import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { chargingAllowed, charge, refuelingAllowed, refuel, driveControls, recoverEnergy, canTrick, Trip, Trial } from '../src/ride-systems.js';
import { cleanGear, cleanPose, POSE_LIMITS, BIKE_IDS } from '../src/network-protocol.js';
import { Bike, BIKES } from '../src/bikephysics.js';
import { BikeModel } from '../src/bikemodel.js';
import { World } from '../src/world.js';
const bike=()=>({pos:{x:0,y:.6,z:0},speed:0,kmh:0,m:140,battery:.2,cfg:{kind:'electric',batteryWh:2000},grounded:true,resetVersion:1});
const ctrl={throttle:1,boost:1,brake:0,rearBrake:0,reverse:false};
test('removed E Ride is absent from both the garage and multiplayer allowlist',()=>{assert.ok(!BIKES.some(b=>b.id==='eride'));assert.ok(!BIKE_IDS.includes('eride'));});
test('charging requires an electric bike stopped inside the bay on the same ground level',()=>{
 const b=bike(),s={x:0,y:0,z:0};assert.ok(chargingAllowed(b,s));
 for(const altered of [{speed:3},{crashed:true},{pos:{x:5,y:.6,z:0}},{pos:{x:0,y:8,z:0}},{cfg:{kind:'gas'}}])assert.equal(chargingAllowed({...b,...altered},s),false);
 assert.equal(chargingAllowed(b,s,true),false);
});
test('fuel pumps reject electric bikes, motion, height differences and arrests',()=>{
 const b={...bike(),cfg:{kind:'gas',tankLiters:12},fuel:.5},s={x:0,y:0,z:0,kind:'gas'};
 assert.ok(refuelingAllowed(b,s));assert.equal(refuelingAllowed(bike(),s),false);assert.equal(chargingAllowed(bike(),s),false);
 assert.equal(refuelingAllowed({...b,speed:2},s),false);assert.equal(refuelingAllowed(b,s,true),false);assert.equal(refuelingAllowed(b,{...s,y:10}),false);
 assert.ok(Math.abs(refuel(b,5)-3)<1e-8);assert.equal(b.fuel,.75);refuel(b,100);assert.equal(b.fuel,1);refuel(b,-1);assert.equal(b.fuel,1);
});
test('gas fuel depletes under power, stays through resets, and an empty tank cuts drive',()=>{
 const ground={queryGround:(x,z,y,out)=>Object.assign(out,{y:0,nx:0,ny:1,nz:0,surface:2}),collideCircle:()=>({hit:false})};
 const b=new Bike(ground,'crf450r');b.reset({x:0,y:0,z:0,yaw:0});for(let i=0;i<240;i++)b.step(1/240,{...ctrl,steer:0,wheelie:0,boost:0});assert.ok(b.fuel<1);const fuel=b.fuel;b.reset({x:0,y:0,z:0,yaw:0});assert.equal(b.fuel,fuel);b.fuel=0;for(let i=0;i<240;i++)b.step(1/240,{...ctrl,steer:0,wheelie:0,boost:0});assert.ok(b.speed<.1);assert.equal(b.fuel,0);
});
test('charger respects target, capacity and does not discharge a pack above target',()=>{
 const b=bike();assert.ok(Math.abs(charge(b,30,.8)-1000)<1e-8);assert.ok(Math.abs(b.battery-.7)<1e-9);charge(b,50,.8);assert.equal(b.battery,.8);charge(b,50,.5);assert.equal(b.battery,.8);
 const big=bike();big.cfg.batteryWh=4000;charge(big,30);assert.equal(big.battery,.45);
});
test('modes, limiter and cruise preserve brakes and cancel cruise on safety transitions',()=>{
 const b={...bike(),kmh:30,speed:30/3.6};assert.equal(driveControls(ctrl,b,{mode:'eco'},0).controls.throttle,.48);
 assert.equal(driveControls(ctrl,b,{mode:'eco'},0).controls.boost,0);
 assert.equal(driveControls(ctrl,b,{mode:'sport',limit:25},0).controls.throttle,0);
 assert.equal(driveControls({...ctrl,throttle:0},b,{mode:'sport'},40).controls.throttle,1);
 for(const c of [{...ctrl,brake:1},{...ctrl,rearBrake:1},{...ctrl,reverse:true}])assert.equal(driveControls(c,b,{},40).cruise,0);
 assert.equal(driveControls(ctrl,b,{},40,false).cruise,0);
});
test('regen recovers only lost kinetic energy while grounded and braking',()=>{
 const b={...bike(),speed:8};const c={throttle:0,brake:.2};const energy=recoverEnergy(b,10,c,.1,2);assert.ok(energy>0);assert.ok(energy<=250/3600);const before=b.battery;
 recoverEnergy(b,7,c,.1,2);recoverEnergy({...b,grounded:false},10,c,.1,2);assert.equal(b.battery,before);
 assert.equal(recoverEnergy(b,10,{throttle:1,brake:1},.1,2),0);
});
test('trip distance excludes respawns and unexplained teleports',()=>{
 const t=new Trip(),b=bike();t.update(b,.1);b.pos.z=1;t.update(b,.1);assert.equal(t.distance,1);b.pos.z=50;t.update(b,.1);assert.equal(t.distance,1);b.pos.z=51;b.resetVersion++;t.update(b,.1);assert.equal(t.distance,1);
});
test('performance tests wait for launch, finish at their threshold and cancel on reset',()=>{
 const b=bike(),accel=new Trial('acceleration',b);accel.update(b,2,0);assert.equal(accel.time,0);b.kmh=10;accel.update(b,1,3);b.kmh=50;accel.update(b,1,12);assert.equal(accel.result,'2.00 s');
 const braking=new Trial('braking',b);b.kmh=55;braking.update(b,1,12);assert.equal(braking.started,false);b.kmh=49;braking.update(b,1,10);b.kmh=.5;braking.update(b,1,4);assert.equal(braking.result,'14.0 m');
 const long=new Trial('distance',b);b.resetVersion++;long.update(b,1,1000);assert.match(long.result,/Cancelled/);
});
test('tricks cannot score stopped or crashed, and advanced tricks require airtime',()=>{
 const b=bike();assert.equal(canTrick(b,0),false);b.speed=10;assert.ok(canTrick(b,0));assert.equal(canTrick(b,4),false);b.grounded=false;assert.ok(canTrick(b,4));b.crashed=true;assert.equal(canTrick(b,1),false);
});
test('outfits sanitize colors, numbers and booleans; poses preserve optional trick animation',()=>{
 assert.equal(cleanGear({gearA:'url(secret)',number:'<b>',backpack:'yes'}).gearA,'#4ef0b3');
 const pose={...Object.fromEntries(Object.keys(POSE_LIMITS).map(k=>[k,0])),bikeId:'lbx',gear:{gearA:'#112233',number:'42',backpack:true},trickIndex:4,trickBlend:.6};
 const p=cleanPose(pose);assert.equal(p.gear.gearA,'#112233');assert.equal(p.gear.number,'42');assert.equal(p.trickIndex,4);assert.equal(p.trickBlend,.6);
});
test('all five trick animations keep articulated rider geometry finite',()=>{
 const world={queryGround:(x,z,y,out)=>Object.assign(out,{y:0,nx:0,ny:1,nz:0,surface:0})};const b=new Bike(world,'lbx');b.reset({x:0,y:0,z:0,yaw:0});const model=new BikeModel({...b.cfg,asset:null});
 for(let i=0;i<5;i++){model.update({...b,speed:10,grounded:false,trickIndex:i,trickBlend:1},1/60,0);model.root.updateMatrixWorld(true);model.root.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));}
});
test('slalom gates and charger bays are reachable on the generated world',()=>{
 const noop=()=>{};const context=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createLinearGradient:()=>({addColorStop:noop}),measureText:()=>({width:50})},{get:(t,k)=>t[k]??noop});
 globalThis.document={createElement:()=>({getContext:()=>context})};
 const w=new World(new T.Scene(),'low');delete globalThis.document;const s=w.spawnPoints.find(s=>s.name==='Dirt playground');
 for(let i=0;i<6;i++){let x=s.x+(i%2?3:-3),z=s.z+12+i*12,y=w.terrainHeight(x,z);if(w.collideCircle(x,z,y+.5,2,{}).hit){x=s.x;y=w.terrainHeight(x,z);}assert.equal(w.collideCircle(x,z,y+.5,1,{}).hit,false,`gate ${i}`);}
 for(const [x,z] of [[-210,-60],[210,210]])assert.equal(w.collideCircle(x,z,w.terrainHeight(x,z)+.5,3,{}).hit,false,'gas station bay');
 for(const p of w.spawnPoints.filter(s=>['Parking lot','Dirt playground','Stunt park'].includes(s.name)))assert.equal(w.collideCircle(p.x,p.z,p.y+.5,1,{}).hit,false,p.name);
});
