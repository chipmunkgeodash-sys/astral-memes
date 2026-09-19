import { Bike, BIKES } from '../src/bikephysics.js';
import { World } from '../src/world.js';
import { SpatialHash } from '../src/core.js';
export function jumpWorld(yaw=0){
 const w=Object.create(World.prototype);
 Object.assign(w,{terrainHeight:()=>0,terrainSurface:()=>1,surfaces:[],surfHash:new SpatialHash(20),_scratch:[],_stamp:1,
 collideCircle:(x,z,y,r,out={})=>Object.assign(out,{hit:false})});
 w.addSurface({kind:'wedge',cx:12*Math.sin(yaw),cz:12*Math.cos(yaw),yaw:Math.PI/2-yaw,len:24,wid:12,y0:0,y1:4,curve:1.7,surface:1});
 return w;
}
export const neutral={throttle:0,brake:0,rearBrake:0,steer:0,wheelie:false,reverse:false,boost:false};
export function jumpRun(id,speed=18,yaw=0){
 const b=new Bike(jumpWorld(yaw),id);b.reset({x:-3*Math.sin(yaw),z:-3*Math.cos(yaw),y:0,yaw});b.vel.x=speed*Math.sin(yaw);b.vel.z=speed*Math.cos(yaw);b.omegaF=speed/b.cfg.rF;b.omegaR=speed/b.cfg.rR;
 let maxAir=0,landings=0,prev=null;
 for(let i=0;i<240*6&&!b.crashed;i++){
  prev={z:b.pos.z,y:b.pos.y,pitch:b.pitch,groundPitch:b.groundPitch,front:b.frontDown,rear:b.rearDown,vy:b.vel.y};
  b.step(1/240,neutral);maxAir=Math.max(maxAir,b.airTime);landings+=b.events.filter(e=>e.type==='land').length;b.events.length=0;
 }
 return {id,crashed:b.crashed,reason:b.crashReason,z:b.pos.z,pitch:b.pitch,groundPitch:b.groundPitch,maxAir,landings,prev};
}
if(process.argv[1]?.endsWith('jump-diagnostic.mjs'))for(const b of BIKES)console.log(JSON.stringify(jumpRun(b.id)));
