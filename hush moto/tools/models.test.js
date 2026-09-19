import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Bike, BIKES } from '../src/bikephysics.js';
import { attachHonda } from '../src/hondarig.js';
import { attachAssembledBike } from '../src/assembledrig.js';
import { BikeModel } from '../src/bikemodel.js';
import { validateLocalBike } from '../src/localmodels.js';
import { loadImportedBike } from '../src/importedbike.js';

function loadingOwner() {
  const root = new THREE.Group(), chassis = new THREE.Group();root.add(chassis);
  const rider = { root: new THREE.Group(), arms: [], legs: [] };chassis.add(rider.root);
  const oldBody = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());chassis.add(oldBody);
  return { root, chassis, rider, oldBody, cfg: { id: 'lbx', asset: '/lbx.glb', assetRig: 'assembled', cgHeight: .575 } };
}
function minimalImportedRig() {
  const scene = new THREE.Group();
  for (const name of ['Steering', 'FrontSuspension', 'FrontWheel', 'RearSwing', 'RearWheel', 'GripLeft', 'GripRight', 'PegLeft', 'PegRight']) {
    const joint = new THREE.Group();joint.name = name;scene.add(joint);
  }
  return { scene };
}
function browserDocument(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'document', original);else delete globalThis.document; });
}

test('import hides the old body until the complete replacement is ready', async t => {
  browserDocument(t);
  let resolve;t.mock.method(GLTFLoader.prototype, 'loadAsync', () => new Promise(r => { resolve = r; }));
  const owner = loadingOwner();loadImportedBike(owner);
  assert.equal(owner.root.visible, false);assert.equal(owner.assetStatus, 'loading');
  await new Promise(resolve => setImmediate(resolve));
  resolve(minimalImportedRig());await owner.assetReady;
  assert.equal(owner.assetStatus, 'ready');assert.equal(owner.root.visible, true);
  assert.equal(owner.oldBody.parent, null);assert.ok(owner.importedRig);
});

test('failed imports reveal a usable fallback rather than leaving an invisible bike', async t => {
  browserDocument(t);
  t.mock.method(console, 'error', () => {});
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => { throw Error('offline'); });
  const owner = loadingOwner();loadImportedBike(owner);await owner.assetReady;
  assert.equal(owner.assetStatus, 'error');assert.equal(owner.root.visible, true);
  assert.equal(owner.oldBody.parent, owner.chassis);assert.equal(owner.assetError.message, 'offline');
});

test('cancelled model requests cannot reveal or attach a stale bike', async t => {
  browserDocument(t);
  let resolve;t.mock.method(GLTFLoader.prototype, 'loadAsync', () => new Promise(r => { resolve = r; }));
  const owner = loadingOwner();loadImportedBike(owner);owner.cancelAssetLoad();
  await new Promise(resolve => setImmediate(resolve));
  resolve(minimalImportedRig());await owner.assetReady;
  assert.equal(owner.root.visible, false);assert.equal(owner.importedRig, undefined);
});

test('prepared private models validate locally without permitting external file requests',async()=>{
  for(const [name,path,id] of [['lbx.glb','how2random/lbx.glb','lbx'],['ultra.glb','files3d/ultra.glb','ultrabee']]){
    const data=await fs.readFile(new URL('../assets/bikes/'+path,import.meta.url));
    const buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
    assert.equal(validateLocalBike(name,buffer),id);
  }
  assert.throws(()=>validateLocalBike('ultra.glb',new ArrayBuffer(2)));
  assert.throws(()=>validateLocalBike('unknown.glb',new ArrayBuffer(24)));
});

async function loadGeometry(file) {
  const bytes = await fs.readFile(file), length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + length));
  // Node has no image decoder. Preserve the real mesh/armature/buffers while
  // omitting texture decoding; the browser smoke check covers the materials.
  json.materials = json.materials.map(m => ({ name: m.name }));
  delete json.images;delete json.textures;delete json.samplers;
  const data = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4, 32);data.copy(padded);
  const tail = bytes.subarray(20 + length), out = Buffer.alloc(20 + padded.length + tail.length);
  out.write('glTF');out.writeUInt32LE(2, 4);out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(padded.length, 12);out.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(out, 20);tail.copy(out, 20 + padded.length);
  return (await new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset, out.byteOffset + out.length), '')).scene;
}
for (const [id, attach] of [['crf450r', attachHonda], ['lbx', attachAssembledBike], ['ultrabee', attachAssembledBike], ['starkvarg', attachAssembledBike], ['superduke', attachAssembledBike]]) {
  test(`${id}: imported tyres, moving joints and rider anchors align with physics`, async () => {
    const cfg = BIKES.find(b => b.id === id), chassis = new THREE.Group();
    const rider = {root: new THREE.Group(), arms: [], legs: []};chassis.add(rider.root);
    const owner = { cfg, chassis, rider }, scene = await loadGeometry(new URL('../' + cfg.asset, import.meta.url));
    if (id === 'starkvarg' || id === 'ultrabee') {
      const fallback = new BikeModel(cfg);
      owner.frontWheel = fallback.frontWheel;owner.rearWheel = fallback.rearWheel;
    }
    attach(owner, scene);
    const s = { steer: 0, suspF: 0, suspR: 0, restSuspF: 0, restSuspR: 0, wheelAngleF: 0, wheelAngleR: 0 };
    owner.updateImported(s);chassis.updateMatrixWorld(true);
    const { front, rear } = owner.importedRig;
    const position = node => node.getWorldPosition(new THREE.Vector3());
    const f = position(front), r = position(rear);
    assert.ok(Math.abs(f.z-r.z-cfg.wheelbase)<.001, 'wheelbase');
    assert.ok(Math.abs(f.y+cfg.cgHeight-cfg.rF)<.001, 'front axle height');
    assert.ok(Math.abs(r.y+cfg.cgHeight-cfg.rR)<.001, 'rear axle height');
    for (const wheel of [front,rear]) {
      const bounds = new THREE.Box3().setFromObject(wheel);
      assert.ok(Math.abs(bounds.min.y+cfg.cgHeight)<.012, 'tyre rests on road');
    }
    assert.equal(owner.gripPos.length,2);assert.equal(owner.pegPos.length,2);
    assert.ok(position(owner.gripPos[0]).x < 0 && position(owner.gripPos[1]).x > 0, 'left/right grips');
    const grip = position(owner.gripPos[0]);
    owner.updateImported({...s,steer:.3,wheelAngleF:1.7,wheelAngleR:2.4});chassis.updateMatrixWorld(true);
    assert.ok(position(owner.gripPos[0]).distanceTo(grip)>.04, 'grips follow steering');
    assert.ok(position(rear).distanceTo(r)<.001, 'wheel spin preserves axle');
    if (id === 'ultrabee' || id === 'starkvarg') {
      for (let phase=0;phase<Math.PI*2;phase+=Math.PI/8) {
        owner.updateImported({...s,wheelAngleF:phase,wheelAngleR:phase});chassis.updateMatrixWorld(true);
        for (const wheel of [front,rear]) {
          const box=new THREE.Box3().setFromObject(wheel,true),center=box.getCenter(new THREE.Vector3());
          assert.ok(center.distanceTo(position(wheel))<.008,'wheel remains concentric through a full revolution');
          assert.ok(Math.abs(box.min.y+cfg.cgHeight)<.012,'spinning tyre maintains ground clearance');
        }
      }
    }
    owner.updateImported({...s,suspF:.08,suspR:.08});chassis.updateMatrixWorld(true);
    assert.ok(position(front).y>f.y+.065, 'fork compression lifts front axle');
    assert.ok(position(rear).y>r.y+.065, 'swingarm compression lifts rear axle');
    chassis.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite),o.name));
    assert.equal(rider.root.visible,true);
    const world={queryGround:(x,z,y,out={})=>Object.assign(out,{y:0,nx:0,ny:1,nz:0,surface:2})};
    const bike=new Bike(world,id),model=new BikeModel(cfg);
    const oldBody=model.chassis.children.filter(node=>!node.userData.keepOnImport && node!==model.rider.root
      && ![...model.rider.arms,...model.rider.legs].some(limb=>Object.values(limb).includes(node)));
    bike.reset({x:0,y:0,z:0,yaw:0});attach(model,await loadGeometry(new URL('../'+cfg.asset,import.meta.url)));
    for(const node of oldBody) assert.ok(node.parent===null,'old body is removed after import');
    assert.ok(model.chassis.children.some(node=>node.name==='Rear fender scrape guard'),'scrape guard is preserved');
    for(const [compressionF,compressionR] of [[.09,-.035],[-.045,.11],[.10,.10]]){
      bike.suspF=bike.restSuspF+compressionF;bike.suspR=bike.restSuspR+compressionR;
      model.update(bike,1/60,0);model.root.updateMatrixWorld(true);
      assert.ok(Math.abs(position(model.importedRig.front).y-cfg.rF)<.002,'front contact remains supported during dive/squat');
      assert.ok(Math.abs(position(model.importedRig.rear).y-cfg.rR)<.002,'rear contact remains supported during dive/squat');
      for(let i=0;i<2;i++)assert.ok(position(model.rider.arms[i].glove).distanceTo(position(model.gripPos[i]))<1e-5);
    }
  });
}


test('themes reach merged plastics and decal materials without painting hardware',async()=>{
 const {paintModel}=await import('../src/customization.js');
 const scene=new THREE.Group();
 for(const [name,material] of [['UltraBee_Graphite plastics','Graphite plastics'],['Object_40','FENDERS'],['Object_42','NUMBERPLATES'],['Frame - Motor','Black alloy'],['Seat','Seat']]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({name:material,color:0x333333}));mesh.name=name;scene.add(mesh);}
 const original=scene.children.map(o=>o.material);
 paintModel({cfg:{id:'ultrabee',build:{paint:'mint'},accent:0xe8f4f3},importedRig:{imported:scene}});
 for(let i=0;i<3;i++){assert.equal(scene.children[i].material.userData.theme,'mint');assert.notEqual(scene.children[i].material,original[i]);}
 for(let i=3;i<5;i++)assert.equal(scene.children[i].material,original[i]);
 assert.equal(original[0].color.getHex(),0x333333,'shared original materials stay unchanged');
});
