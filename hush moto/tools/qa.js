/* eslint-disable no-console */
// tools/qa.js — headless QA harness for Hush Moto.
//
// Not loaded by the game. Inject it from the devtools console:
//   var s=document.createElement('script'); s.src='tools/qa.js'; document.head.appendChild(s);
// then run e.g. `QA.all()` or `QA.wheelie('lbx')`.
//
// It drives Bike.step() directly at a fixed 240 Hz, so results are deterministic
// and independent of frame rate or requestAnimationFrame.

(function () {
  const g = window.__game;
  if (!g) { console.error('QA: game not ready'); return; }
  const DT = 1 / 240;
  const deg = (r) => +(r * 57.2958).toFixed(1);
  const f1 = (v) => +v.toFixed(1);
  const f2 = (v) => +v.toFixed(2);

  const QA = {
    DT,
    ctrl(o) {
      return Object.assign(
        { steer: 0, throttle: 0, brake: 0, rearBrake: 0, wheelie: false, boost: false, reverse: false },
        o
      );
    },

    noCollide(on) {
      if (on && !this._rc) {
        this._rc = g.world.collideCircle.bind(g.world);
        g.world.collideCircle = (x, z, y, r, out) => {
          out = out || {};
          out.hit = false; out.depth = 0; out.nx = 0; out.nz = 0;
          return out;
        };
      } else if (!on && this._rc) {
        g.world.collideCircle = this._rc;
        this._rc = null;
      }
    },

    /** Replace the world with an infinite flat asphalt plane (pure physics). */
    flat(on) {
      if (on && !this._qg) {
        this._qg = g.world.queryGround.bind(g.world);
        g.world.queryGround = (x, z, fromY, out) => {
          out = out || {};
          out.y = 0; out.nx = 0; out.ny = 1; out.nz = 0;
          out.surface = 2; out.platform = null;
          return out;
        };
        this.noCollide(true);
      } else if (!on && this._qg) {
        g.world.queryGround = this._qg;
        this._qg = null;
        this.noCollide(false);
      }
    },

    /** Steady-state cornering on the flat plane: hold full lock and settle. */
    grip(id, kmh) {
      this.use(id); this.flat(true);
      const b = g.bike;
      this.place(0, 0, 0, kmh);
      let latSum = 0, n = 0, rollSum = 0, yawSum = 0, slipMax = 0;
      this.sim(8, (t) => this.ctrl({ steer: 1, throttle: 0.18 }), (bb, t) => {
        if (t > 4 && !bb.crashed) {
          latSum += bb.vLong * bb.yawRate; rollSum += bb.roll; yawSum += bb.yawRate; n++;
          slipMax = Math.max(slipMax, bb.lateralSlip);
        }
        return !bb.crashed;
      });
      const latG = n ? latSum / n / 9.81 : null;
      const r = { bike: id, kmh, mu: f2(b.rearGrip) };
      if (n) {
        r.steadyLatG = f2(latG);
        r.leanDeg = deg(rollSum / n);
        r.idealLeanDeg = deg(Math.atan(latG));
        r.radiusM = f1(b.speed / Math.max(Math.abs(yawSum / n), 0.001));
        r.slip = f2(slipMax);
        r.gripUsedPct = f1((Math.abs(latG) / b.rearGrip) * 100);
      }
      r.crashed = b.crashed; r.reason = b.crashReason;
      this.flat(false);
      return r;
    },

    use(id) { g.bike.setConfig(id); return g.bike; },

    spawn(name) {
      const sp = g.world.spawnPoints.find((s) => s.name === name) || g.world.spawnPoints[0];
      g.bike.reset(sp);
      return sp;
    },

    /** Place the bike on flat-ish road heading +Z with a given speed. */
    place(x, z, yaw, kmh) {
      const b = g.bike;
      b.reset({ x, z, yaw, y: g.world.terrainHeight(x, z) });
      const v = (kmh || 0) / 3.6;
      b.vLong = v;
      b.vel.x = Math.sin(yaw) * v;
      b.vel.z = Math.cos(yaw) * v;
      b.omegaR = v / b.cfg.rR;
      b.omegaF = v / b.cfg.rF;
      if (b.cfg.gears) {
        for (let i = 0; i < b.gearCount; i++) {
          b.gear = i;
          if (b.omegaR * 9.5493 * b.cfg.gears[i] * b.finalDrive < b.cfg.redline * 0.9) break;
        }
      }
      // Settle onto the ground so tests never start mid-air.
      const keep = this.ctrl({});
      for (let i = 0; i < 120; i++) { b.step(DT, keep); b.events.length = 0; }
      b.vLong = v;
      b.vel.x = Math.sin(b.yaw) * v;
      b.vel.z = Math.cos(b.yaw) * v;
      b.distance = 0;
      return b;
    },

    sim(sec, ctrl, cb) {
      const b = g.bike;
      const n = Math.round(sec / DT);
      for (let i = 0; i < n; i++) {
        const c = typeof ctrl === 'function' ? ctrl(i * DT, b) : ctrl;
        b.step(DT, c);
        const keepGoing = !cb || cb(b, i * DT) !== false;
        b.events.length = 0;
        if (!keepGoing) return b;
      }
      return b;
    },

    bad() {
      const b = g.bike;
      const v = [b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y, b.vel.z,
        b.yaw, b.pitch, b.roll, b.omegaR, b.omegaF, b.vLong, b.vLat,
        b.suspF, b.suspR, b.yawRate, b.pitchRate, b.rollRate];
      return v.some((x) => !Number.isFinite(x));
    },

    // -----------------------------------------------------------------------
    perf(id) {
      this.use(id); this.noCollide(true);
      this.place(0, -60, 0, 0);
      const b = g.bike;
      let t60 = null, t100 = null, t200 = null;
      this.sim(45, this.ctrl({ throttle: 1 }), (bb, t) => {
        bb.pos.x = 0; bb.pos.z = -60; bb.vel.x = 0;
        if (!t60 && bb.kmh >= 60) t60 = f2(t);
        if (!t100 && bb.kmh >= 100) t100 = f2(t);
        if (!t200 && bb.kmh >= 200) t200 = f2(t);
      });
      const top = f1(b.kmh);
      // braking from top speed
      this.place(0, -60, 0, top);
      let dist = 0, stopT = null;
      this.sim(12, this.ctrl({ brake: 1 }), (bb, t) => {
        dist += Math.abs(bb.vLong) * DT;
        bb.pos.x = 0; bb.pos.z = -60; bb.vel.x = 0;
        if (!stopT && bb.kmh < 5) { stopT = f2(t); return false; }
        return true;
      });
      this.noCollide(false);
      return {
        bike: id, top, spec: Math.round(b.cfg.topSpeed * 3.6),
        t0_60: t60, t0_100: t100, t0_200: t200,
        brakeSec: stopT, brakeM: f1(dist),
        brakeG: stopT ? f2((top - 5) / 3.6 / stopT / 9.81) : null,
        minPitchDeg: null, nan: this.bad(),
      };
    },

    // -----------------------------------------------------------------------
    wheelie(id) {
      this.use(id); this.noCollide(true);
      const b = g.bike;
      const pin = (bb) => { bb.pos.x = 0; bb.pos.z = -60; bb.vel.x = 0; };
      const out = { bike: id };

      // 1. Launch wheelie from a standstill.
      this.place(0, -60, 0, 0);
      let maxP = 0, liftT = null;
      this.sim(6, this.ctrl({ throttle: 1, wheelie: true }), (bb, t) => {
        pin(bb);
        if (!bb.crashed) maxP = Math.max(maxP, bb.pitch);
        if (!liftT && bb.pitch > 0.12) liftT = f2(t);
      });
      out.launch = { liftAt: liftT, maxDeg: deg(maxP), crashed: b.crashed, reason: b.crashReason };

      // 2. Hold a rolling wheelie for 10 s at a steady cruise.
      this.place(0, -60, 0, Math.min(55, b.cfg.topSpeed * 3.6 * 0.5));
      let mn = 9, mx = -9, crashAt = null, held = 0;
      this.sim(10, this.ctrl({ throttle: 0.72, wheelie: true }), (bb, t) => {
        pin(bb);
        if (bb.crashed) { if (crashAt === null) crashAt = f2(t); return false; }
        mn = Math.min(mn, bb.pitch); mx = Math.max(mx, bb.pitch);
        if (bb.pitch > 0.2) held += DT;
        return true;
      });
      out.hold = { rangeDeg: [deg(mn), deg(mx)], heldSec: f2(held), crashAt, reason: b.crashReason };

      // 3. Release: does the front come back down on its own?
      if (!b.crashed) {
        const from = b.pitch;
        this.sim(2.5, this.ctrl({ throttle: 0.4 }), pin);
        out.release = { fromDeg: deg(from), toDeg: deg(b.pitch) };
      }

      // 4. Rear brake should bring the nose down mid-wheelie.
      this.place(0, -60, 0, 45);
      this.sim(1.4, this.ctrl({ throttle: 0.8, wheelie: true }), pin);
      const beforeBrake = b.pitch;
      this.sim(1.0, this.ctrl({ throttle: 0.5, wheelie: true, rearBrake: 1 }), pin);
      out.brakeDown = { fromDeg: deg(beforeBrake), toDeg: deg(b.pitch) };

      // 5. Push past the balance point -> must loop out.
      this.place(0, -60, 0, 25);
      this.sim(9, this.ctrl({ throttle: 1, wheelie: true }), (bb) => { pin(bb); return !bb.crashed; });
      out.loopOut = { crashed: b.crashed, reason: b.crashReason };

      this.noCollide(false);
      return out;
    },

    // -----------------------------------------------------------------------
    stoppie(id) {
      this.use(id); this.noCollide(true);
      this.place(0, -60, 0, 80);
      const b = g.bike;
      let minP = 0;
      this.sim(4, this.ctrl({ brake: 1 }), (bb) => {
        bb.pos.x = 0; bb.pos.z = -60; bb.vel.x = 0;
        if (!bb.crashed) minP = Math.min(minP, bb.pitch);
        return !bb.crashed;
      });
      this.noCollide(false);
      return { bike: id, minDeg: deg(minP), crashed: b.crashed, reason: b.crashReason };
    },

    // -----------------------------------------------------------------------
    corner(id, kmh) {
      this.use(id);
      this.noCollide(true);
      this.place(0, -300, 0, kmh);
      const b = g.bike;
      let maxRoll = 0, maxYawRate = 0, minSpeed = 999;
      this.sim(6, this.ctrl({ throttle: 0.42, steer: 1 }), (bb) => {
        maxRoll = Math.max(maxRoll, Math.abs(bb.roll));
        maxYawRate = Math.max(maxYawRate, Math.abs(bb.yawRate));
        minSpeed = Math.min(minSpeed, bb.kmh);
        return !bb.crashed;
      });
      const radius = maxYawRate > 0.01 ? (b.speed / maxYawRate) : Infinity;
      this.noCollide(false);
      return {
        bike: id, entry: kmh, maxRollDeg: deg(maxRoll),
        maxYawRate: f2(maxYawRate), turnRadiusM: f1(Math.min(radius, 9999)),
        exitKmh: f1(b.kmh), crashed: b.crashed, reason: b.crashReason, nan: this.bad(),
      };
    },

    // -----------------------------------------------------------------------
    /** Ride into the stunt-park kicker and measure the jump. */
    jump(id) {
      this.use(id);
      this.place(210 + 46, -210 - 34, -Math.PI / 2, 0);
      const b = g.bike;
      let maxY = -99, airTime = 0, landed = false, land = null, startY = b.pos.y;
      b.events.length = 0;
      this.sim(9, this.ctrl({ throttle: 1 }), (bb) => {
        for (const e of bb.events) if (e.type === 'land' && !landed) { landed = true; land = e.data; }
        bb.events.length = 0;
        if (!bb.grounded) airTime += DT;
        maxY = Math.max(maxY, bb.pos.y);
        return !bb.crashed;
      });
      return {
        bike: id, approachOk: true, airSec: f2(airTime), peakRise: f2(maxY - startY),
        landed, landDist: land ? f1(land.dist) : null, landBad: land ? f2(land.bad) : null,
        crashed: b.crashed, reason: b.crashReason, nan: this.bad(),
      };
    },

    // -----------------------------------------------------------------------
    /** Long random-input soak: must never NaN, explode, or leave the map. */
    soak(seconds, seed) {
      let s = seed || 1;
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      this.spawn('Downtown');
      const b = g.bike;
      let c = this.ctrl({ throttle: 1 });
      let worstY = 0, maxSpeed = 0, crashes = 0, nanAt = null, offMap = 0;
      let lastCrashed = false;
      this.sim(seconds, (t) => {
        if (Math.floor(t * 2) !== Math.floor((t - DT) * 2)) {
          c = this.ctrl({
            throttle: rnd() < 0.72 ? 1 : 0,
            brake: rnd() < 0.18 ? 1 : 0,
            rearBrake: rnd() < 0.12 ? 1 : 0,
            steer: rnd() * 2 - 1,
            wheelie: rnd() < 0.34,
            boost: rnd() < 0.3,
          });
        }
        return c;
      }, (bb, t) => {
        if (nanAt === null && this.bad()) { nanAt = f2(t); return false; }
        if (bb.crashed && !lastCrashed) crashes++;
        if (bb.crashed && bb.crashTimer > 2.6) { g.respawnBike(false); }
        lastCrashed = bb.crashed;
        maxSpeed = Math.max(maxSpeed, bb.kmh);
        worstY = Math.min(worstY, bb.pos.y);
        if (Math.abs(bb.pos.x) > 520 || Math.abs(bb.pos.z) > 520) offMap++;
        return true;
      });
      return {
        bike: g.bikeId, seconds, crashes, maxKmh: f1(maxSpeed),
        lowestY: f1(worstY), offMapFrames: offMap, nanAt, ok: nanAt === null && offMap === 0,
      };
    },

    // -----------------------------------------------------------------------
    /** Ground-query consistency across the whole map. */
    worldScan() {
      const w = g.world;
      let minH = 1e9, maxH = -1e9, nan = 0, steep = 0, n = 0;
      const out = {};
      for (let x = -500; x <= 500; x += 7) {
        for (let z = -500; z <= 500; z += 7) {
          const q = w.queryGround(x, z, 200, {});
          if (!Number.isFinite(q.y) || !Number.isFinite(q.ny)) nan++;
          minH = Math.min(minH, q.y); maxH = Math.max(maxH, q.y);
          if (q.ny < 0.55) steep++;
          n++;
        }
      }
      out.samples = n; out.minY = f1(minH); out.maxY = f1(maxH);
      out.nanSamples = nan; out.steepSamples = steep;
      out.steepPct = f2((steep / n) * 100);
      return out;
    },

    /** Are all spawn points clear of obstacles and on drivable ground? */
    spawnCheck() {
      const w = g.world;
      return w.spawnPoints.map((sp) => {
        const q = w.queryGround(sp.x, sp.z, sp.y + 5, {});
        const c = w.collideCircle(sp.x, sp.z, q.y + 0.4, 0.8, {});
        return { name: sp.name, y: f2(q.y), surf: q.surface, blocked: c.hit, slope: f2(q.ny) };
      });
    },

    /** Drive the whole game loop and audit the traffic system. */
    traffic(seconds) {
      const g0 = window.__game;
      g0.paused = false;
      const t = g0.traffic;
      const before = t.cars.map((c) => ({ x: c.x, z: c.z }));
      let stuck = 0, overlaps = 0, offRoad = 0, maxSpeed = 0, stopped = 0;
      const frames = Math.round(seconds * 60);
      for (let i = 0; i < frames; i++) g0.frame(1 / 60);
      for (let i = 0; i < t.cars.length; i++) {
        const c = t.cars[i];
        const moved = Math.hypot(c.x - before[i].x, c.z - before[i].z);
        if (moved < 1.5) stuck++;
        if (c.speed < 0.6) stopped++;
        maxSpeed = Math.max(maxSpeed, c.speed);
        if (g0.world.roadWeight(c.x, c.z) < 0.4) offRoad++;
        for (let j = i + 1; j < t.cars.length; j++) {
          const o = t.cars[j];
          const d = Math.hypot(c.x - o.x, c.z - o.z);
          if (d < (c.type.l + o.type.l) * 0.32) overlaps++;
        }
      }
      g0.paused = true;
      return {
        cars: t.cars.length, seconds, stuck, stoppedNow: stopped,
        overlaps, offRoad, maxKmh: f1(maxSpeed * 3.6),
        peds: t.peds.mesh.count,
      };
    },

    /** Every ramp's rendered surface must match its collision surface. */
    ramps() {
      const w = g.world;
      const bad = [];
      for (const s of w.surfaces) {
        for (const t of [0.1, 0.35, 0.65, 0.9]) {
          for (const vf of [-0.3, 0.3]) {
            const u = -s.len / 2 + s.len * t;
            const v = s.wid * vf;
            // world point from the surface's own local frame
            const x = s.cx + u * Math.cos(s.yaw) - v * Math.sin(s.yaw);
            const z = s.cz + u * Math.sin(s.yaw) + v * Math.cos(s.yaw);
            const h = w.surfaceHeightAt(s, x, z);
            const expect = s.kind === 'flat'
              ? s.base + s.y0
              : s.base + s.y0 + (s.y1 - s.y0) * (s.curve !== 1 ? Math.pow(t, s.curve) : t);
            if (h === null || Math.abs(h - expect) > 0.02) {
              bad.push({ cx: s.cx, cz: s.cz, t, got: h === null ? null : f2(h), want: f2(expect) });
            }
          }
        }
      }
      return { surfaces: w.surfaces.length, mismatches: bad.length, sample: bad.slice(0, 4) };
    },

    all(bikes) {
      const ids = bikes || ['lbx', 'ultrabee', 'starkvarg', 'crf450r', 'superduke', 'r1', 'bobber'];
      const r = { perf: [], wheelie: [], stoppie: [], corner: [], jump: [] };
      for (const id of ids) {
        r.perf.push(this.perf(id));
        r.wheelie.push(this.wheelie(id));
        r.stoppie.push(this.stoppie(id));
        r.corner.push(this.corner(id, 60));
        r.jump.push(this.jump(id));
      }
      r.world = this.worldScan();
      r.spawns = this.spawnCheck();
      return r;
    },
  };

  /** Take the frame loop away from rAF so stepping is deterministic. */
  QA.drive = function (on) { g.externalDrive = on !== false; };
  /** Run N seconds of the FULL game loop at a fixed step. */
  QA.frames = function (seconds, keysDown) {
    QA.drive(true);
    if (keysDown) for (const k of keysDown) g.input.down.add(k);
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) g.frame(1 / 60);
    if (keysDown) for (const k of keysDown) g.input.down.delete(k);
    return g.bike;
  };

  window.QA = QA;
  g.paused = true;
  g.externalDrive = true;
  console.log('QA ready');
})();
