import { retireProceduralBody } from './retireprocedural.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clamp } from './core.js';
import { attachHonda } from './hondarig.js';
import { attachAssembledBike } from './assembledrig.js';
import { readLocalBike } from './localmodels.js';

function dispose(root) {
  const materials = new Set(), textures = new Set();
  root.traverse(o => { if (o.isMesh) { o.geometry.dispose();for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
  for (const m of materials) { for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);m.dispose(); }
  for (const texture of textures) texture.dispose();
}

// Duhgless's authored Blender export has separate frame, fork and wheel meshes.
// Bake its object transforms into metre-space, then create actual moving pivots.
export function loadImportedBike(owner) {
  owner.assetStatus = 'loading';owner.assetCancelled = false;
  owner.cancelAssetLoad = () => { owner.assetCancelled = true; };
  if (typeof document === 'undefined') return;
  // Never present the temporary body as the selected imported motorcycle.
  // Reveal either the completed rig or an explicit fallback after resolution.
  owner.root.visible = false;
  const loader=new GLTFLoader();
  const privateKey = owner.cfg.localModelKey || (['lbx', 'ultrabee'].includes(owner.cfg.id) ? owner.cfg.id : null);
  const source = (async () => {
    if (privateKey) {
      let buffer;
      try { buffer = await readLocalBike(privateKey); }
      catch (error) { if (!owner.cfg.asset) throw error; }
      // An imported replacement must also work in the local build, which has
      // a bundled asset URL as well as the browser's private model store.
      if (buffer) return loader.parseAsync(buffer, '');
    }
    return owner.cfg.asset ? loader.loadAsync(owner.cfg.asset+(owner.cfg.assetRevision?'?v='+encodeURIComponent(owner.cfg.assetRevision):'')) : null;
  })();
  owner.assetReady = source.then(gltf => {
    if(!gltf){owner.assetStatus='built-in';return;}
    if (owner.assetCancelled) { dispose(gltf.scene);return; }
    if (owner.cfg.assetRig === 'honda' || owner.cfg.assetRig === 'assembled') {
      try { (owner.cfg.assetRig === 'honda' ? attachHonda : attachAssembledBike)(owner, gltf.scene); }
      catch (error) { dispose(gltf.scene);throw error; }
      owner.assetStatus = 'ready';return;
    }
    const cfg = owner.cfg, scale = cfg.wheelbase / 3.3825268745;
    const imported = new THREE.Group();imported.name = 'Blender motorcycle';
    gltf.scene.updateMatrixWorld(true);
    const convert = new THREE.Matrix4().makeTranslation(0, .030 - cfg.cgHeight, -cfg.cgRear + 1.7033121586 * scale)
      .multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2))
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    const meshes = {};
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(convert, o.matrixWorld));
      o.position.set(0, 0, 0);o.quaternion.identity();o.scale.set(1, 1, 1);
      o.castShadow = o.receiveShadow = true;meshes[o.name] = o;
      o.material.roughness = o.name.includes('Wheel') ? .82 : .48;
      if (o.material.map) o.material.map.anisotropy = 4;
    });
    const front = meshes['Front-Wheel'], rear = meshes['Back-Wheel'], fork = meshes.Fork;
    if (!front || !rear || !fork || !meshes.Cube) { dispose(gltf.scene);throw new Error('The bike asset is missing its moving parts.'); }
    const wheel = (mesh, point) => {
      // Wheel origins in the source are the axle centres, not bounding-box centres.
      const original = mesh === front ? new THREE.Vector3(1.679214716, .786166489, 0) : new THREE.Vector3(-1.703312159, .712028921, 0);
      original.applyMatrix4(convert);mesh.geometry.translate(-original.x, -original.y, -original.z);
      const pivot = new THREE.Group();pivot.position.copy(point);pivot.add(mesh);return pivot;
    };
    const frontPoint = new THREE.Vector3(0, cfg.rF - cfg.cgHeight, cfg.wheelbase - cfg.cgRear);
    const rearPoint = new THREE.Vector3(0, cfg.rR - cfg.cgHeight, -cfg.cgRear);
    const steer = new THREE.Group();steer.position.set(0, .88 - cfg.cgHeight, .51);
    imported.add(meshes.Cube, steer);
    fork.geometry.translate(-steer.position.x, -steer.position.y, -steer.position.z);steer.add(fork);
    const frontPivot = wheel(front, frontPoint.clone().sub(steer.position));steer.add(frontPivot);
    const rearPivot = wheel(rear, rearPoint);imported.add(rearPivot);
    owner.pegPos.forEach((peg, i) => { owner.chassis.attach(peg);peg.position.set((i ? 1 : -1) * .23, .28 - cfg.cgHeight, .12); });
    retireProceduralBody(owner, imported, owner.pegPos);
    owner.chassis.add(imported);
    owner.importedRig = { imported, steering: steer, front: frontPivot, rear: rearPivot };
    owner.exhaustLocal = new THREE.Vector3(-.22, .22 - cfg.cgHeight, -.6);
    owner.gripPos = [-1, 1].map(side => {
      const grip = new THREE.Object3D();grip.position.set(side * .245, .40, -.29);steer.add(grip);return grip;
    });
    owner.updateImported = s => {
      steer.rotation.y = s.steer;
      frontPivot.rotation.x = s.wheelAngleF;rearPivot.rotation.x = s.wheelAngleR;
      frontPivot.position.y = frontPoint.y - steer.position.y + clamp(s.suspF - (s.restSuspF || 0), -.06, .07);
      rearPivot.position.y = rearPoint.y + clamp(s.suspR - (s.restSuspR || 0), -.05, .06);
    };
    owner.assetStatus = 'ready';
  }).catch(error => {
    if (!owner.assetCancelled) { owner.assetStatus = 'error';owner.assetError = error;console.error('Bike asset load failed:', error); }
  }).finally(() => {
    if (!owner.assetCancelled) owner.root.visible = true;
  });
}
