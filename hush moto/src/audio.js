// audio.js — fully synthesised engine, tyre, wind, impact and ambience audio.
// No external sample files: everything is generated with the Web Audio API.

import { clamp, lerp } from './core.js';

function noiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = white * 0.7 + last * 3.5;
  }
  return buf;
}

export class GameAudio {
  constructor() {
    this.ready = false;
    this.enabled = true;
    this.masterVolume = 0.75;
    this.ctx = null;
    this.kind = 'electric';
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 2.5);

    this.master = ctx.createGain();
    this.master.gain.value = this.masterVolume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 22;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // ---- engine bus ----
    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 1400;
    this.engineFilter.Q.value = 0.9;
    this.engineBus.connect(this.engineFilter);
    this.engineFilter.connect(this.master);

    // Oscillator stack: fundamental + harmonics for combustion, whine for electric.
    this.oscs = [];
    const specs = [
      { type: 'sawtooth', mul: 0.5, gain: 0.34, detune: 0 },
      { type: 'sawtooth', mul: 1.0, gain: 0.30, detune: 6 },
      { type: 'square', mul: 2.0, gain: 0.12, detune: -7 },
      { type: 'sawtooth', mul: 3.0, gain: 0.07, detune: 11 },
    ];
    for (const s of specs) {
      const o = ctx.createOscillator();
      o.type = s.type;
      o.frequency.value = 60;
      o.detune.value = s.detune;
      const g = ctx.createGain();
      g.gain.value = s.gain;
      o.connect(g); g.connect(this.engineBus);
      o.start();
      this.oscs.push({ o, g, mul: s.mul, base: s.gain });
    }
    // Electric whine layer
    this.whine = ctx.createOscillator();
    this.whine.type = 'triangle';
    this.whine.frequency.value = 400;
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain);
    this.whineGain.connect(this.engineBus);
    this.whine.start();

    this.whine2 = ctx.createOscillator();
    this.whine2.type = 'sawtooth';
    this.whine2.frequency.value = 800;
    this.whine2Gain = ctx.createGain();
    this.whine2Gain.gain.value = 0;
    this.whine2.connect(this.whine2Gain);
    this.whine2Gain.connect(this.engineBus);
    this.whine2.start();

    // Intake / combustion roughness
    this.engNoise = ctx.createBufferSource();
    this.engNoise.buffer = this.noise;
    this.engNoise.loop = true;
    this.engNoiseFilter = ctx.createBiquadFilter();
    this.engNoiseFilter.type = 'bandpass';
    this.engNoiseFilter.frequency.value = 320;
    this.engNoiseFilter.Q.value = 1.4;
    this.engNoiseGain = ctx.createGain();
    this.engNoiseGain.gain.value = 0;
    this.engNoise.connect(this.engNoiseFilter);
    this.engNoiseFilter.connect(this.engNoiseGain);
    this.engNoiseGain.connect(this.engineBus);
    this.engNoise.start();

    // ---- wind ----
    this.wind = ctx.createBufferSource();
    this.wind.buffer = this.noise;
    this.wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.wind.start();

    // ---- tyre / skid ----
    this.skid = ctx.createBufferSource();
    this.skid.buffer = this.noise;
    this.skid.loop = true;
    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1600;
    this.skidFilter.Q.value = 5.5;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skid.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.master);
    this.skid.start();
    this.scrape=ctx.createBufferSource();this.scrape.buffer=this.noise;this.scrape.loop=true;
    this.scrapeFilter=ctx.createBiquadFilter();this.scrapeFilter.type='highpass';this.scrapeFilter.frequency.value=1900;
    this.scrapeGain=ctx.createGain();this.scrapeGain.gain.value=0;
    this.scrape.connect(this.scrapeFilter);this.scrapeFilter.connect(this.scrapeGain);this.scrapeGain.connect(this.master);this.scrape.start();

    // ---- rolling tyre noise ----
    this.roll = ctx.createBufferSource();
    this.roll.buffer = this.noise;
    this.roll.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass';
    this.rollFilter.frequency.value = 700;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    this.roll.connect(this.rollFilter);
    this.rollFilter.connect(this.rollGain);
    this.rollGain.connect(this.master);
    this.roll.start();

    // ---- city ambience ----
    this.amb = ctx.createBufferSource();
    this.amb.buffer = this.noise;
    this.amb.loop = true;
    this.ambFilter = ctx.createBiquadFilter();
    this.ambFilter.type = 'lowpass';
    this.ambFilter.frequency.value = 260;
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0.0;
    this.amb.connect(this.ambFilter);
    this.ambFilter.connect(this.ambGain);
    this.ambGain.connect(this.master);
    this.amb.start();

    this.siren = ctx.createOscillator();this.siren.type = 'triangle';
    this.sirenGain = ctx.createGain();this.sirenGain.gain.value = 0;
    this.sirenPan = ctx.createStereoPanner();
    this.siren.connect(this.sirenGain);this.sirenGain.connect(this.sirenPan);this.sirenPan.connect(this.master);this.siren.start();
    this.ready = true;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.masterVolume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.enabled ? this.masterVolume : 0;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.masterVolume : 0;
  }

  setBike(cfg) {
    this.kind = cfg.kind;
    this.cfg = cfg;
    if (!this.ready) return;
    const electric = cfg.kind === 'electric';
    for (const s of this.oscs) s.g.gain.value = electric ? s.base * 0.12 : s.base;
    this.whineGain.gain.value = 0;
    this.whine2Gain.gain.value = 0;
    this.engineFilter.frequency.value = electric ? 2600 : 1500;
  }

  /** Called every frame with the live bike state. */
  updatePolice(police, bike, paused) {
    if (!this.ready) return;
    let nearest = null, distance = Infinity;
    for (const u of police.units) {
      const d = Math.hypot(u.x - bike.pos.x, u.z - bike.pos.z);
      if (d < distance) { distance = d;nearest = u; }
    }
    const audible = police.enabled && police.level > 0 && !paused;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(audible ? 0.16 / (1 + (distance / 40) ** 2) : 0, t, 0.12);
    this.siren.frequency.setTargetAtTime(650 + 410 * (0.5 + 0.5 * Math.sin(police.time * (distance < 35 ? 9 : 3))), t, 0.025);
    if (nearest) this.sirenPan.pan.setTargetAtTime(clamp(((nearest.x - bike.pos.x) * Math.cos(bike.yaw) -
      (nearest.z - bike.pos.z) * Math.sin(bike.yaw)) / Math.max(distance, 1), -0.9, 0.9), t, 0.08);
  }

  /** Called every frame with the live bike state. */
  update(dt, bike, paused) {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const k = 0.06;
    const setT = (param, v) => param.setTargetAtTime(v, t, k);

    if (paused) {
      setT(this.engineBus.gain, 0);
      setT(this.windGain.gain, 0);
      setT(this.skidGain.gain, 0);
      setT(this.scrapeGain.gain,0);
      setT(this.rollGain.gain, 0);
      setT(this.ambGain.gain, 0);
      return;
    }

    const cfg = bike.cfg;
    const speed = bike.speed;
    setT(this.scrapeGain.gain,bike.fenderScraping&&!bike.crashed?bike.scrapeIntensity*.18:0);
    const load = bike.engineLoad;

    if (cfg.kind === 'electric') {
      // Motor whine tracks wheel speed; a light PWM buzz adds texture.
      const wheelHz = Math.abs(bike.omegaR) / (2 * Math.PI);
      const f = clamp(90 + wheelHz * 52, 70, 2100);
      setT(this.whine.frequency, f);
      setT(this.whine2.frequency, f * 2.02);
      const lvl = clamp(0.12 + load * 0.5 + clamp(speed / 30, 0, 1) * 0.35, 0, 1);
      setT(this.whineGain.gain, lvl * 0.30);
      setT(this.whine2Gain.gain, lvl * 0.13 * (0.4 + load * 0.6));
      for (const s of this.oscs) {
        setT(s.o.frequency, clamp(f * 0.5 * s.mul, 20, 4000));
        setT(s.g.gain, s.base * 0.10 * (0.4 + load));
      }
      setT(this.engNoiseFilter.frequency, clamp(300 + f * 0.6, 200, 3000));
      setT(this.engNoiseGain.gain, 0.035 * (0.3 + load) + clamp(Math.abs(bike.rearSlip), 0, 1) * 0.04);
      setT(this.engineFilter.frequency, clamp(1500 + f * 1.4, 900, 7000));
      setT(this.engineBus.gain, clamp(0.10 + lvl * 0.5, 0, 0.75) * 0.7);
    } else {
      const rpm = bike.rpm;
      const f = clamp((rpm / 60) * 1.0, 22, 560); // firing-order fundamental
      for (const s of this.oscs) {
        setT(s.o.frequency, clamp(f * s.mul, 18, 7000));
        setT(s.g.gain, s.base * (0.45 + load * 0.55));
      }
      setT(this.whineGain.gain, 0);
      setT(this.whine2Gain.gain, 0);
      setT(this.engNoiseFilter.frequency, clamp(180 + f * 2.2, 150, 4200));
      setT(this.engNoiseGain.gain, 0.05 + load * 0.10);
      const bright = clamp(700 + (rpm / cfg.redline) * 3600 + load * 1400, 500, 7000);
      setT(this.engineFilter.frequency, bright);
      const lvl = 0.14 + load * 0.42 + clamp(rpm / cfg.redline, 0, 1) * 0.26;
      setT(this.engineBus.gain, clamp(lvl, 0, 0.9) * 0.62);
    }

    // Wind noise rises steeply with speed.
    const sp = clamp(speed / 55, 0, 1.4);
    setT(this.windGain.gain, sp * sp * 0.33);
    setT(this.windFilter.frequency, 320 + sp * 1500);

    // Rolling tyres
    const rolling = bike.grounded && !bike.crashed ? clamp(speed / 28, 0, 1) : 0;
    setT(this.rollGain.gain, rolling * 0.10 * (bike.surface >= 2 ? 1 : 1.6));
    setT(this.rollFilter.frequency, 380 + rolling * 900);

    // Skid / scrub
    const slip = clamp(
      (Math.abs(bike.rearSlip) - 0.14) * 1.1 + (bike.lateralSlip - 0.2) * 1.2, 0, 1.4
    );
    const skidding = bike.grounded && speed > 2 && bike.surface >= 2 ? slip : slip * 0.35;
    setT(this.skidGain.gain, clamp(skidding, 0, 1) * 0.22 + (bike.crashed ? 0.16 : 0));
    setT(this.skidFilter.frequency, 1100 + clamp(speed / 30, 0, 1) * 1400 + (bike.crashed ? -400 : 0));

    // City ambience fades in near roads.
    setT(this.ambGain.gain, 0.05);
  }

  // ---- one-shots -----------------------------------------------------------
  _env(node, peak, attack, decay) {
    const t = this.ctx.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  thud(strength = 1, pitch = 90) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(pitch * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(pitch * 0.55, t + 0.18);
    const g = ctx.createGain();
    o.connect(g); g.connect(this.master);
    this._env(g, clamp(strength, 0, 1) * 0.55, 0.006, 0.26);
    o.start(t); o.stop(t + 0.4);

    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 480;
    const ng = ctx.createGain();
    n.connect(nf); nf.connect(ng); ng.connect(this.master);
    this._env(ng, clamp(strength, 0, 1) * 0.30, 0.004, 0.16);
    n.start(t); n.stop(t + 0.3);
  }

  crash(strength = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.thud(clamp(strength, 0.3, 1), 70);
    // Metallic clang: detuned square partials with fast decay.
    const freqs = [523, 784, 1174, 1568, 2093];
    for (let i = 0; i < freqs.length; i++) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = freqs[i] * (0.94 + Math.random() * 0.12);
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freqs[i]; f.Q.value = 9;
      o.connect(f); f.connect(g); g.connect(this.master);
      const t0 = t + i * 0.012;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.10 * strength / (1 + i * 0.5), t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5 + i * 0.1);
      o.start(t0); o.stop(t0 + 0.9);
    }
    // Scrape
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const nf = ctx.createBiquadFilter();
    nf.type = 'highpass'; nf.frequency.value = 1800;
    const ng = ctx.createGain();
    n.connect(nf); nf.connect(ng); ng.connect(this.master);
    this._env(ng, 0.22 * strength, 0.01, 0.7);
    n.start(t); n.stop(t + 1.0);
  }

  blip(freq = 880, dur = 0.09, vol = 0.14, type = 'square') {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    o.connect(g); g.connect(this.master);
    this._env(g, vol, 0.005, dur);
    o.start(t); o.stop(t + dur + 0.06);
  }

  shift(dir) {
    if (!this.ready) return;
    // Quick throttle cut + a mechanical click.
    this.blip(dir > 0 ? 420 : 320, 0.05, 0.07, 'square');
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 6;
    const g = ctx.createGain();
    n.connect(f); f.connect(g); g.connect(this.master);
    this._env(g, 0.10, 0.003, 0.05);
    n.start(t); n.stop(t + 0.12);
  }

  score(level = 0) {
    this.blip(600 + level * 110, 0.08, 0.10, 'triangle');
    setTimeout(() => this.blip(900 + level * 140, 0.07, 0.08, 'triangle'), 70);
  }
}

void lerp;
