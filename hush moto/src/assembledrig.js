import { retireProceduralBody } from './retireprocedural.js';
import * as THREE from 'three';
import { clamp } from './core.js';

export function attachAssembledBike(owner, scene) {
  const get = name => { const o = scene.getObjectByName(name);if (!o) throw new Error(`Missing imported part: ${name}`);return o; };
  const steer = get('Steering'), fork = get('FrontSuspension'), front = get('FrontWheel');
  const swing = get('RearSwing'), rear = get('RearWheel');
  const grips = [get('GripLeft'), get('GripRight')], pegs = [get('PegLeft'), get('PegRight')];
  // Stark omits wheels; Ultra's fused print wheels have suspension cut-outs.
  // Use complete concentric wheels inside each imported suspension rig.
  const configuredWheels = owner.cfg.id === 'starkvarg' || owner.cfg.id === 'ultrabee';
  if (configuredWheels) {
    front.add(owner.frontWheel);rear.add(owner.rearWheel);
    owner.frontWheel.position.set(0,0,0);owner.frontWheel.rotation.set(0,0,0);
    owner.rearWheel.position.set(0,0,0);owner.rearWheel.rotation.set(0,0,0);
  }
  retireProceduralBody(owner, scene);
  scene.position.y = -owner.cfg.cgHeight;
  scene.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  owner.chassis.add(scene);owner.gripPos = grips;owner.pegPos = pegs;
  owner.importedRig = { imported: scene, steering: steer, front, rear, fork, swing };
  const swingLength = Math.max(.3, Math.abs(rear.position.z));
  const steeringAxis = new THREE.Vector3(0, Math.cos(.47), -Math.sin(.47));
  owner.updateImported = s => {
    steer.quaternion.setFromAxisAngle(steeringAxis, s.steer);
    fork.position.y = clamp(s.suspF - (s.restSuspF || 0), -.1, .17);
    fork.position.z = -fork.position.y * Math.tan(.47);
    swing.rotation.x = clamp(s.suspR - (s.restSuspR || 0), -.11, .18) / swingLength;
    front.rotation.x = s.wheelAngleF;rear.rotation.x = s.wheelAngleR - swing.rotation.x;
    if (configuredWheels) {
      owner.frontWheel.rotation.x = 0;owner.rearWheel.rotation.x = 0;
    }
  };
}
