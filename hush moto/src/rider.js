// rider.js — an articulated rider built from capsules and rounded shells:
// helmet with peak/chin bar/visor, jacket with shoulder armour, gloves, knee
// braces and boots. Arms and legs are re-aimed every frame at the grips and
// pegs, so the pose follows whatever the bike is doing.

import * as THREE from 'three';
import { pbr, roundedBox, wedgeBox, tube, Batcher, spanMesh } from './parts.js';
import { clamp, damp, smoothstep } from './core.js';
import { limbGeometry, torsoGeometry, jointPoint } from './humanoid.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Rider {
  constructor(parent, cfg, seatY, b) {
    this.cfg = cfg;
    this.seatY = seatY;
    this.b = b;

    const gearA = pbr(cfg.gearColor ?? cfg.accent, 0.62, 0.08);   // jersey / jacket
    const gearB = pbr(0x424a57, 0.70, 0.08);              // trousers, sleeves
    const gearC = pbr(cfg.gearColor ?? cfg.accent, 0.88, 0.0);
    const armour = pbr(0x1d2026, 0.42, 0.22);             // pads, protector
    const helmetM = pbr(0xeef1f5, 0.28, 0.16);
    const visorM = pbr(0x10141c, 0.08, 0.9, {
      transparent: true, opacity: 0.86,
    });
    const skin = pbr(0x8d6b52, 0.75, 0.02);
    const bootM = pbr(0x2a2d34, 0.55, 0.18);
    const gloveM = pbr(0x3a3f48, 0.66, 0.12);
    this.mats = { gearA, gearB, gearC, armour, helmetM, visorM, skin, bootM, gloveM };
    const roadHelmet = cfg.style === 'sport' || cfg.style === 'street';
    for (const mat of [gearA, gearB, gearC]) { mat.roughness = 0.9;mat.metalness = 0; }

    this.root = new THREE.Group();
    parent.add(this.root);

    // ---- pelvis -----------------------------------------------------------
    this.pelvis = new THREE.Group();
    this.pelvis.position.set(0, seatY + 0.06, -b * 0.30);
    this.root.add(this.pelvis);

    const pb = new Batcher();
    pb.at(roundedBox(0.275, 0.185, 0.235, 0.065), gearB, 0, 0.025, 0);
    pb.at(roundedBox(0.245, 0.075, 0.185, 0.035), armour, 0, 0.115, -0.015); // belt
    pb.flush(this.pelvis);

    // ---- torso ------------------------------------------------------------
    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.11, 0.02);
    this.pelvis.add(this.torso);

    const tb = new Batcher();
    // Chest: wedgeBox tapers along its depth axis, so pass the height as `d`
    // and let the X rotation stand it upright — narrow waist, wide shoulders.
    tb.at(torsoGeometry(), gearA, 0, -0.025, 0);
    // Back protector.
    tb.at(roundedBox(0.205, 0.27, 0.026, 0.025, 4), armour, 0, 0.20, -0.102);
    // Chest plate.
    tb.at(roundedBox(0.20, 0.17, 0.020, 0.025, 4), roadHelmet ? gearB : armour, 0, 0.225, 0.112);
    // Zipper, panel seams, collar and fabric folds break up the solid suit.
    tb.at(roundedBox(0.009, 0.32, 0.006, 0.002), armour, 0, 0.19, 0.126);
    for (const sd of [-1, 1]) {
      tb.at(roundedBox(0.095, 0.013, 0.007, 0.003), helmetM, sd * 0.11, 0.31, 0.12, 0, 0, sd * 0.16);
      tb.at(roundedBox(0.015, 0.16, 0.012, 0.005), gearB, sd * 0.135, 0.12, 0.089, 0, 0, sd * 0.15);
      for (let i = 0; i < 3; i++) tb.at(roundedBox(0.09, 0.008, 0.012, 0.003), gearB, sd * 0.08, 0.065 + i * 0.019, 0.093);
    }
    // Collar.
    tb.at(new THREE.TorusGeometry(0.082, 0.024, 6, 14), armour, 0, 0.375, 0.0,
      Math.PI / 2, 0, 0);
    // Shoulder caps.
    for (const s of [-1, 1]) {
      tb.at(new THREE.SphereGeometry(0.070, 16, 12), gearA, s * 0.178, 0.335, 0.005);
      tb.at(roundedBox(0.060, 0.065, 0.092, 0.025, 3), armour, s * 0.198, 0.348, 0.005);
    }
    tb.flush(this.torso);

    // Shoulder anchors for the arms.
    this.shoulders = [];
    for (const s of [-1, 1]) {
      const o = new THREE.Object3D();
      o.position.set(s * 0.178, 0.328, 0.015);
      this.torso.add(o);
      this.shoulders.push(o);
    }

    // ---- head + helmet ----------------------------------------------------
    this.head = new THREE.Group();
    this.head.position.set(0, 0.462, 0.015);
    this.torso.add(this.head);

    const hb = new Batcher();
    hb.at(tube(0.054, 0.062, 0.085, 8), skin, 0, -0.030, 0);
    // Shell.
    const shell = new THREE.SphereGeometry(0.118, 28, 20);
    shell.scale(1.0, 1.05, 1.12);
    hb.at(shell, helmetM, 0, 0.065, 0.005);
    // Chin bar.
    hb.at(roundedBox(0.152, 0.075, 0.125, 0.035), helmetM, 0, 0.005, 0.075);
    // Sun peak.
    if (!roadHelmet) hb.at(roundedBox(0.198, 0.016, 0.125, 0.008), helmetM, 0, 0.128, 0.110, -0.30, 0, 0);
    const stripe = new THREE.SphereGeometry(0.120, 18, 14, 1.40, 0.34, 0.18, 1.15);
    stripe.scale(1, 1.05, 1.12);hb.at(stripe, gearA, 0, 0.065, 0.005);
    // Vents.
    for (const s of [-1, 1]) {
      hb.at(roundedBox(0.026, 0.017, 0.045, 0.007), pbr(0x2a2d33, 0.5, 0.2),
        s * 0.048, 0.152, 0.065);
    }
    hb.flush(this.head);

    // Visor as its own mesh so it can stay glassy.
    // The lens sits outside the shell; a smaller radius hid it inside the helmet.
    const visorGeo = new THREE.SphereGeometry(0.124, 24, 14, Math.PI * 0.10, Math.PI * 0.80, 0.90, 0.62);
    const visor = new THREE.Mesh(visorGeo, visorM);
    visor.rotation.y = 0;
    visor.position.set(0, 0.065, 0.005);
    visor.scale.set(1.0, 1.05, 1.16);
    this.head.add(visor);

    // ---- limbs (re-aimed each frame) --------------------------------------
    this.arms = [];
    for (let i = 0; i < 2; i++) {
      const upper = new THREE.Mesh(limbGeometry(0.052, 0.81), gearA);
      const fore = new THREE.Mesh(limbGeometry(0.043, 0.67), gearC);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), armour);
      const glove = new THREE.Mesh(roundedBox(0.068, 0.068, 0.105, 0.028), gloveM);
      for (const m of [upper, fore, elbow, glove]) { m.castShadow = true; parent.add(m); }
      this.arms.push({ upper, fore, elbow, glove });
    }

    this.legs = [];
    for (let i = 0; i < 2; i++) {
      const thigh = new THREE.Mesh(limbGeometry(0.075, 0.77), gearB);
      const shin = new THREE.Mesh(limbGeometry(0.053, 0.70), gearB);
      const knee = new THREE.Mesh(roundedBox(0.100, 0.115, 0.090, 0.035), armour);
      const boot = new THREE.Mesh(roundedBox(0.105, 0.12, 0.245, 0.035), bootM);
      const bootTop = new THREE.Mesh(roundedBox(0.105, 0.17, 0.115, 0.035), bootM);
      const detail = new Batcher();
      detail.at(roundedBox(0.108, 0.021, 0.248, 0.012), armour, 0, -0.053, 0);
      detail.at(roundedBox(0.085, 0.020, 0.07, 0.007), gearB, 0, 0.040, 0.060);
      detail.flush(boot);
      const buckles = new Batcher();
      for (let j = 0; j < 3; j++) buckles.at(roundedBox(0.107, 0.013, 0.014, 0.004), helmetM, 0, -0.045 + j * 0.046, 0.059);
      buckles.flush(bootTop);
      for (const m of [thigh, shin, knee, boot, bootTop]) { m.castShadow = true; parent.add(m); }
      this.legs.push({ thigh, shin, knee, boot, bootTop });
    }

    this.hips = [];
    for (const s of [-1, 1]) {
      const o = new THREE.Object3D();
      o.position.set(s * 0.095, 0.0, 0.0);
      this.pelvis.add(o);
      this.hips.push(o);
    }

    this._lean = 0; this._shift = 0; this._rise = 0; this._twist = 0; this._hang = 0;
  }

  /** Aim a two-segment limb from `from` to `to` with a bend at `bendDir`. */
  _limb(seg, fx, fy, fz, tx, ty, tz, bendX, bendY, bendZ, r1, r2) {
    const len = Math.hypot(tx - fx, ty - fy, tz - fz);
    const mx = (fx + tx) / 2 + bendX;
    const my = (fy + ty) / 2 + bendY;
    const mz = (fz + tz) / 2 + bendZ;
    spanMesh(seg.a, fx, fy, fz, mx, my, mz);
    spanMesh(seg.b, mx, my, mz, tx, ty, tz);
    // CapsuleGeometry is built around a unit length, so scale.y is the length.
    seg.a.scale.y = Math.max(0.01, Math.hypot(mx - fx, my - fy, mz - fz)) / 1;
    seg.b.scale.y = Math.max(0.01, Math.hypot(tx - mx, ty - my, tz - mz)) / 1;
    void len; void r1; void r2;
    return { mx, my, mz };
  }

  /**
   * Pose the rider. `owner` is the BikeModel (used for local-space conversion),
   * `grips` / `pegs` are Object3Ds on the bike.
   */
  update(s, dt, owner, grips, pegs, firstPerson) {
    const cfg = this.cfg, b = this.b, seatY = this.seatY;
    const spd = s.speed;
    const tuck = smoothstep(clamp((spd - 14) / 38, 0, 1));
    const contactPitch = s.pitch - (s.grounded ? (s.groundPitch || 0) : 0);
    const wheelie = s.grounded ? clamp(contactPitch / 1.1, 0, 1) : 0;
    const stoppie = s.grounded ? clamp(-contactPitch / 0.6, 0, 1) : 0;
    const air = s.grounded ? 0 : 1;
    const braking = clamp(s.brakeAmount || 0, 0, 1);

    const trick = s.trickIndex ?? -1, trickBlend = s.trickBlend || 0;
    const sportLean = cfg.style === 'sport' ? 0.62 : cfg.style === 'street' ? 0.34 : 0.26;
    // As the chassis pitches up, fold forward at the hips to keep the torso
    // balanced above the rear contact instead of lying back with the bike.
    const acceleration = clamp((s._lastAx || 0) / 9.81, -1, 1);
    const compression = clamp(((s.suspF || 0)-(s.restSuspF || 0)+(s.suspR || 0)-(s.restSuspR || 0))*.5,-.08,.12);
    const targetLean = sportLean + tuck * 0.42 + wheelie * 0.78 + stoppie * 0.55 + braking * 0.10 + acceleration*.045 + air*clamp(s.pitch*.35,-.2,.35);
    const targetShift = -wheelie * 0.26 + stoppie * 0.14 + tuck * 0.03 - braking*.035;
    const targetRise = air * 0.07 + wheelie * 0.04 + (s.surface <= 1 && spd > 6 ? 0.05 : 0) - compression*.45;
    const wheelieTurn = wheelie * clamp((s.yawRate || 0) / .55, -1, 1);
    const corner = (1-air)*(1-wheelie)*smoothstep(clamp(spd/8,0,1))*clamp(s.roll/.7,-1,1);
    const targetTwist = clamp(-s.roll * 0.16 + s.steer * 0.5 + wheelieTurn * .24 + corner*.18, -0.4, 0.4);

    if(s.resetPose){
      this._lean=targetLean;this._shift=targetShift;this._rise=targetRise;this._twist=targetTwist;
      this._hang=wheelieTurn*.11+corner*(cfg.style==='sport'?.10:.055);
    }
    this._lean = damp(this._lean, targetLean, 7, dt);
    this._shift = damp(this._shift, targetShift, 7, dt);
    this._rise = damp(this._rise, targetRise, 6, dt);
    this._twist = damp(this._twist, targetTwist, 6, dt);
    this._hang = damp(this._hang, wheelieTurn * .11 + corner*(cfg.style==='sport'?.10:.055), 7, dt);

    this.pelvis.position.set(this._hang, seatY + 0.06 + this._rise, (cfg.riderSeatZ ?? -b * 0.30) + this._shift);
    this.pelvis.rotation.z = -s.roll * 0.10;
    this.torso.rotation.x = this._lean + (trick===4 ? trickBlend*.8 : 0);
    this.torso.rotation.y = this._twist * 0.35;
    this.torso.rotation.z = -this._hang * 1.4;

    const look = clamp(s.steer * 1.2 + s.roll * 0.30 + wheelieTurn * .38 + corner*.15, -0.55, 0.55);
    if(s.resetPose)this.head.rotation.set(clamp(s.pitch-this._lean+.12,-.85,.7),look,s.roll*.10);
    this.head.rotation.y = damp(this.head.rotation.y, look, 8, dt);
    this.head.rotation.x = damp(this.head.rotation.x, clamp(s.pitch-this._lean+.12,-.85,.7), 8, dt);
    this.head.rotation.z = damp(this.head.rotation.z, s.roll * 0.10, 6, dt);
    // Read the new pose and bike transforms this frame, not last frame's
    // renderer matrices (which stretched the arms after a reset or bike swap).
    owner.root.updateMatrixWorld(true);

    // Hide only what would fill the screen in first person.
    this.head.visible = !firstPerson;
    this.torso.visible = !firstPerson;
    this.pelvis.visible = !firstPerson;

    // ---- arms reach the grips --------------------------------------------
    for (let i = 0; i < 2; i++) {
      const sh = _v.setFromMatrixPosition(this.shoulders[i].matrixWorld);
      owner.chassis.worldToLocal(sh);
      const gp = _w.setFromMatrixPosition(grips[i].matrixWorld);
      owner.chassis.worldToLocal(gp);
      if (trick === 1 || (trick === 0 && i === 0)) { gp.x += (i===0?-1:1)*.32*trickBlend; gp.y += .28*trickBlend; gp.z -= .18*trickBlend; }
      const a = this.arms[i];
      const side = i === 0 ? -1 : 1;
      const elbow = jointPoint(sh, gp, 0.31, 0.29, new THREE.Vector3(side * 0.75 + this._hang, -0.45, -0.4));
      const ex = elbow.x, ey = elbow.y, ez = elbow.z;
      spanMesh(a.upper, sh.x, sh.y, sh.z, ex, ey, ez);
      spanMesh(a.fore, ex, ey, ez, gp.x, gp.y, gp.z);
      a.elbow.position.set(ex, ey, ez);
      a.glove.position.set(gp.x, gp.y, gp.z);
      a.glove.rotation.set(.25-(i===1?(s.throttle||0)*.3:0), owner.steerYaw.rotation.y, 0);
      a.upper.visible = true; a.fore.visible = true; a.elbow.visible = true; a.glove.visible = true;
    }

    // ---- legs reach the pegs ---------------------------------------------
    for (let i = 0; i < 2; i++) {
      const hp = _v.setFromMatrixPosition(this.hips[i].matrixWorld);
      owner.chassis.worldToLocal(hp);
      const pp = _w.setFromMatrixPosition(pegs[i].matrixWorld);
      owner.chassis.worldToLocal(pp);
      if ((trick===2 && i===0) || (trick===3 && i===0) || trick===4) { pp.x += (trick===3 ? .65 : (i===0?-.35:.35))*trickBlend; pp.y += (trick===4?.38:.2)*trickBlend; pp.z -= (trick===4?.7:.2)*trickBlend; }
      const l = this.legs[i];
      const side = i === 0 ? -1 : 1;
      // Knee forward and slightly out — the classic bent riding position.
      const ankle = pp.clone().add(new THREE.Vector3(0, 0.065, 0));
      const knee = jointPoint(hp, ankle, 0.43, 0.43, new THREE.Vector3(side * 0.14 + this._hang * 1.5, 0, 1));
      const kx = knee.x, ky = knee.y, kz = knee.z;
      spanMesh(l.thigh, hp.x, hp.y, hp.z, kx, ky, kz);
      spanMesh(l.shin, kx, ky, kz, pp.x, pp.y + 0.065, pp.z);
      l.knee.position.set(kx, ky, kz + 0.03);
      l.knee.rotation.set(0.5, 0, 0);
      l.bootTop.position.set(pp.x, pp.y + 0.10, pp.z - 0.01);
      l.boot.position.set(pp.x, pp.y + 0.015, pp.z + 0.045);
    }
  }
}
