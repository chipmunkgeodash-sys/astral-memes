// main.js — bootstrap, render loop, game state machine.

import * as THREE from 'three';
import { clamp, damp, lerp, makeRng, TAU, storage } from './core.js';
import { World } from './world.js';
import { Bike, BIKES } from './bikephysics.js';
import { BikeModel } from './bikemodel.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { CameraRig, CAMERA_MODES } from './camera.js';
import { StuntSystem } from './stunts.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { loadBuild } from './customization.js';
import { RideLab } from './ride-lab.js';
import { Multiplayer } from './multiplayer.js';
import { nearestRoad } from './roadnet.js';
import { GameModes } from './game-modes.js';

const PHYS_DT = 1 / 240;
// Cover the entire 250 ms frame cap, including 15/20 FPS rendering. With
// only ten steps the bike ran in slow motion while traffic used real time.
const MAX_SUBSTEPS = Math.ceil(0.25 / PHYS_DT);

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.canvas.tabIndex = 0;
    this.quality = storage.get('hushmoto.quality', 'high');
    this.state = 'menu';
    this.paused = true;
    this.assist = storage.bool('hushmoto.assist', true);
    this.bikeId = storage.get('hushmoto.bike', 'lbx');
    if (!BIKES.some((b) => b.id === this.bikeId)) this.bikeId = 'lbx';
    this.accum = 0;
    this.rng = makeRng(31337);
    this.events = [];
    this.lookBack = false;
    this.autoResetDelay = 2.6;
    this.externalDrive = false;
  }

  async boot() {
    const ui0 = document.getElementById('loading-text');
    // Yield to the browser between stages so the loading text repaints. The
    // timeout fallback keeps boot alive in a background tab, where rAF is idle.
    const step = (t) => new Promise((r) => {
      ui0.textContent = t;
      let done = false;
      const fire = () => { if (!done) { done = true; r(); } };
      requestAnimationFrame(() => requestAnimationFrame(fire));
      setTimeout(fire, 120);
    });

    await step('Starting renderer…');
    this.initRenderer();

    await step('Baking terrain…');
    this.world = new World(this.scene, this.quality);

    await step('Assembling motorcycles…');
    this.bike = new Bike(this.world, this.bikeId, loadBuild(this.bikeId));
    this.model = new BikeModel(this.bike.cfg);
    this.scene.add(this.model.root);
    await this.model.assetReady;

    await step('Spawning traffic…');
    const density = storage.get('hushmoto.traffic', 'normal');
    const counts = { low: [22, 30], normal: [46, 70], high: [70, 110] };
    const [cc, pc] = counts[density] || counts.normal;
    this.traffic = new Traffic(this.scene, this.world, cc, pc);
    this.police = new Police(this.scene, this.world, this.traffic);
    this.police.enabled = storage.bool('hushmoto.police', true);
    for (const unit of this.police.units) unit.root.visible = this.police.enabled;

    await step('Lighting the world…');
    this.effects = new Effects(this.scene);
    this.audio = new GameAudio();
    this.audio.setVolume(storage.num('hushmoto.vol', 0.75));
    this.cameraRig = new CameraRig(this.camera, this.world);
    this.stunts = new StuntSystem();
    this.input = new Input();
    this.checkpoints = new Checkpoints(this.scene, this.world);

    this.ui = new UI(this);
    this.multiplayer = new Multiplayer(this);
    this.rideLab = new RideLab(this);
    this.modes = new GameModes(this);
    this.ui.setBikeLabel(this.bike.cfg);
    this.ui.setCameraLabel(this.cameraRig.mode);
    this.setShadows(storage.bool('hushmoto.shadows', true));

    this.respawnBike(true);
    this.checkpoints.spawnNext(this.bike, this.rng);

    await step('Ready');
    this.ui.setLoading(null);
    this.ui.showMenu('start');
    const launchMode = new URLSearchParams(location.search).get('mode');
    if (launchMode === 'multiplayer') this.ui.showPanel('multiplayer');
    if (launchMode === 'solo') this.startRide();

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.setPaused(true);
    });
    const unlock = () => { this.audio.resume(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    this.last = performance.now();
    this.loop();
  }

  // -------------------------------------------------------------------------
  initRenderer() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality !== 'low',
      powerPreference: 'high-performance',
      stencil: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1 : 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const skyTop = new THREE.Color(0x6ea8e8);
    const skyBottom = new THREE.Color(0xcfe0ee);
    scene.background = makeSkyTexture(skyTop, skyBottom);
    // Metals need reflected sky as well as direct sunlight. Without an
    // environment map the aluminium frames and spokes render almost black.
    scene.environment = scene.background;
    scene.environmentIntensity = 0.65;
    scene.fog = new THREE.Fog(0xbcd2e4, 230, 1050);

    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.16, 2600);
    this.camera.position.set(0, 6, -12);

    const hemi = new THREE.HemisphereLight(0xc3d4e5, 0x62513d, 0.65);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffe8c9, 2.65);
    sun.position.set(-160, 220, 120);
    sun.castShadow = true;
    const S = 62;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 620;
    sun.shadow.mapSize.set(this.quality === 'low' ? 1024 : 2048, this.quality === 'low' ? 1024 : 2048);
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    // Sun disc for a bit of sky interest.
    const sunSprite = new THREE.Mesh(
      new THREE.SphereGeometry(30, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false })
    );
    sunSprite.position.set(-900, 1120, 660);
    scene.add(sunSprite);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => { if (o.isMesh) o.material.needsUpdate = true; });
  }

  applyQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'low' ? 1 : q === 'medium' ? 1.35 : 1.75));
    this.scene.fog.far = q === 'low' ? 620 : q === 'medium' ? 820 : 1050;
    this.sun.shadow.mapSize.set(q === 'low' ? 1024 : 2048, q === 'low' ? 1024 : 2048);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.ui.showHint(`Quality: ${q}`);
  }

  setTrafficDensity() {
    this.ui.showHint('Traffic density applies after reload');
  }

  // -------------------------------------------------------------------------
  selectBike(id, { reload = false } = {}) {
    if (this.bikeId === id && !reload) return this.model.assetReady;
    if (!BIKES.some(b => b.id === id)) return;
    this.bikeId = id;
    storage.set('hushmoto.bike', id);
    const keep = {
      x: this.bike.pos.x, z: this.bike.pos.z, y: this.bike.pos.y, yaw: this.bike.yaw,
    };
    this.scene.remove(this.model.root);
    this.model.cancelAssetLoad?.();
    disposeTree(this.model.root);
    this.bike.setConfig(id, loadBuild(id));
    this.model = new BikeModel(this.bike.cfg);
    this.scene.add(this.model.root);
    this.bike.reset(keep);
    this.audio.setBike(this.bike.cfg);
    this.ui.setBikeLabel(this.bike.cfg);
    this.ui.showHint(this.bike.cfg.name);
    this.model.update(this.bike, 0, this.cameraRig.mode);
    const model = this.model;
    if (model.assetStatus === 'loading') this.ui.setLoading(`Loading ${this.bike.cfg.name}…`);
    else this.ui.setLoading(null);
    return model.assetReady?.then(() => {
      if (this.model !== model || model.assetCancelled) return;
      model.update(this.bike, 0, this.cameraRig.mode);
      this.ui.setLoading(null);
      if (model.assetStatus === 'error') this.ui.showHint('Bike model could not load — built-in model active');
      else if (model.assetStatus === 'built-in') this.ui.showHint('Built-in bike active — add your private model in Garage');
    });
  }

  cycleBike() {
    const i = BIKES.findIndex((b) => b.id === this.bikeId);
    const next = BIKES[(i + 1) % BIKES.length];
    this.selectBike(next.id);
    this.ui.markSelectedBike(next.id);
  }

  respawnBike(initial) {
    const w = this.world;
    let spawn = w.spawnPoints[0];
    if (!initial) {
      // Prefer the nearest road so resets never drop you into a wall.
      const nr = nearestRoad(w.segs, this.bike.pos.x, this.bike.pos.z);
      if (nr.seg && nr.dist < 70) {
        const s = nr.seg;
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const len = Math.hypot(dx, dz) || 1;
        const t = clamp(
          ((this.bike.pos.x - s.ax) * dx + (this.bike.pos.z - s.az) * dz) / (len * len), 0.04, 0.96
        );
        const cx = s.ax + dx * t, cz = s.az + dz * t;
        // Face the way we were travelling.
        const fwd = Math.sin(this.bike.yaw) * (dx / len) + Math.cos(this.bike.yaw) * (dz / len);
        const dir = fwd >= 0 ? 1 : -1;
        const laneOff = s.half * 0.45;
        spawn = {
          x: cx + (dz / len) * laneOff * dir,
          z: cz - (dx / len) * laneOff * dir,
          yaw: Math.atan2((dx / len) * dir, (dz / len) * dir),
        };
        spawn.y = w.terrainHeight(spawn.x, spawn.z);
      } else {
        // Nearest spawn point.
        let best = null, bd = Infinity;
        for (const sp of w.spawnPoints) {
          const d = Math.hypot(sp.x - this.bike.pos.x, sp.z - this.bike.pos.z);
          if (d < bd) { bd = d; best = sp; }
        }
        spawn = best || w.spawnPoints[0];
      }
    }
    this.bike.reset(spawn);
    this.effects.clearMarks();
    this.cameraRig.initialised = false;
  }

  restart() {
    this.police.reset(6);
    this.stunts.reset(true);
    this.respawnBike(true);
    this.checkpoints.reset();
    this.checkpoints.spawnNext(this.bike, this.rng);
    this.ui.showHint('Ride reset');
  }

  startRide() {
    this.restart();
    this.setPaused(false);
  }

  setPaused(p) {
    this.paused = p;
    this.state = p ? 'menu' : 'playing';
    if (p) {
      this.ui.showMenu('pause');
      if (document.pointerLockElement) document.exitPointerLock();
      this.input.looking = false;
    }
    else {
      this.ui.hideMenu(); this.audio.resume(); this.audio.setBike(this.bike.cfg);
      this.canvas.focus({ preventScroll: true });
    }
    this.input.down.clear(); this.input.pressed.clear();
    this.input.enabled = !p;
  }

  // -------------------------------------------------------------------------
  loop = () => {
    requestAnimationFrame(this.loop);
    // tools/qa.js drives frame() itself; letting the rAF loop run at the same
    // time would double-step the simulation and make results non-deterministic.
    if (this.externalDrive) { this.last = performance.now(); return; }
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;   // after a tab switch, do not fast-forward
    this.frame(dt);
  };

  frame(dt) {
    const input = this.input;

    // --- global hotkeys (work paused or not) ---
    if (this.rideLab?.photo && input.wasPressed('pause')) { this.rideLab.exitPhoto(); input.endFrame(); return; }
    if (input.wasPressed('pause')) {
      if (this.ui.activePanel !== 'main' && this.paused) this.ui.showPanel('main');
      else this.setPaused(!this.paused);
    }
    if (input.wasPressed('map')) { const opened=this.paused && this.ui.activePanel === 'map'; this.setPaused(true); this.ui.showPanel(opened ? 'main' : 'map'); }
    if (!this.paused) {
      if (input.wasPressed('camera')) {
        this.cameraRig.setMode(this.cameraRig.mode + 1);
        this.ui.setCameraLabel(this.cameraRig.mode);
        this.ui.showHint(`Camera: ${CAMERA_MODES[this.cameraRig.mode]}`);
      }
      if (input.wasPressed('reset') && !this.police.busted) { this.respawnBike(false); this.stunts.loseCombo(); }
      if (input.wasPressed('nextBike') && !this.police.busted) this.cycleBike();
      if (input.wasPressed('horn')) this.audio.blip(392, 0.28, 0.16, 'square');
      if (input.wasPressed('freeLook')) {
        this.input.togglePointerLock();
        this.ui.showHint(document.pointerLockElement ? 'Free look locked — L to release' : 'Free look released');
      }
    }
    this.lookBack = input.isDown('lookBack');

    if (!this.paused) this.simulate(dt);

    // Camera + presentation still update while paused so menus look alive.
    input.updateLook(this.paused ? 0 : dt);
    this.cameraRig.update(this.paused ? 0.0001 : dt, this.bike, this.lookBack, {
      yaw: input.lookYaw, pitch: input.lookPitch,
    });
    this.model.update(this.bike, this.paused ? 0.0001 : dt, this.cameraRig.mode);
    this.multiplayer.update(dt);
    this.updateSunShadow();
    this.audio.update(dt, this.bike, this.paused);
    this.audio.updatePolice(this.police, this.bike, this.paused);
    this.ui.update(dt, this);
    this.checkpoints.updateVisual(dt, this.bike, this.ui);

    this.rideLab?.update(dt);
    this.modes?.update(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.paused && this.ui.activePanel === 'map') this.ui.drawCityMap();
    if (this.paused && this.ui.activePanel === 'garage') this.ui.showroom?.render(dt);
    input.endFrame();
  }

  simulate(dt) {
    // Switching models must not leave an invisible motorcycle moving through
    // traffic while its download/IndexedDB read is still pending.
    if (this.model.assetStatus === 'loading') return;
    const bike = this.bike;
    const allowDrive = !bike.crashed && !this.police.busted;

    // Rider assist gently damps the worst lean excursions for new players.
    if (this.assist && bike.grounded && !bike.crashed) {
      bike.roll = clamp(bike.roll, -1.05, 1.05);
    }

    this.accum += dt;
    let steps = 0;
    while (this.accum >= PHYS_DT && steps < MAX_SUBSTEPS) {
      let ctrl = this.input.sample(PHYS_DT, allowDrive && !bike.crashed);
      ctrl = this.rideLab?.beforeStep(ctrl,PHYS_DT,allowDrive) || ctrl;
      if (this.police.busted) { ctrl.throttle = 0;ctrl.brake = 1;ctrl.rearBrake = 1;ctrl.reverse = false; }
      bike.brakeLight = ctrl.brake > 0.05 || ctrl.rearBrake > 0.05;
      bike.step(PHYS_DT, ctrl);
      this.rideLab?.afterStep(PHYS_DT);
      this.accum -= PHYS_DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) this.accum = 0;   // drop the backlog, stay stable

    // Drain physics events.
    for (const ev of bike.events) {
      this.stunts.onEvent(ev, bike, this.audio);
      if (ev.type === 'land') {
        this.effects.onLand(bike, ev.data.impact);
        this.cameraRig.addShake(clamp(ev.data.impact / 16, 0, 0.9));
      } else if (ev.type === 'fenderScrape') {
        this.ui.showHint('FENDER SCRAPE · tap S to bring it back',1200);
      } else if (ev.type === 'crash') {
        this.effects.onCrash(bike);
        this.cameraRig.addShake(1.1);
      } else if (ev.type === 'bump') {
        this.cameraRig.addShake(clamp(ev.data / 22, 0, 0.6));
      }
    }
    bike.events.length = 0;

    // Traffic pushes its own events (near misses).
    this.events.length = 0;
    this.traffic.update(dt, bike, this.events);
    const policeEvent = this.police.update(dt, bike);
    if (policeEvent === 'busted') { this.stunts.loseCombo();this.ui.showHint('BUSTED — stay stopped', 4000); }
    if (policeEvent === 'escaped') this.ui.showHint('Pursuit lost. Keep it calm for a moment.', 4500);
    if (policeEvent === 'released') { this.respawnBike(false);this.ui.showHint('Released. Ride safely.', 4000); }
    for (const ev of this.events) this.stunts.onEvent(ev, bike, this.audio);

    this.world.update(dt);
    this.effects.update(dt, bike, this.model);
    this.stunts.update(dt, bike, this.audio);
    this.checkpoints.update(dt, bike, this.stunts, this.audio, this.rng);

    // Surface type alone does not shake the camera. Suspension follows the
    // terrain; actual landing/collision impulses above still provide feedback.

    // Auto-recover after a crash.
    if (bike.crashed) {
      if (bike.crashTimer > this.autoResetDelay && bike.speed < 3) this.respawnBike(false);
      else if (bike.crashTimer > 6) this.respawnBike(false);
    }
  }

  updateSunShadow() {
    const b = this.bike.pos;
    // Snap the shadow frustum to a grid to stop the map shimmering.
    const snap = 1.5;
    const tx = Math.round(b.x / snap) * snap;
    const tz = Math.round(b.z / snap) * snap;
    this.sun.position.set(tx - 90, b.y + 130, tz + 68);
    this.sun.target.position.set(tx, b.y, tz);
    this.sun.target.updateMatrixWorld();
  }
}

// ---------------------------------------------------------------------------
// Checkpoint gates — the free-ride objective loop.
// ---------------------------------------------------------------------------
class Checkpoints {
  constructor(scene, world) {
    this.world = world;
    this.streak = 0;
    this.timer = 0;
    this.active = null;
    this.spin = 0;

    const g = new THREE.TorusGeometry(4.6, 0.30, 8, 28);
    const m = new THREE.MeshStandardMaterial({
      color: 0x39d98a, emissive: 0x1d7a4c, roughness: 0.3, metalness: 0.2,
      transparent: true, opacity: 0.92,
    });
    this.ring = new THREE.Mesh(g, m);
    this.ring.castShadow = false;
    this.ring.visible = false;
    scene.add(this.ring);

    const bg = new THREE.CylinderGeometry(0.22, 0.22, 26, 6);
    const bm = new THREE.MeshBasicMaterial({ color: 0x39d98a, transparent: true, opacity: 0.20, depthWrite: false });
    this.beam = new THREE.Mesh(bg, bm);
    this.beam.visible = false;
    scene.add(this.beam);
  }

  reset() { this.streak = 0; this.timer = 0; }

  spawnNext(bike, rng) {
    const w = this.world;
    let best = null;
    for (let i = 0; i < 90; i++) {
      const ang = rng() * TAU;
      const dist = 110 + rng() * 210;
      const x = bike.pos.x + Math.cos(ang) * dist;
      const z = bike.pos.z + Math.sin(ang) * dist;
      if (Math.abs(x) > 460 || Math.abs(z) > 460) continue;
      if (w.roadWeight(x, z) < 0.6) continue;
      const y = w.terrainHeight(x, z);
      best = { x, y, z };
      break;
    }
    if (!best) {
      const sp = w.spawnPoints[(rng() * w.spawnPoints.length) | 0];
      best = { x: sp.x, y: sp.y, z: sp.z };
    }
    this.active = best;
    this.ring.position.set(best.x, best.y + 4.2, best.z);
    this.ring.visible = true;
    this.beam.position.set(best.x, best.y + 13, best.z);
    this.beam.visible = true;
  }

  update(dt, bike, stunts, audio, rng) {
    if (!this.active) return;
    if (this.streak > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        stunts.bannerText('RUN OVER', `${this.streak} gates`);
        this.streak = 0;
      }
    }
    const dx = bike.pos.x - this.active.x;
    const dz = bike.pos.z - this.active.z;
    const dy = bike.pos.y - (this.active.y + 4.2);
    const d = Math.hypot(dx, dz);
    if (d < 5.0 && Math.abs(dy) < 4.4 && !bike.crashed) {
      this.streak++;
      this.timer = Math.min(40, this.timer + 18);
      const pts = 260 + this.streak * 90;
      stunts.addTrick(`Gate ×${this.streak}`, pts, 'gate');
      stunts.popup(`GATE ×${this.streak}`, 'great');
      audio && audio.score(Math.min(4, this.streak));
      this.spawnNext(bike, rng);
    }
  }

  updateVisual(dt, bike, ui) {
    if (!this.active) return;
    this.spin += dt * 0.9;
    this.ring.rotation.set(0, this.spin, 0);
    const dx = this.active.x - bike.pos.x;
    const dz = this.active.z - bike.pos.z;
    const d = Math.hypot(dx, dz);
    // Ring faces the rider so it is always a target you can aim at.
    this.ring.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
    this.ring.rotation.z = Math.sin(this.spin * 2) * 0.03;
    const el = document.getElementById('gate');
    if (!el) return;
    el.classList.add('show');
    const ang = Math.atan2(dx, dz) - bike.yaw;
    document.getElementById('gate-arrow').style.transform = `rotate(${(ang * 180 / Math.PI).toFixed(1)}deg)`;
    document.getElementById('gate-dist').textContent = `${d.toFixed(0)}m`;
    const streakEl = document.getElementById('gate-streak');
    streakEl.textContent = this.streak > 0 ? `×${this.streak}  ${this.timer.toFixed(1)}s` : 'GATE';
    streakEl.classList.toggle('urgent', this.streak > 0 && this.timer < 5);
    void ui;
  }
}

// ---------------------------------------------------------------------------
function makeSkyTexture(top, bottom) {
  const c = document.createElement('canvas');
  // A 2:1 panorama is also a valid input for the renderer's environment
  // prefilter. The old four-pixel strip produced a one-pixel reflection map.
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, `#${top.getHexString()}`);
  grd.addColorStop(0.44, '#b7cddd');
  grd.addColorStop(0.50, `#${bottom.getHexString()}`);
  // The lower hemisphere reflects ground, giving metal a readable light/dark
  // transition instead of washing every aluminium component solid white.
  grd.addColorStop(0.54, '#777365');
  grd.addColorStop(1, '#302c28');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  const rng = makeRng(812);
  for (let i = 0; i < 45; i++) {
    const x = rng() * 1024, y = 40 + rng() * 145, w = 55 + rng() * 110;
    const cloud = g.createRadialGradient(x, y, 0, x, y, w);
    cloud.addColorStop(0, 'rgba(255,248,233,0.09)');cloud.addColorStop(1, 'rgba(255,255,255,0)');
    g.save();g.translate(0, y * 0.68);g.scale(1, 0.32);g.fillStyle = cloud;g.fillRect(x - w, y - w, w * 2, w * 2);g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function disposeTree(root) {
  const materials = new Set(), textures = new Set();
  root.traverse((o) => {
    if (o.isMesh) {
      o.geometry && o.geometry.dispose();
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) if (material) materials.add(material);
    }
  });
  for (const material of materials) { if (material.map) textures.add(material.map);material.dispose(); }
  for (const texture of textures) texture.dispose();
}

void lerp; void damp;

const game = new Game();
window.__game = game;
game.boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading-text');
  if (el) el.textContent = `Failed to start: ${err.message}`;
});
