import * as THREE from 'three';
import { clamp } from './core.js';

export const GAME_MODES = [
  { id: 'tag', name: 'Tag', description: 'Catch the moving beacon or a crew rider before the clock runs out.', color: 0xffcf52 },
  { id: 'checkpoint', name: 'Checkpoint Rush', description: 'Chain city gates quickly and keep the streak alive.', color: 0x39d98a },
  { id: 'time-trial', name: 'Time Trial', description: 'Beat a three-minute route while the clock chases you.', color: 0x5fd2ff },
  { id: 'stunt', name: 'Stunt Score Attack', description: 'Bank the biggest combo before the five-minute round ends.', color: 0xff7ad9 },
  { id: 'fuel-run', name: 'Fuel Run', description: 'Reach both orange fuel stations before the tank runs dry.', color: 0xff9b52 },
  { id: 'cops', name: 'Cops & Riders', description: 'Escape a pursuit and finish the round without getting busted.', color: 0x6fa7ff },
  { id: 'slalom', name: 'Slalom Sprint', description: 'Thread six gates with clean lines and no crashes.', color: 0xb5f35a },
  { id: 'delivery', name: 'Courier Dash', description: 'Ride a package across town and return before time expires.', color: 0xffa86e },
  { id: 'night', name: 'Night Ride', description: 'A low-light free ride with the headlight and neon on.', color: 0x9c8cff },
  { id: 'practice', name: 'Corner Practice', description: 'Learn smooth throttle, countersteer and lean through a calm route.', color: 0x8ce9d6 },
];

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class GameModes {
  constructor(game) {
    this.game = game; this.definitions = GAME_MODES; this.mode = null; this.time = 0; this.score = 0; this.progress = 0; this.message = '';
    this.goal = null; this.targets = []; this._next = 0; this._lastScore = 0;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5, .18, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffcf52, transparent: true, opacity: .94 }));
    ring.rotation.x = Math.PI / 2; ring.visible = false; game.scene.add(ring); this.ring = ring;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 11, 8), new THREE.MeshBasicMaterial({ color: 0xffcf52, transparent: true, opacity: .22 }));
    beam.visible = false; game.scene.add(beam); this.beam = beam;
  }
  definition() { return GAME_MODES.find((m) => m.id === this.mode); }
  randomGoal(seed = this._next++) {
    const s = this.game.world.spawnPoints[(seed * 3 + 2) % this.game.world.spawnPoints.length] || { x: 0, z: 0 };
    const angle = (seed * 2.399) % (Math.PI * 2), radius = 35 + (seed % 5) * 22;
    const x = clamp(s.x + Math.sin(angle) * radius, -420, 420), z = clamp(s.z + Math.cos(angle) * radius, -420, 420);
    return { x, z, y: this.game.world.terrainHeight(x, z) + .2 };
  }
  start(id) {
    if (!GAME_MODES.some((m) => m.id === id)) return;
    this.mode = id; this.time = id === 'time-trial' ? 180 : id === 'stunt' ? 300 : id === 'tag' ? 180 : 240; this.score = 0; this.progress = 0; this.message = `${this.definition().name} started`;
    this._next = 1; this._lastScore = this.game.stunts?.score || 0;
    this.game.startRide();
    this.game.ui.showHint(this.message, 2600);
    this.goal = this.randomGoal(0);
    if (id === 'night') { this.game.rideLab.prefs.cycle = true; this.game.rideLab.prefs.headlight = true; this.game.rideLab.prefs.glow = true; this.game.rideLab.applyPreferences(); }
    this.ring.material.color.set(this.definition().color); this.beam.material.color.set(this.definition().color); this.ring.visible = true; this.beam.visible = true;
    this.hud ||= Object.assign(document.createElement('div'), { id: 'mode-hud' });
    if (!this.hud.parentNode) document.getElementById('hud')?.append(this.hud);
    this.hud.hidden = false;
  }
  stop(reason = 'Mode ended') { this.game.ui.showHint(`${reason} · score ${Math.round(this.score)}`, 3500); this.mode = null; this.goal = null; this.ring.visible = false; this.beam.visible = false; if (this.hud) this.hud.hidden = true; }
  update(dt) {
    if (!this.mode || this.game.paused) return;
    const bike = this.game.bike; this.time -= dt;
    if (bike.crashed && this.mode === 'tag') this.score = Math.max(0, this.score - 40);
    if (this.mode === 'tag') this.updateTag(dt, bike);
    else if (this.mode === 'checkpoint') { if (this.game.checkpoints.streak > this.progress) { this.progress = this.game.checkpoints.streak; this.score += 100; } }
    else if (this.mode === 'stunt') { const delta = this.game.stunts.score - this._lastScore; if (delta > 0) this.score += delta; this._lastScore = this.game.stunts.score; }
    else if (this.mode === 'fuel-run') { this.score += dt * (bike.cfg.kind === 'gas' ? 1 : .25); }
    else if (this.mode === 'cops') { if (this.game.police.status === 'search' || this.game.police.status === 'clear') this.score += dt * 5; if (this.game.police.busted) return this.stop('Busted'); }
    else if (this.mode === 'slalom' || this.mode === 'delivery') { if (this.game.rideLab?.slalom?.done || this.game.rideLab?.delivery?.done) { this.progress += 1; this.score += 250; } }
    else if (this.mode === 'practice') { this.score += Math.max(0, bike.speed * dt * (1 - clamp(Math.abs(bike.lateralSlip), 0, 1))); }
    if (this.mode !== 'tag' && this.goal && distance(bike.pos, this.goal) < 6 && bike.speed > .7) {
      this.progress += 1; this.score += 150; this.message = `${this.definition().name} · ${this.progress} gates`;
      this.game.ui.showHint(this.message, 1200); this.goal = this.randomGoal(this._next++);
    }
    if (bike.crashed && this.mode !== 'cops') this.message = 'Recover and keep riding';
    if (this.time <= 0) this.stop(this.mode === 'stunt' ? 'Round complete' : 'Time up');
    this.ring.rotation.z += dt * 1.7; if (this.goal) { this.ring.position.set(this.goal.x, this.goal.y, this.goal.z); this.beam.position.set(this.goal.x, this.goal.y + 5.5, this.goal.z); }
    if (this.hud) this.hud.textContent = `${this.definition().name} · ${Math.max(0, this.time).toFixed(0)}s · ${Math.round(this.score)} pts · ${this.progress} gates`;
  }
  updateTag(dt, bike) {
    const remotes = [...(this.game.multiplayer?.remotes?.values() || [])];
    const remote = remotes.sort((a, b) => distance(a.state.pos, bike.pos) - distance(b.state.pos, bike.pos))[0];
    if (remote) this.goal = { x: remote.state.pos.x, y: remote.state.pos.y, z: remote.state.pos.z };
    if (!this.goal) this.goal = this.randomGoal(this._next);
    if (distance(bike.pos, this.goal) < 5.5 && bike.speed > 1) { this.score += 500; this.progress += 1; this.message = `Tagged! ${this.progress} catch${this.progress === 1 ? '' : 'es'}`; this.game.ui.showHint(this.message, 1800); this.goal = this.randomGoal(this._next++); }
    else if (!remote) { const angle = Math.atan2(this.goal.x - bike.pos.x, this.goal.z - bike.pos.z); const drift = dt * (2.0 + (this._next % 3) * .4); this.goal.x += Math.sin(angle + .8) * drift; this.goal.z += Math.cos(angle + .8) * drift; this.goal.y = this.game.world.terrainHeight(this.goal.x, this.goal.z) + .2; }
  }
}
