import * as T from 'three';
import { B, BLOCKS, TILE_COLS, TILE_ROWS, TILE_INSET, makeAtlas, itemIcon } from './blocks.js';
import { CHUNK } from './world.js';
import { EYE, clamp } from './game.js';

export const QUALITY = {
  low: {radius:3,pixels:1.02, clouds:false, far:90},
  balanced:{radius:4,pixels:1.30, clouds:true, far:115},
  high:{radius:5,pixels:1.70, clouds:true, far:150, shadow:1024},
  ultra:{radius:6,pixels:2.30, clouds:true, far:190, shadow:1536},
};
const key=(x,z)=>x+':'+z;
const gold=new T.Color('#ffc982'), white=new T.Color('#fff3d0'), blue=new T.Color('#819fcf');
const dayFog=new T.Color('#b3d1c8'), duskFog=new T.Color('#b88671'), nightFog=new T.Color('#1b2946');

const skyVertex=`
varying vec3 vDir;
void main() { vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const skyFragment=`
varying vec3 vDir;
uniform vec3 sunDir;
uniform vec3 haze;
uniform float daylight,clock,clouds;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec3 d=normalize(vDir);
  float up=max(d.y,0.);
  vec3 top=mix(vec3(.011,.020,.075),vec3(.105,.39,.64),daylight);
  vec3 color=mix(haze,top,pow(up,.46));
  float facing=max(dot(d,sunDir),0.);
  float solar=smoothstep(-.09,.16,sunDir.y);
  color+=vec3(1.,.43,.12)*pow(facing,14.)*.29*solar;
  color+=vec3(1.0,.83,.51)*smoothstep(.9987,.99905,facing)*solar*1.35;
  float moon=max(dot(d,-sunDir),0.);
  color+=vec3(.52,.72,1.)*(smoothstep(.9992,.99943,moon)+.09*pow(moon,95.))*(1.-solar);
  vec2 sph=vec2(atan(d.z,d.x)*125.,d.y*220.);
  float star=h(floor(sph)), dotstar=1.-smoothstep(.03,.24,length(fract(sph)-.5));
  color+=vec3(.62,.79,.99)*dotstar*step(.989,star)*smoothstep(.02,.29,up)*pow(1.-daylight,2.)*(.65+.35*sin(clock*.75+star*180.));
  if(clouds>.5 && d.y>.018){
    vec2 p=(d.xz/(d.y+.15))*vec2(17.,24.)+vec2(clock*.055,0.);
    p=floor(p*2.8)/2.8;
    float f=n(p*.25)*.62+n(p*.63)*.26+n(p*1.65)*.12;
    float a=smoothstep(.57,.66,f)*smoothstep(.018,.23,d.y);
    vec3 lit=mix(vec3(.025,.035,.092),mix(vec3(.67,.73,.75),vec3(1.,.88,.72),pow(facing,3.)),daylight);
    color=mix(color,lit,a*.86);
  }
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function meshPart(data,material) {
  if(!data?.i?.length) return null;
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.BufferAttribute(data.p,3));
  g.setAttribute('normal',new T.BufferAttribute(data.n,3));
  g.setAttribute('uv',new T.BufferAttribute(data.uv,2));
  g.setAttribute('color',new T.BufferAttribute(data.c,3));
  g.setIndex(new T.BufferAttribute(data.i,1));
  g.computeBoundingSphere();
  return new T.Mesh(g,material);
}

function crackFrames() {
  const traces=[
    [[15,17],[11,12],[13,8],[9,4],[8,0]],
    [[15,17],[20,13],[24,14],[28,9],[32,8]],
    [[15,17],[15,21],[21,23],[24,29],[24,32]],
    [[15,17],[9,19],[5,16],[0,17]],
    [[11,12],[7,11],[4,6],[0,5]],
    [[21,23],[25,21],[29,24],[32,24]],
    [[15,21],[12,26],[7,28],[5,32]],
    [[24,14],[25,17],[30,19],[32,18]],
    [[20,13],[19,7],[21,4],[20,0]],
  ];
  return traces.map((_,i)=>{
    const a=document.createElement('canvas');a.width=a.height=32;
    const ctx=a.getContext('2d');
    for(const line of traces.slice(0,i+1)) {
      ctx.strokeStyle='rgba(222,204,166,.58)';ctx.lineWidth=1.55;ctx.beginPath();
      line.forEach(([x,y],j)=>j?ctx.lineTo(x+.8,y+1.2):ctx.moveTo(x+.8,y+1.2));ctx.stroke();
      ctx.strokeStyle='rgba(18,13,10,.88)';ctx.lineWidth=1.3;ctx.beginPath();
      line.forEach(([x,y],j)=>j?ctx.lineTo(x+.5,y+.5):ctx.moveTo(x+.5,y+.5));ctx.stroke();
    }
    const t=new T.CanvasTexture(a);t.magFilter=T.NearestFilter;t.minFilter=T.NearestFilter;t.colorSpace=T.SRGBColorSpace;return t;
  });
}

export class View {
  constructor(host) {
    this.host=host;
    this.renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance',alpha:false});
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.09;
    this.renderer.shadowMap.type=T.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate=false;
    this.renderer.domElement.setAttribute('aria-label','第一人称游戏视野');
    host.append(this.renderer.domElement);
    this.scene=new T.Scene();
    this.camera=new T.PerspectiveCamera(73,1,.045,222);
    this.camera.rotation.order='YXZ'; this.scene.add(this.camera);
    this.scene.fog=new T.Fog(dayFog,34,115);
    this.sun=new T.DirectionalLight(white,2.20);
    const sc=this.sun.shadow.camera;
    sc.left=sc.bottom=-37;sc.right=sc.top=37;sc.near=2;sc.far=135;
    this.sun.shadow.bias=-.00029;
    this.sun.shadow.normalBias=.07;
    this.sun.shadow.radius=1.35;
    this.shadowCell='';this.shadowDirty=true;
    this.hemi=new T.HemisphereLight('#c5e9ff','#9e836a',1.70);
    this.scene.add(this.sun,this.sun.target,this.hemi);
    this.torch=new T.PointLight('#ff9a41',0,10,1.6);
    this.scene.add(this.torch);
    this.sky=new T.Mesh(new T.SphereGeometry(202,24,16),
      new T.ShaderMaterial({vertexShader:skyVertex,fragmentShader:skyFragment,side:T.BackSide,
        depthWrite:false,fog:false,uniforms:{sunDir:{value:new T.Vector3()},haze:{value:dayFog.clone()},daylight:{value:1},clock:{value:0},clouds:{value:1}}}));
    this.sky.frustumCulled=false; this.sky.renderOrder=-9; this.scene.add(this.sky);
    this.atlas=new T.CanvasTexture(makeAtlas());
    this.atlas.colorSpace=T.SRGBColorSpace;
    this.atlas.magFilter=T.NearestFilter;
    this.atlas.minFilter=T.NearestMipmapLinearFilter;
    this.atlas.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
    this.land=new T.MeshLambertMaterial({map:this.atlas,vertexColors:true,alphaTest:.42});
    this.water=new T.MeshLambertMaterial({map:this.atlas,vertexColors:true,transparent:true,opacity:.78,depthWrite:false,side:T.DoubleSide});
    this.waterClock={value:0};this.waterSun={value:new T.Vector3()};
    this.water.onBeforeCompile=s=>{
      s.uniforms.clock=this.waterClock;
      s.uniforms.waterSun=this.waterSun;
      s.vertexShader='varying vec3 wavePos;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n wavePos=position;');
      s.fragmentShader='varying vec3 wavePos;\nuniform float clock;\nuniform vec3 waterSun;\n'+s.fragmentShader.replace('#include <color_fragment>',`
        #include <color_fragment>
        float ripple=sin(wavePos.x*3.4+sin(wavePos.z*1.9+clock*.85)*1.2+clock*2.2);
        float sparkle=smoothstep(.88,1.,ripple)*smoothstep(.4,1.,sin(wavePos.z*4.1-clock*1.2));
        vec3 V=normalize(cameraPosition-wavePos);
        vec3 W=normalize(vec3(.065*sin(wavePos.x*.9+clock*1.8),1.,.08*cos(wavePos.z*1.2-clock*1.1)));
        float fresnel=pow(1.-max(0.,dot(W,V)),3.);
        float sunSpec=pow(max(0.,dot(reflect(-waterSun,W),V)),27.)*max(0.,waterSun.y);
        diffuseColor.rgb*=.98+ripple*.093;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.14,.36,.43),fresnel*.70);
        diffuseColor.rgb+=vec3(.12,.25,.28)*sparkle+vec3(.92,.73,.43)*sunSpec*.45;
        diffuseColor.a=clamp(diffuseColor.a*.91+sparkle*.2,0.,.97);
      `);
    };
    const outline=new T.EdgesGeometry(new T.BoxGeometry(1.006,1.006,1.006));
    this.outline=new T.LineSegments(outline,new T.LineBasicMaterial({color:'#fff2c0',transparent:true,opacity:.87}));
    this.outline.visible=false; this.scene.add(this.outline);
    this.crack=new T.Mesh(new T.BoxGeometry(1.003,1.003,1.003),
      new T.MeshBasicMaterial({transparent:true,depthWrite:false,alphaTest:.08}));
    this.crack.visible=false;this.crack.renderOrder=3;this.scene.add(this.crack);
    this.chunks=new Map(); this.mobs=new Map(); this.remote=new Map(); this.effects=[];
    this.particleGeo=new T.BoxGeometry(1,1,1);
    this.cube=new T.BoxGeometry(1,1,1);
    this.actorMaterials=new Map();
    this.hand=new T.Group(); this.camera.add(this.hand);
    this.heldCube=new T.Mesh(this.cube.clone(),new T.MeshLambertMaterial({map:this.atlas,alphaTest:.38,depthTest:false,depthWrite:false}));
    this.arm=new T.Mesh(this.cube,new T.MeshLambertMaterial({color:'#9e7454',depthTest:false,depthWrite:false}));
    const cuff=new T.Mesh(this.cube,new T.MeshLambertMaterial({color:'#45684b',depthTest:false,depthWrite:false}));
    cuff.scale.set(.17,.20,.169); cuff.position.set(.09,-.19,.01); cuff.renderOrder=21;
    this.arm.scale.set(.159,.39,.156); this.arm.position.set(.09,-.12,.01); this.arm.renderOrder=21;
    this.heldCube.renderOrder=22;
    this.heldTool=new T.Sprite(new T.SpriteMaterial({depthTest:false,depthWrite:false,transparent:true,alphaTest:.03}));
    this.heldTool.scale.set(.51,.51,1); this.heldTool.position.set(-.02,.015,-.04); this.heldTool.renderOrder=23;
    this.hand.add(this.arm,cuff,this.heldCube,this.heldTool);
    this.handItem=-1; this.swing=0; this.kick=0; this.torchScan=0;
    this.resize=()=>this.fit();
    window.addEventListener('resize',this.resize,{passive:true});
    this.configure('balanced');
  }
  configure(preset) {
    this.settings=QUALITY[preset]??QUALITY.balanced;
    const size=this.settings.shadow??0, shadow=this.sun.shadow;
    if(size && size!==shadow.mapSize.x) {
      shadow.map?.dispose();shadow.map=null;shadow.mapSize.set(size,size);
    }
    this.sun.castShadow=!!size;
    this.renderer.shadowMap.enabled=!!size;
    this.shadowDirty=true;
    this.fit();
  }
  fit() {
    const w=this.host.clientWidth||innerWidth,h=this.host.clientHeight||innerHeight;
    const cap=Math.min(2560/w,1440/h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.settings.pixels,cap));
    this.renderer.setSize(w,h,false);
    this.camera.aspect=w/h; this.camera.fov=w/h<.82?84:73; this.camera.updateProjectionMatrix();
  }
  setChunk(cx,cz,raw) {
    this.removeChunk(cx,cz);
    const group=new T.Group();
    const land=meshPart(raw.solid,this.land),water=meshPart(raw.water,this.water);
    if(land) {land.castShadow=true;land.receiveShadow=true;group.add(land);}
    if(water) {water.receiveShadow=true;group.add(water);}
    this.chunks.set(key(cx,cz),{cx,cz,group});
    this.scene.add(group);
    this.shadowDirty=true;
  }
  removeChunk(cx,cz) {
    const old=this.chunks.get(key(cx,cz)); if(!old)return;
    this.scene.remove(old.group); old.group.traverse(o=>o.geometry?.dispose());
    this.chunks.delete(key(cx,cz));
  }
  trim(cx,cz,radius) {
    for(const obj of this.chunks.values()) if(Math.abs(obj.cx-cx)>radius||Math.abs(obj.cz-cz)>radius) this.removeChunk(obj.cx,obj.cz);
  }
  reset() {
    for(const o of this.chunks.values()) this.removeChunk(o.cx,o.cz);
    for(const map of [this.mobs,this.remote]) { for(const o of map.values()) this.removeActor(o); map.clear(); }
    for(const p of this.effects) {for(const q of p.cubes)this.scene.remove(q.mesh);p.mesh.material.dispose();}
    this.effects.length=0; this.torch.intensity=0; this.torchScan=0;
    this.crack.visible=false;
  }
  aim(hit) {
    this.outline.visible=!!hit;
    if(hit) this.outline.position.set(hit.x+.5,hit.y+.5,hit.z+.5);
  }
  hit() { this.swing=.30; }
  damageBlock(hit,progress=0) {
    this.crack.visible=!!hit&&progress>.06&&!!BLOCKS[hit.id]?.solid;
    if(!this.crack.visible)return;
    this.cracks??=crackFrames();
    const tex=this.cracks[Math.floor(clamp(progress*this.cracks.length,0,this.cracks.length-1))];
    if(this.crack.material.map!==tex) {
      if(!this.crack.material.map)this.crack.material.needsUpdate=true;
      this.crack.material.map=tex;
    }
    this.crack.position.set(hit.x+.5,hit.y+.5,hit.z+.5);
  }
  splash(hit) {
    const color=BLOCKS[hit.id]?.color??(hit.id===B.GRASS?'#809755':hit.id===B.LOG?'#997652':'#ad9d82');
    if(this.effects.length>45) return;
    const material=new T.MeshLambertMaterial({color});
    const cubes=[];
    for(let i=0;i<7;i++) {
      const mesh=new T.Mesh(this.particleGeo,material);
      mesh.position.set(hit.x+.5+(Math.random()-.5)*.7,hit.y+.5+(Math.random()-.5)*.7,hit.z+.5+(Math.random()-.5)*.7);
      mesh.scale.setScalar(.045+Math.random()*.10);
      this.scene.add(mesh);
      cubes.push({mesh,x:(Math.random()-.5)*3,y:1+Math.random()*2.4,z:(Math.random()-.5)*3});
    }
    this.effects.push({mesh:cubes[0].mesh,cubes,time:.48});
  }
  setHeld(id) {
    if(id===this.handItem)return;
    this.handItem=id; this.kick=.13;
    const tiles=BLOCKS[id]?.tiles, cube=!!tiles&&BLOCKS[id]?.solid;
    this.heldCube.visible=cube; this.heldTool.visible=!!id&&!cube;
    if(cube) {
      const uv=this.heldCube.geometry.attributes.uv;
      for(let f=0;f<6;f++) {
        const tile=tiles[f],x=tile%TILE_COLS,y=Math.floor(tile/TILE_COLS);
        for(let j=0;j<4;j++) uv.setXY(f*4+j,(x+(j%2?1-TILE_INSET:TILE_INSET))/TILE_COLS,1-(y+(j<2?TILE_INSET:1-TILE_INSET))/TILE_ROWS);
      }
      uv.needsUpdate=true; this.heldCube.scale.setScalar(.175); this.heldCube.position.set(.026,.018,-.11);
    } else if(id) {
      const img=new Image(); img.src=itemIcon(id);
      img.onload=()=>{
        if(this.handItem!==id)return;
        this.heldTool.material.map?.dispose();
        const tex=new T.Texture(img); tex.magFilter=T.NearestFilter; tex.colorSpace=T.SRGBColorSpace; tex.needsUpdate=true;
        this.heldTool.material.map=tex; this.heldTool.material.needsUpdate=true;
      };
    }
  }
  material(color) {
    if(!this.actorMaterials.has(color)) this.actorMaterials.set(color,new T.MeshLambertMaterial({color}));
    return this.actorMaterials.get(color);
  }
  actor(type,name) {
    const g=new T.Group(),legs=[];
    const box=(x,y,z,w,h,l,c)=>{
      const p=new T.Mesh(this.cube,this.material(c)); p.position.set(x,y,z); p.scale.set(w,h,l); g.add(p); return p;
    };
    if(type==='boar'||type==='sheep') {
      const boar=type==='boar', fur=boar?'#b87560':'#ded3bd', head=boar?'#c98a71':'#8b7964';
      box(0,.58,-.09,.65,.60,1.04,fur); box(0,.67,.52,.51,.51,.48,head);
      box(0,.57,.79,.31,.20,.14,boar?'#e2a089':'#665c4f');
      for(const x of [-.18,.18]) {
        box(x,.75,.765,.072,.073,.023,'#262522'); box(x,.91,.46,.12,.16,.19,fur);
        for(const z of [-.42,.27]) legs.push(box(x,.156,z,.16,.31,.16,head));
      }
    } else {
      const shade=type==='shade', cloth=shade?'#45366b':'#6a9c73', face=shade?'#74856e':'#cba074';
      box(0,1.035,0,.49,.60,.30,cloth);
      box(0,1.54,.01,.43,.43,.40,face);
      box(0,1.742,-.002,.45,.089,.43,shade?'#584c66':'#5d4837');
      for(const x of [-.105,.105]) box(x,1.55,.218,.074,.055,.02,shade?'#e096b8':'#362b22');
      for(const x of [-.325,.325]) box(x,1.035,shade?.13:0,.149,.60,.158,cloth);
      for(const x of [-.137,.137]) legs.push(box(x,.344,0,.219,.68,.24,shade?'#4c5266':'#435472'));
    }
    if(name) {
      const c=document.createElement('canvas'); c.width=256;c.height=48;
      const ctx=c.getContext('2d'); ctx.font='bold 23px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      const w=Math.min(250,ctx.measureText(name).width+26);
      ctx.fillStyle='#14201bdc';ctx.fillRect(128-w/2,3,w,42);ctx.fillStyle='#fbf2c9';ctx.fillText(name,128,25,234);
      const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
      const tag=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));tag.position.y=2.07;tag.scale.set(2.1,.394,1);
      g.add(tag);
    }
    this.scene.add(g); return {g,legs,phase:Math.random()*5,last:null};
  }
  removeActor(actor) {
    this.scene.remove(actor.g);
    actor.g.traverse(o=>{if(o.isSprite) {o.material.map?.dispose();o.material.dispose();}});
  }
  actors(map,entries,dt,remote=false) {
    const present=new Set();
    for(const [id,entry] of entries) {
      const p=entry.p??entry;
      if(![p.x,p.y,p.z].every(Number.isFinite)) continue;
      present.add(id);
      let a=map.get(id);
      if(!a) {a=this.actor(remote?'player':entry.type,remote?entry.name:null); a.g.position.set(p.x,p.y,p.z);map.set(id,a);}
      const d=Math.hypot(a.g.position.x-p.x,a.g.position.z-p.z);
      const s=remote?1-Math.exp(-dt*17):1;
      a.g.position.x+=(p.x-a.g.position.x)*s; a.g.position.y+=(p.y-a.g.position.y)*s;a.g.position.z+=(p.z-a.g.position.z)*s;
      a.g.rotation.y=remote?(entry.yaw??0)+Math.PI:entry.yaw;
      a.phase+=dt*(remote?(d>.05?11:0):entry.moving?9:0);
      for(let i=0;i<a.legs.length;i++) a.legs[i].rotation.x=Math.sin(a.phase+(i%2?Math.PI:0))*(remote?(d>.045?.47:0):entry.moving?.46:0);
    }
    for(const [id,a] of map) if(!present.has(id)) {this.removeActor(a);map.delete(id);}
  }
  lights(world,p,dt,held) {
    this.torchScan-=dt;
    if(held===B.TORCH||held===B.LANTERN) {
      this.torch.position.set(p.p.x,p.p.y+1.25,p.p.z);
      this.torch.intensity=7.7+Math.sin(this.waterClock.value*11)*.35;
      this.torchScan=0; return;
    }
    if(this.torchScan>0)return;
    this.torchScan=.45;
    const x=Math.floor(p.p.x),y=Math.floor(p.p.y+1),z=Math.floor(p.p.z);
    let best=Infinity, found=null;
    if(world.lightNear) found=world.lightNear(x,y,z);
    else for(let a=-4;a<=4;a++) for(let b=-3;b<=3;b++) for(let c=-4;c<=4;c++) {
      const id=world.get(x+a,y+b,z+c),d=a*a+b*b+c*c;
      if((id===B.TORCH||id===B.LANTERN)&&d<best) {best=d;found=[x+a,y+b,z+c];}
    }
    if(found) { this.torch.position.set(found[0]+.5,found[1]+.63,found[2]+.5);this.torch.intensity=13; }
    else this.torch.intensity=0;
  }
  draw({p,world,time,dt,fauna,peers,held}) {
    const hour=(time/540%1)*Math.PI*2;
    const sx=Math.cos(hour)*.82, sy=Math.sin(hour), sz=-.48;
    const daylight=clamp((sy+.16)/.70,.015,1);
    const dusk=clamp(1-Math.abs(sy)*3.8,0,1);
    const u=this.sky.material.uniforms;
    u.sunDir.value.set(sx,sy,sz).normalize(); u.daylight.value=daylight;u.clock.value=time;u.clouds.value=this.settings.clouds?1:0;
    u.haze.value.copy(nightFog).lerp(dayFog,daylight).lerp(duskFog,dusk*.49);
    const sunX=Math.floor(p.p.x/8)*8+4,sunY=Math.floor(p.p.y/8)*8+4,sunZ=Math.floor(p.p.z/8)*8+4;
    const shadowCell=sunX+':'+sunY+':'+sunZ+':'+Math.floor(time/2.7);
    const refresh=this.shadowCell!==shadowCell||(this.shadowDirty&&performance.now()>(this.lastShadow??0)+210);
    if(!this.sun.castShadow||refresh) {
      this.sun.target.position.set(sunX,sunY,sunZ);
      this.sun.position.copy(u.sunDir.value).multiplyScalar(68);
      this.sun.position.y=Math.max(this.sun.position.y,22);
      this.sun.position.add(this.sun.target.position);
      this.shadowCell=shadowCell;this.shadowDirty=false;this.lastShadow=performance.now();
      this.renderer.shadowMap.needsUpdate=this.sun.castShadow;
    }
    this.sun.color.copy(white).lerp(gold,dusk*.85).lerp(blue,(1-daylight)*.75);
    this.sun.intensity=.19+daylight*2.05;
    this.hemi.intensity=.17+daylight*1.37;
    this.scene.fog.color.copy(u.haze.value);
    const submerged=world.get(Math.floor(p.p.x),Math.floor(p.p.y+EYE),Math.floor(p.p.z))===B.WATER;
    this.scene.fog.near=submerged?.9:this.settings.radius*CHUNK*.53;
    this.scene.fog.far=submerged?14:this.settings.radius*CHUNK*.96;
    if(submerged)this.scene.fog.color.set('#356f79');
    const bob=p.ground?Math.sin(p.bob)*Math.min(.046,p.move*.009):0;
    this.camera.position.set(p.p.x,p.p.y+EYE+bob,p.p.z);
    this.camera.rotation.set(p.pitch,p.yaw,0,'YXZ');
    this.sky.position.copy(this.camera.position);
    this.waterClock.value=time;
    this.waterSun.value.copy(u.sunDir.value);
    this.setHeld(held); this.lights(world,p,dt,held);
    this.swing=Math.max(0,this.swing-dt); this.kick=Math.max(0,this.kick-dt);
    const swing=Math.sin(this.swing/.30*Math.PI);
    const aspect=this.camera.aspect;
    this.hand.position.set(Math.min(.59,aspect*.445)+Math.cos(p.bob*.5)*p.move*.005-swing*.22,-.42+bob*.60-this.kick-swing*.105,-.66-swing*.30);
    this.hand.rotation.set(-.46-swing*.45,.54+swing*.42,-.23+swing*.53);
    this.actors(this.mobs,fauna.mobs.map(m=>[m.id,m]),dt);
    this.actors(this.remote,peers??[],dt,true);
    for(let i=this.effects.length-1;i>=0;i--) {
      const e=this.effects[i];e.time-=dt;
      for(const q of e.cubes) {
        if(e.time<=0) this.scene.remove(q.mesh);
        else {q.mesh.position.x+=q.x*dt;q.mesh.position.y+=q.y*dt;q.mesh.position.z+=q.z*dt;q.y-=9*dt;q.mesh.rotation.x+=4*dt;q.mesh.rotation.z+=2*dt;}
      }
      if(e.time<=0) {e.mesh.material.dispose();this.effects.splice(i,1);}
    }
    this.renderer.render(this.scene,this.camera);
  }
}
