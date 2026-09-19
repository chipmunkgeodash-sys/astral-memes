import { retireProceduralBody } from './retireprocedural.js';
import * as THREE from 'three';
import { clamp } from './core.js';

// Jacobdesigns' CRF450 export retains its Blender armature and rigid children.
// Keep the author's hierarchy and materials, and drive only its control joints.
export function attachHonda(owner, scene) {
  const cfg = owner.cfg;
  const joint = name => {
    const node = scene.getObjectByName(name);
    if (!node) throw new Error(`Honda rig is missing ${name}`);
    return node;
  };
  const steering = joint('FRONT-STEER_02');
  const fork = joint('FRONT-SUS-ATTATCH_04');
  const front = joint('FRONT-WHEEL-DEF_09');
  const rear = joint('REAR-WHEEL-DEF_017');
  const swing = joint('SUS-REAR_013');
  scene.updateMatrixWorld(true);
  const f = front.getWorldPosition(new THREE.Vector3());
  const r = rear.getWorldPosition(new THREE.Vector3());
  const scale = cfg.wheelbase / (f.z - r.z);
  const imported = new THREE.Group();
  imported.name = 'Honda CRF450R · Jacobdesigns';
  imported.scale.setScalar(scale);
  imported.position.set(-r.x * scale, cfg.rR - cfg.cgHeight - r.y * scale, -cfg.cgRear - r.z * scale);
  imported.add(scene);imported.updateMatrixWorld(true);

  // Axle heights and tyre radii must agree with collision/contact geometry.
  const positionDelta = (node, delta) => {
    const inv = node.parent.matrixWorld.clone().invert();
    return delta.clone().applyMatrix4(inv).sub(new THREE.Vector3().applyMatrix4(inv));
  };
  fork.position.add(positionDelta(fork, new THREE.Vector3(0, cfg.rF - cfg.cgHeight - front.getWorldPosition(new THREE.Vector3()).y, 0)));
  imported.updateMatrixWorld(true);
  for (const [name, axle, radius] of [['FRONT_TIRE_TIRE_0', front, cfg.rF], ['REAR_TIRE_TIRE_0', rear, cfg.rR]]) {
    const tyre = joint(name), bounds = new THREE.Box3().setFromObject(tyre);
    const measured = (bounds.max.y - bounds.min.y) / 2;
    axle.scale.multiplyScalar(radius / measured);
  }
  imported.updateMatrixWorld(true);
  const rotate = (node, worldAxis) => {
    const rest = node.quaternion.clone();
    const axis = worldAxis.clone().applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    const q = new THREE.Quaternion();
    return angle => node.quaternion.copy(rest).multiply(q.setFromAxisAngle(axis, angle));
  };
  const turn = rotate(steering, new THREE.Vector3(0, Math.cos(cfg.rake), -Math.sin(cfg.rake)));
  const spinF = rotate(front, new THREE.Vector3(1, 0, 0));
  const spinR = rotate(rear, new THREE.Vector3(1, 0, 0));
  const moveSwing = rotate(swing, new THREE.Vector3(1, 0, 0));
  const forkRest = fork.position.clone();
  const forkDirection = positionDelta(fork, new THREE.Vector3(0, 1, -Math.tan(cfg.rake)));
  const swingPoint = swing.getWorldPosition(new THREE.Vector3());
  const rearPoint = rear.getWorldPosition(new THREE.Vector3());
  const armZ = rearPoint.z - swingPoint.z;
  const anchor = (name, endName) => {
    const node = joint(name), end = joint(endName), grip = new THREE.Object3D();
    grip.position.copy(end.position).multiplyScalar(.5);node.add(grip);return grip;
  };
  owner.gripPos = [anchor('HAND-SNAPR_010', 'HAND-SNAPR_end_035'), anchor('HAND-SNAPL_011', 'HAND-SNAPL_end_036')];
  owner.pegPos = [anchor('FOOT-ATCHR_029', 'FOOT-ATCHR_end_044'), anchor('FOOT-ATCHL_030', 'FOOT-ATCHL_end_045')];
  retireProceduralBody(owner, imported);
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    // Animated bones can move outside the export's bind-pose bounds.
    if (o.isSkinnedMesh) o.frustumCulled = false;
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const value of Object.values(mat)) if (value?.isTexture) value.anisotropy = 4;
    }
  });
  owner.chassis.add(imported);
  owner.importedRig = { imported, steering, front, rear, fork, swing };
  owner.updateImported = s => {
    turn(s.steer);
    fork.position.copy(forkRest).addScaledVector(forkDirection, clamp(s.suspF - (s.restSuspF || 0), -.10, .17));
    const swingAngle = -clamp(s.suspR - (s.restSuspR || 0), -.11, .18) / armZ;
    moveSwing(swingAngle);
    spinF(s.wheelAngleF);spinR(s.wheelAngleR - swingAngle);
  };
}
