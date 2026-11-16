import { B, BLOCKS } from './blocks.js';

export const RADIUS = .29, BODY = 1.76, EYE = 1.60;
const tau = Math.PI * 2;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const solid = (world,x,y,z) => Boolean(BLOCKS[world.get(x,y,z)]?.solid);

export function raycast(world, origin, dir, max = 6) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
  const dx = Math.abs(1 / dir.x), dy = Math.abs(1 / dir.y), dz = Math.abs(1 / dir.z);
  let tx = sx ? (sx > 0 ? x + 1 - origin.x : origin.x - x) * dx : Infinity;
  let ty = sy ? (sy > 0 ? y + 1 - origin.y : origin.y - y) * dy : Infinity;
  let tz = sz ? (sz > 0 ? z + 1 - origin.z : origin.z - z) * dz : Infinity;
  let dist = 0, nx=0, ny=0, nz=0;
  while (dist <= max) {
    const id = world.get(x,y,z);
    if (id && id !== B.WATER) return {x,y,z,id,nx,ny,nz,dist};
    nx=ny=nz=0;
    if (tx <= ty && tx <= tz) { dist=tx; tx+=dx; x+=sx; nx=-sx; }
    else if (ty <= tz) { dist=ty; ty+=dy; y+=sy; ny=-sy; }
    else { dist=tz; tz+=dz; z+=sz; nz=-sz; }
  }
  return null;
}

export function overlaps(p,x,y,z) {
  return p.x+RADIUS>x && p.x-RADIUS<x+1 && p.y+BODY>y && p.y<y+1 && p.z+RADIUS>z && p.z-RADIUS<z+1;
}

function slide(world,p,axis,d,rad=RADIUS,h=BODY) {
  if (!d) return false;
  p[axis]+=d;
  let hit=false;
  for (let x=Math.floor(p.x-rad+1e-5); x<=Math.floor(p.x+rad-1e-5); x++)
    for(let z=Math.floor(p.z-rad+1e-5); z<=Math.floor(p.z+rad-1e-5);z++)
      for(let y=Math.floor(p.y+1e-5); y<=Math.floor(p.y+h-1e-5);y++) {
        if (!solid(world,x,y,z)) continue;
        const c=axis==='x'?x:axis==='y'?y:z;
        const extent=axis==='y'?h:rad;
        const opposite=axis==='y'?0:rad;
        p[axis]=d>0?Math.min(p[axis],c-extent-1e-5):Math.max(p[axis],c+1+opposite+1e-5);
        hit=true;
      }
  return hit;
}

export class Player {
  constructor(spawn, mode, save) {
    this.mode=mode;
    this.p={...spawn};
    this.yaw=Number.isFinite(spawn.yaw)?spawn.yaw:0;
    this.pitch=Number.isFinite(spawn.pitch)?spawn.pitch:-.10;
    this.health=20; this.food=20; this.vy=0; this.ground=false; this.bob=0; this.step=0;
    this.vx=0; this.vz=0; this.flight=false; this.hurt=0; this.swim=false; this.move=0;
    this.metabolism=0;
    if(save?.p && ['x','y','z'].every(k=>Number.isFinite(save.p[k]))) this.p={...save.p};
    if(Number.isFinite(save?.yaw)) this.yaw=save.yaw;
    if(Number.isFinite(save?.pitch)) this.pitch=save.pitch;
    if(Number.isFinite(save?.health)) this.health=clamp(save.health,1,20);
    if(Number.isFinite(save?.food)) this.food=clamp(save.food,0,20);
  }
  look(dx,dy,scale=1) {
    this.yaw=(this.yaw-dx*.0028*scale)%tau;
    this.pitch=clamp(this.pitch-dy*.0028*scale,-1.53,1.53);
  }
  get dir() {
    const c=Math.cos(this.pitch);
    return {x:-Math.sin(this.yaw)*c,y:Math.sin(this.pitch),z:-Math.cos(this.yaw)*c};
  }
  get eye() { return {x:this.p.x,y:this.p.y+EYE,z:this.p.z}; }
  damage(n) { if(this.mode==='survival' && this.hurt<=0) { this.health=Math.max(0,this.health-n); this.hurt=.55; return true; } return false; }
  update(world,input,dt,audio) {
    this.hurt=Math.max(0,this.hurt-dt);
    const p=this.p, m=Math.max(1,Math.hypot(input.forward,input.side));
    const f=input.forward/m, s=input.side/m;
    const x=-Math.sin(this.yaw)*f+Math.cos(this.yaw)*s;
    const z=-Math.cos(this.yaw)*f-Math.sin(this.yaw)*s;
    this.swim=world.get(Math.floor(p.x),Math.floor(p.y+.56),Math.floor(p.z))===B.WATER;
    const speed=this.flight?(input.run?16:9):this.swim?3:input.run&&this.food>2?6.6:4.8;
    const damp=1-Math.exp(-dt*(this.ground||this.flight?23:12));
    this.vx+=(x*speed-this.vx)*damp; this.vz+=(z*speed-this.vz)*damp;
    const hitX=slide(world,p,'x',this.vx*dt), hitZ=slide(world,p,'z',this.vz*dt);
    if(hitX) this.vx=0;
    if(hitZ) this.vz=0;
    if(this.flight) this.vy=((input.jump?1:0)-(input.down?1:0))*speed;
    else if(this.swim) this.vy+=( (input.jump?4.5:-2)-this.vy )*dt*8;
    else {
      if(input.jump && this.ground) { this.vy=8.0; this.ground=false; audio?.play('jump',B.GRASS); }
      this.vy=Math.max(-45,this.vy-23*dt);
    }
    const vy=this.vy;
    this.ground=false;
    if(slide(world,p,'y',vy*dt)) {
      if(vy<0) {
        this.ground=true;
        if(vy<-14.2&&!this.swim&&!this.flight&&this.damage(Math.ceil((Math.abs(vy)-13)*.74))) audio?.play('hurt');
      }
      this.vy=0;
    }
    this.move=Math.hypot(this.vx,this.vz);
    if(this.ground && this.move>1) {
      this.bob+=this.move*dt*2.35; this.step+=this.move*dt;
      if(this.step>2.1) { this.step=0; audio?.play('step',world.get(Math.floor(p.x),Math.floor(p.y-.1),Math.floor(p.z))); }
    }
    if(this.mode==='survival') {
      this.metabolism+=dt*(input.run&&this.move>4?2.8:1);
      if(this.metabolism>9) {
        this.metabolism=0; this.food=Math.max(0,this.food-1);
        if(this.food>=15) this.health=Math.min(20,this.health+1);
        if(!this.food) this.damage(1);
      }
    }
    if(p.y<-8) this.health=0;
  }
  serialize() { return {p:this.p,yaw:this.yaw,pitch:this.pitch,health:this.health,food:this.food}; }
}

export class Fauna {
  constructor() { this.mobs=[]; this.serial=0; this.timer=0; }
  update(world,player,daylight,dt,audio,{spawn=true}={}) {
    const p=player.p;
    this.timer-=dt;
    if(spawn&&this.timer<0&&this.mobs.length<10) {
      this.timer=2.6;
      for(let i=0;i<8;i++) {
        const a=Math.random()*tau, r=12+Math.random()*23;
        const x=Math.floor(p.x+Math.cos(a)*r)+.5, z=Math.floor(p.z+Math.sin(a)*r)+.5, y=world.surface(Math.floor(x),Math.floor(z))+1;
        if(Math.abs(y-p.y)>16 || !solid(world,Math.floor(x),y-1,Math.floor(z)) || world.get(Math.floor(x),y,Math.floor(z))!==B.AIR || world.get(Math.floor(x),y+1,Math.floor(z))!==B.AIR) continue;
        const type=daylight<.35&&player.mode==='survival'?'shade':Math.random()<.52?'sheep':'boar';
        this.mobs.push({id:'mob'+(++this.serial),type,p:{x,y,z},yaw:a,life:type==='shade'?12:7,vy:0,think:0,hit:0,moving:false});
        break;
      }
    }
    this.mobs=this.mobs.filter(m=>m.life>0&&Math.hypot(m.p.x-p.x,m.p.z-p.z)<61&&!(m.type==='shade'&&daylight>.62&&Math.hypot(m.p.x-p.x,m.p.z-p.z)>19));
    for(const m of this.mobs) {
      const {x,y,z}=m.p, rx=p.x-x, rz=p.z-z, range=Math.hypot(rx,rz);
      m.hit=Math.max(0,m.hit-dt);
      const chase=m.type==='shade'&&range<16&&Math.abs(y-p.y)<5, flee=m.hit>0&&m.type!=='shade';
      m.think-=dt;
      if(chase||flee) { m.yaw=Math.atan2(rx,rz)+(flee?Math.PI:0); m.moving=true; }
      else if(m.think<0) { m.think=1.5+Math.random()*4; m.yaw+=Math.random()*3-1.5; m.moving=Math.random()>.39; }
      if(chase && range<1.35 && Math.abs(p.y-y)<1.2 && player.damage(2)) audio?.play('hurt');
      const speed=(chase?2.1:flee?3:1.05)*dt, h=m.type==='shade'?1.60:1.02;
      m.vy-=22*dt;
      if(m.moving && (!chase||range>1)) {
        const wallX=slide(world,m.p,'x',Math.sin(m.yaw)*speed,.27,h), wallZ=slide(world,m.p,'z',Math.cos(m.yaw)*speed,.27,h);
        if((wallX||wallZ)&&m.vy<0&&solid(world,Math.floor(m.p.x),Math.floor(m.p.y-.12),Math.floor(m.p.z))) m.vy=6.7;
      }
      if(slide(world,m.p,'y',m.vy*dt,.27,h)) m.vy=0;
      if(m.p.y<0) m.life=0;
    }
  }
  aim(origin,dir,max) {
    let best=null;
    for(const mob of this.mobs) {
      const dx=mob.p.x-origin.x,dy=mob.p.y+(mob.type==='shade'?.90:.56)-origin.y,dz=mob.p.z-origin.z;
      const t=dx*dir.x+dy*dir.y+dz*dir.z;
      if(t>0 && t<max && dx*dx+dy*dy+dz*dz-t*t<(mob.type==='shade'?.42:.34)) { best=mob; max=t; }
    }
    return best;
  }
}
