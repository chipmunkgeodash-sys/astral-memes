// parts.js — reusable geometry helpers for building detailed hard-surface
// models out of code: rounded boxes, lathed shells, tubes and a small
// merge-by-material batcher that keeps the draw-call count sane.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function pbr(color, rough = 0.5, metal = 0.35, extra) {
  return new THREE.MeshStandardMaterial(
    Object.assign({ color, roughness: rough, metalness: metal }, extra)
  );
}


/**
 * Merge geometries safely. mergeGeometries() refuses to mix indexed and
 * non-indexed inputs (and differing attribute sets) — it returns null and the
 * mesh silently disappears — so normalise everything first.
 */
export function mergeParts(geos) {
  if (!geos || !geos.length) return null;
  const norm = [];
  for (let g of geos) {
    if (!g) continue;
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    norm.push(g);
  }
  if (!norm.length) return null;
  if (norm.length === 1) return norm[0];
  const merged = mergeGeometries(norm, false);
  if (!merged) console.error('mergeParts: merge failed for', norm.length, 'geometries');
  return merged;
}

/** Box with rounded edges — the single biggest upgrade over raw BoxGeometry. */
export function roundedBox(w, h, d, r = 0.02, curve = 2) {
  r = Math.max(0.001, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002));
  const x = -w / 2, y = -h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d - r * 0.8,
    bevelEnabled: true,
    bevelThickness: r * 0.45,
    bevelSize: r * 0.45,
    bevelSegments: 1,
    curveSegments: curve,
  });
  geo.translate(0, 0, -(d - r * 0.8) / 2);
  geo.computeVertexNormals();
  return geo;
}

/** A tapered slab — useful for tanks, seats and side panels. */
export function wedgeBox(wFront, wBack, h, d, r = 0.02) {
  const geo = roundedBox(Math.max(wFront, wBack), h, d, r);
  const pos = geo.attributes.position;
  const halfD = d / 2;
  const wf = wFront / Math.max(wFront, wBack);
  const wb = wBack / Math.max(wFront, wBack);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getZ(i) + halfD) / d;        // 0 at back, 1 at front
    const k = wb + (wf - wb) * Math.max(0, Math.min(1, t));
    pos.setX(i, pos.getX(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Smooth bodywork loft. Sections are [z, centreY, halfWidth, halfHeight]. */
export function bodyLoft(sections, radial = 24) {
  const pos = [], uv = [], idx = [], rings = [];
  const cat = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t +
    (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < 5; j++) {
    const t = j / 5, a = sections[Math.max(0, i - 1)], b = sections[i], c = sections[i + 1], d = sections[Math.min(sections.length - 1, i + 2)];
    rings.push([b[0] + (c[0] - b[0]) * t, ...[1, 2, 3].map(k => cat(a[k], b[k], c[k], d[k], t))]);
  }
  rings.push(sections.at(-1));
  for (let i = 0; i < rings.length; i++) {
    const [z, y, width, height] = rings[i];
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2;
      pos.push(Math.cos(a) * Math.max(0.001, width), y + Math.sin(a) * Math.max(0.001, height), z);
      uv.push(j / radial, i / (rings.length - 1));
      if (i < rings.length - 1 && j < radial) { const k = i * (radial + 1) + j;idx.push(k, k + 1, k + radial + 1, k + 1, k + radial + 2, k + radial + 1); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));geometry.setIndex(idx);geometry.computeVertexNormals();return geometry;
}

/** Cylinder helper with a choice of axis. */
export function tube(rTop, rBot, len, seg = 10, axis = 'y', open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, open);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return g;
}

/** Lathe a 2D profile (array of [radius, y]) around the Y axis. */
export function lathe(profile, seg = 16) {
  const pts = profile.map((p) => new THREE.Vector2(Math.max(p[0], 0.0005), p[1]));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return g;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** Build a tube geometry spanning two points (already in local space). */
export function tubeBetween(ax, ay, az, bx, by, bz, radius, seg = 8) {
  _v1.set(ax, ay, az); _v2.set(bx, by, bz);
  _v3.subVectors(_v2, _v1);
  const len = _v3.length();
  const g = new THREE.CylinderGeometry(radius, radius, Math.max(len, 0.01), seg);
  _v3.normalize();
  _q.setFromUnitVectors(UP, _v3);
  g.applyQuaternion(_q);
  g.translate(_v1.x + _v3.x * len / 2, _v1.y + _v3.y * len / 2, _v1.z + _v3.z * len / 2);
  return g;
}

/** Orient an existing unit-height mesh so it spans from -> to. */
export function spanMesh(mesh, ax, ay, az, bx, by, bz) {
  _v1.set(ax, ay, az); _v2.set(bx, by, bz);
  _v3.subVectors(_v2, _v1);
  const len = _v3.length();
  mesh.position.copy(_v1).addScaledVector(_v3, 0.5);
  if (len > 1e-5) {
    _v3.normalize();
    _q.setFromUnitVectors(UP, _v3);
    mesh.quaternion.copy(_q);
  }
  mesh.scale.y = Math.max(len, 0.02);
}

/**
 * Collects geometries per material and flushes them as one merged mesh each,
 * so a 60-piece assembly costs a handful of draw calls instead of 60.
 */
export class Batcher {
  constructor() { this.groups = new Map(); }

  add(geo, material, transform) {
    if (transform) geo.applyMatrix4(transform);
    let arr = this.groups.get(material);
    if (!arr) this.groups.set(material, (arr = []));
    arr.push(geo);
    return geo;
  }

  /** Convenience: add with position / rotation / scale. */
  at(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    if (rx || ry || rz) {
      const e = new THREE.Euler(rx, ry, rz, 'XYZ');
      geo.applyQuaternion(new THREE.Quaternion().setFromEuler(e));
    }
    if (x || y || z) geo.translate(x, y, z);
    return this.add(geo, material);
  }

  flush(parent, castShadow = true) {
    const made = [];
    for (const [material, geos] of this.groups) {
      if (!geos.length) continue;
      const merged = mergeParts(geos);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = false;
      parent.add(mesh);
      made.push(mesh);
    }
    this.groups.clear();
    return made;
  }
}
