// camera.js — chase / close / first-person / cinematic cameras.

import * as THREE from 'three';
import { clamp, lerp, damp, smoothstep, angleDelta } from './core.js';

export const CAMERA_MODES = ['Chase', 'Close', 'First person', 'Cinematic'];

export class CameraRig {
  constructor(camera, world) {
    this.cam = camera;
    this.world = world;
    this.mode = 0;
    this.pos = new THREE.Vector3(0, 5, -10);
    this.look = new THREE.Vector3();
    this.lookSmooth = new THREE.Vector3();
    this.camYaw = 0;
    this.roll = 0;
    this.fov = 68;
    this.shake = 0;
    this.shakeVec = new THREE.Vector3();
    this.baseFov = 68;
    this.invertLook = false;
    this._g = {};
    this._col = {};
    this.cinTimer = 0;
    this.cinAngle = 0;
    this.initialised = false;
  }

  setMode(m) {
    this.mode = ((m % CAMERA_MODES.length) + CAMERA_MODES.length) % CAMERA_MODES.length;
    this.initialised = false;
  }

  addShake(amount) {
    this.shake = Math.min(1.6, this.shake + amount);
  }

  update(dt, bike, lookBack, look) {
    this.look_ = look || { yaw: 0, pitch: 0 };
    const speed = bike.speed;
    const spdT = smoothstep(clamp(speed / 55, 0, 1));

    // Camera yaw follows the bike but lags in fast turns for a sense of speed.
    const targetYaw = bike.yaw + (lookBack ? Math.PI : 0) + this.look_.yaw;
    if (!this.initialised) { this.camYaw = targetYaw; this.initialised = true; this.pos.set(bike.pos.x, bike.pos.y + 3, bike.pos.z); }
    const yawRate = this.mode === 2 ? 26 : lerp(5.2, 9.0, spdT);
    this.camYaw += angleDelta(this.camYaw, targetYaw) * (1 - Math.exp(-yawRate * dt));

    switch (this.mode) {
      case 0: this.chase(dt, bike, 5.8, 2.25, spdT, lookBack); break;
      case 1: this.chase(dt, bike, 3.8, 1.75, spdT, lookBack); break;
      case 2: this.firstPerson(dt, bike); break;
      case 3: this.cinematic(dt, bike); break;
    }

    // Shake decays quickly.
    this.shake = Math.max(0, this.shake - dt * 2.6);
    const sh = this.shake * this.shake;
    if (sh > 0.0005) {
      const t = performance.now() * 0.001;
      this.shakeVec.set(
        Math.sin(t * 47.3) * sh * 0.16,
        Math.sin(t * 61.7) * sh * 0.13,
        Math.sin(t * 39.1) * sh * 0.10
      );
      this.cam.position.add(this.shakeVec);
    }

    // FOV rises with speed, punches on hard acceleration.
    const targetFov = this.baseFov + spdT * 21 + (bike.crashed ? -6 : 0) +
      clamp(bike.engineLoad * (speed > 4 ? 1 : 0), 0, 1) * 2.5;
    this.fov = damp(this.fov, targetFov, 3.2, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
  }

  chase(dt, bike, dist, height, spdT, lookBack) {
    const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);
    // Desired position behind the bike.
    const d = dist + spdT * 1.6;
    const hgt = height + spdT * 0.35 + clamp(bike.pitch, 0, 1.3) * 0.75
      + this.look_.pitch * dist * 0.85;
    const tx = bike.pos.x - sy * d;
    const tz = bike.pos.z - cy * d;
    let ty = bike.pos.y + hgt;

    // Keep the camera above the ground and out of solid objects.
    const g = this.world.queryGround(tx, tz, ty + 4, this._g);
    ty = Math.max(ty, g.y + 1.5);

    const follow = lerp(7.5, 13.0, spdT);
    this.pos.x = damp(this.pos.x, tx, follow, dt);
    this.pos.z = damp(this.pos.z, tz, follow, dt);
    this.pos.y = damp(this.pos.y, ty, 7.0, dt);

    // Never let terrain clip in front of the lens.
    const gc = this.world.queryGround(this.pos.x, this.pos.z, this.pos.y + 6, this._g);
    if (this.pos.y < gc.y + 1.1) this.pos.y = gc.y + 1.1;

    this.avoidObstacles(bike);

    this.cam.position.copy(this.pos);

    // Look slightly ahead of the bike along its travel direction. While the
    // player is looking around, aim at the bike itself so it stays framed.
    const freeLook = Math.abs(this.look_.yaw) > 0.03;
    const lead = freeLook ? 0 : (lookBack ? -2 : 2.2 + spdT * 4);
    const leadX = bike.pos.x + Math.sin(bike.yaw) * lead;
    const leadZ = bike.pos.z + Math.cos(bike.yaw) * lead;
    const leadY = bike.pos.y + 0.9 + clamp(bike.pitch, 0, 1.3) * 0.5
      - this.look_.pitch * 2.2;
    this.look.set(leadX, leadY, leadZ);
    this.lookSmooth.x = damp(this.lookSmooth.x || leadX, leadX, 11, dt);
    this.lookSmooth.y = damp(this.lookSmooth.y || leadY, leadY, 8, dt);
    this.lookSmooth.z = damp(this.lookSmooth.z || leadZ, leadZ, 11, dt);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(this.lookSmooth);

    // Subtle roll with the bike's lean — enough to feel it, not enough to sicken.
    const targetRoll = -bike.roll * 0.16 - bike.vLat * 0.004;
    this.roll = damp(this.roll, targetRoll, 5, dt);
    this.cam.rotateZ(this.roll);
    void lookBack;
  }

  firstPerson(dt, bike) {
    const cfg = bike.cfg;
    const h = cfg.cgHeight;
    // Rider's eye point in bike-local space.
    const ex = 0, ey = cfg.seatH - h + 0.72, ez = -cfg.cgRear * 0.10;
    const e = new THREE.Euler(-bike.pitch, bike.yaw, -bike.roll * 0.72, 'YXZ');
    const q = new THREE.Quaternion().setFromEuler(e);
    const off = new THREE.Vector3(ex, ey, ez).applyQuaternion(q);
    const px = bike.pos.x + off.x;
    const py = bike.pos.y + off.y;
    const pz = bike.pos.z + off.z;
    this.pos.x = damp(this.pos.x, px, 38, dt);
    this.pos.y = damp(this.pos.y, py, 30, dt);
    this.pos.z = damp(this.pos.z, pz, 38, dt);
    this.cam.position.set(this.pos.x, this.pos.y, this.pos.z);

    // Look direction: bike forward, plus the rider's head turning into corners
    // and any free-look the player is applying.
    const ly = this.look_.yaw, lp = this.look_.pitch;
    const headYaw = Math.sin(bike.steer * 0.55) * 0.35;
    const dir = new THREE.Vector3(
      Math.sin(ly) + headYaw * Math.cos(ly),
      -0.09 + bike.pitch * 0.22 + lp * 1.4,
      Math.cos(ly) - headYaw * Math.sin(ly)
    );
    const look = dir.applyQuaternion(q).normalize();
    this.cam.up.set(0, 1, 0).applyQuaternion(q);
    this.cam.lookAt(this.pos.x + look.x * 10, this.pos.y + look.y * 10, this.pos.z + look.z * 10);
  }

  avoidObstacles(bike) {
    // Sweep from the rider to the lens, including its near-plane clearance.
    // Snap inward at a wall; ordinary follow damping eases the camera back out.
    const ox = bike.pos.x, oy = bike.pos.y + .65, oz = bike.pos.z;
    const dx = this.pos.x - ox, dy = this.pos.y - oy, dz = this.pos.z - oz;
    const length = Math.hypot(dx, dy, dz), steps = Math.ceil(length / .22);
    for (let i = 2; i <= steps; i++) {
      const t = i / steps, x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      const ground = this.world.queryGround(x, z, y + .25, this._g);
      const solid = this.world.collideCircle(x, z, y, .24, this._col);
      if (solid.hit || ground.y > y - .24) {
        const safe = Math.max(0, (i - 2) / steps);
        this.pos.set(ox + dx * safe, oy + dy * safe, oz + dz * safe);break;
      }
    }
  }

  cinematic(dt, bike) {
    this.cinTimer -= dt;
    if (this.cinTimer <= 0) {
      this.cinTimer = 5 + Math.random() * 4;
      this.cinAngle = Math.random() * Math.PI * 2;
      this.cinDist = 11 + Math.random() * 16;
      this.cinHeight = 1.6 + Math.random() * 7;
      this.initialised = false;
    }
    const ang = this.cinAngle + performance.now() * 0.00007;
    const tx = bike.pos.x + Math.sin(ang) * this.cinDist;
    const tz = bike.pos.z + Math.cos(ang) * this.cinDist;
    const g = this.world.queryGround(tx, tz, bike.pos.y + 20, this._g);
    const ty = Math.max(g.y + 1.2, bike.pos.y + this.cinHeight);
    if (!this.initialised) { this.pos.set(tx, ty, tz); this.initialised = true; }
    this.pos.x = damp(this.pos.x, tx, 2.2, dt);
    this.pos.y = damp(this.pos.y, ty, 2.2, dt);
    this.pos.z = damp(this.pos.z, tz, 2.2, dt);
    this.avoidObstacles(bike);
    this.cam.position.copy(this.pos);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(bike.pos.x, bike.pos.y + 0.6, bike.pos.z);
  }
}
