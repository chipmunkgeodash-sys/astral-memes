// input.js — rebindable keyboard input with smoothed analogue axes.

import { clamp, approach, storage } from './core.js';

export const DEFAULT_BINDINGS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['Space'],
  rearBrake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  wheelie: ['ShiftLeft', 'ShiftRight'],
  boost: ['ControlLeft', 'ControlRight'],
  reset: ['KeyR'],
  camera: ['KeyC'],
  pause: ['Escape'],
  lookBack: ['KeyB'],
  horn: ['KeyH'],
  nextBike: ['KeyN'],
  lab: ['KeyU'], charge: ['KeyE'], cruise: ['KeyT'], headlight: ['KeyJ'], photo: ['KeyP'],
  trick1:['Digit1'], trick2:['Digit2'], trick3:['Digit3'], trick4:['Digit4'], trick5:['Digit5'],
  map: ['KeyM'],
  freeLook: ['KeyL'],
};

export const ACTION_LABELS = {
  throttle: 'Accelerate',
  brake: 'Brake (front+rear)',
  rearBrake: 'Rear brake / reverse',
  left: 'Lean / steer left',
  right: 'Lean / steer right',
  wheelie: 'Wheelie (hold)',
  boost: 'Boost',
  reset: 'Reset bike',
  camera: 'Change camera',
  pause: 'Pause',
  lookBack: 'Look back',
  horn: 'Horn',
  nextBike: 'Next bike',
  lab:'Ride Lab', charge:'Refuel / charge / disconnect', cruise:'Toggle cruise control', headlight:'Toggle headlight', photo:'Photo mode',
  trick1:'One hand',trick2:'No hands',trick3:'One footer',trick4:'Nac nac (air)',trick5:'Superman (air)',
  map: 'Toggle map',
  freeLook: 'Lock mouse for free look',
};

export class Input {
  constructor() {
    this.bindings = this.load();
    this.down = new Set();
    this.pressed = new Set();
    this.axes = { steer: 0, throttle: 0, brake: 0 };
    this.capture = null;       // pending rebind: action name
    this.onCaptureDone = null;
    this.enabled = true;

    // Free look: hold a mouse button (or lock the pointer) and move the mouse.
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.looking = false;
    this.lookIdle = 0;
    this.lookSensitivity = storage.num('hushmoto.looksens', 1);
    this.invertLean = storage.bool('hushmoto.invertlean', true);
    this.invertLook = storage.bool('hushmoto.invertlook', false);

    this._keydown = (e) => {
      if (e.code !== 'Escape' && !this.capture && e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (this.capture) {
        e.preventDefault();
        if (e.code !== 'Escape') {
          this.bindings[this.capture] = [e.code];
          this.save();
        }
        const a = this.capture;
        this.capture = null;
        this.onCaptureDone && this.onCaptureDone(a);
        return;
      }
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      // Stop the page scrolling / browser shortcuts stealing gameplay keys.
      if (this.isGameKey(e.code)) e.preventDefault();
    };
    this._keyup = (e) => { this.down.delete(e.code); };
    this._blur = () => { this.down.clear(); };
    window.addEventListener('keydown', this._keydown, { passive: false });
    window.addEventListener('keyup', this._keyup);
    window.addEventListener('blur', this._blur);

    const canvas = document.getElementById('gl');
    this._mousedown = (e) => {
      if (!this.enabled) return;
      if (e.target !== canvas) return;
      this.looking = true;
      this.lookIdle = 0;
      e.preventDefault();
    };
    this._mouseup = () => { this.looking = false; };
    this._mousemove = (e) => {
      const locked = document.pointerLockElement === canvas;
      if (!this.enabled || (!this.looking && !locked)) return;
      const s = 0.0032 * this.lookSensitivity;
      this.lookYaw = clamp(this.lookYaw - e.movementX * s, -2.7, 2.7);
      const inv = this.invertLook ? -1 : 1;
      this.lookPitch = clamp(this.lookPitch - e.movementY * s * inv, -0.75, 0.85);
      this.lookIdle = 0;
    };
    this._ctxmenu = (e) => { if (e.target === canvas) e.preventDefault(); };
    window.addEventListener('mousedown', this._mousedown);
    window.addEventListener('mouseup', this._mouseup);
    window.addEventListener('mousemove', this._mousemove);
    window.addEventListener('contextmenu', this._ctxmenu);
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
  }

  togglePointerLock() {
    const canvas = document.getElementById('gl');
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    else if (canvas.requestPointerLock) canvas.requestPointerLock();
  }

  /** Free-look angles, recentring smoothly once the player stops looking. */
  updateLook(dt) {
    const locked = document.pointerLockElement === document.getElementById('gl');
    if (this.looking || locked) { this.lookIdle = 0; return; }
    this.lookIdle += dt;
    if (this.lookIdle > 0.35) {
      const k = 1 - Math.exp(-5.5 * dt);
      this.lookYaw -= this.lookYaw * k;
      this.lookPitch -= this.lookPitch * k;
      if (Math.abs(this.lookYaw) < 0.002) this.lookYaw = 0;
      if (Math.abs(this.lookPitch) < 0.002) this.lookPitch = 0;
    }
  }

  isGameKey(code) {
    for (const k of Object.keys(this.bindings)) {
      if (this.bindings[k].includes(code)) return true;
    }
    return code === 'Tab';
  }

  load() {
    try {
      const raw = storage.get('hushmoto.bindings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if(JSON.stringify(parsed.wheelie)===JSON.stringify(['ControlLeft','ControlRight'])&&
          JSON.stringify(parsed.boost)===JSON.stringify(['ShiftLeft','ShiftRight'])){
          parsed.wheelie=DEFAULT_BINDINGS.wheelie.slice();parsed.boost=DEFAULT_BINDINGS.boost.slice();
        }
        const out = {};
        for (const k of Object.keys(DEFAULT_BINDINGS)) {
          out[k] = Array.isArray(parsed[k]) && parsed[k].length ? parsed[k] : DEFAULT_BINDINGS[k].slice();
        }
        return out;
      }
    } catch { /* fall through to defaults */ }
    const out = {};
    for (const k of Object.keys(DEFAULT_BINDINGS)) out[k] = DEFAULT_BINDINGS[k].slice();
    return out;
  }

  save() {
    storage.set('hushmoto.bindings', JSON.stringify(this.bindings));
  }

  resetBindings() {
    for (const k of Object.keys(DEFAULT_BINDINGS)) this.bindings[k] = DEFAULT_BINDINGS[k].slice();
    this.save();
  }

  beginCapture(action, cb) {
    this.capture = action;
    this.onCaptureDone = cb;
  }

  isDown(action) {
    if (!this.enabled) return false;
    const codes = this.bindings[action];
    for (let i = 0; i < codes.length; i++) if (this.down.has(codes[i])) return true;
    return false;
  }

  wasPressed(action) {
    const codes = this.bindings[action];
    for (let i = 0; i < codes.length; i++) {
      if (this.pressed.has(codes[i])) return true;
    }
    return false;
  }

  endFrame() { this.pressed.clear(); }

  /** Build the smoothed control state consumed by the physics step. */
  sample(dt, allowDrive) {
    const a = this.axes;
    let want = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    if (this.invertLean) want = -want;
    // Fast to apply, faster to release — keeps steering crisp but forgiving.
    const rate = want === 0 ? 7.5 : 5.2;
    a.steer = approach(a.steer, want, rate * dt);

    const thr = allowDrive && this.isDown('throttle') ? 1 : 0;
    // Motor response is smoothed once inside the fixed physics step. A
    // second keyboard ramp made short wheelie corrections arrive too late.
    a.throttle = thr;

    const br = allowDrive && this.isDown('brake') ? 1 : 0;
    a.brake = approach(a.brake, br, (br ? 7 : 9) * dt);

    const rear = allowDrive && this.isDown('rearBrake') ? 1 : 0;
    a.rearBrake = approach(a.rearBrake ?? 0, rear, 8 * dt);

    return {
      steer: clamp(a.steer, -1, 1),
      throttle: clamp(a.throttle, 0, 1),
      brake: clamp(a.brake, 0, 1),
      rearBrake: clamp(a.rearBrake, 0, 1),
      wheelie: allowDrive && this.isDown('wheelie'),
      boost: allowDrive && this.isDown('boost'),
      reverse: allowDrive && this.isDown('rearBrake'),
    };
  }

  keyLabel(code) {
    if (!code) return '—';
    return code
      .replace('Key', '')
      .replace('Digit', '')
      .replace('Arrow', '')
      .replace('Left', ' L')
      .replace('Right', ' R')
      .replace('Control', 'Ctrl')
      .replace('Space', 'SPACE')
      .replace('Escape', 'ESC');
  }
}
