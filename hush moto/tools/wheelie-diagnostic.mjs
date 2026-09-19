import {Bike,BIKES} from '../src/bikephysics.js';
const world={queryGround:(x,z,y,out={})=>Object.assign(out,{y:0,nx:0,ny:1,nz:0,surface:2}),collideCircle:(x,z,y,r,out={})=>Object.assign(out,{hit:false})};
export function wheelieRun(id,direction=1){
 const b=new Bike(world,id),dt=1/240;
 b.reset({x:0,z:0,y:0,yaw:0});b.vel.z=8;b.omegaR=8/b.cfg.rR;b.omegaF=8/b.cfg.rF;
 const input={throttle:1,steer:0,brake:0,rearBrake:0,wheelie:true,boost:false,reverse:false};
 for(let i=0;i<720&&b.pitch<.55&&!b.crashed;i++)b.step(dt,input);
 const rows=[];
 for(let i=0;i<144&&!b.crashed;i++){
  b.step(dt,{...input,throttle:id==='starkvarg'?.23:.60,steer:.7*direction});
  const lever=-b.b*Math.cos(b.pitch)+(b.h-b.cfg.rR)*Math.sin(b.pitch);
  rows.push({roll:b.roll,yaw:b.yaw,yawRate:b.yawRate,slip:Math.atan2(b.vLat+lever*b.yawRate,Math.max(b.vLong,1)),front:b.frontDown,rear:b.rearDown,pitch:b.pitch});
 }
 return {bike:b,rows};
}
if(process.argv[1]?.endsWith('wheelie-diagnostic.mjs'))for(const c of BIKES){const {bike:b,rows}=wheelieRun(c.id);console.log(c.id,b.crashed,JSON.stringify(rows.at(-1)));}
