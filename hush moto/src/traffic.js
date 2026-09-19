// traffic.js — AI cars on the city lane graph + ring highway, plus pedestrians.

import * as THREE from 'three';
import { mergeParts, roundedBox, tubeBetween } from './parts.js';
import { clamp, lerp, damp, makeRng, angleDelta, SpatialHash } from './core.js';
import { ringLaneLoop } from './roadnet.js';
import { Pedestrians } from './pedestrians.js';
import { pedestrianSpeedLimit } from './crosswalks.js';

const CAR_TYPES = [
  { name: 'sedan', w: 1.82, l: 4.45, h: 1.28, speed: 15.5, mass: 1 },
  { name: 'hatch', w: 1.74, l: 3.95, h: 1.34, speed: 14.5, mass: 1 },
  { name: 'van', w: 1.95, l: 5.2, h: 2.1, speed: 12.5, mass: 1.3 },
  { name: 'truck', w: 2.2, l: 7.4, h: 2.7, speed: 11.0, mass: 2.2 },
];

const CAR_COLORS = [
  0xb8bec7, 0x2b2f36, 0x9b1f24, 0x1d4f8b, 0xe4e6ea, 0x3d6b3f,
  0xd8a32a, 0x6a6f78, 0x14171b, 0xc4c9d0, 0x7a3b6b, 0x2f7f86,
];

function buildCarGeometry(t) {
  const geos = [];
  const body = roundedBox(t.w, t.h * 0.46, t.l, .16, 4);
  body.translate(0, t.h * 0.42, 0);
  geos.push(body);
  if (t.name === 'truck') {
    const cab = roundedBox(t.w, t.h * 0.7, t.l * 0.28, .13, 4);
    cab.translate(0, t.h * 0.75, t.l * 0.34);
    geos.push(cab);
    const boxg = new THREE.BoxGeometry(t.w * 1.02, t.h * 0.78, t.l * 0.62);
    boxg.translate(0, t.h * 0.82, -t.l * 0.16);
    geos.push(boxg);
  } else if (t.name === 'van') {
    const cab = roundedBox(t.w * 0.98, t.h * 0.56, t.l * 0.82, .14, 4);
    cab.translate(0, t.h * 0.78, -t.l * 0.05);
    geos.push(cab);
  } else {
    const roof = roundedBox(t.w * .75, .065, t.l * .32, .025, 4);
    roof.translate(0, t.h * 1.04, -t.l * .06);geos.push(roof);
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      geos.push(tubeBetween(side * t.w * .375, t.h * 1.02, -t.l * .06 + end * t.l * .16,
        side * t.w * .435, t.h * .66, -t.l * .04 + end * t.l * .25, .035, 6));
    }
  }
  return mergeParts(geos);
}

function buildCarDetailGeometry(t) {
  // Wheels + glass + lights, rendered with a dark shared material.
  const geos = [];
  const wr = t.name === 'truck' ? 0.46 : 0.33;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.CylinderGeometry(wr, wr, 0.26, 20);
      w.rotateZ(Math.PI / 2);
      w.translate(sx * (t.w / 2 - 0.05), wr, sz * (t.l * 0.33));
      geos.push(w);
    }
  }
  for (const end of [-1, 1]) {
    const bumper = roundedBox(t.w * .95, .10, .08, .025, 3);
    bumper.translate(0, .35, end * t.l * .50);geos.push(bumper);
  }
  const grille = roundedBox(t.w * .45, .17, .03, .025, 3);grille.translate(0, t.h * .49, t.l * .503);geos.push(grille);
  if (t.name === 'sedan' || t.name === 'hatch') for (const side of [-1, 1]) {
    const pillar = new THREE.BoxGeometry(.035, t.h * .38, .055);pillar.translate(side * t.w * .415, t.h * .83, -.12);geos.push(pillar);
    const mirror = roundedBox(.16, .10, .19, .035, 4);mirror.translate(side * t.w * .54, t.h * .70, t.l * .17);geos.push(mirror);
    for (const z of [-.55, .45]) { const handle = roundedBox(.028, .028, .14, .009);handle.translate(side * t.w * .501, t.h * .55, z);geos.push(handle); }
  }
  return mergeParts(geos);
}

function carGlass(t) {
  if (t.name === 'van' || t.name === 'truck') {
    const geo = roundedBox(t.w * .84, t.h * .27, .028, .03, 4);
    geo.translate(0, t.h * .9, t.l * (t.name === 'truck' ? .48 : .361));return geo;
  }
  const geo = new THREE.BoxGeometry(t.w * .87, t.h * .38, t.l * .50);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * .86);p.setZ(i, p.getZ(i) * .64 - t.l * .02); }
  geo.computeVertexNormals();geo.translate(0, t.h * .84, -t.l * .04);return geo;
}

function carBrightwork(t, lamps = false) {
  const parts = [], wr = t.name === 'truck' ? .46 : .33;
  for (const side of [-1, 1]) {
    if (lamps) {
      const geo = roundedBox(t.w * .21, .095, .045, .024, 4);geo.translate(side * t.w * .35, t.h * .55, t.l * .503);parts.push(geo);
    } else for (const end of [-1, 1]) {
      const geo = new THREE.CylinderGeometry(wr * .61, wr * .61, .02, 20);geo.rotateZ(Math.PI / 2);
      geo.translate(side * (t.w / 2 + .085), wr, end * t.l * .33);parts.push(geo);
    }
  }
  return mergeParts(parts);
}

export class Traffic {
  constructor(scene, world, count = 46, pedCount = 70) {
    this.scene = scene;
    this.world = world;
    this.rng = makeRng(4242);
    this.cars = [];
    this.hash = new SpatialHash(20);
    this._stamp = 1;
    this._near = [];
    this.nearMissCooldown = new Map();

    this.ringLoops = [];
    for (const lane of [0, 1]) {
      this.ringLoops.push(this.prepLoop(ringLaneLoop(world.roads, lane, 1)));
      this.ringLoops.push(this.prepLoop(ringLaneLoop(world.roads, lane, -1)));
    }

    this.buildMeshes(count);
    this.spawnInitial(count);
    this.peds = new Pedestrians(scene, world, pedCount);
  }

  prepLoop(pts) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], len, start: total });
      total += len;
    }
    return { segs, total };
  }

  loopPoint(loop, s, out) {
    s = ((s % loop.total) + loop.total) % loop.total;
    let lo = 0, hi = loop.segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (loop.segs[mid].start <= s) lo = mid; else hi = mid - 1;
    }
    const seg = loop.segs[lo];
    const t = clamp((s - seg.start) / seg.len, 0, 1);
    out.x = lerp(seg.ax, seg.bx, t);
    out.z = lerp(seg.az, seg.bz, t);
    return out;
  }

  buildMeshes(count) {
    this.groups = [];
    const per = Math.ceil(count / CAR_TYPES.length);
    for (const t of CAR_TYPES) {
      const bodyGeo = buildCarGeometry(t);
      const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.4 });
      const body = new THREE.InstancedMesh(bodyGeo, bodyMat, per);
      body.castShadow = true;
      body.receiveShadow = true;
      body.count = 0;
      body.frustumCulled = false;
      this.scene.add(body);

      const detGeo = buildCarDetailGeometry(t);
      const detMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.85, metalness: 0.1 });
      const det = new THREE.InstancedMesh(detGeo, detMat, per);
      det.count = 0;
      det.frustumCulled = false;
      this.scene.add(det);

      // Brake / tail lights
      const lampGeo = new THREE.BoxGeometry(t.w * 0.9, 0.12, 0.06);
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const lamp = new THREE.InstancedMesh(lampGeo, lampMat, per);
      lamp.count = 0;
      lamp.frustumCulled = false;
      this.scene.add(lamp);

      const extras = [
        [carGlass(t), new THREE.MeshStandardMaterial({ color: 0x243b4a, roughness: .16, metalness: .4 })],
        [carBrightwork(t), new THREE.MeshStandardMaterial({ color: 0xa6abb1, roughness: .3, metalness: .8 })],
        [carBrightwork(t, true), new THREE.MeshBasicMaterial({ color: 0xe5f0ef })],
      ].map(([geo, mat]) => { const mesh = new THREE.InstancedMesh(geo, mat, per);mesh.count = 0;mesh.frustumCulled = false;this.scene.add(mesh);return mesh; });
      this.groups.push({ type: t, body, det, lamp, extras, slots: 0, max: per });
    }
    this._mtx = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._c = new THREE.Color();
  }

  spawnInitial(count) {
    const g = this.world.graph;
    for (let i = 0; i < count; i++) {
      const gi = i % this.groups.length;
      const grp = this.groups[gi];
      if (grp.slots >= grp.max) continue;
      const slot = grp.slots++;
      const onRing = this.rng() < 0.38;
      const car = {
        group: grp, slot,
        type: grp.type,
        color: CAR_COLORS[(this.rng() * CAR_COLORS.length) | 0],
        x: 0, z: 0, y: 0, yaw: 0,
        speed: 0,
        targetSpeed: grp.type.speed * (0.82 + this.rng() * 0.42),
        onRing,
        loop: null, s: 0,
        edge: null, lane: 0, nextEdge: null,
        brake: 0,
        stopped: false,
        active: true,
      };
      if (onRing) {
        car.loop = this.ringLoops[(this.rng() * this.ringLoops.length) | 0];
        car.s = this.rng() * car.loop.total;
        car.targetSpeed = grp.type.speed * (1.55 + this.rng() * 0.55);
      } else {
        car.edge = g.edges[(this.rng() * g.edges.length) | 0];
        car.lane = (this.rng() * car.edge.lanes.length) | 0;
        car.s = this.rng() * car.edge.len;
      }
      this.placeOnPath(car, true);
      car.speed = car.targetSpeed;
      this.cars.push(car);
    }
  }

  /** World position of a car's path at arc-length s (+ lane offset). */
  pathPoint(car, s, out) {
    if (car.onRing) return this.loopPoint(car.loop, s, out);
    const g = this.world.graph;
    let edge = car.edge;
    let ss = s;
    let guard = 0;
    while (ss > edge.len && guard++ < 4) {
      ss -= edge.len;
      edge = car.nextEdge && guard === 1 ? car.nextEdge : this.pickNext(edge, g);
    }
    const a = g.nodes[edge.a], b = g.nodes[edge.b];
    const t = clamp(ss / edge.len, 0, 1);
    const lane = edge.lanes[Math.min(car.lane, edge.lanes.length - 1)];
    out.x = lerp(a.x, b.x, t) + edge.rx * lane;
    out.z = lerp(a.z, b.z, t) + edge.rz * lane;
    return out;
  }

  pickNext(edge, g) {
    const node = g.nodes[edge.b];
    const opts = node.out;
    let pick = null, tries = 0;
    while (tries++ < 8) {
      const e = g.edges[opts[(this.rng() * opts.length) | 0]];
      if (e.b === edge.a && opts.length > 1) continue; // avoid U-turn
      pick = e; break;
    }
    return pick || g.edges[opts[0]];
  }

  placeOnPath(car, snapYaw) {
    const p = this._tmp || (this._tmp = { x: 0, z: 0 });
    this.pathPoint(car, car.s, p);
    car.x = p.x; car.z = p.z;
    if (snapYaw) {
      const q = { x: 0, z: 0 };
      this.pathPoint(car, car.s + 4, q);
      car.yaw = Math.atan2(q.x - p.x, q.z - p.z);
    }
    this.placeOnRoad(car);
  }

  placeOnRoad(car) {
    const height = (x, z) => this.world.trafficHeight?.(x, z, car.edge) ?? this.world.terrainHeight(x, z);
    car.y = height(car.x, car.z);
    const dx = Math.sin(car.yaw) * car.type.l / 2, dz = Math.cos(car.yaw) * car.type.l / 2;
    car.pitch = -Math.atan2(height(car.x + dx, car.z + dz) - height(car.x - dx, car.z - dz), car.type.l);
  }

  update(dt, bike, events) {
    const g = this.world.graph;
    const p = { x: 0, z: 0 };

    // Rebuild the broad-phase for car-vs-car following.
    this.hash.clear();
    for (const car of this.cars) {
      this.hash.insertAABB(car.x - 3, car.z - 3, car.x + 3, car.z + 3, car);
    }
    for (const unit of this.policeUnits || []) if (unit.root.visible) {
      this.hash.insertAABB(unit.x - 3, unit.z - 3, unit.x + 3, unit.z + 3, unit);
    }

    const bx = bike.pos.x, bz = bike.pos.z;
    const bSpeed = bike.speed;

    for (const car of this.cars) {
      // ---- recycle distant cars near the player ----
      const dx = car.x - bx, dz = car.z - bz;
      const d2 = dx * dx + dz * dz;
      if (d2 > 420 * 420) { this.respawnNear(car, bike); continue; }

      let target = car.targetSpeed;
      car.brake = 0;
      // Make room for a pursuing patrol in the inner lane of an avenue.
      for (const unit of this.policeUnits || []) {
        if (!unit.emergency || car.onRing || car.edge.lanes.length < 2) continue;
        const dx = car.x - unit.x, dz = car.z - unit.z;
        const along = dx * Math.sin(unit.yaw) + dz * Math.cos(unit.yaw);
        const side = Math.abs(dx * Math.cos(unit.yaw) - dz * Math.sin(unit.yaw));
        if (along > 0 && along < 45 && side < 5 && Math.cos(unit.yaw - car.yaw) > 0.7) {
          car.lane = car.edge.lanes.length - 1;target *= 0.8;
        }
      }

      // ---- traffic lights ----
      if (!car.onRing) {
        const node = g.nodes[car.edge.b];
        const toNode = car.edge.len - car.s;
        if (node.light) {
          const st = this.world.lightStateFor(node, car.edge.axis);
          const stopDist = 3 + node.radius;
          if ((st === 'red' || (st === 'yellow' && toNode > 10)) && toNode < 42) {
            const d = Math.max(toNode - stopDist, 0);
            target = Math.min(target, d * 0.55);
            if (d < 1.5) target = 0;
            car.brake = target < car.speed - 0.5 ? 1 : 0;
          }
        }
      }

      // ---- car following ----
      const list = this._near;
      list.length = 0;
      const ahead = 22;
      this.hash.query(car.x - ahead, car.z - ahead, car.x + ahead, car.z + ahead, list, this._stamp++);
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o === car || Math.abs(o.y - car.y) > 3) continue;
        const ox = o.x - car.x, oz = o.z - car.z;
        const along = ox * fx + oz * fz;
        if (along <= 0 || along > ahead) continue;
        const side = Math.abs(ox * fz - oz * fx);
        if (side > 2.2) continue;
        const gap = along - (car.type.l + o.type.l) * 0.5;
        const safe = 3.5 + car.speed * 0.55;
        if (gap < safe) {
          target = Math.min(target, Math.max(0, o.speed * (gap / safe)));
          if (gap < safe * 0.55) car.brake = 1;
        }
      }

      // ---- react to the player's bike ----
      const bAlong = (bx - car.x) * fx + (bz - car.z) * fz;
      const bSide = Math.abs((bx - car.x) * fz - (bz - car.z) * fx);
      const bDist = Math.sqrt(d2);
      const bHeightClose = Math.abs(bike.pos.y - car.y) < 3.0;
      if (bHeightClose && bAlong > 0 && bAlong < 26 && bSide < 2.6) {
        const gap = bAlong - car.type.l * 0.5;
        const safe = 5 + car.speed * 0.5;
        if (gap < safe) { target = Math.min(target, Math.max(0, bSpeed * 0.8)); car.brake = 1; }
      }
      // Near miss scoring — must be alongside the car, not 9 m above it on
      // the bridge.
      const bDy = Math.abs(bike.pos.y - (car.y + car.type.h * 0.5));
      if (bDist < 3.2 && bDy < 2.4 && bSpeed > 11) {
        const last = this.nearMissCooldown.get(car) || -9;
        if (performance.now() / 1000 - last > 1.2) {
          this.nearMissCooldown.set(car, performance.now() / 1000);
          events.push({ type: 'nearMiss', speed: bSpeed, dist: bDist });
        }
      }

      // ---- longitudinal ----
      const crossingLimit = pedestrianSpeedLimit(car, this.peds.peds);
      if (crossingLimit < target) { target = crossingLimit;car.brake = 1; }
      const accel = target > car.speed ? 3.6 : 8.5;
      car.speed = damp(car.speed, target, accel * 0.55, dt);
      car.speed = clamp(car.speed, 0, 46);

      // ---- advance along the path ----
      car.s += car.speed * dt;
      if (!car.onRing) {
        if (car.s > car.edge.len) {
          car.s -= car.edge.len;
          car.edge = car.nextEdge || this.pickNext(car.edge, g);
          car.nextEdge = null;
          car.lane = Math.min(car.lane, car.edge.lanes.length - 1);
        }
        if (!car.nextEdge && car.edge.len - car.s < 24) {
          car.nextEdge = this.pickNext(car.edge, g);
        }
      }

      // ---- steer toward a look-ahead point (gives smooth turns) ----
      const look = 4.5 + car.speed * 0.45;
      this.pathPoint(car, car.s + look, p);
      const desiredYaw = Math.atan2(p.x - car.x, p.z - car.z);
      const dy = angleDelta(car.yaw, desiredYaw);
      const maxTurn = (car.speed > 1 ? 2.6 : 3.4) * dt;
      car.yaw += clamp(dy, -maxTurn, maxTurn);

      // Move, then gently correct back onto the lane centre.
      car.x += Math.sin(car.yaw) * car.speed * dt;
      car.z += Math.cos(car.yaw) * car.speed * dt;
      this.pathPoint(car, car.s, p);
      car.x = damp(car.x, p.x, 3.0, dt);
      car.z = damp(car.z, p.z, 3.0, dt);
      this.placeOnRoad(car);
      bike.collideVehicle?.(car, dt);
    }

    this.writeMatrices();
    this.peds.update(dt, bike, [...this.cars, ...(this.policeUnits || [])]);
  }

  respawnNear(car, bike) {
    const g = this.world.graph;
    const bx = bike.pos.x, bz = bike.pos.z;
    if (this.rng() < 0.4) {
      car.onRing = true;
      car.loop = this.ringLoops[(this.rng() * this.ringLoops.length) | 0];
      // Find a spot on the loop 140-300 m from the player.
      for (let i = 0; i < 24; i++) {
        const s = this.rng() * car.loop.total;
        const p = this.loopPoint(car.loop, s, { x: 0, z: 0 });
        const d = Math.hypot(p.x - bx, p.z - bz);
        if (d > 130 && d < 330) { car.s = s; break; }
      }
      car.targetSpeed = car.type.speed * (1.55 + this.rng() * 0.55);
    } else {
      car.onRing = false;
      let best = null;
      for (let i = 0; i < 40; i++) {
        const e = g.edges[(this.rng() * g.edges.length) | 0];
        const a = g.nodes[e.a];
        const d = Math.hypot(a.x - bx, a.z - bz);
        if (d > 110 && d < 300) { best = e; break; }
      }
      car.edge = best || g.edges[(this.rng() * g.edges.length) | 0];
      car.lane = (this.rng() * car.edge.lanes.length) | 0;
      car.s = this.rng() * car.edge.len;
      car.nextEdge = null;
      car.targetSpeed = car.type.speed * (0.82 + this.rng() * 0.42);
    }
    this.placeOnPath(car, true);
    car.speed = car.targetSpeed * 0.8;
  }

  writeMatrices() {
    for (const grp of this.groups) { grp.body.count = 0; grp.det.count = 0; grp.lamp.count = 0;for (const mesh of grp.extras) mesh.count = 0; }
    const mtx = this._mtx, q = this._q, v = this._v, s = this._s, c = this._c;
    for (const car of this.cars) {
      const grp = car.group;
      const i = car.slot;
      q.setFromEuler(new THREE.Euler(car.pitch || 0, car.yaw, 0, 'YXZ'));
      v.set(car.x, car.y, car.z);
      mtx.compose(v, q, s);
      grp.body.setMatrixAt(i, mtx);
      grp.det.setMatrixAt(i, mtx);
      for (const mesh of grp.extras) mesh.setMatrixAt(i, mtx);
      c.setHex(car.color);
      grp.body.setColorAt(i, c);

      // Tail lamp sits at the back of the car.
      const t = car.type;
      v.set(car.x - Math.sin(car.yaw) * t.l * 0.5, car.y + t.h * 0.45, car.z - Math.cos(car.yaw) * t.l * 0.5);
      mtx.compose(v, q, s);
      grp.lamp.setMatrixAt(i, mtx);
      const lit = car.brake > 0.5 ? 1 : 0.28;
      c.setRGB(lit, lit * 0.08, lit * 0.06);
      grp.lamp.setColorAt(i, c);

      grp.body.count = Math.max(grp.body.count, i + 1);
      grp.det.count = Math.max(grp.det.count, i + 1);
      grp.lamp.count = Math.max(grp.lamp.count, i + 1);
      for (const mesh of grp.extras) mesh.count = grp.body.count;
    }
    for (const grp of this.groups) {
      grp.body.instanceMatrix.needsUpdate = true;
      grp.det.instanceMatrix.needsUpdate = true;
      grp.lamp.instanceMatrix.needsUpdate = true;
      for (const mesh of grp.extras) mesh.instanceMatrix.needsUpdate = true;
      if (grp.body.instanceColor) grp.body.instanceColor.needsUpdate = true;
      if (grp.lamp.instanceColor) grp.lamp.instanceColor.needsUpdate = true;
    }
  }
}
