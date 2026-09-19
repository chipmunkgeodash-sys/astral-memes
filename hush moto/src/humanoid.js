import * as THREE from 'three';
import { lathe } from './parts.js';

/** A soft, anatomically tapered limb with exact unit length for spanMesh. */
export function limbGeometry(radius, taper = 0.75) {
  const geo = lathe([[0.002, -0.5], [radius * taper, -0.46],
    [radius * taper, -0.27], [radius, 0.22], [radius * 0.85, 0.46], [0.002, 0.5]], 12);
  geo.scale(1, 1, 0.92);
  return geo;
}

export function torsoGeometry() {
  const geo = lathe([[0.12, 0], [0.145, 0.07], [0.15, 0.21], [0.205, 0.37],
    [0.19, 0.43], [0.075, 0.47]], 20);
  geo.scale(1, 1, 0.61);
  return geo;
}

/** Fixed-length two-bone IK with a bend pole, clamped near full extension. */
export function jointPoint(from, to, upper, lower, pole, out = new THREE.Vector3()) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const raw = Math.max(direction.length(), 1e-6);direction.multiplyScalar(1 / raw);
  const reach = Math.min(raw, upper + lower - 0.0001);
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  const bend = Math.sqrt(Math.max(0, upper * upper - along * along));
  const normal = new THREE.Vector3().copy(pole).addScaledVector(direction, -pole.dot(direction));
  if (normal.lengthSq() < 1e-8) normal.set(1, 0, 0).addScaledVector(direction, -direction.x);
  normal.normalize();
  return out.copy(from).addScaledVector(direction, along).addScaledVector(normal, bend);
}
