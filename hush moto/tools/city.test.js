import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Police, policeRoute } from '../src/police.js';
import { Pedestrians } from '../src/pedestrians.js';
import { buildRoads, buildCityGraph, baseRoadHeight } from '../src/roadnet.js';
import { World } from '../src/world.js';
import { SpatialHash } from '../src/core.js';
import { Bike, BIKES } from '../src/bikephysics.js';
import { BikeModel } from '../src/bikemodel.js';
import { jointPoint } from '../src/humanoid.js';
import { CameraRig } from '../src/camera.js';
import { crossingAt, crossingClear, sidewalkRoute, pedestrianSpeedLimit } from '../src/crosswalks.js';
import { Traffic } from '../src/traffic.js';
import fs from 'node:fs';

for(const quality of ['low','high']){
  test(`${quality}: grass physics matches rendered triangle heights between vertices`,()=>{
    const w=Object.create(World.prototype);w.quality=quality;
    w.terrainHeight=(x,z)=>Math.sin(x*.12)*1.8+Math.cos(z*.17)*1.2;
    w.terrainSurface=()=>0;w.surfHash=new SpatialHash(20);w._scratch=[];w._stamp=1;
    const geometry=w.buildTerrainGeometry();w.terrainMesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
    w.terrainMesh.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(),direction=new THREE.Vector3(0,-1,0);
    let oldMismatch=0;
    for(let i=0;i<40;i++){
      const x=-190+i*9.571,z=105+Math.sin(i*2)*75;
      ray.set(new THREE.Vector3(x,30,z),direction);
      const hit=ray.intersectObject(w.terrainMesh)[0];assert.ok(hit);
      oldMismatch=Math.max(oldMismatch,Math.abs(w.terrainHeight(x,z)-hit.point.y));
      assert.ok(Math.abs(w.queryGround(x,z,20,{}).y-hit.point.y)<.00001,'contact matches visible grass');
    }
    assert.ok(oldMismatch>.02,'fixture must exercise the former mesh mismatch');
    geometry.dispose();w.terrainMesh.material.dispose();
  });
}

test('sidewalk and crossing-cut contact matches the rendered pavement triangles',()=>{
  const w=Object.create(World.prototype);w.scene=new THREE.Scene();w.graph=buildCityGraph(buildRoads());
  w.terrainHeight=(x,z)=>Math.sin(x*.04)*.3+Math.cos(z*.03)*.2;
  w.terrainMeshHeight=w.terrainHeight;w.terrainSurface=()=>0;
  w.surfHash=new SpatialHash(20);w._scratch=[];w._stamp=1;
  w.buildSidewalks();const mesh=w.scene.children[0];mesh.updateMatrixWorld(true);
  const positions=mesh.geometry.attributes.position,index=mesh.geometry.index;
  const count=index?index.count:positions.count;
  for(let i=0;i<count;i+=Math.max(3,Math.floor(count/150/3)*3)){
    if(i+2>=count)break;
    const a=new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(i):i);
    const b=new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(i+1):i+1);
    const c=new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(i+2):i+2);
    const p=a.add(b).add(c).multiplyScalar(1/3),ground=w.queryGround(p.x,p.z,20,{});
    assert.ok(Math.abs(ground.y-p.y)<1e-5,'tyre support matches pavement height');
    assert.equal(ground.surface,3);assert.ok(ground.ny>.8);
  }
});

test('wheelie turning shifts rider, gaze and bars symmetrically while hands stay on grips',()=>{
  const results=[];
  for(const direction of [-1,1]){
    const {world}=setup(),bike=new Bike(world,'ultrabee'),model=new BikeModel(bike.cfg);
    bike.reset({x:0,y:0,z:0,yaw:0});bike.pitch=.65;bike.yawRate=direction*.5;bike.steer=direction*.08;
    bike.grounded=true;bike.vel.z=8;
    for(let i=0;i<60;i++)model.update(bike,1/60,0);
    assert.ok(model.rider.pelvis.position.x*direction>.035);
    assert.ok(model.rider.head.rotation.y*direction>.15);
    assert.equal(model.visualSteer,bike.steer,'rendered bars match the simulated steering');
    model.root.updateMatrixWorld(true);
    const torsoUp=new THREE.Vector3(0,1,0).transformDirection(model.rider.torso.matrixWorld);
    assert.ok(torsoUp.y>.85,'rider balances upright rather than lying back with the raised bike');
    for(let i=0;i<2;i++){
      const glove=model.rider.arms[i].glove.getWorldPosition(new THREE.Vector3());
      assert.ok(glove.distanceTo(model.gripPos[i].getWorldPosition(new THREE.Vector3()))<.001);
    }
    results.push(model.rider.pelvis.position.x);
    bike.pitch=0;bike.yawRate=0;bike.steer=0;
    for(let i=0;i<120;i++)model.update(bike,1/60,0);
    assert.ok(Math.abs(model.rider.pelvis.position.x)<.001,'pose returns to centre');
  }
  assert.ok(Math.abs(results[0]+results[1])<.001);
});

test('banked takeoff does not teleport the model, and reset clears the old rider pose',()=>{
  const {world}=setup(),bike=new Bike(world,'ultrabee'),model=new BikeModel(bike.cfg);
  bike.reset({x:0,y:0,z:0,yaw:0});bike.roll=.5;bike.steer=.2;bike.vel.z=12;
  for(let i=0;i<90;i++)model.update(bike,1/60,0);
  const before=model.root.position.clone();bike.grounded=false;bike.frontDown=bike.rearDown=false;
  model.update(bike,1/60,0);
  assert.ok(before.distanceTo(model.root.position)<.08,'release bank pivot without a one-frame position snap');
  bike.reset({x:0,y:0,z:0,yaw:0});model.update(bike,1/60,0);
  assert.ok(Math.abs(model.rider.pelvis.position.x)<1e-8);
  assert.ok(Math.abs(model.rider.head.rotation.y)<1e-8);
  assert.ok(model.root.position.distanceTo(new THREE.Vector3(bike.pos.x,bike.pos.y,bike.pos.z))<1e-8);
  assert.equal(model.visualSteer,0);
});

test('rider corners inward, absorbs compression and keeps hands attached during transitions',()=>{
  const {world}=setup(),bike=new Bike(world,'ultrabee'),model=new BikeModel(bike.cfg);
  bike.reset({x:0,y:0,z:0,yaw:0});bike.vel.z=12;bike.grounded=true;bike.surface=2;
  for(const direction of [-1,1]){
    bike.roll=direction*.4;bike.steer=direction*.09;bike.yawRate=direction*.3;
    for(let i=0;i<120;i++){
      model.update(bike,1/60,0);model.root.updateMatrixWorld(true);
      for(let j=0;j<2;j++)assert.ok(model.rider.arms[j].glove.getWorldPosition(new THREE.Vector3())
        .distanceTo(model.gripPos[j].getWorldPosition(new THREE.Vector3()))<1e-5);
    }
    assert.ok(model.rider.pelvis.position.x*direction>.025,'hips move into turn');
    assert.ok(model.rider.head.rotation.y*direction>.2,'look through turn');
  }
  const height=model.rider.pelvis.position.y;
  bike.suspF=(bike.restSuspF||0)+.1;bike.suspR=(bike.restSuspR||0)+.1;
  for(let i=0;i<60;i++)model.update(bike,1/60,0);
  assert.ok(model.rider.pelvis.position.y<height-.025,'knees absorb suspension compression');
  bike.roll=0;bike.steer=0;bike.yawRate=0;
  for(let i=0;i<120;i++)model.update(bike,1/60,0);
  assert.ok(Math.abs(model.rider.pelvis.position.x)<.001,'returns to neutral');
});

test('leaning a wheelie keeps rear wheel heading aligned and its contact on the ground',()=>{
  const {world}=setup(),bike=new Bike(world,'ultrabee'),model=new BikeModel(bike.cfg);
  for(const roll of [-.5,.5])for(const yaw of [0,1.2]){
    bike.reset({x:0,y:0,z:0,yaw});bike.pitch=.7;bike.roll=roll;
    bike.frontDown=false;bike.rearDown=true;
    bike.pos.y=bike.cfg.rR-(bike.cfg.rR-bike.h)*Math.cos(bike.pitch)+bike.b*Math.sin(bike.pitch);
    model.update(bike,1/60,0);model.root.updateMatrixWorld(true);
    const axleDirection=new THREE.Vector3(1,0,0).transformDirection(model.root.matrixWorld);
    const rolling=new THREE.Vector3().crossVectors(axleDirection,new THREE.Vector3(0,1,0)).normalize();
    assert.ok(rolling.dot(new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)))>.99999,'rear wheel cannot swivel against its path when banked');
    const axle=model.rearAxleNode.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(axle.y-bike.cfg.rR*Math.cos(roll))<.0001,'lean pivots at the rear tyre, not the floating chassis');
  }
});

test('deep obstacle overlap returns a unit normal and the actual escape distance', () => {
  const world = Object.create(World.prototype);
  world.obstacles = [];world.obsHash = new SpatialHash(22);world._scratch = [];world._stamp = 1;
  world.addObstacle({ x: 10, z: 10, w: 4, d: 6, y: 0, h: 5, yaw: .4 });
  const hit = world.collideCircle(10, 10, 1, .5);
  assert.ok(hit.hit);assert.ok(Math.abs(Math.hypot(hit.nx, hit.nz) - 1) < 1e-10);
  assert.equal(hit.depth, 2.5);
  const cleared = world.collideCircle(10 + hit.nx * (hit.depth + .01), 10 + hit.nz * (hit.depth + .01), 1, .5);
  assert.equal(cleared.hit, false);
});

test('bridge graph separates the deck from the avenue underneath', () => {
  const { world } = setup(), nodes = world.graph.nodes.filter(n => n.x === 140 && n.z === 0);
  assert.equal(nodes.length, 2);
  for (const node of nodes) {
    const axes = new Set(node.out.map(id => world.graph.edges[id].axis));
    assert.equal(axes.size, 1);assert.equal([...axes][0], node.isOverpass ? 'v' : 'h');
  }
});

test('bridge ramps meet the deck continuously and leave neighboring crossings clear', () => {
  const world = Object.create(World.prototype);
  world.terrainHeight = baseRoadHeight;world.surfaces = [];world.surfHash = new SpatialHash(20);
  world.buildRampsAndPlatforms();
  const bridge = world.surfaces.filter(s => s.isBridge), deck = bridge.find(s => s.kind === 'flat');
  for (const ramp of bridge.filter(s => s.kind === 'wedge')) {
    const z = Math.sign(ramp.cz) * world.bridge.half;
    assert.ok(Math.abs(world.surfaceHeightAt(deck, 140, z) - world.surfaceHeightAt(ramp, 140, z)) < 1e-8);
    assert.ok(Math.abs(ramp.cz) + ramp.len / 2 < 120, 'ramp ends before the neighboring crosswalk');
  }
  const vertical = { axis: 'v', road: { coord: 140 } }, horizontal = { axis: 'h', road: { coord: 0 } };
  assert.ok(world.trafficHeight(140, 0, vertical) > baseRoadHeight(140, 0) + 8.9);
  assert.equal(world.trafficHeight(140, 0, horizontal), baseRoadHeight(140, 0) + .05);
});

test('Blender asset contains its textures and separate steerable fork and wheels', () => {
  const bytes = fs.readFileSync(new URL('../assets/bikes/duhgless/bike3.glb', import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.match(json.asset.generator, /Blender/);
  for (const name of ['Cube', 'Fork', 'Front-Wheel', 'Back-Wheel']) assert.ok(json.nodes.some(n => n.name === name));
  assert.equal(json.images.length, 4);
  assert.ok(json.images.every(image => Number.isInteger(image.bufferView)), 'textures are embedded for offline play');
});

test('pedestrians cross the road, reach the opposite sidewalk, and continue walking', () => {
  const { world, bike } = setup(), peds = new Pedestrians(new THREE.Scene(), world, 1);
  const edge = world.graph.edges.find(e => !world.graph.nodes[e.b].light), route = sidewalkRoute(world.graph, edge);
  const p = peds.peds[0];Object.assign(p, route[1], { active: true, y: .22, edge, route, side: 1, direction: 1, state: 'walking' });
  bike.pos.x = p.x + 30;bike.pos.z = p.z;
  let crossed = false;
  for (let i = 0; i < 40 * 60; i++) { peds.update(1 / 60, bike);crossed ||= p.state === 'crossing'; }
  assert.ok(crossed);assert.equal(p.side, -1);assert.equal(p.state, 'walking');
  assert.equal(p.direction, 0);assert.ok(Number.isFinite(p.y));
});

test('crossing waits for moving traffic and blocked stripes but accepts a stopped yielding car', () => {
  const { world, bike } = setup(), c = crossingAt(world.graph, world.graph.edges[0], 1);
  bike.pos = { x: 900, z: 900, y: 0 };
  const car = { x: c.x - c.dx * 20, z: c.z - c.dz * 20, yaw: Math.atan2(c.dx, c.dz), speed: 12, type: { l: 4.5 } };
  assert.equal(crossingClear(c, [car], bike, 15), false);
  car.speed = 0;assert.equal(crossingClear(c, [car], bike, 15), true);
  car.x = c.x;car.z = c.z;assert.equal(crossingClear(c, [car], bike, 15), false);
  car.y = 8;assert.equal(crossingClear({ ...c, y: 0 }, [car], bike, 15), true);
});

test('pedestrians wait at a green traffic light then cross on red when clear', () => {
  const { world, bike } = setup(), peds = new Pedestrians(new THREE.Scene(), world, 1);
  const edge = world.graph.edges.find(e => world.graph.nodes[e.b].light), route = sidewalkRoute(world.graph, edge);
  const p = peds.peds[0];Object.assign(p, route[1], { active: true, y: .22, edge, route, side: 1, direction: 1, state: 'walking' });
  bike.pos.x = p.x + 40;bike.pos.z = p.z;
  for (let i = 0; i < 180; i++) peds.update(1 / 60, bike);
  assert.equal(p.state, 'waiting');assert.equal(p.x, route[1].x);
  world.lightStateFor = () => 'red';peds.update(1 / 60, bike);assert.equal(p.state, 'crossing');
});

test('cars brake before an occupied crossing and resume after it clears', () => {
  const { world, bike } = setup(), traffic = new Traffic(new THREE.Scene(), world, 4, 0);
  const car = traffic.cars.find(c => !c.onRing) || traffic.cars[0];
  car.onRing = false;car.edge = world.graph.edges[0];car.lane = 0;car.s = car.edge.len - 50;car.nextEdge = null;
  traffic.placeOnPath(car, true);car.speed = 14;traffic.cars = [car];
  bike.pos = { x: car.x + 100, z: car.z + 100, y: 0 };
  const c = crossingAt(world.graph, car.edge, 1), ped = { active: true, state: 'crossing', crossing: c, y: 0 };
  traffic.peds.peds = [ped];traffic.peds.update = () => {};
  for (let i = 0; i < 8 * 60; i++) traffic.update(1 / 60, bike, []);
  const gap = (c.x - car.x) * Math.sin(car.yaw) + (c.z - car.z) * Math.cos(car.yaw) - car.type.l / 2;
  assert.ok(gap >= 2.8, `stopped before stripes: ${gap}`);assert.ok(car.speed < .4);
  ped.state = 'walking';assert.equal(pedestrianSpeedLimit(car, [ped]), Infinity);
  for (let i = 0; i < 120; i++) traffic.update(1 / 60, bike, []);
  assert.ok(car.speed > 3);
});

test('chase camera pulls in before a wall and returns smoothly after clearing it', () => {
  const { world, bike } = setup(), camera = new THREE.PerspectiveCamera(68, 1, .16, 100);
  const rig = new CameraRig(camera, world);bike.yaw = 0;bike.roll = 0;bike.vLat = 0;bike.engineLoad = 0;
  world.collideCircle = (x, z, y, r, out = {}) => Object.assign(out, { hit: z - r < -2 });
  for (let i = 0; i < 180; i++) rig.update(1 / 60, bike, false);
  assert.ok(camera.position.z > -1.8, 'lens remains in front of wall');
  const blockedZ = camera.position.z;
  world.collideCircle = (x, z, y, r, out = {}) => Object.assign(out, { hit: false });
  rig.update(1 / 60, bike, false);assert.ok(camera.position.z > -3, 'release does not teleport');
  for (let i = 0; i < 180; i++) rig.update(1 / 60, bike, false);
  assert.ok(camera.position.z < blockedZ - 2);assert.ok(Number.isFinite(camera.quaternion.w));
});

test('camera sweep protects line of sight over a terrain ridge', () => {
  const { world, bike } = setup(), rig = new CameraRig(new THREE.PerspectiveCamera(), world);
  world.queryGround = (x, z, y, out = {}) => Object.assign(out, { y: z < -2 && z > -3 ? 4 : 0 });
  rig.pos.set(0, 3, -6);rig.avoidObstacles(bike);assert.ok(rig.pos.z > -2);
});
import { StuntSystem } from '../src/stunts.js';

function setup() {
  const roads = buildRoads(), graph = buildCityGraph(roads);
  const world = { graph, roads, terrainHeight: () => 0, roadWeight: () => 1,
    lightStateFor: () => 'green', collideCircle: (x, z, y, r, out = {}) => Object.assign(out, { hit: false }),
    queryGround: (x, z, y, out = {}) => Object.assign(out, { y: 0, nx: 0, ny: 1, nz: 0, surface: 2 }) };
  const traffic = { cars: [], peds: { peds: [] } };
  const police = new Police(new THREE.Scene(), world, traffic, 1);
  const bike = { pos: { x: 0, y: 0.6, z: 0 }, vel: { x: 0, z: 0 }, pitch: 0,
    speed: 0, kmh: 0, surface: 2, grounded: true, crashed: false,
    crash(reason) { this.crashed = true;this.crashReason = reason; } };
  return { police, bike, world, traffic };
}
function ahead(police, bike, distance = 30) {
  const u = police.units[0];bike.pos.x = u.x + Math.sin(u.yaw) * distance;bike.pos.z = u.z + Math.cos(u.yaw) * distance;
}
function seconds(police, bike, duration, before = () => {}) {
  const events = [];
  for (let i = 0; i < duration * 60; i++) { before();const event = police.update(1 / 60, bike);if (event) events.push(event); }
  return events;
}
function trigger(police, bike) {
  bike.speed = 28;bike.kmh = 101;seconds(police, bike, 1.5, () => ahead(police, bike));
  assert.equal(police.status, 'pursuit');
}

test('police routes use connected directed roads', () => {
  const { world } = setup(), g = world.graph;
  for (const start of g.nodes) for (const end of g.nodes) {
    const route = policeRoute(g, start.id, end.id);let current = start.id;
    for (const id of route) { assert.equal(g.edges[id].a, current);current = g.edges[id].b; }
    assert.equal(current, end.id);
  }
});
test('legal riding and stunt-park wheelies do not trigger a pursuit', () => {
  const { police, bike } = setup();bike.speed = 15;bike.kmh = 54;
  seconds(police, bike, 5, () => ahead(police, bike));assert.equal(police.level, 0);
  bike.surface = 3;bike.pitch = 0.6;
  seconds(police, bike, 5, () => ahead(police, bike));assert.equal(police.level, 0);
});
test('normal hill riding earns no wheelie points or police pursuit', () => {
  const { police, bike } = setup();
  bike.speed = 10; bike.kmh = 36; bike.pitch = bike.groundPitch = 0.35;
  seconds(police, bike, 4, () => ahead(police, bike));
  assert.equal(police.level, 0);
  const stunts = new StuntSystem();
  stunts.update(1, bike);
  assert.equal(stunts.wheelieT, 0); assert.equal(stunts.comboPoints, 0);
  bike.pitch = bike.groundPitch = -0.35;
  stunts.update(1, bike);
  assert.equal(stunts.stoppieT, 0); assert.equal(stunts.comboPoints, 0);
  bike.pitch = 0.4; bike.groundPitch = 0;
  stunts.update(1, bike);
  assert.ok(stunts.wheelieT > 0 && stunts.comboPoints > 0);
});
test('police need a sustained visible offense, and buildings block detection', () => {
  const { police, bike, world } = setup();bike.speed = 28;bike.kmh = 101;
  seconds(police, bike, 0.5, () => ahead(police, bike));assert.equal(police.level, 0);
  world.collideCircle = (x, z, y, r, out = {}) => Object.assign(out, { hit: true });
  seconds(police, bike, 2, () => ahead(police, bike));assert.equal(police.level, 0);assert.equal(police.suspicion, 0);
  world.collideCircle = (x, z, y, r, out = {}) => Object.assign(out, { hit: false });
  trigger(police, bike);assert.equal(police.reason, 'Excessive speed');
});
test('losing line of sight searches the last known position, then allows escape', () => {
  const { police, bike } = setup();trigger(police, bike);
  const lastSeen = { ...police.lastSeen };bike.pos.x = 1000;bike.pos.z = 1000;
  seconds(police, bike, 3);assert.equal(police.status, 'search');assert.deepEqual(police.lastSeen, lastSeen);
  const events = seconds(police, bike, 12);assert.ok(events.includes('escaped'));assert.equal(police.level, 0);
  assert.ok(police.cooldown > 0);
});
test('a nearby stopped rider can surrender, then is released with a grace period', () => {
  const { police, bike } = setup();trigger(police, bike);bike.speed = 0;bike.kmh = 0;
  const events = seconds(police, bike, 3.2, () => ahead(police, bike, 8));
  assert.ok(events.includes('busted'));assert.equal(police.busted, true);
  assert.ok(seconds(police, bike, 4.1).includes('released'));assert.equal(police.level, 0);assert.ok(police.cooldown > 10);
});
test('an elevated rider cannot be arrested by a patrol below the bridge', () => {
  const { police, bike } = setup();trigger(police, bike);bike.speed = 0;bike.kmh = 0;bike.pos.y = 10;
  seconds(police, bike, 4, () => ahead(police, bike, 8));assert.equal(police.arrest, 0);assert.equal(police.busted, false);
});
test('disabling police stops detection and hides patrols', () => {
  const { police, bike } = setup();police.enabled = false;bike.speed = 40;bike.kmh = 144;
  seconds(police, bike, 5, () => ahead(police, bike));assert.equal(police.level, 0);assert.equal(police.units[0].root.visible, false);
});
test('patrol movement remains finite and makes progress through junctions', () => {
  const { police, bike } = setup();bike.pos.x = 1000;bike.pos.z = 1000;
  const seen = new Set();
  seconds(police, bike, 180, () => {
    const u = police.units[0];seen.add(u.edge.id);assert.ok([u.x, u.y, u.z, u.yaw, u.speed].every(Number.isFinite));
    assert.ok(Math.abs(u.x) < 300 && Math.abs(u.z) < 300);
  });
  assert.ok(seen.size > 8, `patrol visited ${seen.size} road segments`);
});
test('pedestrians have separate animated limbs, varied skin and adult proportions', () => {
  const { world, bike } = setup();world.roadWeight = () => 0;
  const crowd = new Pedestrians(new THREE.Scene(), world, 12);
  for (let i = 0; i < 120; i++) crowd.update(1 / 60, bike);
  assert.ok(crowd.mesh.count > 0);assert.equal(crowd.parts.shoePair.count, crowd.mesh.count * 2);
  assert.ok(new Set(crowd.peds.map(p => p.skin)).size >= 4);
  const before = crowd.parts.shinPair.instanceMatrix.array.slice();crowd.update(0.1, bike);
  assert.notDeepEqual(before, crowd.parts.shinPair.instanceMatrix.array);
  for (const mesh of Object.values(crowd.parts)) assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));
});
test('two-bone joints preserve segment lengths for reachable targets', () => {
  const a = new THREE.Vector3(0, 1, 0), b = new THREE.Vector3(0.2, 0.5, 0.1);
  const knee = jointPoint(a, b, 0.43, 0.43, new THREE.Vector3(0, 0, 1));
  assert.ok(Math.abs(a.distanceTo(knee) - 0.43) < 1e-6);
  assert.ok(Math.abs(b.distanceTo(knee) - 0.43) < 1e-6);
});
for (const cfg of BIKES) test(`${cfg.id}: complete model and rider survive immediate teleport and steering`, () => {
  const { world } = setup(), bike = new Bike(world, cfg.id), model = new BikeModel(cfg);
  bike.reset({ x: 110, z: -170, y: 0, yaw: 1.3 });bike.steer = 0.25;
  model.update(bike, 1 / 60, 0);model.root.updateMatrixWorld(true);
  for (let i = 0; i < 2; i++) {
    const grip = model.gripPos[i].getWorldPosition(new THREE.Vector3());
    const hand = model.rider.arms[i].glove.getWorldPosition(new THREE.Vector3());
    assert.ok(grip.distanceTo(hand) < 0.002);
  }
  model.root.traverse(o => {
    if (!o.isMesh) return;assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));assert.ok(o.matrixWorld.elements.every(Number.isFinite));
  });
});
