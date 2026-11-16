import { B, BLOCKS, itemIcon } from './blocks.js';
import { Inventory, RECIPES, CREATIVE_PALETTE, miningTime, canHarvest, isPlaceable, foodValue, attackDamage, dropFor } from './systems.js';
import { GameAudio } from './audio.js';
import { World, CHUNK, HEIGHT, LANDMARK } from './world.js';
import { Player, Fauna, raycast, overlaps, clamp } from './game.js';
import { View, QUALITY } from './render.js';
import { Room } from './online.js';

const $=id=>document.getElementById(id);
const txt=(id,value)=>{const n=$(id);if(n&&n.textContent!==value)n.textContent=value;};
const hide=(id,state)=>{const n=$(id);if(n)n.hidden=state;};
const listen=(id,type,f)=>$(id)?.addEventListener(type,f);
const STORE='frontier.save.1', PREFS='frontier.settings.1', SEED='verdant';
const read=(k)=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}};
const tag=(type,cls,content)=>{const n=document.createElement(type);if(cls)n.className=cls;if(content)n.textContent=content;return n;};
const touch=matchMedia('(pointer:coarse)').matches || /iPhone|iPad|Android/i.test(navigator.userAgent);
document.body.classList.toggle('touch',touch);
const preferences={quality:'auto',volume:72,sensitivity:100,...read(PREFS)};
const audio=new GameAudio(preferences.volume/100);
const canvasHost=$('game');
let view, world, player, inventory, fauna, worker, room, errorMessage;
let worldSeed=SEED;
let time=47, selection=0, panel=null, back=null, active=false, loading=false, roomPending=false;
let chosenPreset=preferences.quality==='auto'?(touch?'low':'high'):preferences.quality;
let dirtySave=false, saveTick=0, elapsed=0, lastStep=0, lastFPS=0, sampleFrames=0, measuredFPS=0, lowSamples=0, lastHUD=-1, lastAudio=-1;
let saveWarning=false, overlayFocus=null, sim=0, stage=0, goalPlaced=0, lastSwing=-20;
let aimed=null,mining=null,lastMine=0,toastTimer=0,roomToastTimer=0,contextLost=false,bench=false;
const keys=new Set(), input={forward:0,side:0,jump:false,down:false,run:false};
const joystick={id:null,x:0,y:0}, look={id:null,x:0,y:0};
let breaking=false, placedRepeat=0, holdingPlace=false;
const wanted=new Map(), revisions=new Map(), results=[];
let working=null, currentCx=Infinity,currentCz=Infinity, ticket=0, loaded=0;
const chunkKey=(x,z)=>x+':'+z;
const modes=()=> $('mode').value==='creative'?'creative':'survival';
const blockName=id=>BLOCKS[id]?.name??'';
const daylight=()=>clamp((Math.sin((time/540%1)*Math.PI*2)+.16)/.70,.015,1);

function toast(message) {
  txt('toast',message); hide('toast',false);
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>hide('toast',true),2400);
}
function pauseInput() {
  keys.clear();breaking=false;holdingPlace=false;joystick.id=null;joystick.x=joystick.y=0;
  look.id=null; resetMine();
  $('move-knob').style.transform='';
}
function showPanel(id,returnTo=null) {
  const old=panel;
  if(!old && id) overlayFocus=document.activeElement;
  if(old)hide(old,true);
  back=returnTo;
  panel=id;
  if(id) {
    hide(id,false);pauseInput();
    if(document.pointerLockElement)document.exitPointerLock?.();
    if(id==='inventory')paintBag();
    if(id==='party')paintParty();
    requestAnimationFrame(()=>{if(panel===id) $(id)?.querySelector('button:not(:disabled)')?.focus({preventScroll:true});});
  } else if (!active && overlayFocus?.isConnected) {
    overlayFocus.focus({preventScroll:true});overlayFocus=null;
  }
}
function lock() {
  if(touch||!active||panel||!view)return;
  try{const request=view.renderer.domElement.requestPointerLock?.();request?.catch?.(()=>{});}catch{}
}
function closePanel(relock=false) {
  const target=back; showPanel(target);
  if(relock&&!target)lock();
}
function fail(err) {
  console.error(err);
  if(active) exitWorld(false);
  errorMessage='图形引擎未能启动。请用支持 WebGL 2 的 Chrome、Edge、Firefox 或 Safari，并开启图形加速。';
  txt('error',errorMessage);hide('error',false);
}
function initView() {
  if(view)return;
  view=new View(canvasHost);view.configure(chosenPreset);
  const c=view.renderer.domElement;
  c.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;showPanel('pause');toast('图形上下文暂时中断，正在等待恢复');});
  c.addEventListener('webglcontextrestored',()=>{contextLost=false;toast('画面已恢复');});
}
function clearRegion() {
  working=null;results.length=0;wanted.clear();revisions.clear();loaded=0;
  currentCx=currentCz=Infinity;
}
function warmRegion(force=false) {
  if(!player)return;
  const cx=Math.floor(player.p.x/CHUNK), cz=Math.floor(player.p.z/CHUNK);
  if(!force&&cx===currentCx&&cz===currentCz)return;
  currentCx=cx;currentCz=cz;
  const r=QUALITY[chosenPreset]?.radius??4;
  view.trim(cx,cz,r);
  world.trim?.(cx,cz,r+2);
  worker?.postMessage({type:'trim',region:[cx,cz,r+2]});
  for(const [k,v] of wanted) if(Math.abs(v.cx-cx)>r||Math.abs(v.cz-cz)>r)wanted.delete(k);
  for(const [k,v] of revisions) if(Math.abs(v.cx-cx)>r+1||Math.abs(v.cz-cz)>r+1)revisions.delete(k);
  const all=[];
  for(let z=-r;z<=r;z++)for(let x=-r;x<=r;x++)all.push({cx:cx+x,cz:cz+z,d:x*x+z*z});
  all.sort((a,b)=>a.d-b.d);
  for(const part of all) {
    const k=chunkKey(part.cx,part.cz);
    if(!view.chunks.has(k)&&working?.k!==k&&!wanted.has(k))wanted.set(k,part);
  }
}
function prioritize(cx,cz) {
  const k=chunkKey(cx,cz);
  const p={cx,cz,v:(revisions.get(k)?.v??0)+1};
  revisions.set(k,p);
  if(Math.abs(cx-currentCx)>view.settings.radius||Math.abs(cz-currentCz)>view.settings.radius)return;
  wanted.delete(k);const old=[...wanted];wanted.clear();wanted.set(k,p);
  for(const [id,data] of old)wanted.set(id,data);
}
function pumpRegion() {
  if(!working&&wanted.size&&results.length<2) {
    const [k,next]=wanted.entries().next().value;
    wanted.delete(k);
    working={k,cx:next.cx,cz:next.cz,v:revisions.get(k)?.v??0,ticket:++ticket};
    if(worker)worker.postMessage({type:'mesh',...working});
    else {
      const job=working;
      setTimeout(()=>{if(working!==job||!world)return;receiveMesh({...job,mesh:world.chunk(job.cx,job.cz)});},0);
    }
  }
}
function receiveMesh(data) {
  if(working?.ticket!==data.ticket)return;
  const job=working; working=null;
  results.push({...data,...job});
  pumpRegion();
}
function installMesh() {
  const m=results.shift();if(!m)return;
  if(Math.abs(m.cx-currentCx)>view.settings.radius||Math.abs(m.cz-currentCz)>view.settings.radius)return;
  if((revisions.get(m.k)?.v??0)!==m.v)return;
  view.setChunk(m.cx,m.cz,m.mesh);
  loaded++;
}
function save(force=false) {
  if(room||!world||!player||!active||(!dirtySave&&!force))return;
  const ok=write(STORE,{version:1,seed:worldSeed,mode:player.mode,edits:world.edits,player:player.serialize(),inventory:inventory.serialize(),time,selection,stage,goalPlaced});
  if(ok){dirtySave=false;hide('continue',false);}
  else if(!saveWarning){saveWarning=true;toast('浏览器存储空间不足，自动保存未完成');}
}
function startWorld(config=null,fromRoom=false) {
  try{initView();}catch(e){fail(e);return false;}
  if(active)exitWorld(false);
  hide('error',true);
  const seed=String(config?.seed??($('seed').value.trim()||SEED)).slice(0,128);
  const mode=config?.mode??modes();
  try {
    worldSeed=seed;world=new World(seed,config?.edits??{});
    player=new Player(world.spawn,mode,config?.player);
    inventory=new Inventory(mode,config?.inventory);
    fauna=new Fauna();time=Number.isFinite(config?.time)?config.time:47;
    selection=clamp(config?.selection??0,0,8);
    stage=config?.stage??0;goalPlaced=config?.goalPlaced??0;
    bench=false; dirtySave=true; saveTick=0; sim=0; aimed=null;
    view.reset();view.configure(chosenPreset);clearRegion();
    try {
      worker=new Worker(new URL('./world-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=e=>receiveMesh(e.data);
      worker.onerror=()=>{if(working){wanted.set(working.k,working);working=null;}worker?.terminate();worker=null;};
      worker.postMessage({type:'init',seed,edits:world.edits});
    } catch { worker=null; }
    active=true;loading=true;pauseInput();showPanel(null);
    document.body.classList.add('playing');
    hide('menu',true);hide('hud',false);hide('mobile',!touch);hide('room-badge',!fromRoom);
    warmRegion(true);paintHotbar();paintHUD(true);pumpRegion();
    if(!fromRoom)lock();
    audio.play('open');
    toast(fromRoom?'已进入房间 · 点击房间图标分享':touch?'左侧摇杆移动 · 滑动画面转向':'WASD 移动 · E 背包 · Esc 暂停');
    return true;
  }catch(e){fail(e);return false;}
}
function exitWorld(persist=true) {
  if(persist)save(true);
  if(room){room.close();room=null;}
  worker?.terminate(); worker=null;clearRegion();
  active=false;loading=false;pauseInput();showPanel(null);
  if(document.pointerLockElement)document.exitPointerLock?.();
  audio.setEnvironment?.({enabled:false});
  document.body.classList.remove('playing');
  hide('hud',true);hide('mobile',true);hide('menu',false);hide('room-badge',true);
  hide('continue',!read(STORE));view?.reset();
  world=player=inventory=fauna=null;
}
function getHeld(){return inventory?.slots[selection]??0;}
function slot(id,index,{selected=false,number=false,action,label,count}={}) {
  const n=tag('button','slot');n.type='button';
  n.title=label||blockName(id)||'空位';n.setAttribute('aria-label',n.title);
  if(selected)n.setAttribute('aria-pressed','true');
  if(number)n.append(tag('span','slot-key',String(index+1)));
  if(id){const img=tag('img','slot-icon');img.alt='';img.draggable=false;img.src=itemIcon(id);n.append(img);}
  if(count>1&&player.mode!=='creative')n.append(tag('span','slot-count',String(count)));
  n.addEventListener('click',action??(()=>{}));
  return n;
}
function paintHotbar() {
  const bar=$('hotbar'), children=[];
  for(let i=0;i<9;i++) {
    const id=inventory.slots[i];
    children.push(slot(id,i,{selected:selection===i,number:true,count:inventory.count(id),action:()=>select(i)}));
  }
  bar.replaceChildren(...children);
}
function select(i) {
  const next=(i+9)%9;
  if(next===selection)return;
  selection=next;dirtySave=true;
  paintHotbar();resetMine();
  audio.play('select');
  if(getHeld())toast(blockName(getHeld()));
}
function paintBag() {
  if(!inventory)return;
  const creative=player.mode==='creative';
  const ids=creative?CREATIVE_PALETTE:inventory.slots;
  const nodes=ids.map((id,i)=>slot(id,i,{selected:!creative&&selection===i,number:!creative&&i<9,count:inventory.count(id),
    action:()=>{
      if(creative)inventory.equipCreative(id,selection);
      else if(i<9)select(i);
      else if(id){inventory.swap(i,selection);toast('已装入快捷栏 '+(selection+1));}
      dirtySave=true;audio.play('select');paintHotbar();paintBag();
    }}));
  $('items').replaceChildren(...nodes);
  txt('inventory-caption',creative?'选择物品可装入当前快捷栏 · 无限材料':bench?'工作台已接入 · 可制作进阶配方':'点击物品装入当前快捷栏 · 放置并使用工作台解锁进阶配方');
  const recipes=RECIPES.map(r=>{
    const n=tag('button','recipe');n.type='button';n.disabled=!inventory.canCraft(r,bench);
    const img=tag('img','recipe-icon');img.alt='';img.src=itemIcon(r.output[0]);img.style.cssText='width:30px;height:30px;object-fit:contain;image-rendering:pixelated';
    const name=tag('strong','',r.name+(r.output[1]>1?' ×'+r.output[1]:''));
    const hint=tag('small','',r.needs.map(([b,q])=>blockName(b)+' '+q).join(' · ')+(r.station&&!bench&&!creative?' · 需工作台':''));
    const info=tag('span');info.append(name,hint);n.append(img,info);
    n.onclick=()=>{
      if(!inventory.craft(r,bench))return;
      if(r.output[0]===B.PLANKS&&stage===1)advance(2);
      if(r.output[0]===B.WOOD_PICK&&stage<3)advance(3);
      audio.play('craft');dirtySave=true;
      toast('已合成 '+blockName(r.output[0])+' ×'+r.output[1]);paintHotbar();paintBag();
    };
    return n;
  });
  $('recipes').replaceChildren(...recipes);
}
const goals=['采集一块原木','打开背包，将原木合成木板','用木板与木棍合成木镐','开采石头，放置 6 块方块搭建营地','探索河谷石窟与古遗迹'];
function advance(n){if(n>stage){stage=n;audio.play('achievement');dirtySave=true;paintHUD(true);}}
function paintHUD(force=false) {
  if(!player)return;
  const p=player.p;
  const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);
  const biome=world.biome(x,z);
  const hour=Math.floor((time/540%1)*24+6)%24;
  txt('coords',`${x}  /  ${y}  /  ${z}`);
  const scale=view.renderer.getPixelRatio(),px=Math.round(view.host.clientHeight*scale);
  txt('status',loading?'生成地形…':biome+' · '+String(hour).padStart(2,'0')+':00 · '+(measuredFPS||'—')+' FPS'+(preferences.quality!=='low'?' · '+px+'p':''));
  txt('objective',player.mode==='creative'?(player.flight?'飞行中 · 长按跳跃上升':'创造模式 · 自由搭建'):
    goals[Math.min(stage,goals.length-1)]+(stage===3?'  '+Math.min(goalPlaced,6)+'/6':'')+(stage>=4?'  ·  '+LANDMARK.x+', '+LANDMARK.z:''));
  const vitals=$('vitals');
  if(player.mode==='creative'){if(vitals.childNodes.length)vitals.replaceChildren();return;}
  const value=player.health+':'+player.food;
  if(value===vitals.dataset.value&&!force)return;
  const nodes=[];
  for(const [cls,level,sym] of [['health',player.health,'♥'],['food',player.food,'◆']]) {
    const meter=tag('span','vital-group '+cls);meter.setAttribute('aria-label',(cls==='health'?'生命':'饱食度')+' '+level+'/20');
    for(let i=0;i<10;i++)meter.append(tag('i','vital '+(level<=i*2?'empty':level===i*2+1?'half':''),sym));
    nodes.push(meter);
  }
  vitals.dataset.value=value;vitals.replaceChildren(...nodes);
}
function setBlock([x,y,z,id],broadcast=true) {
  if(!world||world.get(x,y,z)===id)return false;
  world.set(x,y,z,id);
  worker?.postMessage({type:'edit',block:[x,y,z,id]});
  const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK);
  const dx=((x%CHUNK)+CHUNK)%CHUNK,dz=((z%CHUNK)+CHUNK)%CHUNK;
  for(let i=dx===0?-1:0;i<=(dx===CHUNK-1?1:0);i++)
    for(let j=dz===0?-1:0;j<=(dz===CHUNK-1?1:0);j++)prioritize(cx+i,cz+j);
  view.torchScan=0;dirtySave=true;if(broadcast)room?.edit([x,y,z,id]);
  return true;
}
function resetMine() {
  mining=null;
  hide('mining-meter',true);
  $('mining-meter').style.setProperty('--progress','0%');
}
const canAct=()=>active&&!panel&&!loading&&!contextLost;
function mine(dt) {
  if(!breaking||!canAct()){if(mining)resetMine();return;}
  const held=getHeld(), mob=fauna.aim(player.eye,player.dir,Math.min(3.45,aimed?.dist??9));
  if(mob) {
    if(elapsed-lastSwing<.36)return;
    lastSwing=elapsed;view.hit();audio.play('attack');
    mob.hit=.42;mob.life-=attackDamage(held);
    if(mob.life<=0&&mob.type!=='shade'&&player.mode==='survival') {inventory.add(mob.type==='boar'?B.BREAD:B.BERRIES,2);paintHotbar();dirtySave=true;}
    resetMine();return;
  }
  if(!aimed){resetMine();return;}
  const a=aimed,need=miningTime(a.id,player.mode==='creative'?'creative':held);
  if(!Number.isFinite(need)) {
    if(elapsed-lastSwing>.5){lastSwing=elapsed;view.hit();audio.play('mine',a.id);toast('这种方块无法挖掘');}
    resetMine();return;
  }
  if(!mining||mining.x!==a.x||mining.y!==a.y||mining.z!==a.z||mining.id!==a.id)mining={...a,t:0};
  mining.t+=dt;
  if(elapsed-lastMine>.17){lastMine=elapsed;view.hit();audio.play('mine',a.id);}
  hide('mining-meter',false);$('mining-meter').style.setProperty('--progress',Math.min(100,mining.t/need*100)+'%');
  if(mining.t<need)return;
  if(setBlock([a.x,a.y,a.z,B.AIR])) {
    view.splash(a);audio.play('break',a.id);
    if(player.mode==='survival'&&canHarvest(a.id,held)){
      const drop=dropFor(a.id);
      if(inventory.add(drop))paintHotbar();
      if(stage===0&&(a.id===B.LOG||a.id===B.PINE_LOG))advance(1);
    }
  }
  resetMine();
}
function place() {
  if(!canAct())return;
  const a=raycast(world,player.eye,player.dir,6);
  const held=getHeld(), food=foodValue(held);
  if(a?.id===B.WORKBENCH){bench=true;showPanel('inventory');audio.play('open');return;}
  if(food&&player.mode==='survival'&&player.food<20) {
    if(inventory.take(held)) {
      player.food=Math.min(20,player.food+food);audio.play('eat');view.hit();
      paintHotbar();paintHUD(true);dirtySave=true;
    } return;
  }
  if(!a||!isPlaceable(held)||!inventory.count(held))return;
  const x=a.x+a.nx,y=a.y+a.ny,z=a.z+a.nz;
  const there=world.get(x,y,z);
  if(y<1||y>=HEIGHT||overlaps(player.p,x,y,z)||![B.AIR,B.WATER,B.FLOWER,B.FERN,B.MUSHROOM].includes(there))return;
  if(setBlock([x,y,z,held])) {
    inventory.take(held);paintHotbar();view.hit();audio.play('place',held);
    if(stage===3&&++goalPlaced>=6)advance(4);
  }
}
function toggleFlight(){if(player?.mode!=='creative')return;player.flight=!player.flight;player.vy=0;toast(player.flight?'已开启飞行':'已关闭飞行');paintHUD(true);}
function proximityBench(){
  const p=player.p;
  for(let x=-3;x<=3;x++)for(let y=-1;y<=2;y++)for(let z=-3;z<=3;z++)
    if(world.get(Math.floor(p.x)+x,Math.floor(p.y)+y,Math.floor(p.z)+z)===B.WORKBENCH)return true;
  return false;
}
function bag(){bench=proximityBench();showPanel('inventory');audio.play('open');}
function respawn(){
  player=new Player(world.spawn,player.mode);fauna=new Fauna();
  showPanel(null);warmRegion(true);dirtySave=true;lock();paintHUD(true);
}
function paintParty(){
  if(!room)return;
  txt('party-code',room.code);
  txt('party-players','在线 '+(room.players.size+1)+'/8  ·  '+[room.name+'（你'+(room.isHost?' · 房主':'')+'）',...Array.from(room.players.values(),v=>v.name)].join('、'));
  $('room-badge').title='房间 '+room.code;
}
function bindRoom(r) {
  r.addEventListener('players',()=>{if(room===r)paintParty();});
  r.addEventListener('edit',e=>{if(room===r&&active)setBlock(e.detail,false);});
  r.addEventListener('time',e=>{if(room===r&&Number.isFinite(e.detail)&&Math.abs(time-e.detail)>1)time=e.detail;});
  r.addEventListener('close',e=>{
    if(room!==r)return;
    exitWorld(false);showPanel('online');
    txt('room-status',typeof e.detail==='string'?e.detail:'房间已断开');
  });
}
async function enterRoom(create) {
  if(roomPending)return;
  audio.unlock();
  const name=$('room-name').value||'探险家',code=$('room-code').value.trim();
  if(!create&&!code){txt('room-status','请输入朋友发来的 8 位房间号。');return;}
  const r=new Room();roomPending=true;
  $('room-create').disabled=$('room-join').disabled=true;
  txt('room-status',create?'正在创建房间…':'正在连接房主…');
  const initial={seed:$('seed').value.trim()||SEED,mode:modes(),edits:{},time:47};
  try {
    const info=create?(await r.create({name,...initial}),initial):await r.join(code,name);
    if(panel!=='online'){r.close();return;}
    room=r;bindRoom(r);
    if(!startWorld(info,true)){r.close();room=null;return;}
    paintParty();
    showPanel('party');
  } catch(e) {r.close();txt('room-status',e?.message||'无法连接，请重试。');}
  finally {roomPending=false;$('room-create').disabled=$('room-join').disabled=false;}
}
function openRoom(){
  audio.unlock();txt('room-status','最多 8 人 · 请保持房主页面开启。');
  showPanel('online');
}
async function copyInvite() {
  if(!room)return;
  const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('room',room.code);
  const b=$('party-copy');
  try{await navigator.clipboard.writeText(url.href);b.textContent='已复制邀请链接';}
  catch {const t=tag('input');t.value=url.href;t.readOnly=true;b.parentElement.after(t);t.select();b.textContent='请复制下方链接';}
  clearTimeout(roomToastTimer);roomToastTimer=setTimeout(()=>b.textContent='复制邀请链接',2000);
}

listen('start','click',()=>{audio.unlock();startWorld();});
listen('continue','click',()=>{audio.unlock();const data=read(STORE);if(data?.version===1)startWorld(data);});
hide('continue',read(STORE)?.version!==1);
listen('menu-settings','click',()=>showPanel('settings'));
listen('help','click',()=>showPanel('help-panel'));
listen('pause-settings','click',()=>showPanel('settings','pause'));
listen('pause-help','click',()=>showPanel('help-panel','pause'));
for(const id of ['hud-pause','act-pause'])listen(id,'click',()=>showPanel('pause'));
listen('act-bag','click',()=>{if(canAct())bag();});
listen('resume','click',()=>{audio.unlock();closePanel(true);});
listen('quit','click',()=>exitWorld());
listen('bag-close','click',()=>closePanel(true));
listen('settings-close','click',()=>closePanel());
listen('help-close','click',()=>closePanel());
listen('respawn','click',respawn);
listen('online-open','click',openRoom);
listen('online-close','click',()=>closePanel());
listen('room-create','click',()=>enterRoom(true));
listen('room-join','click',()=>enterRoom(false));
listen('room-code','keydown',e=>{if(e.key==='Enter')enterRoom(false);});
listen('room-badge','click',()=>showPanel('party'));
listen('party-close','click',()=>closePanel(true));
listen('party-copy','click',copyInvite);
listen('party-leave','click',()=>exitWorld(false));
listen('fullscreen','click',async()=>{
  try {
    if(document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { txt('fullscreen','全屏不可用'); }
});
document.addEventListener('fullscreenchange',()=>txt('fullscreen',document.fullscreenElement?'退出全屏':'全屏游玩'));
txt('party-copy','复制邀请链接');
for(const k of ['quality','sensitivity','volume']) {
  if(!$(k))continue;
  $(k).value=preferences[k];
  listen(k,k==='quality'?'change':'input',()=>{
    preferences[k]=k==='quality'?$(k).value:Number($(k).value);
    write(PREFS,preferences);
    if(k==='volume')audio.volume=preferences.volume/100;
    if(k==='quality'){
      chosenPreset=preferences.quality==='auto'?(touch?'low':'high'):preferences.quality;
      view?.configure(chosenPreset);if(active)warmRegion(true);
    }
  });
}
const invite=new URL(location.href).searchParams.get('room');
if(invite){$('room-code').value=invite.toUpperCase().slice(0,40);openRoom();}

window.addEventListener('keydown',e=>{
  if(e.code==='Escape') {
    if(panel==='death')return;
    if(panel){closePanel(active);e.preventDefault();}
    else if(active){showPanel('pause');e.preventDefault();}
    return;
  }
  if(!active||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.code==='KeyE'&&!e.repeat&&(!panel||panel==='inventory')) {
    if(panel==='inventory')closePanel(true);else if(canAct())bag();e.preventDefault();return;
  }
  if(panel||(!canAct()&&e.code!=='Escape'))return;
  if(e.code.startsWith('Digit')){const i=Number(e.code.slice(5))-1;if(i>=0&&i<9)select(i);}
  if(e.code==='KeyF'&&!e.repeat)toggleFlight();
  if(e.code==='Space'&& !e.repeat&&player.mode==='creative') {
    if(elapsed-lastStep<.31&&lastStep>0){toggleFlight();lastStep=0;}else lastStep=elapsed;
  }
  keys.add(e.code);
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{if(active){pauseInput();save();}});
window.addEventListener('pagehide',()=>save(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active){save(true);pauseInput();}});
document.addEventListener('pointerlockchange',()=>{
  if(active&&!touch&&!document.pointerLockElement&&!panel)showPanel('pause');
});
document.addEventListener('mousemove',e=>{
  if(canAct()&&document.pointerLockElement)player.look(e.movementX,e.movementY,preferences.sensitivity/100);
});
canvasHost.addEventListener('contextmenu',e=>e.preventDefault());
canvasHost.addEventListener('wheel',e=>{if(canAct()){select(selection+Math.sign(e.deltaY));e.preventDefault();}},{passive:false});
canvasHost.addEventListener('pointerdown',e=>{
  if(!canAct())return;
  e.preventDefault();audio.unlock();
  if(e.pointerType==='touch'||e.pointerType==='pen') {
    if(look.id===null){look.id=e.pointerId;look.x=e.clientX;look.y=e.clientY;canvasHost.setPointerCapture(e.pointerId);}
  } else {
    if(!document.pointerLockElement&&e.button===0)lock();
    if(!document.pointerLockElement&&e.button===0){look.id=e.pointerId;look.x=e.clientX;look.y=e.clientY;canvasHost.setPointerCapture(e.pointerId);}
    if(e.button===0)breaking=true;
    if(e.button===2){holdingPlace=true;placedRepeat=elapsed+.30;place();}
    if(e.button===1&&player.mode==='creative'&&aimed){inventory.equipCreative(aimed.id,selection);paintHotbar();}
  }
});
canvasHost.addEventListener('pointermove',e=>{
  if(canAct()&&!document.pointerLockElement&&look.id===e.pointerId) {
    player.look(e.clientX-look.x,e.clientY-look.y,preferences.sensitivity/100*(touch?1.37:1));
    look.x=e.clientX;look.y=e.clientY;
  }
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])window.addEventListener(event,e=>{
  if(look.id===e.pointerId)look.id=null;
  if(e.pointerType!=='touch'){if(e.button===0)breaking=false;if(e.button===2)holdingPlace=false;}
});
const movePad=$('move-pad');
function joystickMove(e) {
  if(joystick.id!==e.pointerId)return;
  const r=movePad.getBoundingClientRect(),max=r.width*.34;
  const x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;
  const dist=Math.max(max,Math.hypot(x,y));
  joystick.x=x/dist;joystick.y=y/dist;
  $('move-knob').style.transform=`translate(${joystick.x*max}px,${joystick.y*max}px)`;
}
movePad.addEventListener('pointerdown',e=>{if(!canAct()||joystick.id!==null)return;e.preventDefault();joystick.id=e.pointerId;movePad.setPointerCapture(e.pointerId);joystickMove(e);});
movePad.addEventListener('pointermove',joystickMove);
for(const event of ['pointerup','pointercancel','lostpointercapture'])movePad.addEventListener(event,e=>{
  if(joystick.id===e.pointerId){joystick.id=null;joystick.x=joystick.y=0;$('move-knob').style.transform='';}
});
function hold(id,down,up){
  listen(id,'pointerdown',e=>{if(!canAct())return;e.preventDefault();$(id).setPointerCapture(e.pointerId);down();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(id,event,up);
}
hold('act-break',()=>{breaking=true;},()=>{breaking=false;});
hold('act-place',()=>{holdingPlace=true;placedRepeat=elapsed+.32;place();},()=>{holdingPlace=false;});
hold('act-jump',()=>{
  keys.add('Space');
  if(player?.mode==='creative'){if(elapsed-lastStep<.38&&lastStep>0){toggleFlight();lastStep=0;}else lastStep=elapsed;}
},()=>keys.delete('Space'));

function tick(now) {
  requestAnimationFrame(tick);
  const delta=lastFPS?(now-lastFPS)/1000:1/60;lastFPS=now;
  if(!active||contextLost||!player)return;
  try {
    const dt=clamp(delta,0,.065);elapsed+=dt;
    if(!panel)sampleFrames++;
    if(Math.floor(elapsed/2)!==Math.floor((elapsed-dt)/2)) {
      if(sampleFrames>=20)measuredFPS=Math.round(sampleFrames/2);
      if(preferences.quality==='auto'&&chosenPreset!=='low'&&sampleFrames>40&&sampleFrames<98){
        if(++lowSamples>=2){chosenPreset=chosenPreset==='high'?'balanced':'low';view.configure(chosenPreset);warmRegion(true);lowSamples=0;}
      }else lowSamples=0;
      sampleFrames=0;
    }
    installMesh();pumpRegion();
    if(loading&&view.chunks.has(chunkKey(currentCx,currentCz))&&loaded>=5)loading=false;
    if(!panel&&!loading) {
      input.forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joystick.y;
      input.side=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystick.x;
      input.run=keys.has('ControlLeft')||keys.has('ShiftLeft')&&!player.flight||Math.hypot(joystick.x,joystick.y)>.95;
      input.down=keys.has('ShiftLeft')||keys.has('ShiftRight')||player.flight&&touch&&joystick.y>.68;
      input.jump=keys.has('Space');
      sim+=dt;
      const step=1/120;
      while(sim>=step){
        player.update(world,input,step,audio);
        fauna.update(world,player,daylight(),step,audio);
        sim-=step;
      }
      aimed=raycast(world,player.eye,player.dir,6);
      if(breaking)mine(dt);else if(mining)resetMine();
      if(holdingPlace&&elapsed>=placedRepeat){placedRepeat=elapsed+.19;place();}
      if(player.health<=0){audio.play('death');showPanel('death');}
      warmRegion();if(player.move>.03||time%2<dt)dirtySave=true;
    }
    if(!loading&&(!panel||room)) {
      time+=dt;
      room?.move(player);room?.sync(time);
    }
    if((!panel||room)&&elapsed-lastHUD>.36) {
      lastHUD=elapsed;paintHUD();
      if(room&&!panel)paintParty();
    }
    if(elapsed-lastAudio>.8) {
      lastAudio=elapsed;
      audio.setEnvironment?.({enabled:!panel,outdoors:player.p.y>=world.surface(Math.floor(player.p.x),Math.floor(player.p.z))-1?1:.1,night:1-daylight(),underwater:player.swim});
    }
    saveTick+=dt;if(saveTick>5){saveTick=0;save();}
    document.body.classList.toggle('hurt',player.hurt>.22);
    if(!panel||room||loaded<10) {
      view.aim(panel?null:aimed);
      view.draw({p:player,world,time,dt,fauna,peers:room?.players,held:getHeld()});
    }
  } catch(e){fail(e);}
}
requestAnimationFrame(tick);
