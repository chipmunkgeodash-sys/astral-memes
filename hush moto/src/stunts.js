// stunts.js — trick detection, combo chaining and scoring.

import { clamp, TAU, storage } from './core.js';

const GRACE = 2.4;           // seconds a combo survives with no active trick
const MAX_MULT = 12;

export class StuntSystem {
  constructor() {
    this.score = 0;
    this.best = storage.num('hushmoto.best', 0);
    this.combo = [];          // [{ name, points, kind }]
    this.comboPoints = 0;
    this.comboTimer = 0;
    this.multiplier = 1;
    this.popups = [];
    this.banner = null;
    this.bannerTimer = 0;
    this.lastCombo = null;

    this.wheelieBest = 0;
    this.airBest = 0;
    this.jumpBest = 0;
    this.speedBest = 0;
    this.nearMisses = 0;
    this.crashes = 0;
    this.flips = 0;

    // live trick state
    this.wheelieT = 0;
    this.stoppieT = 0;
    this.driftT = 0;
    this.airT = 0;
    this.active = false;
  }

  reset(full) {
    this.combo.length = 0;
    this.comboPoints = 0;
    this.comboTimer = 0;
    this.multiplier = 1;
    this.wheelieT = this.stoppieT = this.driftT = this.airT = 0;
    if (full) {
      this.score = 0;
      this.wheelieBest = this.airBest = this.jumpBest = this.speedBest = 0;
      this.nearMisses = this.crashes = this.flips = 0;
    }
  }

  addTrick(name, points, kind) {
    const existing = this.combo.find((c) => c.kind === kind);
    if (existing) {
      existing.points += points;
      existing.name = name;
    } else {
      this.combo.push({ name, points, kind });
    }
    this.comboPoints += points;
    this.comboTimer = GRACE;
    this.recalcMultiplier();
  }

  recalcMultiplier() {
    const unique = new Set(this.combo.map((c) => c.kind)).size;
    this.multiplier = clamp(1 + (unique - 1) * 0.55 + Math.max(0, this.combo.length - 1) * 0.15, 1, MAX_MULT);
  }

  popup(text, cls) {
    this.popups.push({ text, cls: cls || '', life: 1.9 });
  }

  bannerText(text, sub) {
    this.banner = { text, sub };
    this.bannerTimer = 1.8;
  }

  /** Called every frame. Returns audio cues for the caller. */
  update(dt, bike, audio) {
    const speed = bike.speed;
    const contactPitch = bike.pitch - (bike.groundPitch || 0);
    this.speedBest = Math.max(this.speedBest, speed * 3.6);

    let anyActive = false;

    // ---- wheelie ----
    if (!bike.crashed && bike.grounded && contactPitch > 0.18 && speed > 2.2) {
      this.wheelieT += dt;
      anyActive = true;
      const rate = 42 + clamp(speed / 30, 0, 1) * 55 + clamp(contactPitch / 1.2, 0, 1) * 38;
      this.addTrick(`Wheelie ${this.wheelieT.toFixed(1)}s`, rate * dt, 'wheelie');
      this.wheelieBest = Math.max(this.wheelieBest, this.wheelieT);
      if (this.wheelieT > 3 && Math.floor(this.wheelieT) !== Math.floor(this.wheelieT - dt)) {
        audio && audio.blip(560 + Math.min(this.wheelieT, 12) * 40, 0.05, 0.06, 'triangle');
      }
    } else if (this.wheelieT > 0) {
      if (this.wheelieT > 1.2) this.popup(`WHEELIE ${this.wheelieT.toFixed(1)}s`, 'good');
      this.wheelieT = 0;
    }

    if(bike.fenderScraping&&!bike.crashed){
      anyActive=true;this.addTrick(`Fender scrape ${bike.scrapeTime.toFixed(1)}s`,125*dt,'fenderScrape');
    }

    // ---- stoppie ----
    if (!bike.crashed && bike.grounded && contactPitch < -0.13 && speed > 4) {
      this.stoppieT += dt;
      anyActive = true;
      this.addTrick(`Stoppie ${this.stoppieT.toFixed(1)}s`, 95 * dt, 'stoppie');
    } else if (this.stoppieT > 0) {
      if (this.stoppieT > 0.6) this.popup(`STOPPIE ${this.stoppieT.toFixed(1)}s`, 'good');
      this.stoppieT = 0;
    }

    // ---- drift / slide ----
    if (!bike.crashed && bike.grounded && bike.lateralSlip > 0.34 && speed > 9) {
      this.driftT += dt;
      anyActive = true;
      this.addTrick(`Slide ${this.driftT.toFixed(1)}s`, 46 * dt * clamp(bike.lateralSlip, 0, 1.4), 'drift');
    } else this.driftT = 0;

    // ---- air ----
    if (!bike.crashed && !bike.grounded) {
      this.airT += dt;
      anyActive = true;
      if (this.airT > 0.35) {
        this.addTrick(`Air ${this.airT.toFixed(1)}s`, 70 * dt, 'air');
        this.airBest = Math.max(this.airBest, this.airT);
      }
    }

    // ---- combo lifetime ----
    if (anyActive) this.comboTimer = GRACE;
    else if (this.combo.length) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.bankCombo(audio);
    }

    // popups age out
    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].life -= dt;
      if (this.popups[i].life <= 0) this.popups.splice(i, 1);
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner = null;
    }
  }

  bankCombo(audio) {
    if (!this.combo.length) return;
    const total = Math.round(this.comboPoints * this.multiplier);
    this.score += total;
    if (this.score > this.best) {
      this.best = this.score;
      storage.set('hushmoto.best', Math.round(this.best));
    }
    this.lastCombo = {
      total,
      mult: this.multiplier,
      names: this.combo.map((c) => c.name),
    };
    if (this.combo.length > 1) {
      this.bannerText(`+${total}`, `${this.combo.length} TRICK CHAIN  ×${this.multiplier.toFixed(2)}`);
      audio && audio.score(Math.min(4, this.combo.length));
    } else if (total > 60) {
      this.popup(`+${total}`, 'score');
    }
    this.combo.length = 0;
    this.comboPoints = 0;
    this.multiplier = 1;
  }

  loseCombo() {
    if (this.combo.length) {
      this.bannerText('COMBO LOST', `${Math.round(this.comboPoints * this.multiplier)} points dropped`);
    }
    this.combo.length = 0;
    this.comboPoints = 0;
    this.multiplier = 1;
    this.comboTimer = 0;
  }

  // ---- events from the bike / world ---------------------------------------
  onEvent(ev, bike, audio) {
    switch (ev.type) {
      case 'land': {
        const d = ev.data;
        if (d.airTime > 0.45) {
          this.jumpBest = Math.max(this.jumpBest, d.dist);
          const flipsBack = Math.abs(d.airPitch) / TAU;
          const spins = Math.abs(d.airRoll) / TAU;
          let pts = d.dist * 11 + d.airTime * 55;
          const names = [];
          if (flipsBack >= 0.85) {
            const n = Math.floor(flipsBack + 0.15);
            pts += n * 700;
            this.flips += n;
            names.push(d.airPitch > 0 ? `${n > 1 ? n + 'x ' : ''}BACKFLIP` : `${n > 1 ? n + 'x ' : ''}FRONTFLIP`);
          }
          if (spins >= 0.8) {
            const n = Math.floor(spins + 0.2);
            pts += n * 420;
            names.push(`${n * 360}° BARREL`);
          }
          if (d.bad < 0.25) { pts *= 1.3; names.push('PERFECT LANDING'); }
          this.addTrick(names.length ? names.join(' + ') : `Jump ${d.dist.toFixed(0)}m`, pts, 'jump');
          if (names.length) this.popup(names.join(' + '), 'great');
          else if (d.dist > 12) this.popup(`JUMP ${d.dist.toFixed(0)}m`, 'good');
        }
        if (audio && d.impact > 2.5) audio.thud(clamp(d.impact / 14, 0.15, 1), bike.surface >= 2 ? 95 : 70);
        break;
      }
      case 'nearMiss': {
        this.nearMisses++;
        const pts = 90 + clamp(ev.speed, 0, 60) * 4;
        this.addTrick('Near miss', pts, 'nearmiss');
        this.popup('NEAR MISS', 'good');
        audio && audio.blip(1200, 0.05, 0.07, 'sine');
        break;
      }
      case 'crash':
        this.crashes++;
        this.loseCombo();
        audio && audio.crash(clamp(bike.speed / 22 + 0.35, 0.35, 1));
        break;
      case 'bump':
        if (audio && ev.data > 2) audio.thud(clamp(ev.data / 16, 0.1, 0.7), 120);
        break;
      case 'frontSlam':
        if (audio) audio.thud(clamp(ev.data / 6, 0.08, 0.45), 130);
        break;
      case 'shift':
        audio && audio.shift(ev.data);
        break;
      default: break;
    }
  }
}
