import test from 'node:test';
import assert from 'node:assert/strict';
import { Bike, BIKES, LOOP_OUT_ANGLE } from '../src/bikephysics.js';
import { BikeModel } from '../src/bikemodel.js';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { SpatialHash } from '../src/core.js';
import { jumpRun } from './jump-diagnostic.mjs';
import { wheelieRun } from './wheelie-diagnostic.mjs';
import { turnRun } from './turn-diagnostic.mjs';
import { Input, DEFAULT_BINDINGS } from '../src/input.js';

test('Shift wheelies and Ctrl boosts without overlapping defaults',()=>{
  assert.deepEqual(DEFAULT_BINDINGS.wheelie,['ShiftLeft','ShiftRight']);
  assert.deepEqual(DEFAULT_BINDINGS.boost,['ControlLeft','ControlRight']);
  const input=Object.create(Input.prototype);input.axes={steer:0};input.invertLean=true;
  input.isDown=action=>action==='right';
  assert.ok(input.sample(.1,true).steer<0,'inverted turning reverses right input');
});

for(const id of ['lbx','ultrabee','starkvarg'])test(`${id}: rear brake saves a fender scrape beyond the old loop limit`,()=>{
  const bike=fresh(id,10);bike.pitch=1.42;bike.frontDown=false;bike.rearDown=true;
  bike.pos.y=bike.cfg.rR-(bike.cfg.rR-bike.h)*Math.cos(bike.pitch)+bike.b*Math.sin(bike.pitch);
  bike.checkFailure(10);assert.equal(bike.crashed,false);
  let scraping=0;
  for(let i=0;i<360&&!bike.crashed;i++){
    bike.step(dt,controls({rearBrake:1}));if(bike.fenderScraping)scraping++;
  }
  assert.equal(bike.crashed,false);assert.ok(scraping>30,'scrape lasts long enough to correct');
  assert.ok(bike.pitch<.08,'rear brake brings the front down');
  bike.grounded=true;bike.pitch=LOOP_OUT_ANGLE+.02;bike.checkFailure(10);
  assert.equal(bike.crashReason,'Looped out','still crashes when pushed past the new limit');
});

for(const cfg of BIKES)test(`${cfg.id}: fender contact scrapes before looping, releases and resets`,()=>{
  const bike=fresh(cfg.id,8);bike.pitch=1.31;bike.frontDown=false;bike.rearDown=true;
  bike.pos.y=cfg.rR-(cfg.rR-bike.h)*Math.cos(bike.pitch)+bike.b*Math.sin(bike.pitch);
  bike.updateFenderScrape(dt);
  assert.equal(bike.fenderScraping,true);assert.ok(bike.scrapeIntensity>0);
  assert.ok(bike.scrapePoint.y>=0);assert.equal(bike.events.filter(e=>e.type==='fenderScrape').length,1);
  bike.updateFenderScrape(dt);assert.equal(bike.events.filter(e=>e.type==='fenderScrape').length,1,'one entry cue');
  bike.checkFailure(8);assert.equal(bike.crashed,false,'scrape remains a recoverable trick');
  bike.grounded=false;bike.updateFenderScrape(dt);assert.equal(bike.fenderScraping,false,'no airborne sparks');
  bike.reset({x:0,y:0,z:0,yaw:0});assert.equal(bike.scrapeTime,0);assert.equal(bike.scrapePoint,null);
});

test('throttle taps reach the motor promptly and shut off without a second input ramp',()=>{
  const input=Object.create(Input.prototype);input.axes={steer:0,throttle:0,brake:0,rearBrake:0};
  let held=true;input.isDown=action=>action==='throttle'&&held;
  const bike=fresh('ultrabee');
  for(let i=0;i<24;i++)bike.step(dt,input.sample(dt,true));
  assert.ok(bike.throttle>.65&&bike.throttle<.8,'progressive motor reaches usable throttle within 100ms');
  held=false;
  for(let i=0;i<24;i++)bike.step(dt,input.sample(dt,true));
  assert.ok(bike.throttle<.07,'release promptly removes drive for wheelie correction');
});

for(const cfg of BIKES)test(`${cfg.id}: keyboard throttle release and progressive brakes stop cleanly`,()=>{
  const input=Object.create(Input.prototype);input.axes={steer:0,throttle:0,brake:0,rearBrake:0};
  let braking=false;input.isDown=action=>braking?action==='brake':action==='throttle';
  const bike=fresh(cfg.id,0);
  for(let i=0;i<480&&!bike.crashed;i++)bike.step(dt,input.sample(dt,true));
  assert.equal(bike.crashed,false);assert.ok(bike.speed>3,'keyboard throttle launches bike');
  braking=true;
  for(let i=0;i<1440&&!bike.crashed;i++)bike.step(dt,input.sample(dt,true));
  assert.equal(bike.crashed,false);assert.ok(bike.speed<.1,'brakes stop and hold without reverse creep');
  assert.ok(bike.omegaF>=0&&bike.omegaR>=0,'brakes do not spin wheels backwards');
});

test('airborne turn input gives bounded bank instead of an automatic barrel roll',()=>{
  for(const direction of [-1,1]){
    const bike=fresh('ultrabee');bike.roll=direction*.3;
    for(let i=0;i<480;i++)bike.updateRoll(dt,controls({steer:direction}),0,true,15);
    assert.ok(bike.roll*direction>.3&&bike.roll*direction<.8);
    assert.ok(Math.abs(bike.rollRate)<.5);
  }
});

test('suspension absorbs touchdown impulses and settles without persistent bounce',()=>{
  const bike=fresh('ultrabee');bike.suspFv=1.2;bike.suspRv=1.0;
  const front=bike.suspF,rear=bike.suspR;
  for(let i=0;i<12;i++)bike.updateSuspension(dt,front,rear);
  assert.ok(bike.suspF>front+.01&&bike.suspR>rear+.01,'impact compresses both springs');
  for(let i=0;i<480;i++)bike.updateSuspension(dt,front,rear);
  assert.ok(Math.abs(bike.suspF-front)<1e-5&&Math.abs(bike.suspR-rear)<1e-5);
  assert.ok(Math.abs(bike.suspFv)<1e-4&&Math.abs(bike.suspRv)<1e-4);
});

test('landing along a downslope preserves tangent speed and uses the first contacting wheel',()=>{
  const bike=fresh('ultrabee',20),slope={nx:0,ny:Math.cos(.65),nz:Math.sin(.65)};
  bike.pitch=-.65;bike.vel.y=-20*Math.tan(.65);bike.vLong=20;bike.airTime=1;
  const before={...bike.vel};
  bike.handleLanding(slope,{nx:0,ny:1,nz:0},false);
  assert.equal(bike.crashed,false);assert.ok(bike.impactSpeed<1e-8);
  assert.ok(Math.abs(bike.vel.y-before.y)<1e-8&&Math.abs(bike.vel.z-before.z)<1e-8);
  const uphill=fresh('ultrabee',20),up={nx:0,ny:Math.cos(.4),nz:-Math.sin(.4)};
  uphill.pitch=.4;uphill.vel.y=-2;uphill.airTime=1;
  uphill.handleLanding(up,up,true);
  assert.ok(uphill.impactSpeed>9,'uphill face uses closing speed, not just vertical speed');
});

for(const cfg of BIKES){
  test(`${cfg.id}: mirrored slow and fast turns track the rear tyre on grass, dirt and road`,()=>{
    for(const speed of [2,8,20])for(const surface of [0,1,2]){
      const right=turnRun(cfg.id,speed,surface,1),left=turnRun(cfg.id,speed,surface,-1);
      for(const {bike,rows} of [right,left]){
        assert.equal(bike.crashed,false);
        assert.ok(rows.slice(-60).every(r=>Math.abs(r.slip)<.04),'rear contact tracks within 2.3 degrees');
        assert.ok(rows.every(r=>Number.isFinite(r.roll)&&Math.abs(r.roll)<.8),'stable bank');
      }
      assert.ok(right.bike.roll>.02&&right.bike.yaw>.03,'inward bank follows the curved path');
      assert.ok(Math.abs(right.bike.roll+left.bike.roll)<1e-5,'symmetric lean');
      assert.ok(Math.abs(right.bike.yaw+left.bike.yaw)<1e-5,'symmetric path');
    }
  });
}

test('retired Storm Bee is absent and old saved selections fall back to LBX',()=>{
  assert.ok(!BIKES.some(b=>b.id==='stormbee'));
  assert.equal(new Bike(world,'stormbee').cfg.id,'lbx');
});
for(const id of ['lbx','ultrabee','starkvarg']){
  test(`${id}: wheelie lean leads yaw and rear contact follows the tyre heading`,()=>{
    for(const direction of [-1,1]){
      const {bike,rows}=wheelieRun(id,direction),last=rows.at(-1);
      assert.equal(bike.crashed,false);
      assert.ok(Math.abs(rows[0].yawRate)<.001,'turn input must not instantly yaw an upright wheelie');
      assert.ok(last.roll*direction>.25&&last.roll*direction<.75,'controlled inward lean');
      assert.ok(last.yaw*direction>.06,'lean curves the actual trajectory');
      assert.ok(rows.slice(80).every(r=>Math.abs(r.slip)<.04),'rear tyre tracks its rolling direction within 2.3 degrees');
      assert.ok(last.rear&&!last.front);
    }
  });
}

const dt = 1 / 240;
for(const cfg of BIKES){
  test(`${cfg.id}: rides off a jump lip and lands without a false loop-out`,()=>{
    for(const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI])for(const speed of [15,22]){
      const result=jumpRun(cfg.id,speed,yaw);
      assert.equal(result.crashed,false,`${result.reason} at speed ${speed}, yaw ${yaw}`);
      assert.ok(result.maxAir>.5,'must actually leave the ramp');
      assert.ok(result.landings>=1,'must complete a landing');
    }
  });
}
const world = {
  queryGround: (x, z, y, out = {}) => Object.assign(out, { y: 0, nx: 0, ny: 1, nz: 0, surface: 2 }),
  collideCircle: (x, z, y, r, out = {}) => Object.assign(out, { hit: false }),
  terrainHeight: () => 0,
};
const controls = (values = {}) => ({ steer: 0, throttle: 0, brake: 0, rearBrake: 0,
  wheelie: false, boost: false, reverse: false, ...values });
function fresh(id, speed = 8) {
  const bike = new Bike(world, id);
  bike.reset({ x: 0, y: 0, z: 0, yaw: 0 });
  bike.vel.z = speed;
  bike.omegaR = speed / bike.cfg.rR;
  bike.omegaF = speed / bike.cfg.rF;
  return bike;
}
function run(bike, seconds, input) {
  for (let i = 0; i < Math.round(seconds / dt) && !bike.crashed; i++) {
    bike.step(dt, controls(typeof input === 'function' ? input(bike) : input));
    assert.ok([bike.pos.x, bike.pos.y, bike.pos.z, bike.pitch, bike.roll,
      bike.yaw, bike.vel.x, bike.vel.y, bike.vel.z].every(Number.isFinite));
    bike.events.length = 0;
  }
}
function lift(bike, angle = 0.55) {
  for (let i = 0; i < 720 && bike.pitch < angle && !bike.crashed; i++) {
    bike.step(dt, controls({ throttle: 1, wheelie: true }));
  }
  assert.ok(bike.pitch >= angle && !bike.crashed, `${bike.cfg.id} should lift`);
}

for (const surface of [1,2]) {
  test(`Stark full throttle launches on surface ${surface} without a burnout or tyre chatter`,()=>{
    const bike=fresh('starkvarg',0);
    bike.world={...world,queryGround:(x,z,y,out={})=>Object.assign(out,{y:0,nx:0,ny:1,nz:0,surface})};
    let maxSlip=0,maxJerk=0,previous=0;
    for(let i=0;i<720;i++){
      bike.step(dt,controls({throttle:1}));
      maxSlip=Math.max(maxSlip,Math.abs(bike.rearSlip));
      if(i>60)maxJerk=Math.max(maxJerk,Math.abs(bike._lastAx-previous));
      previous=bike._lastAx;
    }
    assert.equal(bike.crashed,false);assert.ok(bike.kmh>40);
    assert.ok(maxSlip<.15,`peak tyre slip ${maxSlip}`);
    assert.ok(maxJerk<.15,`step acceleration oscillation ${maxJerk}`);
  });
}

function obstacleWorld(){
  const w=Object.assign(Object.create(World.prototype),world);
  w.obstacles=[];w.obsHash=new SpatialHash(22);w._scratch=[];w._stamp=1;
  w.collideCircle=World.prototype.collideCircle;return w;
}
for(const cfg of BIKES){
  test(`${cfg.id}: collision follows tyre ends and leaves space beside the frame`,()=>{
    const b=fresh(cfg.id,0);b.world=obstacleWorld();
    const end=b.a+cfg.rF;
    b.world.addObstacle({x:0,z:end-.04,w:.20,d:.05,y:0,h:.7,kind:'pole'});
    b.resolveCollisions(dt);assert.ok(b.pos.z<-.03,'front tyre must contact pole before chassis does');
    b.reset({x:0,y:0,z:0,yaw:0});b.world=obstacleWorld();
    b.world.addObstacle({x:.40,z:-b.b*.5,w:.08,d:.08,y:0,h:.3,kind:'pole'});
    b.resolveCollisions(dt);assert.equal(b.pos.x,0,'nearby low obstacle is outside the bike');
    b.world=obstacleWorld();b.reset({x:0,y:0,z:0,yaw:Math.PI/2});
    b.world.addObstacle({x:end-.04,z:0,w:.05,d:.20,y:0,h:.7,kind:'pole'});
    b.resolveCollisions(dt);assert.ok(b.pos.x<-.03,'collision rotates with yaw');
  });
}
test('raised front tyre clears a low obstacle and vehicle contact respects height',()=>{
  const bike=fresh('starkvarg',0);bike.pitch=.8;bike.pos.y=1.1;bike.world=obstacleWorld();
  bike.world.addObstacle({x:0,z:.9,w:.1,d:.1,y:0,h:.2});
  bike.resolveCollisions(dt);assert.equal(bike.pos.z,0);
  const vehicle={x:0,z:0,y:0,yaw:0,speed:0,type:{w:1.8,l:4.4,h:1.3}};
  bike.pos.y=5;bike.collideVehicle(vehicle,dt);assert.equal(bike.pos.z,0);
});
test('front tyre strikes traffic before the centre enters the car; parallel clearance remains free',()=>{
  const b=fresh('lbx',12),car={x:0,z:3,y:0,yaw:0,speed:0,type:{w:1.8,l:4.4,h:1.3}};
  b.collideVehicle(car,dt);assert.ok(b.crashed,'front wheel reaches the rear bumper');
  const clear=fresh('lbx',8);clear.pos.x=1.5;clear.collideVehicle(car,dt);
  assert.equal(clear.crashed,false);assert.equal(clear.pos.x,1.5);
});
test('fast bike cannot skip a thin pole between physics steps',()=>{
  const bike=fresh('r1',80);bike.world=obstacleWorld();
  const nose=bike.a+bike.cfg.rF;
  bike.world.addObstacle({x:0,z:nose+.20,w:.1,d:.02,y:0,h:2,kind:'pole'});
  bike.step(dt,controls());
  assert.equal(bike.crashReason,'Collision');
  assert.ok(bike.pos.z<.23,'bike stopped at the pole instead of crossing it');
});

test('airborne brakes exchange finite wheel momentum; locked wheels cannot keep pitching', () => {
  const bike = fresh('starkvarg', 0);bike.pos.y = 100;
  bike.omegaF = 40;bike.omegaR = 45;
  run(bike,.25,{brake:1});
  assert.equal(bike.omegaF,0);assert.equal(bike.omegaR,0);
  assert.ok(bike.pitchRate < -.1, 'braking spinning wheels lowers the nose');
  const rate=bike.pitchRate;
  run(bike,.25,{brake:1,wheelie:true});
  assert.ok(Math.abs(bike.pitchRate-rate)<1e-10, 'held brake/CTRL cannot add torque after the wheels stop');
});

test('airborne throttle raises the nose through rear wheel angular momentum', () => {
  const bike=fresh('lbx',0);bike.pos.y=100;
  run(bike,.2,{throttle:1});
  assert.ok(bike.omegaR>10 && bike.pitchRate>.05);
});

test('stoppie recovery integrates rotation instead of snapping the rear onto the road', () => {
  const bike=fresh('lbx',8);bike.pitch=-.20;bike.pitchRate=.12;
  bike.updatePitch(dt,controls(),0,false,true,false,1000,0,1);
  assert.ok(bike.pitch<-.19 && bike.pitchRate>.12);
});

for (const cfg of BIKES) {
  test(`${cfg.id}: throttle response is progressive, loads conserve supported weight, CTRL alone does not lift`, () => {
    const bike=fresh(cfg.id,0);
    bike.step(dt,controls({throttle:1}));
    assert.ok(bike.throttle>0 && bike.throttle<.1);
    for (let i=0;i<120;i++) {
      bike.step(dt,controls({throttle:.5}));
      if(bike.grounded) assert.ok(Math.abs(bike.Nf+bike.Nr-bike.m*9.81)<.001);
    }
    bike.reset({x:0,y:0,z:0,yaw:0});assert.equal(bike.throttle,0);
    run(bike,2,{wheelie:true});
    assert.ok(Math.abs(bike.pitch)<.001 && bike.speed<.1);
  });
}

for (const cfg of BIKES) {
  test(`${cfg.id}: throttle launches from rest without bogging or crashing`, () => {
    const bike = fresh(cfg.id, 0);
    run(bike, 4, { throttle: 0.4 });
    assert.equal(bike.crashed, false);
    assert.ok(bike.kmh > 10, `launch reached only ${bike.kmh} km/h`);
  });

  test(`${cfg.id}: committed throttle loops, rear brake saves a recoverable wheelie`, () => {
    const loop = fresh(cfg.id);
    run(loop, 5, { throttle: 1, wheelie: true });
    assert.equal(loop.crashReason, 'Looped out');
    const saved = fresh(cfg.id);
    lift(saved, 0.65);
    run(saved, 1, { rearBrake: 1 });
    assert.equal(saved.crashed, false);
    assert.ok(saved.pitch < 0.08);
  });

  test(`${cfg.id}: cruising and braking remain stable`, () => {
    const bike = fresh(cfg.id, 12);
    run(bike, 4, { throttle: 0.25, steer: 0.25 });
    assert.equal(bike.crashed, false);
    assert.ok(bike.yaw > 0.03);
    run(bike, 5, { brake: 1 });
    assert.equal(bike.crashed, false);
    assert.ok(bike.speed < 0.5);
  });
}

for (const id of ['lbx', 'ultrabee', 'starkvarg']) {
  test(`${id}: rear-contact wheelie turns left and right`, () => {
    const results = [];
    for (const steer of [-0.7, 0.7]) {
      const bike = fresh(id);
      lift(bike);
      // Feed in less power on the VARG, whose rear tyre saturates at full power.
      const throttle = id === 'starkvarg' ? 0.23 : 0.60;
      const yaw = bike.yaw;
      let rearOnly = 0;
      run(bike, 0.60, b => {
        if (b.rearDown && !b.frontDown) rearOnly++;
        return { throttle, wheelie: true, steer };
      });
      assert.equal(bike.crashed, false);
      assert.ok(rearOnly > 100, 'turn must happen with the front tyre raised');
      assert.ok((bike.yaw - yaw) * Math.sign(steer) > 0.06, 'heading must change toward input');
      assert.ok(bike.vel.x * Math.sign(steer) > 0.15, 'trajectory must turn, not just the mesh');
      results.push(bike.yaw - yaw);
    }
    assert.ok(Math.abs(results[0] + results[1]) < 0.005);
  });

  test(`${id}: model geometry is finite and uses configured axle spacing`, () => {
    const cfg = BIKES.find(b => b.id === id);
    const model = new BikeModel(cfg);
    assert.ok(Math.abs(model.pts.frontAxle.z - model.pts.rearAxle.z - cfg.wheelbase) < 1e-8);
    assert.equal(model.exhaustLocal, undefined);
    model.root.traverse(o => {
      if (!o.isMesh) return;
      assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));
      o.geometry.dispose();
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) material.dispose();
    });
  });
}

test('reset clears wheelie contact, slip, acceleration and suspension state', () => {
  const bike = fresh('ultrabee');
  lift(bike);
  bike.reset({ x: 0, y: 0, z: 0, yaw: 0 });
  assert.ok(bike.frontDown && bike.rearDown);
  assert.equal(bike._lastAx, 0);
  assert.equal(bike.lateralSlip, 0);
  assert.equal(bike.suspF, bike.restSuspF);
  assert.equal(bike.suspR, bike.restSuspR);
});

for (const cfg of BIKES) {
  test(`${cfg.id}: S brakes forward motion then reverses at walking pace`, () => {
    const bike = fresh(cfg.id, 8);
    run(bike, 8, { reverse: true, rearBrake: 1 });
    assert.equal(bike.crashed, false);
    assert.ok(bike.vLong < -0.5 && bike.vLong > -2.5, `reverse speed ${bike.vLong}`);
    assert.ok(Number.isFinite(bike.omegaR));
    run(bike, 2, { reverse: true, rearBrake: 1, brake: 1 });
    assert.ok(bike.speed < 0.1, 'front brake must stop reverse');
  });

  test(`${cfg.id}: airborne wheels coast independently and respond to brakes`, () => {
    const coast = fresh(cfg.id, 0);
    coast.pos.y = 20; coast.omegaF = 35; coast.omegaR = 40;
    run(coast, 0.5, {});
    assert.ok(coast.omegaF > 32 && coast.omegaR > 36, 'air must not force wheels toward ground speed');
    run(coast, 0.25, { brake: 1 });
    assert.equal(coast.omegaF, 0);
    assert.equal(coast.omegaR, 0);
  });

  test(`${cfg.id}: climbs and descents follow the road without false wheelies`, () => {
    for (const grade of [-0.18, 0.18]) {
      const normal = new THREE.Vector3(0, 1, -grade).normalize();
      const slope = { ...world, queryGround: (x, z, y, out = {}) => Object.assign(out,
        { y: z * grade, nx: 0, ny: normal.y, nz: normal.z, surface: 2 }) };
      const bike = new Bike(slope, cfg.id); bike.reset({ x: 0, y: 0, z: 0, yaw: 0 });
      bike.vel.z = 8; bike.omegaF = 8 / cfg.rF; bike.omegaR = 8 / cfg.rR;
      run(bike, 1, { throttle: 0.15 });
      assert.equal(bike.crashed, false);
      assert.ok(bike.frontDown && bike.rearDown, `both tyres should contact a ${grade} grade`);
      assert.ok(Math.abs(bike.pitch - Math.atan(grade)) < 0.03);
      assert.equal(bike.wheelieTime, 0); assert.equal(bike.stoppieTime, 0);
    }
  });

  test(`${cfg.id}: animated axles and chain match the configured dimensions`, () => {
    const bike = fresh(cfg.id, 0), model = new BikeModel(cfg);
    model.update(bike, dt, 0); model.root.updateMatrixWorld(true);
    const front = model.frontAxleNode.getWorldPosition(new THREE.Vector3());
    const rear = model.rearAxleNode.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(front.z - rear.z - cfg.wheelbase) < 1e-6);
    assert.ok(Math.abs(front.y - cfg.rF) < 1e-6);
    assert.ok(Math.abs(rear.y - cfg.rR) < 1e-6);
    for (const chain of [model.chainTop, model.chainBot]) {
      chain.geometry.computeBoundingBox();
      const size = chain.geometry.boundingBox.getSize(new THREE.Vector3());
      assert.ok(size.y > 0.99 && size.z < 0.03, 'chain must stretch along the span axis');
      assert.ok(chain.scale.y > 0.3 && chain.scale.y < cfg.wheelbase);
    }
  });
}

test('gravity opposes uphill travel and assists downhill travel', () => {
  const sample = grade => {
    const normal = new THREE.Vector3(0, 1, -grade).normalize();
    const slope = { ...world, queryGround: (x, z, y, out = {}) => Object.assign(out,
      { y: z * grade, nx: normal.x, ny: normal.y, nz: normal.z, surface: 2 }) };
    const bike = new Bike(slope, 'lbx'); bike.reset({ x: 0, y: 0, z: 0, yaw: 0 });
    bike.vel.z = 8; bike.omegaF = 8 / bike.cfg.rF; bike.omegaR = 8 / bike.cfg.rR;
    bike.step(dt, controls());
    return bike._lastAx;
  };
  assert.ok(sample(0.15) < -1);
  assert.ok(sample(-0.15) > 1);
});

test('landing scrub survives the next physics step', () => {
  const bike = fresh('lbx', 15);
  bike.vLong = 15; bike.vel.y = -8; bike.airTime = 1;
  bike.handleLanding({ nx: 0, ny: 1, nz: 0 }, { nx: 0, ny: 1, nz: 0 });
  assert.ok(bike.speed < 14);
  assert.ok(Math.abs(bike.speed - bike.vLong) < 1e-6);
  bike.step(dt, controls());
  assert.ok(bike.speed < 14);
});

test('collision speed loss stays consistent in body and world coordinates', () => {
  const bike = fresh('lbx', 5);
  bike.world = { ...world, collideCircle: (x,z,y,r,out={}) => Object.assign(out,
    {hit:true,nx:0,nz:-1,depth:0.02,obstacle:{bounce:0.15,kind:'rail'}}) };
  bike.resolveCollisions(dt);
  assert.equal(bike.crashed, false);
  assert.ok(Math.abs(bike.vel.z - bike.vLong) < 1e-9);
  assert.ok(Math.abs(bike.vLong) < 0.75);
});

test('reset clears stale events, shift interruption and airborne stunt totals', () => {
  const bike = fresh('r1');
  bike.shiftTimer = 0.25; bike.clutch = 0.12; bike.airRoll = 6; bike.airPitchTotal = 7;
  bike.lastLandingHard = 12; bike.pushEvent('crash', 'old crash');
  bike.reset({ x: 0, y: 0, z: 0, yaw: 0 });
  assert.equal(bike.shiftTimer, 0); assert.equal(bike.clutch, 1);
  assert.equal(bike.airRoll, 0); assert.equal(bike.airPitchTotal, 0);
  assert.equal(bike.lastLandingHard, 0); assert.equal(bike.events.length, 0);
});


test('round trunks have no invisible square corners',()=>{
  const w=obstacleWorld();w.addObstacle({x:0,z:0,w:.48,d:.48,radius:.24,y:0,h:5});
  assert.equal(w.collideCircle(.24,.24,.3,.05,{},.2).hit,false);
  const contact=w.collideCircle(.26,0,.3,.05,{},.2);
  assert.equal(contact.hit,true);assert.ok(Math.abs(contact.depth-.03)<1e-8);
});
test('glancing walls preserve forward travel and resolve corner overlap',()=>{
  const bike=fresh('lbx',10);bike.world=obstacleWorld();
  bike.world.addObstacle({x:.4,z:0,w:.2,d:8,y:0,h:3});
  bike.vel.x=1;bike.vel.z=10;bike.vLat=1;bike.resolveCollisions(dt);
  assert.ok(bike.vel.z>9.99,'wall scrape preserves tangential velocity');
  assert.ok(bike.vel.x<=0,'inward velocity removed');
  bike.world.addObstacle({x:0,z:1.3,w:8,d:.2,y:0,h:3});
  bike.resolveCollisions(dt);const before={...bike.pos};bike.resolveCollisions(dt);
  assert.ok(Math.hypot(bike.pos.x-before.x,bike.pos.z-before.z)<.001,'corner settled without residual overlap');
});
test('garage upgrades change only their own bike and survive repeated application',()=>{
  const stock=new Bike(world,'lbx'),tuned=new Bike(world,'lbx',{battery:'chi',controller:'ebmx',paint:'mint'});
  assert.equal(tuned.cfg.batteryWh,stock.cfg.batteryWh*1.5);
  assert.equal(tuned.cfg.peakPower,stock.cfg.peakPower*1.18*1.3);
  tuned.setConfig('lbx',{battery:'chi',controller:'ebmx',paint:'mint'});
  assert.equal(tuned.cfg.peakPower,stock.cfg.peakPower*1.18*1.3,'bonuses never compound');
  tuned.setConfig('lbx');assert.equal(tuned.cfg.peakPower,stock.cfg.peakPower);
  const gas=new Bike(world,'crf450r',{battery:'chi',controller:'ebmx'});
  assert.equal(gas.cfg.build.controller,'stock','electric parts cannot alter gas bikes');
});

test('Chi alone increases speed and power; EBMX stacks without overwriting it',()=>{const base=new Bike(world,'lbx'),chi=new Bike(world,'lbx',{battery:'chi'}),both=new Bike(world,'lbx',{battery:'chi',controller:'ebmx'});assert.ok(chi.cfg.topSpeed>base.cfg.topSpeed);assert.ok(chi.cfg.peakPower/chi.cfg.mass>base.cfg.peakPower/base.cfg.mass);assert.ok(both.cfg.topSpeed>chi.cfg.topSpeed);assert.ok(both.cfg.peakPower>chi.cfg.peakPower);});
