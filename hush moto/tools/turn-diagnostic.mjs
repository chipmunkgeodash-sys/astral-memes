import { Bike, BIKES } from '../src/bikephysics.js';
import { pathToFileURL } from 'node:url';

export function turnRun(id, speed=8, surface=2, direction=1, dt=1/240) {
  const world={queryGround:(x,z,y,out={})=>Object.assign(out,{y:0,nx:0,ny:1,nz:0,surface}),
    collideCircle:(x,z,y,r,out={})=>Object.assign(out,{hit:false}),terrainHeight:()=>0};
  const bike=new Bike(world,id);bike.reset({x:0,y:0,z:0,yaw:0});
  bike.vel.z=speed;bike.omegaF=speed/bike.cfg.rF;bike.omegaR=speed/bike.cfg.rR;
  const rows=[];
  for(let i=0;i<Math.round(2/dt)&&!bike.crashed;i++){
    const t=i*dt;
    bike.step(dt,{steer:direction*.45*Math.min(t/.3,1),throttle:0,brake:0,rearBrake:0,wheelie:false,boost:false,reverse:false});
    const lever=-bike.b*Math.cos(bike.pitch)+(bike.h-bike.cfg.rR)*Math.sin(bike.pitch);
    rows.push({roll:bike.roll,yaw:bike.yaw,slip:Math.atan2(bike.vLat+lever*bike.yawRate,Math.max(bike.vLong,1)),speed:bike.speed});
  }
  return {bike,rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  for(const cfg of BIKES)for(const speed of [2,8,20])for(const surface of [0,1,2]){
    const {bike,rows}=turnRun(cfg.id,speed,surface);
    console.log(cfg.id,speed,surface,bike.crashReason||'OK','roll',bike.roll.toFixed(3),'rearSlip',Math.max(...rows.slice(-60).map(r=>Math.abs(r.slip))).toFixed(3));
  }
}
