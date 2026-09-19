import * as THREE from 'three';
import { clamp, damp, makeRng, angleDelta } from './core.js';
import { mergeParts, roundedBox } from './parts.js';
import { limbGeometry, torsoGeometry, jointPoint } from './humanoid.js';
import { sidewalkRoute, crossingAt, crossingClear } from './crosswalks.js';

const UP = new THREE.Vector3(0, 1, 0);
const SHIRTS = [0x3d596f, 0x963f36, 0x60734c, 0xd5c5a5, 0x32383f, 0x6e527c, 0x357c77, 0xbb8850];
const SKIN = [0xf0c5a3, 0xcc9674, 0xa66c4c, 0x78503c, 0x51382d];
const PANTS = [0x27384d, 0x494b4d, 0x726450, 0x24292f];

export class Pedestrians {
  constructor(scene, world, count) {
    this.world = world;this.rng = makeRng(99);this.count = count;this.peds = [];this.parts = {};
    this._mtx = new THREE.Matrix4();this._root = new THREE.Matrix4();this._local = new THREE.Matrix4();
    this._q = new THREE.Quaternion();this._v = new THREE.Vector3();this._s = new THREE.Vector3();this._c = new THREE.Color();
    this._col = {};this._from = new THREE.Vector3();this._to = new THREE.Vector3();this._knee = new THREE.Vector3();
    const make = (name, geo, rough = 0.87) => {
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: rough, metalness: 0 }), count * (name.endsWith('Pair') ? 2 : 1));
      mesh.castShadow = true;mesh.frustumCulled = false;mesh.count = 0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);this.parts[name] = mesh;return mesh;
    };
    this.mesh = make('torso', torsoGeometry()); // compatibility with the QA count
    make('pelvis', roundedBox(0.29, 0.18, 0.19, 0.06, 4));
    const head = new THREE.SphereGeometry(1, 16, 12);head.scale(0.083, 0.115, 0.092);
    const nose = new THREE.SphereGeometry(1, 10, 8);nose.scale(0.015, 0.023, 0.024);nose.translate(0, -0.004, 0.085);
    const geos = [head, nose];
    for (const sd of [-1, 1]) { const ear = new THREE.SphereGeometry(1, 8, 8);ear.scale(0.014, 0.028, 0.015);ear.translate(sd * 0.081, 0, 0);geos.push(ear); }
    make('head', mergeParts(geos), 0.72);
    const hair = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.54);hair.scale(0.087, 0.119, 0.097);make('hair', hair);
    const eyes = [];
    for (const sd of [-1, 1]) { const eye = new THREE.SphereGeometry(0.008, 8, 6);eye.scale(1, 0.65, 0.45);eye.translate(sd * 0.030, 0.017, 0.084);eyes.push(eye); }
    make('eyes', mergeParts(eyes));
    make('neck', new THREE.CylinderGeometry(0.038, 0.046, 0.09, 10));
    make('upperArmPair', limbGeometry(0.048));make('forearmPair', limbGeometry(0.036));
    make('thighPair', limbGeometry(0.074));make('shinPair', limbGeometry(0.054));
    make('kneePair', new THREE.SphereGeometry(0.051, 12, 10));
    make('elbowPair', new THREE.SphereGeometry(0.034, 12, 10));
    const hand = new THREE.SphereGeometry(1, 10, 8);hand.scale(0.030, 0.062, 0.023);make('handPair', hand, 0.75);
    make('shoePair', roundedBox(0.098, 0.083, 0.25, 0.03, 3));
    for (let i = 0; i < count; i++) {
      this.peds.push({ x: 0, y: 0, z: 0, yaw: 0, active: false, speed: 1.05 + this.rng() * 0.5,
        phase: this.rng() * 6.28, scale: 0.92 + this.rng() * 0.14, width: 0.88 + this.rng() * 0.24,
        color: SHIRTS[i % SHIRTS.length], skin: SKIN[i % SKIN.length], pants: PANTS[i % PANTS.length],
        hair: [0x27201b, 0x624832, 0xa68d62, 0x4c4543, 0x908b84][i % 5],
        dodge: 0, pause: 0, walk: 0, route: null, direction: 1 });
    }
  }

  respawn(p, bike) {
    const graph = this.world.graph;
    for (let i = 0; i < 65; i++) {
      const edge = graph.edges[Math.floor(this.rng() * graph.edges.length)];
      const side = this.rng() < .5 ? -1 : 1;
      const [start, end] = sidewalkRoute(graph, edge, side);
      const t = this.rng(), x = start.x + (end.x - start.x) * t, z = start.z + (end.z - start.z) * t;
      const d = Math.hypot(x - bike.pos.x, z - bike.pos.z), y = this.world.terrainHeight(x, z) + 0.22;
      if (d < 22 || d > 180 || this.world.collideCircle(x, z, y + 0.8, 0.33, this._col).hit) continue;
      Object.assign(p, { x, y, z, edge, side, route: [start, end], direction: this.rng() > 0.5 ? 1 : 0,
        active: true, pause: 0, state: 'walking', crossing: null });
      return;
    }
    p.active = false;
  }
  put(name, index, x, y, z, color, rx = 0, ry = 0, sx = 1, sy = 1, sz = 1) {
    this._q.setFromEuler(new THREE.Euler(rx, ry, 0));this._v.set(x, y, z);this._s.set(sx, sy, sz);
    this._local.compose(this._v, this._q, this._s);this._mtx.multiplyMatrices(this._root, this._local);
    const mesh = this.parts[name];mesh.setMatrixAt(index, this._mtx);mesh.setColorAt(index, this._c.setHex(color));
  }
  span(name, index, a, b, color) {
    this._v.subVectors(b, a);const length = this._v.length();this._v.normalize();this._q.setFromUnitVectors(UP, this._v);
    this._v.copy(a).add(b).multiplyScalar(0.5);this._s.set(1, Math.max(0.001, length), 1);
    this._local.compose(this._v, this._q, this._s);this._mtx.multiplyMatrices(this._root, this._local);
    this.parts[name].setMatrixAt(index, this._mtx);this.parts[name].setColorAt(index, this._c.setHex(color));
  }
  pose(p, n) {
    this._q.setFromAxisAngle(UP, p.yaw);this._v.set(p.x, p.y, p.z);this._s.set(p.width * p.scale, p.scale, p.scale);
    this._root.compose(this._v, this._q, this._s);
    const bob = Math.cos(p.phase * 2) * 0.016 * p.walk, hip = 0.89 + bob;
    const lean = p.dodge * 0.16, twist = Math.sin(p.phase) * 0.05 * p.walk;
    this.put('pelvis', n, 0, hip, 0, p.pants, 0, -twist);
    this.put('torso', n, 0, hip + 0.05, 0, p.color, lean, twist);
    this.put('neck', n, 0, hip + 0.55, 0.06 * p.dodge, p.skin);
    const headY = hip + 0.69, headZ = 0.085 * p.dodge;
    this.put('head', n, 0, headY, headZ, p.skin, -0.035, p.look || 0);
    this.put('hair', n, 0, headY + 0.008, headZ - 0.008, p.hair, -0.035, p.look || 0);
    this.put('eyes', n, 0, headY, headZ, 0x282722, -0.035, p.look || 0);
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1, phase = p.phase + i * Math.PI, swing = Math.sin(phase) * p.walk;
      const footZ = swing * (0.20 + p.dodge * 0.09);
      const footY = 0.085 + Math.max(0, Math.cos(phase)) * 0.09 * p.walk;
      const a = this._from.set(sd * 0.095, hip - 0.04, 0), b = this._to.set(sd * 0.10, footY, footZ);
      jointPoint(a, b, 0.41, 0.41, new THREE.Vector3(0, 0, 1), this._knee);
      this.span('thighPair', n * 2 + i, a, this._knee, p.pants);this.span('shinPair', n * 2 + i, this._knee, b, p.pants);
      this.put('kneePair', n * 2 + i, this._knee.x, this._knee.y, this._knee.z, p.pants);
      this.put('shoePair', n * 2 + i, sd * 0.10, footY - 0.032, footZ + 0.065, 0x282b30, -swing * 0.13);
      a.set(sd * 0.192, hip + 0.46, 0.03);
      b.set(sd * (0.22 + p.dodge * 0.06), hip - 0.015 + Math.abs(swing) * 0.025, -swing * 0.15 + p.dodge * 0.12);
      jointPoint(a, b, 0.27, 0.25, new THREE.Vector3(sd * 0.3, 0, -1), this._knee);
      this.span('upperArmPair', n * 2 + i, a, this._knee, p.color);this.span('forearmPair', n * 2 + i, this._knee, b, p.skin);
      this.put('elbowPair', n * 2 + i, this._knee.x, this._knee.y, this._knee.z, p.skin);
      this.put('handPair', n * 2 + i, b.x, b.y - 0.025, b.z, p.skin, -swing * 0.3);
    }
  }
  update(dt, bike, vehicles = []) {
    let n = 0;
    for (const p of this.peds) {
      let distance = Math.hypot(p.x - bike.pos.x, p.z - bike.pos.z);
      if (!p.active || distance > 220) { this.respawn(p, bike);if (!p.active) continue;distance = Math.hypot(p.x - bike.pos.x, p.z - bike.pos.z); }
      let target = p.state === 'crossing' ? p.crossTarget : p.route[p.direction];
      if (Math.hypot(target.x - p.x, target.z - p.z) < .12) {
        if (p.state === 'crossing') {
          p.side *= -1;p.route = sidewalkRoute(this.world.graph, p.edge, p.side);
          p.state = 'walking';p.crossing = null;p.direction = 1 - p.direction;
        } else if (p.state === 'walking') {
          p.crossing = crossingAt(this.world.graph, p.edge, p.direction);
          if (p.crossing.node.isOverpass) {
            p.crossing = null;p.direction = 1 - p.direction;p.pause = .5;
          } else {
          p.crossing.y = this.world.terrainHeight(p.crossing.x, p.crossing.z);
          p.crossTarget = sidewalkRoute(this.world.graph, p.edge, -p.side)[p.direction];
          p.state = 'waiting';p.pause = .6 + this.rng() * .8;
          }
        }
      }
      if (p.state === 'waiting' && p.pause <= 0) {
        const c = p.crossing;
        const signalSafe = !c.node.light || this.world.lightStateFor(c.node, c.axis) === 'red';
        if (signalSafe && crossingClear(c, vehicles, bike, (c.half * 2 + 2.4) / p.speed)) p.state = 'crossing';
      }
      target = p.state === 'crossing' ? p.crossTarget : p.route[p.direction];
      let dx = target.x - p.x, dz = target.z - p.z;
      const remaining = Math.hypot(dx, dz);
      const danger = distance < 8 && bike.speed > 5 && Math.abs(bike.pos.y - p.y) < 2.5;
      p.dodge = damp(p.dodge, danger ? 1 : 0, 5, dt);p.pause = Math.max(0, p.pause - dt);
      dx /= Math.max(remaining, 0.01);dz /= Math.max(remaining, 0.01);
      const speed = p.state === 'waiting' || p.pause > 0 ? 0 : p.speed * (1 + p.dodge * 1.6);
      const step = Math.min(remaining, speed * dt);
      const x = p.x + dx * step, z = p.z + dz * step;
      const roadStart = this.world.graph.nodes[p.edge.a];
      const lateral = Math.abs((x - roadStart.x) * p.edge.rx + (z - roadStart.z) * p.edge.rz);
      const blocked = (p.state !== 'crossing' && lateral < p.edge.road.width / 2 + 0.35) || this.world.collideCircle(x, z, p.y + 0.75, 0.30, this._col).hit;
      if (!blocked) { p.x = x;p.z = z; }
      else if (p.state === 'walking') { p.direction = 1 - p.direction;p.pause = 0.3; }
      if (speed > 0) p.yaw += angleDelta(p.yaw, Math.atan2(dx, dz)) * (1 - Math.exp(-7 * dt));
      p.walk = damp(p.walk, blocked ? 0 : clamp(speed / 1.2, 0, 1), 8, dt);
      if (!blocked) p.phase += step * 5;
      const kerb = clamp((lateral - p.edge.road.width / 2) / .65, 0, 1);
      p.y = this.world.terrainHeight(p.x, p.z) + .065 + .155 * kerb;
      const lookAt = Math.atan2(bike.pos.x - p.x, bike.pos.z - p.z);
      p.look = damp(p.look || 0, distance < 15 ? clamp(angleDelta(p.yaw, lookAt), -0.65, 0.65) : 0, 5, dt);
      this.pose(p, n++);
    }
    for (const [name, mesh] of Object.entries(this.parts)) {
      mesh.count = n * (name.endsWith('Pair') ? 2 : 1);mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
