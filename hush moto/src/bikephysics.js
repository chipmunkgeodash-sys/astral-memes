// bikephysics.js — single-track motorcycle dynamics.
//
// Conventions (right-handed, Y up):
//   forward = (sin yaw, 0, cos yaw)     right = (cos yaw, 0, -sin yaw)
//   yaw increases when turning right.   roll > 0 = leaning right.
//   pitch > 0 = nose up (wheelie).      pitch < 0 = nose down (stoppie).
//
// Pitch uses a unilateral contact constraint about whichever contact patch is
// the pivot, so wheelies and stoppies fall out of the torque balance rather
// than being animated.

import { clamp, lerp, smoothstep, sign, wrapAngle, damp } from './core.js';
import { tuneBike } from './customization.js';
import { SURFACE_INFO } from './world.js';

const G = 9.81;
const RHO = 1.225;
export const LOOP_OUT_ANGLE = 1.72;

// Shared with the visible rear fender scrape guard. Contact starts near 75°.
export function fenderTip(cfg) {
  const y=cfg.seatH-.10, angle=1.30;
  return {y,z:-cfg.cgRear-(cfg.rR+(y-cfg.rR)*Math.cos(angle))/Math.sin(angle)};
}

/** Reduce |v| by `delta`, stopping exactly at zero (never overshooting). */
function brakeToward(v, delta) {
  if (Math.abs(v) <= delta) return 0;
  return v - Math.sign(v) * delta;
}

export const BIKES = [
  {
    // Sur-Ron Light Bee X — 19" wheels, 1260 mm wheelbase, ~6 kW peak,
    // ~75 km/h. Geometry below is modelled to match those real numbers.
    id: 'lbx',
    asset: 'assets/bikes/how2random/lbx.glb', assetRig: 'assembled',
    assetCredit: 'How2Random LBX · adapted from a scale model',
    gearColor: 0x2f3742,
    name: 'Sur-Ron Light Bee X',
    tag: 'Electric mini dirt · 60 kg · 75 km/h',
    kind: 'electric',
    color: 0x14161a,
    accent: 0x36d07a,
    frameColor: 0x292c2e,
    springColor: 0x36d07a,
    mass: 60, riderMass: 78,
    wheelbase: 1.26, cgHeight: 0.575, cgRear: 0.58,
    rF: 0.318, rR: 0.318,
    rimF: 0.2413, rimR: 0.2413, tyreF: 0.070, tyreR: 0.080,
    discF: 0.203, discR: 0.203, barWidth: 0.76,
    maxSteer: 0.62,
    peakWheelTorque: 262,   // 60 N·m motor through the ~4.4:1 reduction
    peakPower: 6200,
    topSpeed: 20.8,         // 75 km/h
    brakeFront: 2400, brakeRear: 1400,
    gripMul: 1.02, dirtBonus: 1.24,
    dragArea: 0.60, cd: 0.95,
    wheelInertia: 0.56,
    wheelieEase: 1.42,
    batteryWh: 2160,        // 60 V 36 Ah classic configuration
    seatH: 0.84, tankLen: 0.50, style: 'lightbee',
    gears: null,
  },
  {
    // Classic Ultra Bee X (MY24), 74 V / 55 Ah, 19-inch wheels.
    id: 'ultrabee', name: 'Sur-Ron Ultra Bee',
    asset: 'assets/bikes/files3d/ultra.glb', assetRig: 'assembled',
    assetCredit: 'Files3D.3mf Ultra Bee · adapted from a display model',
    tag: 'Electric trail · MY24 · 85 kg · 90 km/h',
    kind: 'electric', style: 'electricmx',
    color: 0xf0f1ec, accent: 0xc4dc36, frameColor: 0x30343a,
    springColor: 0xd7de32, gearColor: 0x454c3c,
    mass: 85, riderMass: 78,
    wheelbase: 1.38, cgHeight: 0.615, cgRear: 0.635,
    // MY24 stock 80/100-19 front, 90/90-19 rear (nominal unloaded radii).
    rF: 0.3213, rR: 0.3223,
    rimF: 0.2413, rimR: 0.2413, tyreF: 0.080, tyreR: 0.090,
    discF: 0.240, discR: 0.240, barWidth: 0.80,
    maxSteer: 0.60, peakWheelTorque: 440, peakPower: 12500,
    topSpeed: 25, brakeFront: 3000, brakeRear: 1750,
    gripMul: 1.02, dirtBonus: 1.25, dragArea: 0.63, cd: 0.95,
    wheelInertia: 0.70, wheelieEase: 1.38,
    batteryWh: 4070, seatH: 0.910, tankLen: 0.50,
    gears: null,
  },
  {
    // Original VARG MX Alpha: 80 hp, 6.5 kWh, 21/19-inch MX wheels.
    // Top speed is a gameplay gearing estimate, not a manufacturer claim.
    id: 'starkvarg', name: 'Stark VARG',
    tractionControl: true,
    asset: 'assets/bikes/stark/stark.glb', assetRig: 'assembled',
    assetCredit: 'Stark by tashatitsworth87 · CC BY 4.0 · adapted',
    tag: 'Electric MX Alpha · 80 hp · 118 kg',
    kind: 'electric', style: 'electricmx',
    color: 0xdb302b, accent: 0xf3f1ed, frameColor: 0x303238,
    springColor: 0xd8312b, gearColor: 0xad2825, forkGold: true,
    mass: 118, riderMass: 78,
    wheelbase: 1.48, cgHeight: 0.64, cgRear: 0.70,
    rF: 0.347, rR: 0.340,
    rimF: 0.2667, rimR: 0.2413, tyreF: 0.080, tyreR: 0.110,
    discF: 0.260, discR: 0.220, barWidth: 0.81,
    maxSteer: 0.57, peakWheelTorque: 938, peakPower: 59656,
    topSpeed: 38.9, brakeFront: 3700, brakeRear: 2100,
    gripMul: 1.06, dirtBonus: 1.28, dragArea: 0.65, cd: 0.95,
    wheelInertia: 0.84, wheelieEase: 1.30,
    batteryWh: 6500, seatH: 0.947, tankLen: 0.52,
    gears: null,
  },
  {
    // Honda CRF450R — 111 kg, 449 cc single, ~49 N·m, ~140 km/h.
    id: 'crf450r',
    asset: 'assets/bikes/jacobdesigns/crf450.glb', assetRig: 'honda',
    assetCredit: 'Honda model by Jacobdesigns · CC BY 4.0',
    gearColor: 0xd6232b,
    name: 'Honda CRF450R',
    tag: 'Motocross 450 · 111 kg · 140 km/h',
    kind: 'gas',
    color: 0xd6232b,
    accent: 0xf4f6f8,
    frameColor: 0xb9bfc7,
    springColor: 0xf2f2f2,
    mass: 111, riderMass: 78,
    wheelbase: 1.485, cgHeight: 0.665, cgRear: 0.71,
    rF: 0.347, rR: 0.350,
    rimF: 0.2667, rimR: 0.2413, tyreF: 0.080, tyreR: 0.120,
    discF: 0.260, discR: 0.240, barWidth: 0.80, rake: 0.477, forkGold: true,
    maxSteer: 0.58,
    peakEngineTorque: 49,
    torquePeakRpm: 7000, redline: 11500, idleRpm: 1700,
    gears: [2.45, 1.82, 1.45, 1.22, 1.04], driveEff: 0.92,
    topSpeed: 38.9,         // 140 km/h
    brakeFront: 3400, brakeRear: 1900,
    gripMul: 0.99, dirtBonus: 1.26,
    dragArea: 0.66, cd: 0.98,
    wheelInertia: 0.85,
    wheelieEase: 1.25,
    seatH: 0.955, tankLen: 0.58, style: 'dirt',
  },
  {
    // KTM 1290 Super Duke R — 200 kg wet, 180 hp, 140 N·m, ~290 km/h.
    id: 'superduke',
    asset: 'assets/bikes/ktm/duke.glb', assetRig: 'assembled',
    assetCredit: 'KTM by Moon1376464 · CC BY 4.0 · stylized',
    gearColor: 0xff6a00,
    name: 'KTM 1290 Super Duke R',
    tag: 'Naked V-twin · 200 kg · 290 km/h',
    kind: 'gas',
    color: 0x1b1d21,
    accent: 0xff6a00,
    frameColor: 0xff6a00,
    springColor: 0xff6a00,
    forkGold: true,
    mass: 200, riderMass: 78,
    wheelbase: 1.497, cgHeight: 0.585, cgRear: 0.755,
    rF: 0.300, rR: 0.326,
    rimF: 0.2159, rimR: 0.2159, tyreF: 0.120, tyreR: 0.200,
    discF: 0.320, discR: 0.240, barWidth: 0.78, rake: 0.436, singleSwing: true,
    maxSteer: 0.46,
    peakEngineTorque: 140,
    torquePeakRpm: 8000, redline: 10500, idleRpm: 1100,
    gears: [2.62, 1.92, 1.56, 1.33, 1.16, 1.03], driveEff: 0.93,
    topSpeed: 80.5,         // 290 km/h
    brakeFront: 5400, brakeRear: 2200,
    gripMul: 1.08, dirtBonus: 0.9,
    dragArea: 0.72, cd: 0.70,
    wheelInertia: 1.15,
    wheelieEase: 1.18,
    seatH: 0.835, tankLen: 0.66, style: 'street',
  },
  {
    // Yamaha YZF-R1 — 201 kg wet, 200 hp, 113 N·m at 11 500, ~299 km/h.
    id: 'r1',
    gearColor: 0x1c50a0,
    name: 'Yamaha YZF-R1',
    tag: 'Supersport litre · 201 kg · 299 km/h',
    kind: 'gas',
    color: 0x1c50a0,
    accent: 0xf2f4f7,
    frameColor: 0xc6ccd4,
    springColor: 0xd8dde3,
    mass: 201, riderMass: 78,
    wheelbase: 1.405, cgHeight: 0.555, cgRear: 0.745,
    rF: 0.300, rR: 0.320,
    rimF: 0.2159, rimR: 0.2159, tyreF: 0.120, tyreR: 0.190,
    discF: 0.320, discR: 0.220, barWidth: 0.66, rake: 0.419, forkGold: true,
    maxSteer: 0.42,
    peakEngineTorque: 113,
    torquePeakRpm: 11500, redline: 14500, idleRpm: 1300,
    gears: [2.60, 2.00, 1.67, 1.44, 1.29, 1.16], driveEff: 0.94,
    topSpeed: 83.0,         // 299 km/h
    brakeFront: 5900, brakeRear: 2100,
    gripMul: 1.12, dirtBonus: 0.82,
    dragArea: 0.56, cd: 0.56,
    wheelInertia: 1.1,
    wheelieEase: 0.98,
    seatH: 0.855, tankLen: 0.64, style: 'sport',
  },
];

// An original custom bobber, authored in Blender by Duhgless (CC0).
// Handling is a gameplay tune, not a manufacturer's claimed specification.
BIKES.push({ ...BIKES.find(b => b.id === 'superduke'), id: 'bobber', assetRig: 'bobber', name: 'Custom Bobber · Blender',
  tag: 'Creator-made Blender model · custom V-twin', asset: 'assets/bikes/duhgless/bike3.glb',
  assetCredit: 'Blender model by Duhgless · CC0 · custom handling',
  color: 0x493a30, accent: 0xd0b895, gearColor: 0x302c28, style: 'street',
  mass: 220, wheelbase: 1.65, cgRear: .80, cgHeight: .60, seatH: .70, riderSeatZ: -.40,
  rF: .405, rR: .377, tyreF: .15, tyreR: .15, barWidth: .52,
  maxSteer: .50, peakEngineTorque: 86, torquePeakRpm: 3500, redline: 6000, idleRpm: 950,
  gears: [2.65, 1.85, 1.42, 1.15, 1], topSpeed: 44.4,
  brakeFront: 4100, brakeRear: 2300, gripMul: 1, dirtBonus: .8,
  dragArea: .70, cd: .85, wheelieEase: .85, wheelInertia: 1.4 });

function torqueCurve(rpm, cfg) {
  const p = cfg.torquePeakRpm;
  const r = clamp(rpm, 0, cfg.redline * 1.05);
  // Smooth bell that keeps decent torque low down and tapers after the peak.
  const x = r / p;
  let t;
  if (x < 1) t = 0.55 + 0.45 * Math.sin((x * Math.PI) / 2);
  else t = 1 - 0.42 * Math.pow(clamp((r - p) / (cfg.redline - p), 0, 1.3), 1.5);
  if (r > cfg.redline) t *= 0.25; // rev limiter
  return cfg.peakEngineTorque * clamp(t, 0, 1.05);
}

export class Bike {
  constructor(world, cfgId = 'lbx', build = {}) {
    this.world = world;
    this.setConfig(cfgId, build);

    this.pos = { x: 0, y: 0, z: 0 };     // centre of mass
    this.vel = { x: 0, y: 0, z: 0 };

    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.yawRate = 0; this.pitchRate = 0; this.rollRate = 0;

    this.vLong = 0; this.vLat = 0;
    this.steer = 0;
    this.omegaR = 0; this.omegaF = 0;
    this.wheelAngleF = 0; this.wheelAngleR = 0;

    this.gear = 0; this.rpm = 0; this.clutch = 1; this.shiftTimer = 0;
    this.battery = 1;this.fuel=1;

    this.suspF = 0; this.suspR = 0;       // compression, metres
    this.suspFv = 0; this.suspRv = 0;

    this.grounded = true; this.frontDown = true; this.rearDown = true;
    this.airTime = 0; this.lastAirTime = 0;
    this.crashed = false; this.crashTimer = 0; this.crashReason = '';
    this.rearSlip = 0; this.frontSlip = 0; this.lateralSlip = 0;
    this.slideTimer = 0; this.steerLimit = 0.5; this.steerI = 0;
    this.surface = 2;
    this.groundNormal = { x: 0, y: 1, z: 0 };
    this.contactY = 0;

    this.airRoll = 0; this.airPitchTotal = 0; this.airYawTotal = 0;
    this.jumpStart = null;
    this.wheelieTime = 0; this.wheelieDist = 0;
    this.wheelieHold = 0; this.wheelieTarget = 0; this.wheelieTrim = 1;
    this.wheelieLeanTarget = null; this.wheelieTurnBlend = 0;
    this.brakeTrim = 1; this.throttle = 0; this.airWheelImpulse = 0;
    this.stoppieTime = 0;
    this.distance = 0;
    this.impactSpeed = 0;
    this.lastLandingHard = 0;
    this.engineLoad = 0;
    this.rearGrip = 1; this.frontGrip = 1;

    this._g = {};
    this._gf = {};
    this._gr = {};
    this._col = {};
    this.events = [];
  }

  setConfig(id, build = {}) {
    const cfg = tuneBike(BIKES.find((b) => b.id === id) || BIKES[0], build);
    cfg.tankLiters=({crf450r:6.3,superduke:16,r1:17,bobber:12})[cfg.id]||12;
    this.cfg = cfg;
    this.m = cfg.mass + cfg.riderMass;
    this.L = cfg.wheelbase;
    this.b = cfg.cgRear;              // rear axle -> CG
    this.a = this.L - this.b;         // CG -> front axle
    this.h = cfg.cgHeight;
    this.Izz = this.m * 0.32 * this.L * this.L;
    this.Iyy = this.m * (this.b * this.b + this.h * this.h) * 1.25;
    this.gearCount = cfg.gears ? cfg.gears.length : 1;
    this.calibrate();
  }

  /**
   * Gearing and aerodynamic drag are derived from the quoted top speed so every
   * bike really does top out where its spec sheet says, and gas bikes sit near
   * the redline in top gear when they get there.
   */
  calibrate() {
    const cfg = this.cfg;
    const v = cfg.topSpeed;
    const wheelRpmTop = (v / cfg.rR) * 9.5493;
    let driveForceAtTop;
    if (cfg.kind === 'electric') {
      const omega = v / cfg.rR;
      const tq = Math.min(cfg.peakWheelTorque, cfg.peakPower / Math.max(omega, 1));
      driveForceAtTop = tq / cfg.rR;
      this.finalDrive = 1;
    } else {
      const topGear = cfg.gears[cfg.gears.length - 1];
      const totalTop = (cfg.redline * 0.93) / wheelRpmTop;
      this.finalDrive = totalTop / topGear;
      driveForceAtTop =
        (torqueCurve(cfg.redline * 0.93, cfg) * totalTop * cfg.driveEff) / cfg.rR;
    }
    // Static suspension sag at rest — the model treats this as its rest pose,
    // so visible travel is deviation from it rather than a constant offset.
    this.restSuspF = 0.055 + (this.b / this.L) * 0.19;
    this.restSuspR = 0.07 + (this.a / this.L) * 0.24;

    const rollAtTop = 0.016 * this.m * G;
    this.kDrag = Math.max(0.04, ((driveForceAtTop - rollAtTop) / (v * v)) * 0.90);
    // Separate, lighter coefficient for vertical air resistance while airborne.
    this.kDragAir = 0.5 * RHO * cfg.cd * cfg.dragArea * 0.45;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get kmh() { return this.speed * 3.6; }

  reset(spawn) {
    this.resetVersion = (this.resetVersion || 0) + 1;
    const w = this.world;
    this.pos.x = spawn.x; this.pos.z = spawn.z;
    this.yaw = spawn.yaw || 0;
    const g = w.queryGround(spawn.x, spawn.z, spawn.y + 5, this._g);
    this.pos.y = g.y + this.h;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.vLong = this.vLat = 0;
    this.groundPitch = Math.atan2(-(g.nx * Math.sin(this.yaw) + g.nz * Math.cos(this.yaw)), g.ny);
    this.pitch = this.groundPitch; this.roll = 0;
    this.yawRate = this.pitchRate = this.rollRate = 0;
    this.omegaR = this.omegaF = 0;
    this.steer = 0;
    this.gear = 0; this.rpm = this.cfg.idleRpm || 0;
    this.crashed = false; this.crashTimer = 0; this.crashReason = '';
    this.slideTimer = 0; this.steerI = 0;
    this.airTime = 0; this.grounded = true;
    this.frontDown = this.rearDown = true;
    this._lastAx = 0;
    this.rearSlip = this.frontSlip = this.lateralSlip = 0;
    this.suspF = this.restSuspF; this.suspR = this.restSuspR;
    this.suspFv = this.suspRv = 0;
    this.wheelieTime = 0; this.wheelieDist = 0; this.stoppieTime = 0;
    this.wheelieHold = 0; this.wheelieTarget = 0; this.wheelieTrim = 1;
    this.wheelieLeanTarget = null; this.wheelieTurnBlend = 0;
    this.brakeTrim = 1; this.throttle = 0; this.airWheelImpulse = 0;
    this.jumpStart = null;
    this.crashSpin = null;
    this.shiftTimer = 0; this.clutch = 1;
    this.airRoll = this.airPitchTotal = this.airYawTotal = 0;
    this.lastAirTime = this.impactSpeed = this.lastLandingHard = 0;
    this.engineLoad = 0; this.brakeLight = false;
    this.brakeAmount = 0;
    this.fenderScraping=false;this.scrapeIntensity=0;this.scrapeTime=0;this.scrapePoint=null;
    this.events.length = 0;
  }

  pushEvent(type, data) { this.events.push({ type, data }); }

  /** Fixed-step update. `input` = { throttle, brake, steer, wheelie, boost, reverse } */
  step(dt, input) {
    if (this.crashed) { this.stepCrashed(dt); return; }

    const cfg = this.cfg;
    const w = this.world;
    const m = this.m;
    // A keyboard press opens the throttle progressively, with a faster close.
    // Keep braking and rider controls immediate while smoothing motor torque.
    this.throttle = damp(this.throttle, clamp(input.throttle, 0, 1),
      input.throttle > this.throttle ? 12 : 24, dt);
    input = { ...input, throttle: this.throttle };
    this.brakeAmount = clamp(Math.max(input.brake, input.rearBrake || 0),0,1);

    // ---- orientation helpers -------------------------------------------
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const fx = sy, fz = cy;        // forward
    const rx = cy, rz = -sy;       // right

    // ---- ground probing at both contact patches -------------------------
    const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
    // contact patch positions (ground projection of each axle)
    const frontOffset = this.a * cosP + (this.h - cfg.rF) * sinP;
    const rearOffset = -this.b * cosP + (this.h - cfg.rR) * sinP;
    const frontX = this.pos.x + fx * frontOffset;
    const frontZ = this.pos.z + fz * frontOffset;
    const rearX = this.pos.x + fx * rearOffset;
    const rearZ = this.pos.z + fz * rearOffset;

    const gF = w.queryGround(frontX, frontZ, this.pos.y, this._gf);
    const gR = w.queryGround(rearX, rearZ, this.pos.y, this._gr);

    // Axle positions. The axles sit BELOW the centre of mass by (h - r), and
    // that offset rotates with pitch — leaving it out floats the whole bike.
    const cgY = this.pos.y;
    const frontAxleY = cgY + (cfg.rF - this.h) * cosP + this.a * sinP;
    const rearAxleY = cgY + (cfg.rR - this.h) * cosP - this.b * sinP;
    const frontGap = (frontAxleY - cfg.rF) - gF.y;
    const rearGap = (rearAxleY - cfg.rR) - gR.y;

    const CONTACT_EPS = 0.06;
    let frontDown = frontGap < CONTACT_EPS;
    let rearDown = rearGap < CONTACT_EPS;

    // Pitch can legitimately hold a wheel off the ground.
    // At a jump lip the front probe sees the ground far below while the rear
    // tyre still rests on the ramp. That height difference is empty space,
    // not a steep downhill road: use the supporting tyre's surface normal.
    const support = rearDown ? gR : gF;
    const supportPitch = Math.atan2(-(support.nx * fx + support.nz * fz), support.ny);
    const groundPitch = frontDown && rearDown
      ? Math.atan2(gF.y - gR.y, Math.max(frontOffset - rearOffset, 0.2))
      : supportPitch;
    const relativePitch = this.pitch - groundPitch;
    if (relativePitch > 0.035) frontDown = false;
    if (relativePitch < -0.035) rearDown = false;

    const airborne = !frontDown && !rearDown;
    if (!airborne) this.groundPitch = groundPitch;
    this.groundNormal.x = rearDown ? gR.nx : gF.nx;
    this.groundNormal.y = rearDown ? gR.ny : gF.ny;
    this.groundNormal.z = rearDown ? gR.nz : gF.nz;
    this.surface = rearDown ? gR.surface : gF.surface;
    this.contactY = rearDown ? gR.y : gF.y;
    const surfInfo = SURFACE_INFO[this.surface];
    const mu = surfInfo.grip * cfg.gripMul *
      (this.surface <= 1 ? cfg.dirtBonus : 1) *
      (this.surface === 0 ? 0.95 : 1);
    this.rearGrip = mu;

    // ---- body-frame velocity -------------------------------------------
    this.vLong = this.vel.x * fx + this.vel.z * fz;
    this.vLat = this.vel.x * rx + this.vel.z * rz;
    const speed = Math.hypot(this.vel.x, this.vel.z);

    // ---- steering --------------------------------------------------------
    // A/D asks for a cornering rate, not a bar angle: the rider works out how
    // much lock that needs and trims it with a closed loop, exactly as a real
    // rider countersteers. The cornering itself is still produced entirely by
    // the tyre forces below, so grip loss, slides and the friction circle all
    // behave normally — this only replaces the rider's hands.
    const maxLatA = mu * G * 0.94;
    const vRefS = Math.max(speed, 2.2);
    // If the rear has stepped out, the rider stops asking for more turn and
    // starts catching the slide instead.
    const slideEase = 1 - 0.55 * clamp((this.lateralSlip - 0.55) / 0.6, 0, 1);
    const targetYaw = (input.steer * maxLatA * slideEase) / vRefS;
    const kinSteer = Math.atan((targetYaw * this.L) / vRefS);
    // Correction gain must be scaled by steering sensitivity (d yaw / d steer
    // = v / L); a fixed gain would be wildly over-aggressive at speed and the
    // bike would tank-slap itself into a spin.
    const sens = this.L / vRefS;
    const yawErr = targetYaw - this.yawRate;
    const corrLim = 0.45 * cfg.maxSteer;
    // Integral term: tyres need a standing slip angle to make force, so a rider
    // winds on extra lock until the bike actually holds the line they asked for.
    this.steerI = clamp(
      this.steerI * Math.exp(-(frontDown ? 1.1 : 8) * dt) + (frontDown ? yawErr * sens * 3.6 * dt : 0),
      -corrLim, corrLim
    );
    if (input.steer === 0) this.steerI *= 1 - Math.min(0.9, 5 * dt);
    const corr = clamp(yawErr * sens * 1.8 + this.steerI, -corrLim, corrLim);
    // In the air the bars only move for show, and only at low speed — landing
    // on a fistful of lock at 200 km/h would spit the rider off instantly.
    const airVis = input.steer * 0.10 * (1 - smoothstep(clamp(speed / 26, 0, 1)));
    // A real rider uses much less bar angle as speed rises. Keeping full lock
    // available at motorway speed makes the old arcade turn snap instantly;
    // the progressive limit below preserves parking-lot manoeuvrability while
    // giving fast corners a stable, believable steering response.
    const highSpeedLock = lerp(cfg.maxSteer, cfg.maxSteer * 0.22,
      smoothstep(clamp((speed - 3) / 27, 0, 1)));
    const trail = (cfg.rake || .45) * 0.09;
    const counterSteer = input.steer * trail * (1 - smoothstep(clamp(speed / 8, 0, 1)));
    const steerTarget = !frontDown
      ? clamp(kinSteer + airVis, -highSpeedLock, highSpeedLock)
      : clamp(kinSteer + corr + counterSteer, -highSpeedLock, highSpeedLock);
    this.targetYawRate = targetYaw;
    this.steerLimit = Math.abs(kinSteer);
    this.steer = damp(this.steer, steerTarget, frontDown ? 13.0 - smoothstep(clamp(speed / 24, 0, 1)) * 4 : 5.0, dt);

    // ---- powertrain ------------------------------------------------------
    let driveTorque = 0;
    const boost = input.boost ? 1.0 : 0;
    if (cfg.kind === 'electric') {
      // P = T * omega, so the power-limited wheel torque divides by the wheel's
      // ANGULAR speed, not its linear speed.
      const omega = Math.max(Math.abs(this.omegaR), 1.2);
      const tqPower = (cfg.peakPower * (1 + boost * 0.35)) / omega;
      const tqMax = cfg.peakWheelTorque * (1 + boost * 0.25) * (this.battery <= 0 ? 0 : this.battery > 0.05 ? 1 : 0.25);
      driveTorque = Math.min(tqMax, tqPower) * input.throttle;
      this.rpm = Math.abs(this.omegaR) * 9.5493 * 4.2; // motor rpm (geared)
      this.battery = clamp(
        this.battery - (driveTorque * Math.abs(this.omegaR) / 0.9) * dt / (cfg.batteryWh * 3600) * 1.0,
        0, 1
      );

    } else {
      const ratio = cfg.gears[this.gear] * this.finalDrive;
      const wheelRpm = Math.abs(this.omegaR) * 9.5493;
      let rpm = wheelRpm * ratio;
      // Clutch slip off the line keeps the engine above idle.
      if (rpm < cfg.idleRpm) {
        // A slipping clutch still transmits launch torque. Coupling solely to
        // wheel RPM trapped the gas bikes at nearly zero torque at a stop.
        this.clutch = clamp(0.3 + input.throttle * 0.6 + (rpm / cfg.idleRpm) * 0.1, 0.12, 1);
        rpm = cfg.idleRpm;
      } else this.clutch = 1;
      this.rpm = damp(this.rpm, rpm, 24, dt);
      // Auto gearbox
      this.shiftTimer -= dt;
      if (this.shiftTimer <= 0) {
        if (this.rpm > cfg.redline * 0.94 && this.gear < this.gearCount - 1) {
          this.gear++; this.shiftTimer = 0.28; this.pushEvent('shift', 1);
        } else if (this.rpm < cfg.redline * 0.42 && this.gear > 0) {
          this.gear--; this.shiftTimer = 0.24; this.pushEvent('shift', -1);
        }
      }
      const shifting = this.shiftTimer > 0.12 ? 0.15 : 1;
      driveTorque =
        torqueCurve(this.rpm, cfg) * ratio * cfg.driveEff * input.throttle *
        this.clutch * shifting * (1 + boost * 0.12);
      if(this.fuel<=0){driveTorque=0;this.rpm=0;}
      this.fuel=Math.max(0,this.fuel-dt*(.0006+input.throttle*.004+speed*.00009)/cfg.tankLiters);
    }
    // A rider holding a wheelie feathers the throttle as the balance point
    // approaches; without that no powerful bike could be held up at all.
    driveTorque *= this.wheelieTrim;
    this.engineLoad = (cfg.kind==='gas'&&this.fuel<=0?0:input.throttle) * (0.35 + 0.65 * this.wheelieTrim);

    // S brakes to walking pace, then walks the bike backwards. Gas bikes do
    // not have an electric motor torque field (or a powered reverse gear).
    const reversing = input.reverse && this.vLong < 0.5 && speed < 2.5 &&
      input.throttle < 0.05 && input.brake < 0.05;
    if (reversing) driveTorque = -m * 1.8 * cfg.rR * clamp((2.2 + this.vLong) / 0.7, 0, 1);

    // ---- braking ---------------------------------------------------------
    const brakeInput = clamp(input.brake, 0, 1);
    // The rider (or ABS) eases the front brake as the rear wheel comes up,
    // which is what stops every hard stop from ending in an endo.
    // Configured brake capacities are forces at the tyre; wheel dynamics use Nm.
    const brakeF = cfg.brakeFront * cfg.rF * brakeInput * this.brakeTrim;
    const brakeR = cfg.brakeRear * cfg.rR * Math.max(brakeInput, reversing ? 0 : (input.rearBrake || 0));

    // ---- normal loads ----------------------------------------------------
    const slopeCos = clamp(this.groundNormal.y, 0.55, 1);
    let Nf, Nr;
    const Wtot = m * G * slopeCos;
    if (airborne) { Nf = 0; Nr = 0; }
    else if (!frontDown) { Nf = 0; Nr = Wtot; }
    else if (!rearDown) { Nr = 0; Nf = Wtot; }
    else {
      const axPrev = this._lastAx || 0;
      Nf = clamp(Wtot * (this.b / this.L) - m * axPrev * this.h / this.L, 0, Wtot);
      Nr = Wtot - Nf;
    }
    // Suspension load transfer makes the bike squat/dive visually.
    this.Nf = Nf; this.Nr = Nr;

    // Meter the VARG's motor torque against the supported rear tyre load.
    // Leave a little grip for steering; airborne revs remain unrestricted.
    if (cfg.tractionControl && rearDown && driveTorque > 0) {
      const gripTorque = mu * Nr * cfg.rR * .92;
      const spin = Math.max(0, this.omegaR * cfg.rR - Math.max(0, this.vLong));
      driveTorque = Math.min(driveTorque, gripTorque * clamp(1 - spin / 5, .05, 1));
    }

    // ---- rear wheel slip dynamics ---------------------------------------
    let Fx = 0, rearForce = 0, frontForce = 0;
    const oldOmegaR = this.omegaR, oldOmegaF = this.omegaF;
    if (!airborne) {
      const vRef = Math.max(Math.abs(this.vLong), 3.0);
      const slipR = (this.omegaR * cfg.rR - this.vLong) / vRef;
      this.rearSlip = clamp(slipR, -3, 3);
      const capR = mu * Nr;
      // Solve tyre force against the wheel's end-of-step angular speed. The
      // explicit stiff spring alternated traction/braking at low speed, making
      // the suspension chatter even on smooth ground.
      const Iw = cfg.wheelInertia;
      const freeR = brakeToward(this.omegaR + driveTorque / Iw * dt, brakeR / Iw * dt);
      const stiffnessR = 9 * capR / vRef;
      const FxR = clamp(stiffnessR * (freeR * cfg.rR - this.vLong) /
        (1 + stiffnessR * dt * (cfg.rR * cfg.rR / Iw + 1 / m)), -capR, capR);
      // front longitudinal (braking only)
      const slipF = (this.omegaF * cfg.rF - this.vLong) / vRef;
      this.frontSlip = clamp(slipF, -3, 3);
      const capF = mu * Nf;
      const freeF = brakeToward(this.omegaF, brakeF / (Iw * .55) * dt);
      const stiffnessF = 11 * capF / vRef;
      const FxF = clamp(stiffnessF * (freeF * cfg.rF - this.vLong) /
        (1 + stiffnessF * dt * (cfg.rF * cfg.rF / (Iw * .55) + 1 / m)), -capF, capF);
      Fx = FxR + FxF;
      rearForce = FxR; frontForce = FxF;

      // Wheel angular dynamics. Brakes are applied as a bounded decelerating
      // impulse so a wheel locks at zero instead of being driven backwards.
      this.omegaR += ((driveTorque - FxR * cfg.rR) / Iw) * dt;
      this.omegaR = brakeToward(this.omegaR, (brakeR / Iw) * dt);
      this.omegaF += ((-FxF * cfg.rF) / (Iw * 0.55)) * dt;
      this.omegaF = brakeToward(this.omegaF, (brakeF / (Iw * 0.55)) * dt);
      // A lifted wheel keeps its angular momentum; it cannot track road speed.
      if (!frontDown) this.omegaF *= Math.exp(-0.08 * dt);
    } else {
      // free-spinning wheels in the air, throttle still revs the motor
      this.omegaR += (driveTorque / cfg.wheelInertia) * dt;
      this.omegaR = brakeToward(this.omegaR, brakeR / cfg.wheelInertia * dt);
      this.omegaF = brakeToward(this.omegaF, brakeF / (cfg.wheelInertia * 0.55) * dt);
      this.omegaR *= Math.exp(-0.08 * dt);
      this.omegaF *= Math.exp(-0.08 * dt);
      this.rearSlip = 0; this.frontSlip = 0;
    }
    this.omegaR = clamp(this.omegaR, -260, 260);
    this.omegaF = clamp(this.omegaF, -260, 260);
    // Wheel acceleration reacts on the chassis in flight. Once a braked wheel
    // has stopped it cannot keep supplying a fictional nose-down torque.
    this.airWheelImpulse = airborne ? cfg.wheelInertia *
      ((this.omegaR - oldOmegaR) + .55 * (this.omegaF - oldOmegaF)) : 0;

    // ---- resistive forces ------------------------------------------------
    const drag = this.kDrag * speed * speed * sign(this.vLong || 1);
    const roll = airborne ? 0 : surfInfo.roll * m * G * sign(this.vLong);
    const slopeForce = airborne ? 0 :
      m * G * this.groundNormal.y * (this.groundNormal.x * fx + this.groundNormal.z * fz);

    let FxTotal = Fx - drag - roll + slopeForce;
    if (airborne) FxTotal = -drag;
    const ax = FxTotal / m;
    this._lastAx = ax;

    // ---- lateral / yaw ---------------------------------------------------
    this.wheelieLeanTarget = null;
    this.wheelieTurnBlend = 0;
    let Fy = 0;
    if (!airborne) {
      const vx = Math.max(Math.abs(this.vLong), 0.9) * (this.vLong < 0 ? -1 : 1);
      const alphaF = Math.atan2(this.vLat + this.a * this.yawRate, Math.abs(vx)) - this.steer * Math.sign(vx);
      const alphaR = Math.atan2(this.vLat + rearOffset * this.yawRate, Math.abs(vx));
      const Cf = 13.5 * Nf;
      const Cr = 15.5 * Nr;
      let Fyf = clamp(-Cf * alphaF, -mu * Nf * 1.0, mu * Nf * 1.0);
      let Fyr = clamp(-Cr * alphaR, -mu * Nr * 1.0, mu * Nr * 1.0);
      // friction circle: longitudinal use eats lateral capacity
      const usedR = Math.min(1, Math.abs(rearForce) / Math.max(mu * Nr, 1));
      const usedF = Math.min(1, Math.abs(frontForce) / Math.max(mu * Nf, 1));
      const rearCapacity = mu * Nr * Math.sqrt(Math.max(0, 1 - usedR * usedR));
      Fyr = clamp(Fyr, -rearCapacity, rearCapacity);
      const frontCapacity = mu * Nf * Math.sqrt(Math.max(0, 1 - usedF * usedF));
      Fyf = clamp(Fyf, -frontCapacity, frontCapacity);
      // Rear-contact wheelie control: rider lean/camber asks for a curved
      // path, bounded by the rear tyre's remaining friction circle. Bars in
      // the air do not produce front-tyre force. Fade in to avoid a yaw kick.
      const onRear = rearDown && !frontDown && this.vLong > 0.5;
      const wheelieTurn = onRear ? smoothstep(clamp(relativePitch / 0.22, 0, 1)) : 0;
      const turnSpeed = smoothstep(clamp((speed - 0.5) / 4, 0, 1));
      const yawLimit = Math.min(.65, rearCapacity / m / vRefS) * turnSpeed;
      const requestedYaw = input.steer * yawLimit;
      // Lean first, then carve. A raised front wheel cannot steer the road.
      // The rear wheel is fixed in the frame; its contact velocity must follow
      // its rolling plane rather than dragging sideways behind a rotating CG.
      this.wheelieLeanTarget = Math.atan2(this.vLong * requestedYaw, G);
      this.wheelieTurnBlend = wheelieTurn;
      const wheelieYaw = clamp(G * Math.tan(this.roll) / vRefS, -yawLimit, yawLimit);
      if (wheelieTurn > 0) {
        const contactLateralSpeed = this.vLat + rearOffset * this.yawRate;
        const leanForce = m * (this.vLong * wheelieYaw - contactLateralSpeed * 8.0);
        Fyr = lerp(Fyr, clamp(leanForce, -rearCapacity, rearCapacity), wheelieTurn);
      }
      Fy = Fyf + Fyr;
      this.lateralSlip = clamp(Math.abs(alphaR) * 1.6, 0, 1.4);
      // Track how long the rear has been genuinely away from the rider.
      if (this.lateralSlip > 0.85 && speed > 9) this.slideTimer += dt;
      else this.slideTimer = Math.max(0, this.slideTimer - dt * 2.2);

      const tyreMoment = this.a * Fyf - this.b * Fyr;
      const riderMoment = clamp((wheelieYaw - this.yawRate) * this.Izz * 4.5,
        -rearCapacity * this.L, rearCapacity * this.L);
      const Mz = lerp(tyreMoment, riderMoment, wheelieTurn);
      this.yawRate += (Mz / this.Izz) * dt;
      // low-speed blend toward the kinematic model for crisp slow manoeuvres
      const kinBlend = 1 - smoothstep(clamp((speed - 1.2) / 5.5, 0, 1));
      if (kinBlend > 0 && frontDown && rearDown) {
        const kinYaw = (this.vLong * Math.tan(this.steer)) / this.L;
        this.yawRate = lerp(this.yawRate, kinYaw, 1-Math.exp(-kinBlend*90*dt));
        // The CG moves sideways in a tight turn; only the rear contact has
        // zero lateral velocity. Zeroing CG velocity dragged the rear tyre.
        this.vLat = lerp(this.vLat, -rearOffset*this.yawRate, 1-Math.exp(-kinBlend*90*dt));
      }
      this.yawRate = clamp(this.yawRate, -3.4, 3.4);
      // Light yaw damping only: steering damper + tyre relaxation, not a
      // stand-in for grip.
      this.yawRate *= 1 - Math.min(0.5, 0.45 * dt);
    } else {
      this.lateralSlip = 0;
      this.yawRate += input.steer * 0.9 * dt;
      this.yawRate *= 1 - Math.min(0.9, 0.45 * dt);
    }

    // ---- integrate planar velocity ---------------------------------------
    const aLat = airborne ? 0 : Fy / m;
    this.vLong += (ax + this.yawRate * this.vLat) * dt;
    this.vLat += (aLat - this.yawRate * this.vLong) * dt;
    if (!airborne) this.vLat *= 1 - Math.min(0.4, 0.22 * dt);

    // Static friction: brakes hold the bike still rather than letting it creep.
    if (!reversing && input.throttle < 0.05 && !airborne &&
        (brakeInput > 0.04 || (input.rearBrake || 0) > 0.04) && Math.abs(this.vLong) < 1.5) {
      this.vLong = brakeToward(this.vLong, 26 * dt);
      if (rearDown) this.omegaR = this.vLong / cfg.rR;
      if (frontDown) this.omegaF = this.vLong / cfg.rF;
    }

    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);

    // rebuild world velocity from body components
    const ncy = Math.cos(this.yaw), nsy = Math.sin(this.yaw);
    this.vel.x = this.vLong * nsy + this.vLat * ncy;
    this.vel.z = this.vLong * ncy - this.vLat * nsy;

    // ---- pitch (wheelie / stoppie) ---------------------------------------
    // Contact constraints are relative to the road. Absolute pitch would
    // misclassify an ordinary climb as a wheelie and force descents level.
    if (!airborne) this.pitch -= this.groundPitch;
    this.updatePitch(dt, input, ax, airborne, frontDown, rearDown, Nf, Nr, mu);
    if (!airborne) this.pitch += this.groundPitch;

    // ---- roll ------------------------------------------------------------
    this.updateRoll(dt, input, aLat, airborne, speed);

    // ---- vertical motion & suspension ------------------------------------
    this.updateVertical(dt, airborne, frontDown, rearDown, gF, gR, input);

    // ---- horizontal integration & collisions -----------------------------
    // Sweep in short segments so a tyre cannot skip a thin pole at speed.
    const collisionSteps = Math.max(1, Math.ceil(speed * dt / .14));
    for (let i = 0; i < collisionSteps; i++) {
      this.pos.x += this.vel.x * dt / collisionSteps;
      this.pos.z += this.vel.z * dt / collisionSteps;
      this.resolveCollisions(dt / collisionSteps);
    }
    this.distance += speed * dt;

    // ---- wheel visuals ---------------------------------------------------
    this.wheelAngleF += this.omegaF * dt;
    this.wheelAngleR += this.omegaR * dt;

    // ---- stunt bookkeeping ------------------------------------------------
    this.frontDown = frontDown; this.rearDown = rearDown; this.grounded = !airborne;
    const contactPitch = this.pitch - (this.groundPitch || 0);
    if (contactPitch > 0.16 && !airborne) {
      this.wheelieTime += dt;
      this.wheelieDist += Math.abs(this.vLong) * dt;
    } else if (!airborne) {
      if (this.wheelieTime > 0.35) this.pushEvent('wheelieEnd', { t: this.wheelieTime, d: this.wheelieDist });
      this.wheelieTime = 0; this.wheelieDist = 0;
    }
    if (contactPitch < -0.13 && !airborne && speed > 3) this.stoppieTime += dt;
    else if (!airborne) {
      if (this.stoppieTime > 0.3) this.pushEvent('stoppieEnd', { t: this.stoppieTime });
      this.stoppieTime = 0;
    }

    this.updateFenderScrape(dt);
    this.checkFailure(speed);
  }

  updateFenderScrape(dt) {
    this.fenderScraping=false;this.scrapeIntensity=0;
    if(this.crashed||!this.grounded||!this.rearDown||this.frontDown||this.speed<1||Math.abs(this.roll)>.8){this.scrapeTime=0;return;}
    const tip=fenderTip(this.cfg),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch);
    const y=(tip.y-this.h)*cp+tip.z*sp,z=tip.z*cp-(tip.y-this.h)*sp;
    const pivot=this.cfg.rR-(this.cfg.rR-this.h)*cp+this.b*sp;
    const side=(y+pivot)*Math.sin(this.roll),sy=Math.sin(this.yaw),cy=Math.cos(this.yaw);
    const x=this.pos.x+z*sy+side*cy,wz=this.pos.z+z*cy-side*sy;
    const wy=this.pos.y+(y+pivot)*Math.cos(this.roll)-pivot;
    const ground=this.world.queryGround(x,wz,this.pos.y,{}),gap=wy-ground.y;
    if(gap>.025){this.scrapeTime=0;return;}
    const starting=this.scrapeTime===0;
    this.fenderScraping=true;this.scrapeTime+=dt;
    this.scrapeIntensity=clamp((.03-gap)*14,.15,1);
    this.scrapePoint={x,y:ground.y+.015,z:wz,surface:ground.surface};
    // Limited guard reaction and surface drag: a scrape can be saved with
    // rear brake, but the guard cannot hold an unlimited-power loop-out.
    this.pitchRate-=Math.min(3,Math.max(0,-gap)*70+Math.max(0,this.pitchRate)*1.5)*dt;
    const drag=Math.max(0,1-this.scrapeIntensity*.55*dt);
    this.vel.x*=drag;this.vel.z*=drag;this.vLong*=drag;this.vLat*=drag;
    if(starting)this.pushEvent('fenderScrape');
  }

  // -------------------------------------------------------------------------
  updatePitch(dt, input, ax, airborne, frontDown, rearDown, Nf, Nr, mu) {
    const m = this.m, cfg = this.cfg;
    const held = input.wheelie ? 1 : 0;
    const brakeAmt = clamp(Math.max(input.brake, input.rearBrake || 0), 0, 1);

    // How committed the rider is: creeps up while CTRL is held, so a long
    // wheelie drifts toward the balance point and demands real correction.
    this.wheelieHold = clamp(
      this.wheelieHold + (held ? dt * 0.62 : -dt * 2.6), 0, 1
    );

    if (airborne) {
      this.wheelieTrim = damp(this.wheelieTrim, 1, 10, dt);
      this.brakeTrim = damp(this.brakeTrim, 1, 10, dt);
      // Angular momentum exchanges with spinning wheels; CTRL alone cannot
      // continuously rotate the combined rider/bike system in free flight.
      const chassisInertia = m * (.22 * this.L * this.L + .15 * this.h * this.h);
      this.pitchRate += this.airWheelImpulse / chassisInertia;
      this.pitch += this.pitchRate * dt;
      this.airPitchTotal += this.pitchRate * dt;
      return;
    }

    const th = this.pitch;
    const cosT = Math.cos(th), sinT = Math.sin(th);
    const dCG = this.b * cosT - this.h * sinT;        // CG ahead of rear contact
    const hCG = this.b * sinT + this.h * cosT;        // CG above rear contact
    const dCGf = this.a * cosT + this.h * sinT;       // CG behind front contact
    const hCGf = this.h * cosT - this.a * sinT;

    // ---- rider balance ---------------------------------------------------
    // Wheelies are held by an actual rider: a limited-authority controller that
    // aims for a target angle. It saturates, so past the balance point gravity
    // wins and the bike loops out.
    const speedFade = 1 - smoothstep(clamp((Math.abs(this.vLong) - 26) / 42, 0, 1));
    const targetPitch = held
      ? (0.43 + 0.30 * input.throttle + 0.43 * this.wheelieHold) * speedFade
        - brakeAmt * 0.85
      : -brakeAmt * 0.09;
    // Weight shift is asymmetric: once the rider is committed back over the
    // rear wheel they cannot snap forward again, which is what makes a deep
    // wheelie a real point of no return.
    const authUp = m * G * 0.50 * cfg.wheelieEase *
      (held ? (0.32 + 0.68 * input.throttle) : 0.9);
    const authDown = authUp * (1 - 0.78 * this.wheelieHold * held) + brakeAmt * m * G * 0.30;
    let riderTorque = m * (14.5 * (targetPitch - th) - 6.4 * this.pitchRate);
    riderTorque = clamp(riderTorque, -authDown, authUp);
    this.wheelieTarget = targetPitch;

    // Structural damping: the rider's arms and body soak up the lift rate, so
    // the front end rises over about a second instead of snapping vertical.
    const damping = -this.pitchRate * (held ? 2.5 : 3.6) * m;

    if (this.pitch >= 0) {
      // Pivot: rear contact patch. Required front load to keep pitch at 0.
      const inertial = m * ax * hCG;
      const gravity = -m * G * dCG;
      const netNoFront = inertial + gravity + riderTorque;
      const NfRequired = -netNoFront / Math.max(this.L * cosT, 0.2);

      if (this.pitch <= 1e-4 && NfRequired >= 0) {
        this.pitch = 0;
        this.pitchRate = Math.max(0, this.pitchRate * 0.2);
      } else {
        this.pitchRate += ((netNoFront + damping) / this.Iyy) * dt;
        this.pitch += this.pitchRate * dt;
        if (this.pitch < 0) {
          const impact = -this.pitchRate;
          this.pitch = 0;
          this.pitchRate = 0;
          this.suspFv += impact * 0.35;
          if (impact > 1.4) this.pushEvent('frontSlam', impact);
        }
      }
    } else {
      // Pivot: front contact patch (stoppie).
      const inertial = m * ax * hCGf;
      const gravity = m * G * dCGf;
      const netNoRear = inertial + gravity + riderTorque * 0.82;
      const NrRequired = netNoRear / Math.max(this.L * cosT, 0.2);
      if (this.pitch >= -1e-4 && NrRequired >= 0) {
        this.pitch = 0;
        this.pitchRate = Math.min(0, this.pitchRate * 0.2);
      } else {
        this.pitchRate += ((netNoRear + damping * 0.8) / (this.Iyy * 0.9)) * dt;
        this.pitch += this.pitchRate * dt;
        if (this.pitch > 0) {
          this.suspRv += this.pitchRate * .35;
          this.pitch = 0; this.pitchRate = 0;
        }
      }
    }

    // Entry into a stoppie from flat under hard front braking.
    if (this.pitch === 0 && this.pitchRate === 0) {
      const NrRequired =
        (m * ax * this.h + m * G * this.a + riderTorque * 0.82) / Math.max(this.L, 0.2);
      if (NrRequired < -25 && this.vLong > 4) {
        this.pitchRate = -0.32;
        this.pitch = -0.001;
      }
    }

    // Rider's throttle discipline for the next step: back off hard once the
    // wheelie climbs past what they were aiming for, restore it as it settles.
    const over = clamp((this.pitch - targetPitch) / 0.30, 0, 1);
    const wantTrim = held ? 1 - (0.65 - 0.38 * this.wheelieHold) * over : 1;
    this.wheelieTrim = damp(this.wheelieTrim, wantTrim, 16, dt);

    // Matching discipline on the front brake as the rear end lifts.
    const under = clamp((-0.16 - this.pitch) / 0.26, 0, 1);
    this.brakeTrim = damp(this.brakeTrim, 1 - 0.82 * under, 20, dt);

    this.pitch = clamp(this.pitch, -0.75, 1.86);
    this.pitchRate = clamp(this.pitchRate, -9, 9);
    void Nf; void Nr; void mu; void frontDown; void rearDown;
  }

  // -------------------------------------------------------------------------
  updateRoll(dt, input, aLat, airborne, speed) {
    if (airborne) {
      // A held turn over a jump should make a bounded bank correction, not
      // command an endless barrel roll as soon as the tyres leave the ramp.
      const correction=clamp((input.steer*.55-this.roll)*3-this.rollRate*1.4,-2,2);
      this.rollRate=clamp(this.rollRate+correction*dt,-1.8,1.8);
      this.roll += this.rollRate * dt;
      this.airRoll += this.rollRate * dt;
      this.roll = clamp(this.roll, -2.6, 2.6);
      return;
    }

    // Inverted-pendulum lean with a rider stabiliser.
    const h = this.h;
    const eqLean = Math.atan2(aLat, G);
    // Small stylistic trim only — the lean angle itself has to stay honest to
    // the cornering force, or the bike would be falling over at the apex.
    const trim = input.steer * 0.05 * smoothstep(clamp(speed / 12, 0, 1));
    const target = clamp(lerp(eqLean + trim, this.wheelieLeanTarget ?? eqLean,
      this.wheelieTurnBlend || 0), -1.15, 1.15);

    // The rider balances the rear contact with a damped weight shift. Preserve
    // enough damping at high pitch instead of amplifying every lean correction.
    const wheelieFactor = 1 - clamp((this.pitch - (this.groundPitch || 0)) / 1.1, 0, 1) * 0.30;
    const speedFactor = 0.55 + 0.45 * smoothstep(clamp(speed / 9, 0, 1));
    const kp = 118 * wheelieFactor * speedFactor;
    const kd = 2 * Math.sqrt(kp);

    const err = target - this.roll;
    const riderTorque = kp * err - kd * this.rollRate;
    const gravTorque = (G * Math.sin(this.roll) - aLat * Math.cos(this.roll)) / h;
    this.rollRate += (gravTorque * (1-(this.wheelieTurnBlend || 0)) + riderTorque) * dt;
    this.rollRate = clamp(this.rollRate, -7, 7);
    this.roll += this.rollRate * dt;
    this.roll = clamp(this.roll, -1.5, 1.5);
  }

  // -------------------------------------------------------------------------
  updateVertical(dt, airborne, frontDown, rearDown, gF, gR, input) {
    const cfg = this.cfg;
    if (airborne) {
      this.vel.y -= G * dt;
      this.vel.y -= (this.kDragAir * this.vel.y * Math.abs(this.vel.y) / this.m) * dt;
      this.pos.y += this.vel.y * dt;
      this.airTime += dt;
      if (!this.jumpStart) {
        this.jumpStart = { x: this.pos.x, z: this.pos.z, t: 0, speed: this.speed };
        this.airRoll = 0; this.airPitchTotal = 0;
      }
      // Suspension extends in the air.
      this.updateSuspension(dt,0,0);
      return;
    }

    // Landing detection
    if (this.airTime > 0.14) this.handleLanding(gF, gR, rearDown);
    else if (this.airTime > 0) { this.airTime = 0; this.jumpStart = null; }

    // Centre-of-mass height that puts the relevant wheel(s) exactly on the
    // ground, inverting the axle geometry used for contact detection above.
    const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
    const fy = gF.y + cfg.rF - (cfg.rF - this.h) * cosP - this.a * sinP;
    const ry = gR.y + cfg.rR - (cfg.rR - this.h) * cosP + this.b * sinP;
    let targetY;
    if (frontDown && rearDown) targetY = (fy * this.b + ry * this.a) / this.L;
    else if (rearDown) targetY = ry;
    else targetY = fy;

    // Suspension: the chassis lags the wheel target, giving spring + damping.
    const err = targetY - this.pos.y;
    const stiff = 190, dampC = 21;
    // Damping is relative to the moving road target. Damping against zero
    // vertical speed makes the chassis lag downhill until both tyres lift.
    const n = this.groundNormal;
    const roadVy = -(n.x * this.vel.x + n.z * this.vel.z) / Math.max(n.y, 0.3);
    this.vel.y += (err * stiff - (this.vel.y - roadVy) * dampC) * dt;
    this.vel.y = clamp(this.vel.y, -28, 18);
    this.pos.y += this.vel.y * dt;
    if (this.pos.y < targetY - 0.55) { this.pos.y = targetY - 0.55; this.vel.y = Math.max(this.vel.y, 0); }

    // Visual suspension travel from load + chassis error.
    const staticF = 0.055, staticR = 0.07;
    const loadF = clamp((this.Nf / (this.m * G)) * 0.19, 0, 0.30);
    const loadR = clamp((this.Nr / (this.m * G)) * 0.24, 0, 0.34);
    const tf = clamp(staticF + loadF - err * 0.55, 0, 0.30);
    const tr = clamp(staticR + loadR - err * 0.55, 0, 0.34);
    this.updateSuspension(dt,tf,tr);
    void input;
  }

  updateSuspension(dt, frontTarget, rearTarget) {
    // Damped springs consume touchdown impulses; previously these velocities
    // were written on impact but never used by the suspension animation.
    for(const [position,velocity,target,limit,k] of [
      ['suspF','suspFv',frontTarget,.30,240],['suspR','suspRv',rearTarget,.34,200]]){
      this[velocity]+=((target-this[position])*k-this[velocity]*2*Math.sqrt(k))*dt;
      this[position]+=this[velocity]*dt;
      if(this[position]<0){this[position]=0;this[velocity]=Math.max(0,this[velocity]);}
      if(this[position]>limit){this[position]=limit;this[velocity]=Math.min(0,this[velocity]);}
    }
  }

  handleLanding(gF, gR, rearDown = this.rearDown) {
    this.lastAirTime = this.airTime;
    const jump = this.jumpStart;
    const dist = jump ? Math.hypot(this.pos.x - jump.x, this.pos.z - jump.z) : 0;
    // Impact is velocity INTO the contacted plane. Descending along a
    // downslope is not a hard landing, and an uphill face can hit hard even
    // with little vertical speed. Use the wheel that actually touched first.
    const n = rearDown ? gR : gF;
    const normalVelocity = this.vel.x*n.nx + this.vel.y*n.ny + this.vel.z*n.nz;
    this.impactSpeed = Math.max(0, -normalVelocity);

    // Landing quality: pitch/roll mismatch against the ground and vertical speed.
    const slopePitch = -(n.nx * Math.sin(this.yaw) + n.nz * Math.cos(this.yaw)) / Math.max(n.ny, 0.3);
    const pitchErr = Math.abs(this.pitch - Math.atan(slopePitch));
    const rollErr = Math.abs(this.roll);

    let bad = 0;
    if (this.impactSpeed > 13) bad += (this.impactSpeed - 13) / 9;
    if (pitchErr > 0.62) bad += (pitchErr - 0.62) * 1.5;
    if (rollErr > 0.95) bad += (rollErr - 0.95) * 2.2;

    this.pushEvent('land', {
      airTime: this.airTime, dist, impact: this.impactSpeed, bad,
      airRoll: this.airRoll, airPitch: this.airPitchTotal,
    });

    if (bad > 1.0) {
      this.crash('Bad landing');
    } else {
      // Absorb normal motion while preserving the slope's tangent velocity.
      const scrub = clamp(bad * 0.35 + this.impactSpeed * 0.012, 0, 0.5);
      const rebound = this.impactSpeed*.06;
      this.vel.x=(this.vel.x-normalVelocity*n.nx)*(1-scrub)+rebound*n.nx;
      this.vel.y=(this.vel.y-normalVelocity*n.ny)*(1-scrub)+rebound*n.ny;
      this.vel.z=(this.vel.z-normalVelocity*n.nz)*(1-scrub)+rebound*n.nz;
      this.vLong=this.vel.x*Math.sin(this.yaw)+this.vel.z*Math.cos(this.yaw);
      this.vLat=this.vel.x*Math.cos(this.yaw)-this.vel.z*Math.sin(this.yaw);
      this.suspFv += this.impactSpeed * 0.25;
      this.suspRv += this.impactSpeed * 0.3;
      this.suspF = clamp(this.suspF + this.impactSpeed * 0.012, 0, 0.3);
      this.suspR = clamp(this.suspR + this.impactSpeed * 0.015, 0, 0.34);
      this.pitchRate *= 0.25;
      this.rollRate *= 0.4;
      // Never touch down with more lock than the tyres could hold.
      const landLock = Math.atan((this.rearGrip * G * this.L) /
        Math.max(this.vLong * this.vLong, 4)) * 1.4;
      this.steer = clamp(this.steer, -landLock, landLock);
      this.steerI = clamp(this.steerI, -landLock, landLock);
      if (this.impactSpeed > 5) this.lastLandingHard = this.impactSpeed;
    }
    this.airTime = 0;
    this.jumpStart = null;
  }

  // -------------------------------------------------------------------------
  resolveCollisions(dt, w = this.world, passes = 3) {
    const cfg = this.cfg, cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // Overlapping circles form a narrow, oriented bike silhouette. The old
    // 1.1 m-wide centre circle missed both tyres and caught empty space beside
    // the bike. Separate bar tips also respect obstacles above wheel height.
    const rear = -this.b - cfg.rR + .16, front = this.a + cfg.rF - .16;
    const count = Math.ceil((front - rear) / .28);
    let best = null;
    const probe = (side, z, bottom, height, radius) => {
      const along = z * cp + (this.h - bottom) * sp;
      const y = this.pos.y + (bottom - this.h) * cp + z * sp;
      const hit = w.collideCircle(this.pos.x + sy * along + cy * side,
        this.pos.z + cy * along - sy * side, y, radius, this._col, height);
      if (hit.hit && (!best || hit.depth > best.depth)) best = { ...hit };
    };
    for (let i = 0; i <= count; i++) {
      const z = lerp(rear, front, i / count), middle = z > -this.b + .25 && z < this.a - .25;
      probe(0, z, .06, middle ? cfg.seatH : 2 * (z > 0 ? cfg.rF : cfg.rR), middle ? .23 : .16);
    }
    for (const side of [-1, 1]) {
      const x = side * cfg.barWidth * .5;
      probe(x * Math.cos(this.steer), this.a - .34 - x * Math.sin(this.steer), cfg.seatH + .05, .15, .06);
    }
    if (!best) return;
    const c = best;
    this.pos.x += c.nx * c.depth;
    this.pos.z += c.nz * c.depth;
    const vn = this.vel.x * c.nx + this.vel.z * c.nz;
    if (vn < 0) {
      const bounce = Math.min(c.obstacle?.bounce ?? .15, .08);
      const impact = -vn;
      this.vel.x -= (1 + bounce) * vn * c.nx;
      this.vel.z -= (1 + bounce) * vn * c.nz;
      // Recompute body-frame velocity after the impulse.
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      this.vLong = this.vel.x * sy + this.vel.z * cy;
      this.vLat = this.vel.x * cy - this.vel.z * sy;
      this.pushEvent('bump', impact);
      const kind = c.obstacle && c.obstacle.kind;
      const threshold = kind === 'rail' ? 15 : kind === 'tree' || kind === 'pole' ? 8 : 9.5;
      if (impact > threshold) this.crash('Collision');
      else {
        // The contact impulse removes inward speed; preserve tangential
        // motion so a light brush slides along a wall instead of grabbing it.
        this.rollRate += clamp((c.nx * cy - c.nz * sy) * impact * .06, -.35, .35);
      }
    }
    if (passes > 1) this.resolveCollisions(dt, w, passes - 1);
  }

  collideVehicle(vehicle, dt, reason = 'Hit traffic') {
    if (this.crashed) return;
    const size = vehicle.type || { w: 1.95, l: 4.8, h: 1.45 };
    if (Math.hypot(this.pos.x-vehicle.x,this.pos.z-vehicle.z) > size.l/2 + this.L + 1) return;
    const sin = Math.sin(vehicle.yaw), cos = Math.cos(vehicle.yaw);
    const vx = sin * vehicle.speed, vz = cos * vehicle.speed;
    let touched = false;
    const obstacle = { bounce: 0, kind: 'car' };
    const collider = { collideCircle: (x,z,y,r,out={},height=1.6) => {
      out.hit=false;
      if (y > vehicle.y + size.h || y + height < vehicle.y) return out;
      const dx=x-vehicle.x,dz=z-vehicle.z;
      const lx=dx*cos-dz*sin,lz=dx*sin+dz*cos;
      let nx=lx-clamp(lx,-size.w/2,size.w/2),nz=lz-clamp(lz,-size.l/2,size.l/2);
      let distance=Math.hypot(nx,nz),depth=r-distance;
      if (distance>=r) return out;
      if(distance<1e-6){
        const side=size.w/2-Math.abs(lx),end=size.l/2-Math.abs(lz);
        nx=side<end?(Math.sign(lx)||1):0;nz=side<end?0:(Math.sign(lz)||1);
        depth=r+Math.min(side,end);distance=1;
      }
      touched=true;
      return Object.assign(out,{hit:true,depth,nx:(nx*cos+nz*sin)/distance,nz:(-nx*sin+nz*cos)/distance,obstacle});
    }};
    this.vel.x-=vx;this.vel.z-=vz;
    this.resolveCollisions(dt,collider);
    this.vel.x+=vx;this.vel.z+=vz;
    this.vLong=this.vel.x*Math.sin(this.yaw)+this.vel.z*Math.cos(this.yaw);
    this.vLat=this.vel.x*Math.cos(this.yaw)-this.vel.z*Math.sin(this.yaw);
    if(touched){vehicle.speed=0;if(this.crashed)this.crashReason=reason;}
  }

  // -------------------------------------------------------------------------
  checkFailure(speed) {
    if (this.crashed) return;
    if (this.grounded) {
      if (Math.abs(this.roll) > 1.12 && speed < 34) this.crash('Low side');
      else if (Math.abs(this.roll) > 1.34) this.crash('High side');
      else if (this.slideTimer > 1.5) this.crash('Lost the rear');
      const contactPitch = this.pitch - (this.groundPitch || 0);
      if (contactPitch > LOOP_OUT_ANGLE) this.crash('Looped out');
      if (contactPitch < -0.66) this.crash('Endo');
    }
    if (this.pos.y < -60) this.crash('Out of bounds');
  }

  crash(reason) {
    if (this.crashed) return;
    this.crashed = true;
    this.crashReason = reason;
    this.crashTimer = 0;
    this.crashSpin = {
      rx: (Math.random() - 0.5) * 6 + this.pitchRate,
      ry: (Math.random() - 0.5) * 5,
      rz: this.rollRate + sign(this.roll || 1) * 4.5,
    };
    this.pushEvent('crash', reason);
  }

  stepCrashed(dt) {
    this.crashTimer += dt;
    const w = this.world;
    // Tumble and slide to a halt.
    this.vel.y -= G * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    const g = w.queryGround(this.pos.x, this.pos.z, this.pos.y, this._g);
    const floor = g.y + 0.36;
    if (this.pos.y <= floor) {
      this.pos.y = floor;
      if (this.vel.y < 0) this.vel.y = -this.vel.y * 0.22;
      const f = Math.exp(-3.4 * dt);
      this.vel.x *= f; this.vel.z *= f;
      this.crashSpin.rx *= Math.exp(-4 * dt);
      this.crashSpin.ry *= Math.exp(-3 * dt);
      this.crashSpin.rz *= Math.exp(-4 * dt);
    }
    this.pitch += this.crashSpin.rx * dt;
    this.yaw += this.crashSpin.ry * dt;
    this.roll += this.crashSpin.rz * dt;
    this.omegaR = damp(this.omegaR, 0, 1.4, dt);
    this.omegaF = damp(this.omegaF, 0, 1.4, dt);
    this.wheelAngleF += this.omegaF * dt;
    this.wheelAngleR += this.omegaR * dt;
    this.vLong = Math.hypot(this.vel.x, this.vel.z);
    this.resolveCollisions(dt);
  }
}
