import * as THREE from 'three';
import { clamp, damp, angleDelta, makeRng } from './core.js';
import { roundedBox, wedgeBox, pbr, Batcher, tube } from './parts.js';
import { pedestrianSpeedLimit } from './crosswalks.js';

/** Directed shortest path. Routes consist of edge IDs, never straight lines through blocks. */
export function policeRoute(graph, start, target) {
  if (start === target) return [];
  const dist = graph.nodes.map(() => Infinity), prev = [], open = new Set(graph.nodes.map(n => n.id));
  dist[start] = 0;
  while (open.size) {
    let best = -1;
    for (const id of open) if (best < 0 || dist[id] < dist[best]) best = id;
    if (!Number.isFinite(dist[best]) || best === target) break;
    open.delete(best);
    for (const eid of graph.nodes[best].out) {
      const e = graph.edges[eid], next = dist[best] + e.len;
      if (next < dist[e.b]) { dist[e.b] = next; prev[e.b] = eid; }
    }
  }
  const route = [];
  for (let n = target; n !== start;) {
    if (prev[n] === undefined) return [];
    const e = graph.edges[prev[n]];
    route.unshift(e.id); n = e.a;
  }
  return route;
}

function patrolModel(index) {
  const root = new THREE.Group(), batch = new Batcher();
  const white = pbr(0xe7e9e7, 0.32, 0.18), black = pbr(0x131921, 0.33, 0.28);
  const glass = pbr(0x203846, 0.18, 0.5), rubber = pbr(0x121519, 0.9, 0.02);
  const metal = pbr(0x8b96a1, 0.3, 0.78);
  batch.at(roundedBox(1.86, 0.54, 4.65, 0.15, 4), white, 0, 0.66, 0);
  batch.at(wedgeBox(1.77, 1.71, 0.20, 1.35, 0.07), black, 0, 0.98, 1.39);
  batch.at(wedgeBox(1.65, 1.77, 0.57, 2.28, 0.14), glass, 0, 1.20, -0.15);
  batch.at(roundedBox(1.51, 0.08, 1.77, 0.06), black, 0, 1.52, -0.24);
  for (const sd of [-1, 1]) {
    batch.at(roundedBox(0.028, 0.46, 0.065, 0.01), white, sd * 0.83, 1.19, -0.05);
    batch.at(roundedBox(0.02, 0.025, 0.16, 0.005), black, sd * 0.94, 0.84, 0.08);
    batch.at(roundedBox(0.02, 0.025, 0.16, 0.005), black, sd * 0.94, 0.84, -0.86);
    batch.at(roundedBox(0.24, 0.11, 0.19, 0.04), black, sd * 1.0, 1.10, 0.75);
    batch.at(roundedBox(0.48, 0.12, 0.07, 0.025), pbr(0xe7f4ff, 0.18, 0.1, { emissive: 0x788fa3 }), sd * 0.61, 0.83, 2.34);
    batch.at(roundedBox(0.47, 0.13, 0.06, 0.02), pbr(0x9d1421, 0.3, 0.1, { emissive: 0x4d0811 }), sd * 0.61, 0.83, -2.34);
    batch.at(roundedBox(0.025, 0.11, 3.40, 0.015), black, sd * 0.948, 0.59, -0.02);
  }
  batch.at(roundedBox(0.70, 0.20, 0.06, 0.02), black, 0, 0.74, 2.36);
  for (const sd of [-1, 1]) batch.at(tube(0.035, 0.035, 0.45, 8), metal, sd * 0.42, 0.65, 2.46);
  batch.at(tube(0.035, 0.035, 1.02, 8, 'x'), metal, 0, 0.59, 2.46);
  batch.at(roundedBox(1.10, 0.07, 0.28, 0.02), black, 0, 1.59, -0.16);
  batch.flush(root);
  const wheels = [];
  for (const sd of [-1, 1]) for (const end of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(sd * 0.86, 0.34, end * 1.45);
    const wb = new Batcher();
    wb.add(tube(0.34, 0.34, 0.24, 24, 'x'), rubber);
    wb.at(tube(0.22, 0.22, 0.245, 16, 'x'), metal);
    wb.at(tube(0.07, 0.07, 0.252, 12, 'x'), black);
    wb.flush(w);root.add(w);wheels.push(w);
  }
  const lights = [];
  for (const sd of [-1, 1]) {
    const color = sd < 0 ? 0xe52942 : 0x237eff;
    const mat = pbr(color, 0.18, 0.05, { emissive: color, emissiveIntensity: 0.08 });
    const lamp = new THREE.Mesh(roundedBox(0.46, 0.09, 0.26, 0.025), mat);
    lamp.position.set(sd * 0.27, 1.68, -0.16);root.add(lamp);lights.push(lamp);
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');canvas.width = 512;canvas.height = 128;
    const ctx = canvas.getContext('2d');ctx.fillStyle = '#182331';ctx.font = '900 78px Arial';
    ctx.textAlign = 'center';ctx.fillText('POLICE', 256, 82);ctx.font = 'bold 23px Arial';ctx.fillText(`CITY PATROL  /  0${index + 1}`, 256, 117);
    const map = new THREE.CanvasTexture(canvas);map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.5 });
    for (const sd of [-1, 1]) {
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1.40, 0.35), mat);
      label.position.set(sd * 0.959, 0.78, -0.10);label.rotation.y = sd * Math.PI / 2;root.add(label);
    }
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, wheels, lights };
}

export class Police {
  constructor(scene, world, traffic, count = 4) {
    this.world = world;this.traffic = traffic;this.rng = makeRng(7371);this.units = [];
    this.time = 0;this.enabled = true;this.status = 'patrol';this.level = 0;this.suspicion = 0;this.reason = '';
    this.unseen = 0;this.chaseTime = 0;this.arrest = 0;this.cooldown = 0;this.notice = 0;
    this.lastSeen = null;this.bustedTimer = 0;this.nearest = Infinity;this._col = {};
    const graph = world.graph;
    for (let i = 0; i < Math.min(count, graph.edges.length); i++) {
      // Spread patrols around the centre and opposite sides of town.
      const anchor = [[0, -100], [-140, 70], [140, -120], [0, 220]][i % 4];
      let best = graph.edges[0], distance = Infinity;
      for (const edge of graph.edges) {
        const a = graph.nodes[edge.a], b = graph.nodes[edge.b];
        const d = Math.hypot((a.x + b.x) / 2 - anchor[0], (a.z + b.z) / 2 - anchor[1]);
        if (d < distance) { best = edge;distance = d; }
      }
      const model = patrolModel(i);scene.add(model.root);
      const unit = { ...model, id: i, type: { l: 4.65 }, edge: best, s: best.len * 0.45, route: [], next: null,
        x: 0, y: 0, z: 0, yaw: Math.atan2(best.dirX, best.dirZ), speed: 10, seen: false,
        planTimer: 0, evidence: 0, routeTarget: -1, wheelAngle: 0 };
      Object.assign(unit, this.point(unit.edge, unit.s));
      for (let attempt = 0; attempt < 12; attempt++) {
        const blocked = [...traffic.cars, ...this.units].some(car => Math.hypot(car.x - unit.x, car.z - unit.z) < 9);
        if (!blocked) break;
        unit.s = best.len * (0.12 + this.rng() * 0.76);Object.assign(unit, this.point(unit.edge, unit.s));
      }
      unit.y = world.trafficHeight?.(unit.x, unit.z, unit.edge) ?? world.terrainHeight(unit.x, unit.z) + 0.05;
      this.units.push(unit);
      this.present(unit, 0);
    }
    traffic.policeUnits = this.units;
  }

  get busted() { return this.status === 'busted'; }
  reset(grace = 0) {
    this.status = 'patrol';this.level = 0;this.suspicion = 0;this.unseen = 0;
    this.arrest = 0;this.chaseTime = 0;this.lastSeen = null;this.cooldown = grace;this.bustedTimer = 0;
    for (const u of this.units) { u.evidence = 0;u.route = [];u.next = null;u.planTimer = 0; }
  }
  point(edge, s) {
    const a = this.world.graph.nodes[edge.a], t = clamp(s / edge.len, 0, 1), off = edge.lanes[0];
    return { x: a.x + edge.dirX * edge.len * t + edge.rx * off,
      z: a.z + edge.dirZ * edge.len * t + edge.rz * off };
  }
  nearestNode(x, z) {
    let best = this.world.graph.nodes[0], distance = Infinity;
    for (const n of this.world.graph.nodes) {
      const d = Math.hypot(x - n.x, z - n.z);if (d < distance) { best = n;distance = d; }
    }
    return best.id;
  }
  canSee(unit, bike) {
    const dx = bike.pos.x - unit.x, dz = bike.pos.z - unit.z, distance = Math.hypot(dx, dz);
    if (distance > (this.level ? 140 : 100) || Math.abs(bike.pos.y - unit.y) > 4.5) return false;
    if (!this.level && distance > 25 && (dx * Math.sin(unit.yaw) + dz * Math.cos(unit.yaw)) / distance < -0.20) return false;
    const steps = Math.ceil(distance / 3);
    for (let i = 1; i < steps; i++) {
      const t = i / steps, x = unit.x + dx * t, z = unit.z + dz * t;
      const y = lerpHeight(unit.y + 1.1, bike.pos.y + 0.3, t);
      if (this.world.terrainHeight(x, z) > y || this.world.collideCircle(x, z, y, 0.15, this._col).hit) return false;
    }
    return true;
  }
  offense(bike) {
    const publicRoad = bike.surface === 2 && this.world.roadWeight(bike.pos.x, bike.pos.z) > 0.5;
    if (publicRoad && bike.kmh > 90) return 'Excessive speed';
    if (publicRoad && bike.pitch - (bike.groundPitch || 0) > 0.28 && bike.speed > 6 && !bike.crashed) return 'Reckless wheelie';
    if (bike.speed > 8) for (const p of this.traffic.peds.peds) {
      if (p.active && Math.abs(p.y - bike.pos.y) < 2 && Math.hypot(p.x - bike.pos.x, p.z - bike.pos.z) < 5) return 'Endangering pedestrians';
    }
    return '';
  }
  chooseNext(unit) {
    const graph = this.world.graph;
    if (unit.route.length && graph.edges[unit.route[0]].a === unit.edge.b) return graph.edges[unit.route.shift()];
    const options = graph.nodes[unit.edge.b].out.map(id => graph.edges[id]);
    const forward = options.filter(e => e.b !== unit.edge.a);
    return (forward.length ? forward : options)[Math.floor(this.rng() * (forward.length || options.length))];
  }

  update(dt, bike) {
    for (const u of this.units) { u.root.visible = this.enabled;u.emergency = this.enabled && this.level > 0; }
    if (!this.enabled) return null;
    dt = clamp(dt, 0, 0.1);this.time += dt;this.cooldown = Math.max(0, this.cooldown - dt);this.notice = Math.max(0, this.notice - dt);
    if (this.busted) {
      this.bustedTimer += dt;
      for (const u of this.units) { u.speed = damp(u.speed, 0, 6, dt);this.present(u, dt); }
      if (this.bustedTimer > 4) { this.reset(12);return 'released'; }
      return null;
    }
    const offense = this.offense(bike);let witness = false;this.nearest = Infinity;
    for (const u of this.units) {
      const distance = Math.hypot(bike.pos.x - u.x, bike.pos.z - u.z);
      u.seen = this.canSee(u, bike);witness ||= u.seen;
      if (u.seen) this.nearest = Math.min(this.nearest, distance);
      u.evidence = clamp(u.evidence + (u.seen && offense && this.cooldown <= 0 ? dt : -dt * 1.5), 0, 1.3);
    }
    this.suspicion = Math.max(0, ...this.units.map(u => u.evidence)) / 1.3;
    if (!this.level && this.suspicion >= 1) {
      this.level = 1;this.status = 'pursuit';this.reason = offense;this.chaseTime = 0;
      this.lastSeen = { x: bike.pos.x, z: bike.pos.z };this.notice = 4;
    }
    if (this.level) {
      this.chaseTime += dt;
      this.level = 1 + (this.chaseTime > 20 ? 1 : 0) + (this.chaseTime > 45 ? 1 : 0);
      if (witness) {
        this.unseen = 0;this.status = 'pursuit';
        this.lastSeen = { x: bike.pos.x + bike.vel.x * 1.2, z: bike.pos.z + bike.vel.z * 1.2 };
      } else {
        this.unseen += dt;if (this.unseen > 2) this.status = 'search';
        if (this.unseen > 14) { this.reset(8);this.notice = 5;return 'escaped'; }
      }
      const stopped = bike.speed < 1.5 && this.nearest < 11 && bike.grounded;
      this.arrest = clamp(this.arrest + (stopped ? dt : -dt * 2), 0, 3);
      if (this.arrest >= 3) { this.status = 'busted';this.bustedTimer = 0;return 'busted'; }
    }
    for (const u of this.units) this.drive(u, dt, bike);
    return null;
  }

  drive(u, dt, bike) {
    const graph = this.world.graph;u.planTimer -= dt;
    if (this.level && this.lastSeen && u.planTimer <= 0 && u.edge.len - u.s > 25) {
      const target = this.nearestNode(this.lastSeen.x, this.lastSeen.z);
      u.route = policeRoute(graph, u.edge.b, target);u.next = null;u.routeTarget = target;u.planTimer = 1.2 + u.id * 0.1;
    }
    if (!u.next) u.next = this.chooseNext(u);
    let speed = this.level ? Math.min(32, 22 + this.level * 3) : 12;
    const toNode = u.edge.len - u.s, node = graph.nodes[u.edge.b];
    const turning = u.next && u.next.axis !== u.edge.axis;
    if (turning && toNode < 25) speed = Math.min(speed, 7 + toNode * 0.25);
    if (!this.level && node.light && this.world.lightStateFor(node, u.edge.axis) !== 'green' && toNode < 40) speed = Math.min(speed, Math.max(0, toNode - node.radius - 4) * 0.55);
    const fx = Math.sin(u.yaw), fz = Math.cos(u.yaw);
    for (const o of [...this.traffic.cars, ...this.units]) {
      if (o === u || Math.abs(o.y - u.y) > 2.5) continue;
      const dx = o.x - u.x, dz = o.z - u.z, along = dx * fx + dz * fz;
      if (along > 0 && along < 8 + u.speed * 0.7 && Math.abs(dx * fz - dz * fx) < 2.3) speed = Math.min(speed, Math.max(0, along - 6) * 0.6);
    }
    const dx = bike.pos.x - u.x, dz = bike.pos.z - u.z;
    if (u.seen && Math.hypot(dx, dz) < 12 && bike.speed < 3) speed = Math.min(speed, Math.max(0, Math.hypot(dx, dz) - 7));
    speed = Math.min(speed, pedestrianSpeedLimit(u, this.traffic.peds.peds));
    u.speed = damp(u.speed, speed, speed < u.speed ? 4 : 1.5, dt);
    const oldS = u.s;u.s += u.speed * dt;
    if (u.s >= u.edge.len) { u.s -= u.edge.len;u.edge = u.next;u.next = this.chooseNext(u); }
    const look = 4 + u.speed * 0.35;
    const point = u.s + look < u.edge.len ? this.point(u.edge, u.s + look) : this.point(u.next, u.s + look - u.edge.len);
    const yaw = Math.atan2(point.x - u.x, point.z - u.z);
    u.yaw += clamp(angleDelta(u.yaw, yaw), -1.7 * dt, 1.7 * dt);
    const lane = this.point(u.edge, u.s);
    const nx = damp(u.x + Math.sin(u.yaw) * u.speed * dt, lane.x, 2.5, dt);
    const nz = damp(u.z + Math.cos(u.yaw) * u.speed * dt, lane.z, 2.5, dt);
    const y = this.world.trafficHeight?.(nx, nz, u.edge) ?? this.world.terrainHeight(nx, nz) + 0.05;
    if (!this.world.collideCircle(nx, nz, y + 0.7, 1.05, this._col).hit) { u.x = nx;u.z = nz;u.y = y; }
    else { u.speed = 0;u.s = Math.min(oldS, u.edge.len - 0.01); }
    // Contact with a cruiser has the same consequence as hitting traffic.
      bike.collideVehicle?.(u, dt, 'Hit a police cruiser');
    this.present(u, dt);
  }
  present(u, dt) {
    const dx = Math.sin(u.yaw) * 2, dz = Math.cos(u.yaw) * 2;
    const height = (x, z) => this.world.trafficHeight?.(x, z, u.edge) ?? this.world.terrainHeight(x, z);
    const pitch = -Math.atan2(height(u.x + dx, u.z + dz) - height(u.x - dx, u.z - dz), 4);
    u.root.position.set(u.x, u.y, u.z);u.root.rotation.set(pitch, u.yaw, 0, 'YXZ');
    u.wheelAngle += u.speed * dt / 0.34;
    for (const w of u.wheels) w.rotation.x = u.wheelAngle;
    for (let i = 0; i < u.lights.length; i++) {
      const on = this.level > 0 && Math.floor(this.time * 8 + i) % 2 === 0;
      u.lights[i].material.emissiveIntensity = on ? 4 : 0.08;
    }
  }
}
const lerpHeight = (a, b, t) => a + (b - a) * t;
