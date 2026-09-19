// bikemodel.js — detailed procedural motorcycles.
//
// Geometry is generated from the physics config so the rendered wheelbase,
// wheel radii and seat height always match the simulation. Static chassis
// parts are merged per material; only things that actually move (steering,
// fork lowers, swingarm, wheels, rider limbs) stay as separate nodes.

import * as THREE from 'three';
import {
  pbr, roundedBox, wedgeBox, bodyLoft, tube, lathe, tubeBetween, spanMesh, Batcher,
} from './parts.js';
import { clamp } from './core.js';
import { Rider } from './rider.js';
import { loadImportedBike } from './importedbike.js';
import { paintModel } from './customization.js';
import { addBuildDetails } from './build-details.js';
import { fenderTip } from './bikephysics.js';

const RAKE = 0.46;   // steering-head angle from vertical
const _tmpV = new THREE.Vector3();

// Side-profile extrusions preserve the angular silhouettes of forged spars
// and moulded plastics. Coordinates are [forward, height], in chassis metres.
function sidePanel(points, thickness) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => i ? shape.lineTo(z, y) : shape.moveTo(z, y));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: true, bevelSize: 0.004,
    bevelThickness: 0.003, bevelSegments: 2, steps: 1,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateY(-Math.PI / 2);
  return geo;
}

// ---------------------------------------------------------------------------
// Wheels
// ---------------------------------------------------------------------------
function buildWheel(radius, width, opts) {
  const g = new THREE.Group();
  const knobby = opts.knobby;
  const tyre = pbr(0x141416, 0.95, 0.02);
  const tread = pbr(0x0d0e10, 0.98, 0.0);
    const rimMat = pbr(opts.rimColor, 0.36, 0.58);
  const hubMat = pbr(0x3b3f45, 0.42, 0.75);
  const discMat = pbr(0x9aa0a8, 0.28, 0.95);
  const spokeMat = pbr(0xc3c8d0, 0.3, 0.92);

  const b = new Batcher();

  // --- carcass ---
  const rimOuter = opts.rimRadius ?? radius - width * 0.66;
  const carcassR = (radius + rimOuter) / 2;
  const carcass = lathe([
    [rimOuter, -width * 0.34], [rimOuter + 0.016, -width * 0.46],
    [carcassR, -width * 0.50], [radius - 0.015, -width * 0.35],
    [radius - (knobby ? 0.012 : 0), 0],
    [radius - 0.015, width * 0.35], [carcassR, width * 0.50],
    [rimOuter + 0.016, width * 0.46], [rimOuter, width * 0.34],
  ], 48);
  carcass.rotateZ(Math.PI / 2);
  b.add(carcass, tyre);
  for (const s of [-1, 1]) {
    const sw = new THREE.TorusGeometry(carcassR + width * 0.09, width * 0.16, 6, 26);
    sw.rotateY(Math.PI / 2);
    b.at(sw, tyre, s * width * 0.20, 0, 0);
  }

  // --- tread ---
  if (knobby) {
    const rows = [-0.27, 0, 0.27];
    for (let r = 0; r < rows.length; r++) {
      const count = 32;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + r * 0.25;
        const kn = roundedBox(width * 0.25, 0.022, 0.033, 0.004);
        kn.rotateX(a);
        kn.translate(
          rows[r] * width,
          Math.cos(a) * (radius - 0.009),
          Math.sin(a) * (radius - 0.009)
        );
        b.add(kn, tyre);
      }
    }
  } else {
    for (const off of [-0.24, 0.24]) {
      const gr = new THREE.TorusGeometry(radius - 0.001, 0.0015, 4, 48);
      gr.rotateY(Math.PI / 2);
      b.at(gr, tread, off * width, 0, 0);
    }
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const sipe = roundedBox(width * 0.46, 0.002, 0.008, 0.001);
      sipe.rotateX(a);
      sipe.translate(0, Math.cos(a) * (radius - 0.001), Math.sin(a) * (radius - 0.001));
      b.add(sipe, tread);
    }
  }

  // --- rim: a lathed channel section, not a flat disc ---
  const rim = lathe([
    [rimOuter, -width * 0.36],
    [rimOuter + 0.013, -width * 0.30],
    [rimOuter + 0.013, -width * 0.16],
    [rimOuter - 0.030, -width * 0.10],
    [rimOuter - 0.030, width * 0.10],
    [rimOuter + 0.013, width * 0.16],
    [rimOuter + 0.013, width * 0.30],
    [rimOuter, width * 0.36],
  ], 24);
  rim.rotateZ(Math.PI / 2);
  b.add(rim, rimMat);

  // --- hub ---
  const hub = lathe([
    [0.020, -width * 0.52], [0.056, -width * 0.50], [0.064, -width * 0.30],
    [0.050, -width * 0.16], [0.050, width * 0.16], [0.064, width * 0.30],
    [0.056, width * 0.50], [0.020, width * 0.52],
  ], 14);
  hub.rotateZ(Math.PI / 2);
  b.add(hub, hubMat);

  // --- spokes, alternating to each rim flange ---
  if (opts.cast) for (let i = 0; i < 5; i++) {
    const angle = i / 5 * Math.PI * 2;
    for (const branch of [-1, 1]) {
      const a = angle + branch * 0.08, end = a + 0.18;
      b.add(tubeBetween(0, Math.cos(a) * 0.06, Math.sin(a) * 0.06,
        branch * 0.009, Math.cos(end) * rimOuter, Math.sin(end) * rimOuter, 0.013, 8), rimMat);
    }
  }
  else for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const side = i % 2 ? 1 : -1;
    b.add(tubeBetween(
      side * width * 0.16, Math.cos(a + side * 0.24) * 0.05, Math.sin(a + side * 0.24) * 0.05,
      side * width * 0.30, Math.cos(a) * rimOuter, Math.sin(a) * rimOuter,
      0.0022, 5
    ), spokeMat);
  }

  // --- drilled brake disc ---
  const discR = (opts.discDiameter ?? radius * 0.92) / 2;
  const discShape = new THREE.Shape();
  discShape.absarc(0, 0, discR, 0, Math.PI * 2, false);
  const bore = new THREE.Path();
  bore.absarc(0, 0, discR * 0.52, 0, Math.PI * 2, true);
  discShape.holes.push(bore);
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const hole = new THREE.Path();
    hole.absarc(Math.cos(a) * discR * 0.79, Math.sin(a) * discR * 0.79,
      0.004, 0, Math.PI * 2, true);
    discShape.holes.push(hole);
  }
  const disc = new THREE.ExtrudeGeometry(discShape, { depth: 0.003, bevelEnabled: false, curveSegments: 32 });
  disc.rotateY(Math.PI / 2);
  b.at(disc, discMat, width * 0.48, 0, 0);
  if (opts.dualDisc) b.at(disc.clone(), discMat, -width * 0.96 - 0.003, 0, 0);
    const carrier = new THREE.RingGeometry(0.052, discR * 0.55, 18, 1);
    carrier.rotateY(Math.PI / 2);
    if (opts.dualDisc) b.at(carrier.clone(), hubMat, -width * 0.47, 0, 0);
  b.at(carrier, hubMat, width * 0.47, 0, 0);
  b.at(tube(0.006, 0.006, 0.05, 5), hubMat, 0, rimOuter + 0.02, 0);

  b.flush(g);
  return g;
}

// ---------------------------------------------------------------------------
export class BikeModel {
  constructor(cfg) {
    this.cfg = cfg;
    this.visualSteer = 0;
    this.bankOffset = new THREE.Vector3();
    this.root = new THREE.Group();
    this.build();
    const tip=fenderTip(cfg),guard=new THREE.Group(),metal=pbr(0x33383e,.5,.75);
    guard.name='Rear fender scrape guard';guard.userData.keepOnImport=true;
    for(const side of [-1,1])guard.add(new THREE.Mesh(tubeBetween(side*.065,cfg.seatH-cfg.cgHeight-.08,-cfg.cgRear*.85,
      side*.065,tip.y-cfg.cgHeight,tip.z,.009,8),metal));
    const plate=new THREE.Mesh(roundedBox(.17,.018,.07,.005),metal);
    plate.position.set(0,tip.y-cfg.cgHeight,tip.z);guard.add(plate);this.chassis.add(guard);
    if (cfg.asset || cfg.localModelKey) {
      loadImportedBike(this);
      this.assetReady = this.assetReady?.then(() => { if (!this.assetCancelled) { paintModel(this); addBuildDetails(this); } });
    } else { addBuildDetails(this); }
  }

  build() {
    const cfg = this.cfg;
    const h = cfg.cgHeight;
    const a = cfg.wheelbase - cfg.cgRear;
    const b = cfg.cgRear;
    const rF = cfg.rF, rR = cfg.rR;
    const rake = cfg.rake ?? RAKE;
    const seatY = cfg.seatH - h;
    const style = cfg.style;              // lightbee | dirt | street | sport
    const offroad = style === 'lightbee' || style === 'dirt' || style === 'electricmx';

    const M = {
      body: pbr(cfg.color, 0.40, 0.06),
      accent: pbr(cfg.accent, 0.36, 0.04),
      frame: pbr(cfg.frameColor ?? 0x9aa1a9, 0.34, 0.88),
      dark: pbr(0x1e2126, 0.55, 0.55),
      alu: pbr(0xc6ccd4, 0.24, 0.94),
      gold: pbr(0xc8a24a, 0.28, 0.92),
      rubber: pbr(0x17181b, 0.94, 0.03),
      motor: pbr(0x4a4f56, 0.34, 0.9),
      seat: pbr(0x131417, 0.9, 0.04),
      chrome: pbr(0xc3c8d0, 0.24, 0.94),
    };
    this.M = M;

    this.chassis = new THREE.Group();
    this.root.add(this.chassis);

    // ---- geometry derived from the physics ----
    const rearAxle = new THREE.Vector3(0, rR - h, -b);
    const frontAxle = new THREE.Vector3(0, rF - h, a);
    const STEM = 0.30;
    const FORK_LEN = Math.max(0.60, (cfg.seatH + 0.14) - cfg.rF);
    const FORK_OFFSET = 0.046;
    const axDownY = -Math.cos(rake), axDownZ = Math.sin(rake);
    const axFwdY = Math.sin(rake), axFwdZ = Math.cos(rake);
    const headTop = new THREE.Vector3(
      0,
      frontAxle.y - axDownY * FORK_LEN - axFwdY * FORK_OFFSET,
      frontAxle.z - axDownZ * FORK_LEN - axFwdZ * FORK_OFFSET
    );
    const headBot = new THREE.Vector3(
      0, headTop.y + axDownY * STEM, headTop.z + axDownZ * STEM
    );
    const pivot = new THREE.Vector3(0, -h + 0.40, -b * 0.08);
    this.pts = { headTop, headBot, pivot, rearAxle, frontAxle };

    // ---- frame + bodywork (merged) ----
    const F = new Batcher();
    this.buildFrame(F, M, { headTop, headBot, pivot, seatY, h, a, b, style });
    if (style === 'lightbee') this.buildLightBeeBody(F, M, { seatY, h, b, cfg });
    else if (style === 'electricmx') this.buildElectricMxBody(F, M, { seatY, h, b, cfg });
    else if (style === 'dirt') this.buildMxBody(F, M, { seatY, h, b, cfg });
    else this.buildStreetBody(F, M, { seatY, h, b, cfg, sport: style === 'sport' });
    this.buildPegsAndControls(F, M, { h, b });
    this.buildFinishingDetails(F, M, { h, b, seatY, offroad });
    F.flush(this.chassis);
    this.buildGraphics({ seatY, b });

    // ---- steering ----
    this.steerPivot = new THREE.Group();
    this.steerPivot.position.copy(headTop);
    this.steerPivot.rotation.x = -rake;
    this.chassis.add(this.steerPivot);
    this.steerYaw = new THREE.Group();
    this.steerPivot.add(this.steerYaw);

    const S = new Batcher();
    S.at(tube(0.030, 0.030, STEM + 0.05, 10), M.frame, 0, -(STEM + 0.05) / 2 + 0.025, 0);
    S.at(roundedBox(0.27, 0.034, 0.10, 0.015), M.alu, 0, 0.018, 0.004);
    S.at(roundedBox(0.25, 0.038, 0.098, 0.015), M.alu, 0, -STEM * 0.92, 0.004);

    const upperTopY = -STEM * 0.46;
    const upperBotY = -FORK_LEN + 0.30;
    const upperLen = Math.max(0.12, upperTopY - upperBotY);
    const stanchion = pbr(cfg.forkGold ? 0xc8a24a : style === 'lightbee' ? 0x202327 : 0x858b92, 0.24, 0.75);
    for (const sd of [-1, 1]) {
      S.at(tube(0.0235, 0.0235, upperLen, 12), stanchion,
        sd * 0.102, (upperTopY + upperBotY) / 2, 0);
    }

    const barY = style === 'sport' ? 0.015 : 0.105, barZ = -0.035;
    S.at(roundedBox(0.09, 0.05, 0.05, 0.015), M.alu, 0, 0.055, barZ + 0.01);
    const barHalf = (cfg.barWidth ?? 0.70) / 2;
    if (style !== 'sport') S.at(tube(0.0145, 0.0145, (barHalf - 0.12) * 2, 10, 'x'), M.alu, 0, barY, barZ);
    for (const sd of [-1, 1]) {
      S.add(tubeBetween(sd * (barHalf - 0.18), barY, barZ,
        sd * (barHalf - 0.06), barY + 0.018, barZ - 0.025, 0.014, 10), M.alu);
      if (style === 'sport') S.add(tubeBetween(sd * 0.102, -0.02, 0, sd * (barHalf - 0.18), barY, barZ, 0.019, 10), M.alu);
      S.at(tube(0.019, 0.021, 0.125, 10, 'x'), M.rubber, sd * (barHalf - 0.06), barY + 0.018, barZ - 0.025);
      S.at(roundedBox(0.105, 0.012, 0.024, 0.005), M.alu, sd * 0.205, barY - 0.004, barZ + 0.055);
      S.at(roundedBox(0.045, 0.05, 0.05, 0.012), M.dark, sd * 0.155, barY + 0.008, barZ + 0.02);
    }
    // Nose fairings and road-bike headlights are bolted to the frame; only
    // the handlebar/fork assembly steers beneath them.
    if (!offroad) {
      const nose = new THREE.Group();nose.position.copy(headTop);nose.rotation.x = -rake;
      const N = new Batcher();this.buildFrontEnd(N, M, { style, STEM, rF, offroad });N.flush(nose);this.chassis.add(nose);
    } else this.buildFrontEnd(S, M, { style, STEM, rF, offroad });
    if (cfg.kind === 'electric') {
      S.at(roundedBox(cfg.id === 'starkvarg' ? 0.075 : 0.085, 0.018, 0.055, 0.006),
        M.dark, 0, barY + 0.035, barZ + 0.02);
      S.at(roundedBox(0.059, 0.003, 0.034, 0.004),
        pbr(0x8fb9ad, 0.18, 0.10), 0, barY + 0.046, barZ + 0.02);
    }
    const hose = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.20, barY, barZ + 0.05),
      new THREE.Vector3(-0.15, 0.20, 0.12),
      new THREE.Vector3(-0.11, -0.15, 0.13),
      new THREE.Vector3(-0.09, -FORK_LEN + 0.13, 0.03),
    ]);
    S.add(new THREE.TubeGeometry(hose, 20, 0.004, 6, false), M.rubber);
    S.flush(this.steerYaw);

    this.gripPos = [];
    for (const sd of [-1, 1]) {
      const o = new THREE.Object3D();
      o.position.set(sd * (barHalf - 0.055), barY + 0.025, barZ - 0.025);
      this.steerYaw.add(o);
      this.gripPos.push(o);
    }

    // ---- fork lowers + front wheel ----
    this.forkLower = new THREE.Group();
    this.forkLowerBaseY = -FORK_LEN;
    this.forkLower.position.set(0, this.forkLowerBaseY, 0);
    this.steerYaw.add(this.forkLower);
    const L = new Batcher();
    for (const sd of [-1, 1]) {
      L.at(lathe([
        [0.024, 0.00], [0.028, 0.03], [0.024, 0.10], [0.019, 0.12], [0.019, 0.40],
      ], 20), M.chrome, sd * 0.102, 0, 0);
      if (offroad) L.at(lathe([[0.028, 0.035], [0.031, 0.07], [0.028, 0.255], [0.022, 0.29]], 20),
        style === 'lightbee' ? M.dark : M.body, sd * 0.102, 0, 0.014);
      L.at(roundedBox(0.05, 0.05, 0.075, 0.012), M.alu, sd * 0.102, 0.012, 0.03);
    }
    L.at(roundedBox(0.034, style === 'lightbee' ? 0.060 : 0.100, 0.055, 0.009), M.dark, 0.075, 0.075, -0.072);
    L.at(tube(0.005, 0.005, 0.22, 5), M.dark, 0.075, 0.20, -0.06);
    L.flush(this.forkLower);

    this.frontAxleNode = new THREE.Group();
    this.frontAxleNode.position.set(0, 0, FORK_OFFSET);
    this.forkLower.add(this.frontAxleNode);
    this.frontWheel = buildWheel(rF, cfg.tyreF ?? (offroad ? 0.105 : 0.135), {
      knobby: offroad, rimColor: cfg.id === 'r1' ? 0x2845a0 : 0x23262b, rimRadius: cfg.rimF, discDiameter: cfg.discF,
      cast: !offroad, dualDisc: !offroad,
    });
    this.frontAxleNode.add(this.frontWheel);
    if (!offroad) {
      const shell = new THREE.CylinderGeometry(rF + 0.03, rF + 0.03, 0.16, 32, 1, true, Math.PI * 0.10, Math.PI * 0.80);
      shell.rotateZ(Math.PI / 2);shell.rotateX(rake);
      const fender = new THREE.Mesh(shell, M.body);fender.material.side = THREE.DoubleSide;this.frontAxleNode.add(fender);
      const caliper = new THREE.Mesh(roundedBox(0.05, 0.12, 0.075, 0.015), M.gold);
      caliper.position.set(-0.087, 0.08, -0.10);this.frontAxleNode.add(caliper);
    }

    // ---- swingarm + rear wheel ----
    this.swing = new THREE.Group();
    this.swing.position.copy(pivot);
    this.chassis.add(this.swing);
    const swDy = rearAxle.y - pivot.y;
    const swDz = rearAxle.z - pivot.z;
    this.swingLen = Math.hypot(swDz, swDy);
    this.swingBaseAngle = Math.atan2(swDy / this.swingLen, -swDz / this.swingLen);

    const W = new Batcher();
    for (const sd of [-1, 1]) {
      if (cfg.singleSwing && sd > 0) continue;
      W.at(wedgeBox(0.040, 0.058, style === 'lightbee' ? 0.060 : 0.085, this.swingLen, 0.02), style === 'lightbee' ? M.frame : M.alu,
        sd * (cfg.singleSwing ? 0.145 : 0.098), 0, -this.swingLen / 2);
    }
    W.at(roundedBox(0.19, 0.055, 0.07, 0.02), M.alu, 0, 0.005, -this.swingLen * 0.34);
    W.at(roundedBox(0.022, 0.03, this.swingLen * 0.55, 0.008), pbr(0x121316, 0.72, 0.25),
      -0.098, 0.052, -this.swingLen * 0.42);
    W.flush(this.swing);

    this.rearAxleNode = new THREE.Group();
    this.rearAxleNode.position.set(0, 0, -this.swingLen);
    this.swing.add(this.rearAxleNode);
    this.rearWheel = buildWheel(rR, cfg.tyreR ?? (offroad ? 0.125 : 0.165), {
      knobby: offroad, rimColor: cfg.id === 'r1' ? 0x2845a0 : 0x23262b, rimRadius: cfg.rimR, discDiameter: cfg.discR,
      cast: !offroad,
    });
    this.rearAxleNode.add(this.rearWheel);

    const R = new Batcher();
    const sprR = cfg.style === 'lightbee' ? 0.095 : 0.12;
    const sprocket = new THREE.CylinderGeometry(sprR, sprR, 0.012, 24);
    sprocket.rotateZ(Math.PI / 2);
    R.at(sprocket, M.alu, -0.092, 0, 0);
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2;
      R.at(roundedBox(0.011, 0.022, 0.016, 0.003), M.alu,
        -0.092, Math.cos(ang) * (sprR + 0.010), Math.sin(ang) * (sprR + 0.010), -ang, 0, 0);
    }
    R.at(roundedBox(0.046, 0.095, 0.075, 0.015), pbr(0x33363c, 0.5, 0.55), 0.085, 0.085, 0.055);
    R.flush(this.rearAxleNode);

    // ---- chain + shock ----
    const chainMat = pbr(0x6a7078, 0.45, 0.9);
    // spanMesh stretches the local Y axis between the sprockets.
    this.chainTop = new THREE.Mesh(roundedBox(0.019, 1, 0.016, 0.004), chainMat);
    this.chainBot = new THREE.Mesh(roundedBox(0.019, 1, 0.016, 0.004), chainMat);
    this.chassis.add(this.chainTop, this.chainBot);

    this.shockBody = new THREE.Mesh(tube(0.021, 0.021, 1, 10), M.alu);
    const coil = [];
    for (let i = 0; i <= 180; i++) {
      const t = i / 180, angle = t * Math.PI * 18;
      coil.push(new THREE.Vector3(Math.cos(angle) * 0.036, t - 0.5, Math.sin(angle) * 0.036));
    }
    this.shockSpring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 180, 0.006, 6, false),
      pbr(cfg.springColor ?? 0xdd5522, 0.42, 0.35));
    this.shockRes = new THREE.Mesh(roundedBox(0.05, 0.10, 0.05, 0.02), M.gold);
    this.chassis.add(this.shockBody, this.shockSpring, this.shockRes);
    this.shockTop = new THREE.Vector3(0, seatY - 0.03, -b * 0.30);

    // ---- rider ----
    this.pegPos = [];
    for (const sd of [-1, 1]) {
      const o = new THREE.Object3D();
      o.position.set(sd * 0.185, -h + 0.30, -b * 0.10);
      this.chassis.add(o);
      this.pegPos.push(o);
    }
    this.rider = new Rider(this.chassis, cfg, seatY, b);

    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  // -------------------------------------------------------------------------
  buildFrame(F, M, p) {
    const { headTop, headBot, pivot, seatY, b, style } = p;
    const t = (r, ax, ay, az, bx, by, bz, mat) =>
      F.add(tubeBetween(ax, ay, az, bx, by, bz, r, 8), mat || M.frame);

    if (style === 'lightbee' || (style === 'electricmx' && this.cfg.id !== 'starkvarg')) {
      // Twin perimeter spars wrapping the battery, as on a light e-dirt bike.
      for (const sd of [-1, 1]) {
        const wide = style === 'electricmx';
        // Separate cast spars preserve the open battery cradle.
        F.at(sidePanel([[headBot.z, headBot.y + .035], [headBot.z + .022, headBot.y - .028],
          [pivot.z + .045, pivot.y - .018], [pivot.z - .020, pivot.y + .028]], wide ? .035 : .026),
          M.frame, sd * (wide ? .13 : .107), 0, 0);
        F.at(sidePanel([[pivot.z - .022, pivot.y + .01], [pivot.z + .031, pivot.y + .025],
          [-b * .10 + .025, seatY - .028], [-b * .10 - .025, seatY - .02]], wide ? .035 : .026),
          M.frame, sd * (wide ? .13 : .107), 0, 0);
        t(0.016, sd * 0.095, pivot.y + 0.06, pivot.z, sd * 0.075, seatY + 0.00, -b * 0.92);
        t(0.016, sd * 0.105, seatY - 0.03, -b * 0.12, sd * 0.075, seatY + 0.00, -b * 0.92);
      }
      t(0.020, 0, headBot.y, headBot.z, 0, pivot.y + 0.02, pivot.z + 0.14);
      t(0.018, 0, pivot.y + 0.02, pivot.z + 0.14, 0, pivot.y - 0.02, pivot.z);
    } else if (style === 'street') {
      // Exposed orange triangulated steel trellis on the Super Duke.
      for (const sd of [-1, 1]) {
        const x = sd * 0.145;
        t(0.019, x, headBot.y + 0.12, headBot.z - 0.03, x, seatY - 0.07, -0.20);
        t(0.019, x, headBot.y, headBot.z, x, pivot.y, pivot.z);
        t(0.016, x, seatY - 0.07, -0.20, x, pivot.y, pivot.z);
        t(0.016, x, seatY - 0.07, -0.20, x, headBot.y - 0.06, 0.22);
        t(0.016, x, headBot.y - 0.06, 0.22, x, seatY - 0.005, 0.06);
        t(0.014, x, seatY - 0.07, -0.20, sd * 0.07, seatY + 0.07, -b * 0.92);
      }
    } else if (style === 'sport' || style === 'dirt') {
      // Aluminium twin-spar frame, including the wide Deltabox on the R1.
      for (const sd of [-1, 1]) {
        F.at(sidePanel([[headTop.z - 0.03, headTop.y - 0.03], [headBot.z, headBot.y],
          [pivot.z + 0.03, pivot.y - 0.015], [pivot.z - 0.06, pivot.y + 0.04],
          [headBot.z - 0.095, headBot.y + 0.025]], style === 'sport' ? 0.065 : 0.043), M.frame, sd * 0.13, 0, 0);
        t(0.015, sd * 0.13, pivot.y + 0.10, pivot.z, sd * 0.085, seatY + 0.02, -b * 0.87);
        t(0.016, sd * 0.11, seatY - 0.02, -b * 0.1, sd * 0.085, seatY + 0.02, -b * 0.87);
      }
    } else {
      t(0.030, headTop.x, headTop.y - 0.03, headTop.z, pivot.x, pivot.y + 0.14, pivot.z);
      t(0.026, headBot.x, headBot.y, headBot.z, pivot.x, pivot.y - 0.02, pivot.z + 0.10);
      for (const sd of [-1, 1]) {
        t(0.020, sd * 0.075, headTop.y - 0.05, headTop.z - 0.02,
          sd * 0.105, seatY - 0.02, -b * 0.16);
        t(0.017, sd * 0.105, seatY - 0.02, -b * 0.16, sd * 0.085, seatY + 0.02, -b * 0.95);
        t(0.016, sd * 0.095, pivot.y + 0.08, pivot.z - 0.02, sd * 0.085, seatY + 0.00, -b * 0.62);
      }
    }
    F.at(tube(0.038, 0.038, 0.24, 12, 'x'), M.alu, 0, pivot.y, pivot.z);
  }

  // -------------------------------------------------------------------------
  /** Light-Bee layout: battery in the frame triangle, plank seat. */
  buildLightBeeBody(F, M, p) {
    const { seatY, h, b, cfg } = p;
    const batY = seatY - 0.19;

    F.at(roundedBox(0.175, 0.33, 0.255, 0.018), pbr(0x24272d, 0.65, 0.12), 0, batY, 0.055, -0.13);
    F.at(wedgeBox(0.19, 0.17, 0.035, 0.29, 0.012), M.body, 0, batY + 0.18, 0.035, -0.13);
    F.at(roundedBox(0.072, 0.016, 0.03, 0.005), M.dark, 0, batY + 0.207, 0.04);
    for (let i = 0; i < 5; i++) {
      F.at(roundedBox(0.20, 0.016, 0.018, 0.006), pbr(0x5a6068, 0.36, 0.72),
        0, batY + 0.08 - i * 0.035, 0.21);
    }
    for (const sd of [-1, 1]) {
      F.at(sidePanel([[0.23, batY + 0.15], [0.19, batY - 0.10],
        [-0.075, batY - 0.15], [-0.105, batY + 0.15]], 0.014), M.body, sd * 0.093, 0, 0);
      F.at(roundedBox(0.012, 0.025, 0.16, 0.004), M.accent, sd * 0.113, batY + 0.10, 0.035, -0.13);
    }
    F.at(roundedBox(0.14, 0.12, 0.15, 0.02), M.dark, 0, seatY - 0.13, -b * 0.42);
    F.at(tube(0.022, 0.022, 0.03, 8, 'x'), M.alu, 0.10, batY + 0.16, -0.13);

    F.at(wedgeBox(0.115, 0.175, 0.05, 0.54, 0.018), M.seat, 0, seatY - 0.025, -b * 0.47);
    F.at(bodyLoft([[-b * 1.25, seatY + .01, .045, .005], [-b, seatY + .003, .08, .009],
      [-b * .75, seatY - .015, .07, .012]]), M.body);
    F.at(roundedBox(0.10, 0.035, 0.025, 0.008),
      pbr(0xff2a2a, 0.35, 0.2, { emissive: 0x3a0606 }), 0, seatY + 0.03, -b * 1.12);

    // Mid-drive motor, belt cover, skid plate.
    const motor = lathe([
      [0.020, -0.105], [0.085, -0.100], [0.098, -0.060],
      [0.098, 0.060], [0.085, 0.100], [0.020, 0.105],
    ], 16);
    motor.rotateZ(Math.PI / 2);
    F.at(motor, M.motor, 0.005, -h + 0.31, -b * 0.05);
    F.at(roundedBox(0.026, 0.185, 0.23, 0.025), M.dark, -0.105, -h + 0.345, -b * 0.16);
    F.at(roundedBox(0.185, 0.024, 0.30, 0.01), M.alu, 0, -h + 0.195, -b * 0.02);
  }

  // -------------------------------------------------------------------------
  /** Electric MX silhouettes; no fuel tank or combustion exhaust. */
  buildElectricMxBody(F, M, { seatY, h, b, cfg }) {
    const stark = cfg.id === 'starkvarg';
    const width = stark ? 0.145 : 0.130;
    const casing = pbr(stark ? 0x777a78 : 0x282c2e, 0.52, stark ? 0.72 : 0.25);
    const packTop = seatY - 0.075;
    const packBot = -h + (stark ? 0.39 : 0.32);
    F.at(sidePanel([[0.30, packTop - 0.045], [-0.12, packTop],
      [-0.20, packBot + 0.08], [-0.05, packBot], [0.19, packBot + 0.035]], width * 1.65), casing);
    for (const sd of [-1, 1]) {
      // Stark's exposed magnesium pack has long cooling ribs under red wings.
      if (stark) {
        for (let i = 0; i < 10; i++) {
          F.at(roundedBox(0.013, 0.017, 0.28, 0.003), M.motor,
            sd * (width * 0.83 + 0.01), packBot + 0.09 + i * 0.025, 0.04);
        }
      }
      const wing = stark
        ? [[0.43, seatY + 0.015], [0.37, seatY - 0.12], [0.10, seatY - 0.26],
          [-0.13, seatY - 0.15], [-0.08, seatY + 0.015]]
        : [[0.36, seatY + 0.025], [0.27, seatY - 0.21], [0.08, seatY - 0.25],
            [-0.13, seatY - 0.11], [-0.12, seatY + 0.015]];
      F.at(sidePanel(wing, 0.022), M.body, sd * width, 0, 0);
      F.at(sidePanel([[0.33, seatY - 0.03], [0.21, seatY - 0.12],
        [-0.06, seatY - 0.085], [0.015, seatY - 0.015]], 0.004),
        stark ? M.dark : M.accent, sd * (width + 0.018), 0, 0);
      F.at(sidePanel([[-b * 0.26, seatY - 0.025], [-b * 0.96, seatY - 0.025],
        [-b * 0.86, seatY - (stark ? 0.24 : 0.18)], [-b * 0.43, seatY - 0.20]], 0.018),
        stark ? M.accent : M.body, sd * (width * 0.87), 0, 0);
      for (const z of [-b * 0.40, 0.22]) {
        F.at(tube(0.006, 0.006, 0.006, 6, 'x'), M.alu,
          sd * (width + 0.026), seatY - 0.04, z);
      }
    }
    F.at(wedgeBox(0.13, 0.19, 0.065, 0.72, 0.02),
      M.seat, 0, seatY - 0.032, -b * 0.30);
    // Moulded grip ribs and a tapered, raised rear fender.
    for (let i = 0; i < 9; i++) {
      F.at(roundedBox(0.145, 0.005, 0.012, 0.002), M.rubber, 0, seatY + 0.002, -b * 0.68 + i * 0.055);
    }
    F.at(bodyLoft([[-b * 1.29, seatY + .028, .036, .006], [-b * 1.07, seatY + .014, .075, .009],
      [-b * .75, seatY - .012, .085, .012], [-b * .56, seatY - .018, .075, .01]]), M.body);
    F.at(roundedBox(0.24, 0.045, 0.33, 0.015), M.dark, 0, packBot - 0.015, 0);
    const motor = lathe([[0.02, -0.12], [0.10, -0.11], [0.115, -0.075],
      [0.115, 0.075], [0.10, 0.11], [0.02, 0.12]], 24);
    motor.rotateZ(Math.PI / 2);
    F.at(motor, M.motor, 0, packBot + 0.075, -0.10);
    F.at(roundedBox(0.025, 0.18, 0.25, 0.025), M.dark, -0.14, packBot + 0.07, -0.09);
    // Battery/controller leads, tucked inside the lower cradle.
    F.add(tubeBetween(0.08, packBot + 0.13, 0.11, 0.075, packBot + 0.23, 0.18, 0.009, 8), M.dark);
  }

  buildGraphics({ seatY, b }) {
    if (typeof document === 'undefined') return;
    const cfg = this.cfg, light = cfg.id === 'lbx', stark = cfg.id === 'starkvarg';
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#edf0ec';
    ctx.font = 'italic 900 64px Arial';
    const brands = { crf450r: 'HONDA', superduke: 'KTM', r1: 'YAMAHA' };
    ctx.fillText(brands[cfg.id] || (stark ? 'STARK' : 'SURRON'), 256, 45);
    ctx.font = '700 25px Arial';
    const models = { crf450r: 'CRF 450R', superduke: '1290 SUPER DUKE R', r1: 'YZF-R1' };
    ctx.fillText(models[cfg.id] || (stark ? 'VARG' : light ? 'LIGHT BEE X' : cfg.id === 'ultrabee' ? 'ULTRA BEE' : 'STORM BEE'), 256, 102);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.55, metalness: 0,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const sd of [-1, 1]) {
      const label = new THREE.Mesh(new THREE.PlaneGeometry(light ? 0.19 : 0.24, light ? 0.0475 : 0.06), material);
      const width = light ? 0.127 : stark ? 0.175 : cfg.id === 'ultrabee' ? 0.160 : cfg.id === 'crf450r' ? 0.173 : 0.230;
      const labelY = cfg.id === 'r1' ? -cfg.cgHeight + 0.65 : cfg.id === 'superduke' ? seatY + 0.12 : seatY - (light ? 0.16 : 0.09);
      label.position.set(sd * width, labelY, light ? 0.04 : 0.15);
      label.rotation.y = sd * Math.PI / 2;
      this.chassis.add(label);
    }
  }

  // -------------------------------------------------------------------------
  /** Motocross four-stroke: shrouds, slim tank, high pipe. */
  buildMxBody(F, M, p) {
    const { seatY, h, b, cfg } = p;
    F.at(bodyLoft([[-0.20, seatY - 0.025, 0.06, 0.04], [-0.06, seatY + 0.01, 0.105, 0.08],
      [0.23, seatY + 0.04, 0.115, 0.09], [0.37, seatY + 0.025, 0.035, 0.025]]), M.body);
    F.at(tube(0.032, 0.032, 0.025, 16), M.dark, 0, seatY + 0.137, 0.16);
    for (const sd of [-1, 1]) {
      F.at(sidePanel([[0.40, seatY + 0.055], [0.34, seatY - 0.20],
        [0.18, seatY - 0.27], [-0.15, seatY - 0.08], [-0.08, seatY + 0.015]], 0.024), M.body, sd * 0.15, 0, 0);
      F.at(sidePanel([[0.34, seatY - 0.035], [0.21, seatY - 0.12],
        [0.02, seatY - 0.07], [0.09, seatY - 0.01]], 0.006), M.accent, sd * 0.17, 0, 0);
      F.at(roundedBox(0.055, 0.24, 0.20, 0.02), pbr(0x8f959d, 0.4, 0.85),
        sd * 0.105, -h + 0.58, 0.14);
    }
    // Side number plates — the giveaway detail on a modern MX bike.
    for (const sd of [-1, 1]) {
      F.at(sidePanel([[-b * .28, seatY - .03], [-b * .98, seatY - .015],
        [-b * .87, seatY - .17], [-b * .57, seatY - .22], [-b * .34, seatY - .16]], .009), M.accent,
        sd * 0.128, 0, 0);
    }
    F.at(wedgeBox(0.135, 0.20, 0.06, 0.72, 0.025), M.seat, 0, seatY - 0.03, -b * 0.32);
    F.at(roundedBox(0.19, 0.03, 0.30, 0.012), M.accent, 0, seatY + 0.03, -b * 1.00);

    const crank = new THREE.SphereGeometry(1, 24, 16);crank.scale(.145, .135, .15);
    F.at(crank, M.motor, 0, -h + .37, .01);
    F.at(roundedBox(0.20, 0.20, 0.18, 0.03), pbr(0x6e747c, 0.32, 0.9),
      0, -h + 0.58, 0.09, -0.22, 0, 0);
    const cover = lathe([[0.02, 0], [0.105, 0.01], [0.105, 0.05], [0.02, 0.06]], 14);
    cover.rotateZ(Math.PI / 2);
    F.at(cover, M.motor, 0.155, -h + 0.34, -0.01);

    F.add(tubeBetween(0.026, -h + 0.60, 0.20, 0.09, -h + 0.52, 0.02, 0.024, 8), M.chrome);
    F.add(tubeBetween(0.09, -h + 0.52, 0.02, 0.115, -h + 0.46, -b * 0.55, 0.026, 8), M.chrome);
    const can = lathe([
      [0.02, -0.21], [0.055, -0.20], [0.065, 0.0], [0.058, 0.19], [0.02, 0.21],
    ], 14);
    can.rotateX(Math.PI / 2);
    F.at(can, pbr(0x9aa0a8, 0.3, 0.9), 0.118, -h + 0.45, -b * 0.85);
    this.exhaustLocal = new THREE.Vector3(0.118, -h + 0.45, -b * 1.05);
  }

  // -------------------------------------------------------------------------
  /** Street / sport: tank, tail unit, engine block, underslung can. */
  buildStreetBody(F, M, p) {
    const { seatY, h, b, cfg, sport } = p;
    const tl = cfg.tankLen;

    // Fuel tank: wide and deep over the airbox, pinching to the seat so the
    // rider's knees have somewhere to go.
    F.at(bodyLoft([[-0.22, seatY + 0.015, 0.055, 0.025], [-0.12, seatY + 0.09, 0.125, 0.10],
      [0.08, seatY + 0.12, 0.22, 0.16], [0.28, seatY + 0.13, 0.195, 0.155],
      [0.42, seatY + 0.10, 0.105, 0.085], [0.48, seatY + 0.065, 0.025, 0.025]]), M.body);
    // Tank top with the filler cap.
    F.at(tube(0.040, 0.040, 0.022, 14), pbr(0xb9bec6, 0.25, 0.95),
      0, seatY + 0.28, 0.12);
    // Knee recesses in the accent colour.
    for (const sd of [-1, 1]) {
      F.at(bodyLoft([[-0.19, 0, 0.003, 0.008], [-0.09, 0.01, 0.012, 0.047],
        [0.12, 0.025, 0.014, 0.052], [0.19, 0.025, 0.002, 0.006]]), sport ? M.dark : M.accent,
        sd * 0.197, seatY + 0.055, tl * 0.10);
    }
    // Tank-to-headstock shoulder so the front does not look hollow.

    // Seat runs continuously from the tank to the tail.
    F.at(wedgeBox(0.17, 0.215, 0.075, 0.44, 0.035), M.seat, 0, seatY - 0.0375, -b * 0.26);
    F.at(bodyLoft([[-0.18, 0.045, 0.022, 0.018], [-0.10, 0.045, 0.055, 0.035],
      [0.10, 0.010, 0.096, 0.058], [0.18, -0.02, 0.080, 0.022]]), M.body,
      0, seatY + 0.095, -b * 0.72);
    F.at(roundedBox(0.125, 0.038, 0.03, 0.01),
      pbr(0xff2a2a, 0.35, 0.2, { emissive: 0x3a0606 }), 0, seatY + 0.13, -b * 0.90);
    // Subframe rails visible under the tail.
    for (const sd of [-1, 1]) {
      F.add(tubeBetween(sd * 0.085, seatY - 0.02, -b * 0.22,
        sd * 0.070, seatY + 0.05, -b * 0.86, 0.013, 6), M.frame);
    }

    const crank = new THREE.SphereGeometry(1, 28, 18);crank.scale(.17, .14, .17);
    F.at(crank, M.motor, 0, -h + .36, .02);
    F.at(roundedBox(0.30, 0.16, 0.26, 0.03), pbr(0x6e747c, 0.3, 0.9),
      0, -h + 0.54, 0.07, -0.25, 0, 0);
    for (const sd of [-1, 1]) {
      const cvr = lathe([[0.02, 0], [0.09, 0.012], [0.09, 0.045], [0.02, 0.055]], 14);
      cvr.rotateZ(Math.PI / 2);
      F.at(cvr, M.motor, sd * 0.18, -h + 0.33, 0.0);
      F.add(tubeBetween(sd * 0.07, -h + 0.52, 0.16, sd * 0.05, -h + 0.22, -0.02, 0.019, 7),
        M.chrome);
    }
    F.add(tubeBetween(0.05, -h + 0.22, -0.02, 0.10, -h + 0.30, -b * 0.55, 0.026, 8), M.chrome);
    const can = lathe([
      [0.02, -0.19], [0.062, -0.18], [0.07, 0.0], [0.062, 0.17], [0.02, 0.19],
    ], 14);
    can.rotateX(Math.PI / 2);
    F.at(can, pbr(0x8f959d, 0.28, 0.92), 0.105, -h + 0.33, -b * 0.82);
    this.exhaustLocal = new THREE.Vector3(0.105, -h + 0.33, -b * 1.00);

    F.at(roundedBox(0.30, 0.24, 0.05, 0.012), pbr(0x2c3036, 0.6, 0.5), 0, -h + 0.52, 0.22);

    if (sport) {
      // Full fairing: upper flanks, lower belly pan and winglets.
      for (const sd of [-1, 1]) {
        // Upper flank sweeping back from the nose to the rider's knee.
        F.at(sidePanel([[0.57, -h + 0.92], [0.43, -h + 0.51], [0.22, -h + 0.20],
          [-0.25, -h + 0.20], [-0.21, -h + 0.36], [0.03, -h + 0.50], [-0.10, -h + 0.75]], 0.014), M.body, sd * 0.198, 0, 0);
        F.at(sidePanel([[0.48, -h + 0.77], [0.31, -h + 0.63], [0.02, -h + 0.63],
          [0.20, -h + 0.75]], 0.008), M.accent, sd * 0.228, 0, 0);
        // Winglet.
        F.at(wedgeBox(0.022, 0.034, 0.05, 0.18, 0.014), M.body,
          sd * 0.210, -h + 0.72, 0.32, 0, 0, sd * 0.14);
        // Vent slash.
        F.at(roundedBox(0.026, 0.05, 0.16, 0.012), pbr(0x15171b, 0.7, 0.3),
          sd * 0.196, -h + 0.46, 0.20);
      }
      // Belly pan.
      F.at(wedgeBox(0.24, 0.34, 0.16, 0.50, 0.06), M.body, 0, -h + 0.21, 0.08);
      // Seat cowl over the pillion pad.
      F.at(bodyLoft([[-0.13, 0.015, 0.022, 0.007], [-0.05, 0.026, 0.059, 0.034],
        [0.09, 0, 0.074, 0.026], [0.13, -0.02, 0.053, 0.009]]), M.body,
        0, seatY + 0.16, -b * 0.80);
    } else {
      // Naked: exposed trellis, small flyscreen, belly spoiler.
      for (const sd of [-1, 1]) {
        F.at(wedgeBox(0.022, 0.040, 0.20, 0.26, 0.04), M.accent, sd * 0.150, -h + 0.52, 0.08);
      }
      F.at(wedgeBox(0.16, 0.26, 0.10, 0.30, 0.04), M.body, 0, -h + 0.20, 0.06);
    }
  }

  // -------------------------------------------------------------------------
  buildFrontEnd(S, M, p) {
    const { style, STEM, rF, offroad } = p;
    if (style === 'lightbee') {
      S.at(roundedBox(0.15, 0.070, 0.055, 0.013), M.dark, 0, -0.055, 0.075);
      S.at(roundedBox(0.128, 0.045, 0.014, 0.008),
        pbr(0xe3f1f6, 0.13, 0.1, { emissive: 0x334448 }), 0, -0.055, 0.11);
      S.at(bodyLoft([[-.08, 0, .025, .006], [.03, .015, .062, .012], [.22, .025, .06, .012],
        [.38, .014, .035, .004]]), M.body, 0, -STEM - .03, .025, RAKE - .05);
    } else if (style === 'electricmx') {
      const stark = this.cfg.id === 'starkvarg';
      S.at(wedgeBox(0.20, 0.245, 0.25, 0.038, 0.016), stark ? M.accent : M.body, 0, -0.060, 0.10);
      if (!stark) {
        S.at(roundedBox(0.14, 0.080, 0.025, 0.018), M.dark, 0, -0.040, 0.13);
        S.at(roundedBox(0.105, 0.042, 0.012, 0.010),
          pbr(0xe7f2f7, 0.15, 0.1, { emissive: 0x354448 }), 0, -0.040, 0.148);
        S.at(roundedBox(0.16, 0.024, 0.008, 0.004), M.accent, 0, -0.13, 0.125);
      }
      S.at(bodyLoft([[-.10, 0, .04, .006], [.04, .007, .084, .02], [.28, .025, .067, .017],
        [.48, .018, .035, .005]]), M.body, 0, -STEM - .045, .025, RAKE - .05);
    } else if (offroad) {
      S.at(roundedBox(0.28, 0.24, 0.035, 0.045), M.accent, 0, -0.045, 0.09);
      S.at(bodyLoft([[-0.09, 0, 0.045, 0.007], [0.04, 0, 0.087, 0.019],
        [0.32, 0.014, 0.065, 0.018], [0.48, 0.019, 0.035, 0.007]]), M.body,
        0, -STEM - 0.04, 0.03, (this.cfg.rake ?? RAKE) - 0.04);
    } else if (style === 'sport') {
      // Nose fairing with twin projectors and a screen.
      S.at(bodyLoft([[-0.11, -0.03, 0.15, 0.13], [0.10, -0.04, 0.20, 0.15],
        [0.27, -0.09, 0.17, 0.075], [0.34, -0.115, 0.06, 0.025]]), M.body);
      S.at(roundedBox(0.078, 0.070, 0.016, 0.015), M.dark, 0, -0.075, 0.320);
      for (const sd of [-1, 1]) {
        S.at(roundedBox(0.11, 0.016, 0.02, 0.006),
          pbr(0xfff6dd, 0.16, 0.1, { emissive: 0x6a5a30 }), sd * 0.062, -0.055, 0.255,
          0, 0, sd * 0.25);
        S.at(new THREE.SphereGeometry(0.031, 16, 12), pbr(0xd5e7ed, 0.12, 0.2, { emissive: 0x30414d }), sd * 0.11, -0.14, 0.26);
      }
      S.at(roundedBox(0.075, 0.03, 0.03, 0.01), M.accent, 0, 0.02, 0.26);
      S.at(roundedBox(0.20, 0.17, 0.016, 0.05),
        pbr(0x2b3a4f, 0.10, 0.2, { transparent: true, opacity: 0.42 }),
        0, 0.125, 0.085, 0.60, 0, 0);
      for (const sd of [-1, 1]) {
        S.at(wedgeBox(0.03, 0.05, 0.16, 0.22, 0.04), M.body, sd * 0.145, -0.035, 0.14);
        S.at(roundedBox(0.03, 0.03, 0.055, 0.01), M.dark, sd * 0.165, 0.035, 0.11);
      }
    } else {
      // Super Duke's split vertical LED mask around a central air channel.
      S.at(wedgeBox(0.15, 0.23, 0.28, 0.08, 0.025), M.dark, 0, -0.055, 0.135);
      for (const sd of [-1, 1]) {
        S.at(roundedBox(0.065, 0.205, 0.02, 0.018),
          pbr(0xfff6dd, 0.18, 0.1, { emissive: 0x6a5a30 }), sd * 0.061, -0.05, 0.187, 0, 0, -sd * 0.17);
      }
      S.at(roundedBox(0.035, 0.265, 0.028, 0.008), M.dark, 0, -0.05, 0.198);
      S.at(roundedBox(0.175, 0.10, 0.016, 0.03),
        pbr(0x2b3a4f, 0.10, 0.2, { transparent: true, opacity: 0.45 }),
        0, 0.095, 0.10, 0.55, 0, 0);
      for (const sd of [-1, 1]) {
        S.at(roundedBox(0.035, 0.035, 0.06, 0.012), M.dark, sd * 0.14, -0.005, 0.155);
      }
    }
    if (!offroad) for (const sd of [-1, 1]) {
      S.add(tubeBetween(sd * 0.12, 0.07, 0.03, sd * 0.32, 0.25, -0.01, 0.009, 8), M.dark);
      S.at(roundedBox(0.115, 0.065, 0.043, 0.020, 4), M.dark, sd * 0.35, 0.27, -0.01);
      S.at(roundedBox(0.101, 0.049, 0.008, 0.016, 4), M.chrome, sd * 0.35, 0.27, -0.034);
    }
  }

  // -------------------------------------------------------------------------
  buildFinishingDetails(F, M, { h, b, seatY, offroad }) {
    const cfg = this.cfg;
    // Fasteners, heel guards and serrated footpeg platforms on every bike.
    for (const sd of [-1, 1]) {
      for (const [y, z] of [[-h + 0.4, -b * 0.08], [seatY - 0.04, -b * 0.2], [-h + 0.32, 0.01]]) {
        F.at(tube(0.010, 0.010, 0.009, 6, 'x'), M.alu, sd * 0.148, y, z);
      }
      F.at(roundedBox(0.09, 0.018, 0.07, 0.005), M.dark, sd * 0.192, -h + 0.31, -b * 0.10);
      for (let i = 0; i < 5; i++) F.at(roundedBox(0.008, 0.009, 0.060, 0.002), M.alu, sd * (0.154 + i * 0.018), -h + 0.322, -b * 0.10);
    }
    if (cfg.kind === 'electric') {
      // Distinct battery lid, charge port and controller wiring.
      F.at(tube(0.018, 0.018, 0.018, 12, 'x'), M.rubber, 0.135, seatY - 0.20, -0.08);
      const wire = new THREE.CatmullRomCurve3([new THREE.Vector3(0.08, seatY - 0.13, 0.12),
        new THREE.Vector3(0.10, seatY - 0.30, 0.15), new THREE.Vector3(0.09, -h + 0.38, 0.06)]);
      F.add(new THREE.TubeGeometry(wire, 12, 0.007, 6, false), M.dark);
      if (cfg.id !== 'lbx') {
        for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
          F.at(roundedBox(0.010, 0.011, 0.11, 0.003), M.dark, sd * (cfg.id === 'starkvarg' ? 0.168 : 0.153), seatY - 0.15 - i * 0.02, 0.20);
        }
      }
    } else {
      // Cooling fins and engine architecture: narrow single, V-twin or inline four.
      const cylinders = cfg.id === 'r1' ? [-0.105, -0.035, 0.035, 0.105] : cfg.id === 'superduke' ? [-0.065, 0.065] : [0];
      for (let i = 0; i < cylinders.length; i++) {
        const x = cylinders[i], tilt = cfg.id === 'superduke' ? (i ? -0.48 : 0.48) : -0.13;
        F.at(tube(0.055, 0.052, 0.19, 16), M.motor, x, -h + 0.49, 0.025, tilt);
        for (let j = 0; j < 4; j++) F.at(tube(0.060, 0.060, 0.008, 16), M.alu, x, -h + 0.45 + j * 0.026, 0.025, tilt);
        if (!offroad) {
          const pipe = new THREE.CatmullRomCurve3([new THREE.Vector3(x, -h + 0.52, 0.18),
            new THREE.Vector3(x, -h + 0.34, 0.28), new THREE.Vector3(x * 0.5, -h + 0.19, 0.04)]);
          F.add(new THREE.TubeGeometry(pipe, 16, 0.020, 8, false), M.chrome);
        }
      }
      for (let i = 0; i < 10; i++) F.at(roundedBox(offroad ? 0.18 : 0.28, 0.009, 0.025, 0.003), M.alu, 0, -h + 0.44 + i * 0.020, 0.255);
    }
  }

  // -------------------------------------------------------------------------
  buildPegsAndControls(F, M, p) {
    const { h, b } = p;
    for (const sd of [-1, 1]) {
      F.at(roundedBox(0.05, 0.065, 0.07, 0.015), M.alu, sd * 0.135, -h + 0.31, -b * 0.10);
      F.at(tube(0.013, 0.013, 0.115, 8, 'x'), M.alu, sd * 0.19, -h + 0.30, -b * 0.10);
    }
    F.add(tubeBetween(0.155, -h + 0.31, -b * 0.06, 0.135, -h + 0.28, 0.14, 0.010, 6), M.alu);
    F.add(tubeBetween(-0.155, -h + 0.31, -b * 0.06, -0.135, -h + 0.30, 0.16, 0.010, 6), M.alu);
    F.add(tubeBetween(-0.105, -h + 0.30, -b * 0.16, -0.135, -h + 0.22, -b * 0.42, 0.011, 6),
      M.dark);
  }

  // -------------------------------------------------------------------------
  update(s, dt, cameraMode) {
    const cfg = this.cfg;
    const h = cfg.cgHeight, b = cfg.cgRear;
    const resetPose = this.poseVersion !== s.resetVersion;
    this.poseVersion = s.resetVersion;
    this.chassis.position.set(0,0,0);this.chassis.rotation.set(0,0,0);

    this.root.position.set(s.pos.x, s.pos.y, s.pos.z);
    // Bank around the tyre's ground heading, then pitch the chassis. Pitching
    // before banking twisted the rear wheel away from its direction of travel.
    this.root.rotation.set(-s.pitch, s.yaw, -s.roll, 'YZX');
    const bankTarget = new THREE.Vector3();
    if (s.grounded) {
      const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
      const rearHeight = cfg.rR - (cfg.rR-h)*cp + b*sp;
      const frontHeight = cfg.rF - (cfg.rF-h)*cp - (cfg.wheelbase-b)*sp;
      const pivotHeight = s.frontDown === false ? rearHeight : s.rearDown === false
        ? frontHeight : (frontHeight*b + rearHeight*(cfg.wheelbase-b))/cfg.wheelbase;
      bankTarget.set(pivotHeight*Math.sin(s.roll)*Math.cos(s.yaw),
        pivotHeight*(Math.cos(s.roll)-1),-pivotHeight*Math.sin(s.roll)*Math.sin(s.yaw));
    }
    // Releasing the ground bank pivot used to teleport the chassis sideways
    // at takeoff. Blend its release and reacquisition across contact changes.
    if(resetPose || this.wasGrounded === undefined)this.bankOffset.copy(bankTarget);
    else if(s.grounded && this.wasGrounded && !this.bankTransition)this.bankOffset.copy(bankTarget);
    else {
      this.bankOffset.lerp(bankTarget,1-Math.exp(-14*dt));
      this.bankTransition=this.bankOffset.distanceToSquared(bankTarget)>1e-6;
    }
    this.wasGrounded=s.grounded;
    this.root.position.add(this.bankOffset);
    // Physics already damps the steering. Extra visual lock and lag made
    // the front wheel point somewhere different from its contact forces.
    this.visualSteer = s.steer;
    const pose = { ...s, speed: s.speed, steer: this.visualSteer, resetPose };
    this.steerYaw.rotation.y = this.visualSteer;

    if (!this.importedRig) {
      const fTravel = clamp(s.suspF - (s.restSuspF || 0), -0.10, 0.17);
      this.forkLower.position.y = this.forkLowerBaseY + fTravel;

      const rTravel = clamp(s.suspR - (s.restSuspR || 0), -0.11, 0.18);
      this.swing.rotation.x = Math.asin(clamp(Math.sin(this.swingBaseAngle)+rTravel/this.swingLen,-.98,.98));
      this.rearAxleNode.rotation.x = -this.swing.rotation.x;

      this.frontWheel.rotation.x = s.wheelAngleF;
      this.rearWheel.rotation.x = s.wheelAngleR;

      // Chain + shock follow the swingarm.
      const axle = _tmpV.set(0, 0, -this.swingLen);
      this.swing.localToWorld(axle);
      this.chassis.worldToLocal(axle);
      const sprR = cfg.style === 'lightbee' ? 0.095 : 0.12;
      spanMesh(this.chainTop, -0.092, -h + 0.40, -b * 0.04, -0.092, axle.y + sprR, axle.z);
      spanMesh(this.chainBot, -0.092, -h + 0.33, -b * 0.04, -0.092, axle.y - sprR, axle.z);
      const shockBotY = axle.y + 0.12, shockBotZ = axle.z * 0.40;
      spanMesh(this.shockBody, this.shockTop.x, this.shockTop.y, this.shockTop.z,
        0, shockBotY, shockBotZ);
      spanMesh(this.shockSpring, 0, this.shockTop.y - 0.03, this.shockTop.z,
        0, shockBotY + 0.03, shockBotZ);
      this.shockRes.position.set(0.055, this.shockTop.y - 0.06, this.shockTop.z + 0.02);
    }

    this.updateImported?.(pose);
    // Suspension moves the frame around supported wheels, not tyres up off
    // the road. Solve from the actual rig so imported forks and swingarms
    // use their own travel rather than a guessed common lever length.
    this.root.updateMatrixWorld(true);
    const frontNode=this.importedRig?.front || this.frontAxleNode;
    const rearNode=this.importedRig?.rear || this.rearAxleNode;
    const front=this.chassis.worldToLocal(frontNode.getWorldPosition(new THREE.Vector3()));
    const rear=this.chassis.worldToLocal(rearNode.getWorldPosition(new THREE.Vector3()));
    const rearOnly=s.grounded && s.frontDown===false;
    const frontOnly=s.grounded && s.rearDown===false;
    const suspensionPitch=rearOnly || frontOnly ? 0 : Math.atan2(front.y-rear.y,front.z-rear.z)
      -Math.asin(clamp((cfg.rF-cfg.rR)/Math.max(.1,front.distanceTo(rear)),-1,1));
    this.chassis.rotation.x=suspensionPitch;
    const adjustedF=front.y*Math.cos(suspensionPitch)-front.z*Math.sin(suspensionPitch);
    const adjustedR=rear.y*Math.cos(suspensionPitch)-rear.z*Math.sin(suspensionPitch);
    this.chassis.position.y=rearOnly ? cfg.rR-h-adjustedR : frontOnly ? cfg.rF-h-adjustedF
      : ((cfg.rF-h-adjustedF)*b+(cfg.rR-h-adjustedR)*(cfg.wheelbase-b))/cfg.wheelbase;
    pose.brakeAmount = s.brakeAmount ?? (s.brakeLight ? 1 : 0);
    this.rider.update(pose, dt, this, this.gripPos, this.pegPos, cameraMode === 2);
  }

  /** World position of the exhaust tip, for the smoke effect. */
  getExhaustTip(out) {
    if (!this.exhaustLocal) return null;
    out.copy(this.exhaustLocal);
    this.chassis.localToWorld(out);
    return out;
  }
}
