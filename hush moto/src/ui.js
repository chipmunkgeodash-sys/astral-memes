// ui.js — HUD (speedo, minimap, combo readout), menus and overlays.

import { clamp, lerp, damp, storage } from './core.js';
import { BIKES, LOOP_OUT_ANGLE } from './bikephysics.js';
import { saveLocalBikeFiles } from './localmodels.js';
import { CAMERA_MODES } from './camera.js';
import { ACTION_LABELS } from './input.js';
import { WORLD_HALF } from './roadnet.js';
import { installGarageTools } from './garage-tools.js';
import { Showroom } from './showroom.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.el = {
      root: $('ui'),
      hud: $('hud'),
      speedCanvas: $('speedo'),
      mapCanvas: $('minimap'),
      score: $('score-value'),
      best: $('best-value'),
      mult: $('mult-value'),
      multWrap: $('mult'),
      comboList: $('combo-list'),
      popups: $('popups'),
      banner: $('banner'),
      bannerMain: $('banner-main'),
      bannerSub: $('banner-sub'),
      bikeName: $('bike-name'),
      bikeTag: $('bike-tag'),
      camName: $('cam-name'),
      wheelieBar: $('wheelie-bar'),
      wheelieFill: $('wheelie-fill'),
      wheelieTime: $('wheelie-time'),
      policePanel: $('police-panel'), policeState: $('police-state'),
      policeDetail: $('police-detail'), policeFill: $('police-fill'),
      airInfo: $('air-info'),
      crash: $('crash'),
      crashReason: $('crash-reason'),
      menu: $('menu'),
      menuMain: $('menu-main'),
      menuGarage: $('menu-garage'),
      menuModes: $('menu-modes'),
      menuControls: $('menu-controls'),
      menuSettings: $('menu-settings'),
      garageList: $('garage-list'),
      controlsList: $('controls-list'),
      stats: $('stats'),
      loading: $('loading'),
      loadingText: $('loading-text'),
      fps: $('fps'),
      menuTitle: $('menu-title'),
      resumeBtn: $('btn-resume'),
      hint: $('hint'),
      boostFlash: $('boost-flash'),
    };
    // Fail loudly in development if the markup and the HUD code drift apart —
    // a missing node used to surface only as a crash mid-trick.
    const missing = Object.keys(this.el).filter((k) => !this.el[k]);
    if (missing.length) console.error('UI: missing elements ->', missing.join(', '));

    this.sctx = this.el.speedCanvas.getContext('2d');
    this.mctx = this.el.mapCanvas.getContext('2d');
    this.displaySpeed = 0;
    this.displayRpm = 0;
    this.mapVisible = true;
    this.activePanel = 'main';
    this.popupNodes = [];
    this.fpsAcc = 0; this.fpsCount = 0; this.fpsValue = 60;
    this.vignette = 0;

    this.buildMapBase();
    this.wireMenu();
    const localButton=document.createElement('button');localButton.id='add-local-bike';localButton.className='btn';localButton.textContent='Use a personal LBX / Ultra Bee file';
    const localInput=document.createElement('input');localInput.id='local-bike-files';localInput.type='file';localInput.accept='.glb';localInput.multiple=true;localInput.hidden=true;
    const localStatus=document.createElement('p');localStatus.textContent='LBX and Ultra Bee models are included. Optional personal replacements stay in this browser.';
    localStatus.style.cssText='font-size:12px;color:#a9b8c7;margin:8px 0';localStatus.setAttribute('role','status');
    const localBox=document.createElement('details'),localSummary=document.createElement('summary');
    localSummary.textContent='Personal model replacements (optional)';localSummary.style.cssText='cursor:pointer;font-size:12px;color:#a9b8c7;margin:10px 0';
    localBox.append(localSummary,localButton,localInput,localStatus);this.el.menuGarage.append(localBox);
    localButton.onclick=()=>localInput.click();
    localInput.onchange=async()=>{
      localButton.disabled=true;
      try{
        const count=await saveLocalBikeFiles([...localInput.files]);
        localStatus.textContent=`Saved ${count} bike model${count===1?'':'s'} in this browser.`;
        // Refresh both independent rigs in place, including re-importing the
        // currently selected LBX. A page reload used to discard the selection.
        await game.selectBike(game.bikeId,{reload:true});
        this.showroom?.select(game.bike,{reload:true});
      }
      catch(error){localStatus.textContent=error.message;}
      finally{localButton.disabled=false;localInput.value='';}
    };
    installGarageTools(this);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.el.speedCanvas, this.el.mapCanvas]) {
      const w = c.clientWidth || parseInt(c.getAttribute('width'), 10);
      const h = c.clientHeight || parseInt(c.getAttribute('height'), 10);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    this.dpr = dpr;
  }

  // -------------------------------------------------------------------------
  buildMapBase() {
    const world = this.game.world;
    const S = 700;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const scale = S / (WORLD_HALF * 2);
    const tx = (x) => (x + WORLD_HALF) * scale;
    const tz = (z) => (WORLD_HALF - z) * scale;

    g.fillStyle = '#12160f';
    g.fillRect(0, 0, S, S);

    // Dirt / grass tint from the surface field (coarse sampling).
    const step = 5;
    for (let j = 0; j < S; j += step) {
      for (let i = 0; i < S; i += step) {
        const wx = (i / scale) - WORLD_HALF;
        const wz = WORLD_HALF - (j / scale);
        const s = world.terrainSurface(wx, wz);
        if (s === 1) g.fillStyle = 'rgba(122,94,60,0.55)';
        else if (s === 0) g.fillStyle = 'rgba(52,72,40,0.5)';
        else continue;
        g.fillRect(i, j, step, step);
      }
    }

    // Lots
    g.fillStyle = '#4a4d52';
    for (const lot of world.lots) {
      g.fillRect(tx(lot.x - lot.w / 2), tz(lot.z + lot.d / 2), lot.w * scale, lot.d * scale);
    }
    // Roads
    g.lineCap = 'round';
    for (const s of world.segs) {
      g.strokeStyle = s.type === 'highway' ? '#6e7480' : s.type === 'avenue' ? '#5c6068' : '#4c5057';
      g.lineWidth = Math.max(1.5, s.w * scale);
      g.beginPath();
      g.moveTo(tx(s.ax), tz(s.az));
      g.lineTo(tx(s.bx), tz(s.bz));
      g.stroke();
    }
    // Buildings
    g.fillStyle = 'rgba(28,30,35,0.85)';
    for (const o of world.obstacles) {
      if (o.kind !== 'building') continue;
      g.fillRect(tx(o.x - o.w / 2), tz(o.z + o.d / 2), o.w * scale, o.d * scale);
    }
    // Ramps
    g.fillStyle = '#c8a02a';
    for (const s of world.surfaces) {
      g.save();
      g.translate(tx(s.cx), tz(s.cz));
      g.rotate(s.yaw);
      g.fillRect(-s.len * scale / 2, -s.wid * scale / 2, s.len * scale, s.wid * scale);
      g.restore();
    }
    this.mapBase = c;
    this.mapScale = scale;
  }

  drawMap(bike, traffic) {
    if (!this.mapVisible) return;
    const ctx = this.mctx;
    const c = this.el.mapCanvas;
    const W = c.width, H = c.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2);
    ctx.clip();

    const view = 300; // metres across
    const px = W / view;
    const scale = this.mapScale;
    const srcSize = view * scale;
    const sx = (bike.pos.x + WORLD_HALF) * scale - srcSize / 2;
    const sy = (WORLD_HALF - bike.pos.z) * scale - srcSize / 2;
    ctx.drawImage(this.mapBase, sx, sy, srcSize, srcSize, 0, 0, W, H);

    // Traffic dots
    ctx.fillStyle = '#ffd24a';
    for (const car of traffic.cars) {
      const dx = (car.x - bike.pos.x) * px + W / 2;
      const dy = (bike.pos.z - car.z) * px + H / 2;
      if (dx < -4 || dy < -4 || dx > W + 4 || dy > H + 4) continue;
      ctx.fillRect(dx - 1.6, dy - 1.6, 3.2, 3.2);
    }

    // Patrols remain visible on the minimap, with alternating pursuit lights.
    if (this.game.police.enabled) for (const unit of this.game.police.units) {
      const x = (unit.x - bike.pos.x) * px + W / 2, y = (bike.pos.z - unit.z) * px + H / 2;
      ctx.fillStyle = this.game.police.level && Math.floor(this.game.police.time * 6) % 2 ? '#ff5369' : '#66b5ff';
      ctx.beginPath();ctx.arc(x, y, 3.2, 0, Math.PI * 2);ctx.fill();
    }

    // Player arrow
    ctx.fillStyle = '#a6c7ff';
    for (const remote of this.game.multiplayer?.remotes.values() || []) {
      const pos = remote.state.pos;
      ctx.beginPath();
      ctx.arc((pos.x - bike.pos.x) * px + W / 2, (bike.pos.z - pos.z) * px + H / 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.waypoint) {
      const x=clamp((this.waypoint.x-bike.pos.x)*px+W/2,12,W-12),y=clamp((bike.pos.z-this.waypoint.z)*px+H/2,12,H-12);
      ctx.fillStyle='#ffd27a';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();
    }
    // Player arrow
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-bike.yaw);
    ctx.fillStyle = '#39d98a';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-5.5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Ring
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // -------------------------------------------------------------------------
  drawSpeedo(bike, dt) {
    const ctx = this.sctx;
    const c = this.el.speedCanvas;
    const W = c.width, H = c.height;
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) / 2 - 6 * this.dpr;
    ctx.clearRect(0, 0, W, H);

    const cfg = bike.cfg;
    const maxKmh = Math.ceil((cfg.topSpeed * 3.6 * 1.12) / 20) * 20;
    this.displaySpeed = damp(this.displaySpeed, bike.kmh, 14, dt);
    const t = clamp(this.displaySpeed / maxKmh, 0, 1);

    const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;

    // Track
    ctx.lineWidth = 7 * this.dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.arc(cx, cy, R, A0, A1); ctx.stroke();

    // Speed arc (colour shifts toward the redline)
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#39d98a');
    grad.addColorStop(0.6, '#5fd2ff');
    grad.addColorStop(1, '#ff5a4a');
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, R, A0, A0 + (A1 - A0) * t); ctx.stroke();

    // Ticks
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 1.4 * this.dpr;
    for (let i = 0; i <= 10; i++) {
      const a = A0 + (A1 - A0) * (i / 10);
      const r0 = R - 11 * this.dpr, r1 = R - (i % 5 === 0 ? 18 : 15) * this.dpr;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }

    // RPM / battery inner arc
    let inner, innerColor;
    if (cfg.kind === 'electric') {
      inner = bike.battery;
      innerColor = inner > 0.25 ? '#39d98a' : '#ff5a4a';
    } else {
      this.displayRpm = damp(this.displayRpm, bike.rpm / cfg.redline, 16, dt);
      inner = clamp(this.displayRpm, 0, 1.05);
      innerColor = inner > 0.92 ? '#ff5a4a' : inner > 0.78 ? '#ffb020' : '#5fd2ff';
    }
    ctx.lineWidth = 4 * this.dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.arc(cx, cy, R - 16 * this.dpr, A0, A1); ctx.stroke();
    ctx.strokeStyle = innerColor;
    ctx.beginPath(); ctx.arc(cx, cy, R - 16 * this.dpr, A0, A0 + (A1 - A0) * clamp(inner, 0, 1)); ctx.stroke();

    // Needle
    const na = A0 + (A1 - A0) * t;
    ctx.strokeStyle = '#ff6a55';
    ctx.lineWidth = 2.6 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(na) * 8 * this.dpr, cy - Math.sin(na) * 8 * this.dpr);
    ctx.lineTo(cx + Math.cos(na) * (R - 20 * this.dpr), cy + Math.sin(na) * (R - 20 * this.dpr));
    ctx.stroke();
    ctx.fillStyle = '#22262c';
    ctx.beginPath(); ctx.arc(cx, cy, 5 * this.dpr, 0, Math.PI * 2); ctx.fill();

    // Digits
    ctx.fillStyle = '#f2f5f8';
    ctx.textAlign = 'center';
    ctx.font = `600 ${30 * this.dpr}px 'Rajdhani', system-ui, sans-serif`;
    ctx.fillText(String(Math.round(this.displaySpeed * (this.game.rideLab?.prefs.units === 'mph' ? .621371 : 1))), cx, cy + 12 * this.dpr);
    ctx.font = `500 ${10 * this.dpr}px 'Rajdhani', system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(this.game.rideLab?.prefs.units === 'mph' ? 'MPH' : 'KM/H', cx, cy + 26 * this.dpr);

    // Gear / battery label
    ctx.font = `700 ${13 * this.dpr}px 'Rajdhani', system-ui, sans-serif`;
    ctx.fillStyle = cfg.kind === 'electric' ? innerColor : '#cfd6df';
    const label = cfg.kind === 'electric'
      ? `${Math.round(bike.battery * 100)}%`
      : `G${bike.gear + 1}`;
    ctx.fillText(label, cx, cy - 22 * this.dpr);
  }

  // -------------------------------------------------------------------------
  update(dt, game) {
    const bike = game.bike;
    this.el.hud.classList.toggle('moving', bike.kmh > 8);
    const stunts = game.stunts;

    this.drawSpeedo(bike, dt);
    this.drawMap(bike, game.traffic);
    const police = game.police;
    this.el.policePanel.hidden = !police.enabled;
    this.el.policePanel.dataset.state = police.status;
    this.el.policeState.textContent = police.busted ? 'BUSTED' : police.level
      ? `${'★'.repeat(police.level)}  ${police.status === 'search' ? 'SEARCHING' : 'POLICE PURSUIT'}`
      : police.suspicion > 0 ? 'POLICE WATCHING' : 'CITY PATROL';
    this.el.policeDetail.textContent = police.busted ? 'Releasing you in a moment…'
      : police.arrest > 0 ? `Pulling over · ${(3 - police.arrest).toFixed(1)}s`
      : police.status === 'search' ? `Stay out of sight · ${Math.ceil(14 - police.unseen)}s`
      : police.level ? `${police.reason} · stop to surrender or break sight`
      : police.suspicion > 0 ? 'Ease off — you are being observed'
      : 'Blue dots are patrols · keep stunts off public roads';
    const progress = police.busted ? 1 : police.arrest > 0 ? police.arrest / 3
      : police.status === 'search' ? 1 - police.unseen / 14 : police.level ? 1 : police.suspicion;
    this.el.policeFill.style.width = `${clamp(progress, 0, 1) * 100}%`;

    this.el.score.textContent = Math.round(stunts.score).toLocaleString();
    this.el.best.textContent = Math.round(stunts.best).toLocaleString();

    const hasCombo = stunts.combo.length > 0;
    this.el.multWrap.classList.toggle('active', hasCombo);
    if (hasCombo) {
      this.el.mult.textContent = `×${stunts.multiplier.toFixed(2)}`;
      const pending = Math.round(stunts.comboPoints * stunts.multiplier);
      let html = `<div class="combo-pending">+${pending.toLocaleString()}</div>`;
      for (const c of stunts.combo) html += `<div class="combo-item">${c.name}</div>`;
      const frac = clamp(stunts.comboTimer / 2.4, 0, 1);
      html += `<div class="combo-timer"><i style="width:${(frac * 100).toFixed(0)}%"></i></div>`;
      if (this._comboHtml !== html) { this.el.comboList.innerHTML = html; this._comboHtml = html; }
    } else if (this._comboHtml !== '') {
      this.el.comboList.innerHTML = '';
      this._comboHtml = '';
    }

    // Wheelie / air readout
    const wt = stunts.wheelieT;
    const showWheelie = wt > 0.12;
    this.el.wheelieBar.classList.toggle('show', showWheelie);
    if (showWheelie) {
      this.el.wheelieTime.textContent = `${wt.toFixed(2)}s  ·  ${bike.wheelieDist.toFixed(0)}m`;
      // Balance meter: how close the pitch is to the loop-out point.
      const bal = clamp((bike.pitch - (bike.groundPitch || 0)) / LOOP_OUT_ANGLE, 0, 1);
      this.el.wheelieFill.style.width = `${(bal * 100).toFixed(1)}%`;
      this.el.wheelieFill.style.background =
        bal > 0.86 ? '#ff4a3a' : bal > 0.68 ? '#ffb020' : '#39d98a';
    }
    const air = !bike.grounded && !bike.crashed;
    this.el.airInfo.classList.toggle('show', air && stunts.airT > 0.25);
    if (air) this.el.airInfo.textContent = `AIR ${stunts.airT.toFixed(2)}s`;

    // Popups
    if (stunts.popups.length !== this.popupNodes.length) {
      this.el.popups.innerHTML = stunts.popups
        .map((p) => `<div class="popup ${p.cls}" style="opacity:${clamp(p.life, 0, 1)}">${p.text}</div>`)
        .join('');
      this.popupNodes = stunts.popups.slice();
    }

    // Banner
    if (stunts.banner) {
      this.el.banner.classList.add('show');
      this.el.bannerMain.textContent = stunts.banner.text;
      this.el.bannerSub.textContent = stunts.banner.sub || '';
    } else this.el.banner.classList.remove('show');

    // Crash overlay
    this.el.crash.classList.toggle('show', bike.crashed);
    if (bike.crashed) this.el.crashReason.textContent = bike.crashReason;

    // Speed vignette
    const spdT = clamp((bike.speed - 22) / 45, 0, 1);
    this.vignette = damp(this.vignette, spdT, 4, dt);
    this.el.hud.style.setProperty('--vig', this.vignette.toFixed(3));
    this.el.boostFlash.classList.toggle('on', game.input.isDown('boost') && bike.speed > 4);

    // FPS
    this.fpsAcc += dt; this.fpsCount++;
    if (this.fpsAcc > 0.5) {
      this.fpsValue = this.fpsCount / this.fpsAcc;
      this.fpsAcc = 0; this.fpsCount = 0;
      this.el.fps.textContent = `${this.fpsValue.toFixed(0)} FPS`;
    }
  }

  setBikeLabel(cfg) {
    this.el.bikeName.textContent = cfg.name;
    this.el.bikeTag.textContent = cfg.tag;
  }

  setCameraLabel(mode) {
    this.el.camName.textContent = CAMERA_MODES[mode];
  }

  showHint(text, ms = 2600) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add('show');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => this.el.hint.classList.remove('show'), ms);
  }

  // -------------------------------------------------------------------------
  // Menus
  // -------------------------------------------------------------------------
  wireMenu() {
    const g = this.game;
    $('btn-ride').onclick = () => g.startRide();
    $('btn-resume').onclick = () => g.setPaused(false);
    $('btn-garage').onclick = () => this.showPanel('garage');
    $('btn-controls').onclick = () => this.showPanel('controls');
    $('btn-settings').onclick = () => this.showPanel('settings');
    $('btn-multiplayer').onclick = () => this.showPanel('multiplayer');
    $('btn-modes').onclick = () => { this.buildModes(); this.showPanel('modes'); };
    $('game-menu').onclick = () => g.setPaused(!g.paused);
    $('btn-restart').onclick = () => { g.restart(); g.setPaused(false); };
    for (const b of document.querySelectorAll('.btn-back')) b.onclick = () => this.showPanel('main');

    // Garage
    this.buildGarage();
    this.buildControls();

    // Settings
    const vol = $('set-volume');
    vol.value = String(Math.round(storage.num('hushmoto.vol', 0.75) * 100));
    vol.oninput = () => {
      const v = Number(vol.value) / 100;
      g.audio.setVolume(v);
      storage.set('hushmoto.vol', v);
      $('set-volume-val').textContent = `${vol.value}%`;
    };
    $('set-volume-val').textContent = `${vol.value}%`;

    const q = $('set-quality');
    q.value = storage.get('hushmoto.quality', 'high');
    q.onchange = () => {
      storage.set('hushmoto.quality', q.value);
      g.applyQuality(q.value);
    };

    const sh = $('set-shadows');
    sh.checked = storage.bool('hushmoto.shadows', true);
    sh.onchange = () => {
      storage.set('hushmoto.shadows', sh.checked ? '1' : '0');
      g.setShadows(sh.checked);
    };

    const tc = $('set-traffic');
    tc.value = storage.get('hushmoto.traffic', 'normal');
    tc.onchange = () => {
      storage.set('hushmoto.traffic', tc.value);
      g.setTrafficDensity(tc.value);
    };

    const inv = $('set-assist');
    const policeToggle = $('set-police');policeToggle.checked = g.police.enabled;
    policeToggle.onchange = () => {
      g.police.enabled = policeToggle.checked;g.police.reset(6);
      for (const u of g.police.units) u.root.visible = g.police.enabled;
      storage.set('hushmoto.police', policeToggle.checked ? '1' : '0');
    };
    inv.checked = storage.bool('hushmoto.assist', true);
    inv.onchange = () => {
      storage.set('hushmoto.assist', inv.checked ? '1' : '0');
      g.assist = inv.checked;
    };

    const invLean = $('set-invert-lean');
    invLean.checked = g.input.invertLean;
    invLean.onchange = () => {
      g.input.invertLean = invLean.checked;
      storage.set('hushmoto.invertlean', invLean.checked ? '1' : '0');
    };

    const invLook = $('set-invert-look');
    invLook.checked = g.input.invertLook;
    invLook.onchange = () => {
      g.input.invertLook = invLook.checked;
      storage.set('hushmoto.invertlook', invLook.checked ? '1' : '0');
    };

    const sens = $('set-looksens');
    sens.value = String(Math.round(g.input.lookSensitivity * 100));
    sens.oninput = () => {
      g.input.lookSensitivity = Number(sens.value) / 100;
      storage.set('hushmoto.looksens', g.input.lookSensitivity);
      $('set-looksens-val').textContent = `${sens.value}%`;
    };
    $('set-looksens-val').textContent = `${sens.value}%`;

    $('btn-reset-binds').onclick = () => { g.input.resetBindings(); this.buildControls(); };
  }

  buildGarage() {
    const g = this.game;
    $('showroom-count').textContent = `YOUR GARAGE / ${String(BIKES.length).padStart(2, '0')} BIKES`;
    this.el.garageList.innerHTML = '';
    for (const b of BIKES) {
      const card = document.createElement('button');
      card.className = 'bike-card';
      card.dataset.id = b.id;
      const topKmh = Math.round(b.topSpeed * 3.6);
      const power = b.kind === 'electric'
        ? `${(b.peakPower / 1000).toFixed(1)} kW`
        : `${b.peakEngineTorque} N·m`;
      card.innerHTML = `
        <div class="bike-swatch" style="background:linear-gradient(135deg,#${b.color.toString(16).padStart(6, '0')},#${b.accent.toString(16).padStart(6, '0')})"></div>
        <div class="bike-info">
          <h3>${b.name}</h3>
          <p>${b.tag}</p>
          <div class="bike-stats">
            <span><i>MASS</i>${b.mass} kg</span>
            <span><i>TOP</i>${topKmh} km/h</span>
            <span><i>${b.kind === 'electric' ? 'POWER' : 'TORQUE'}</i>${power}</span>
            <span><i>TYPE</i>${b.kind === 'electric' ? `${(b.batteryWh / 1000).toFixed(1)} kWh` : `${b.gears.length}-speed`}</span>
          </div>
        </div>`;
      card.onclick = () => {
        g.selectBike(b.id);this.syncBuild?.();
        this.markSelectedBike(b.id);
        this.showroom?.select(g.bike);
      };
      this.el.garageList.appendChild(card);
    }
    this.markSelectedBike(g.bikeId);
  }

  markSelectedBike(id) {
    for (const c of this.el.garageList.children) {
      c.classList.toggle('selected', c.dataset.id === id);
    }
  }

  buildControls() {
    const g = this.game;
    this.el.controlsList.innerHTML = '';
    for (const action of Object.keys(ACTION_LABELS)) {
      const row = document.createElement('div');
      row.className = 'bind-row';
      const codes = g.input.bindings[action];
      row.innerHTML = `<span>${ACTION_LABELS[action]}</span>`;
      const btn = document.createElement('button');
      btn.className = 'key-btn';
      btn.textContent = codes.map((c) => g.input.keyLabel(c)).join(' / ');
      btn.onclick = () => {
        btn.textContent = 'press a key…';
        btn.classList.add('capturing');
        g.input.beginCapture(action, () => this.buildControls());
      };
      row.appendChild(btn);
      this.el.controlsList.appendChild(row);
    }
  }

  showPanel(name) {
    this.activePanel = name;
    if (name === 'multiplayer') this.game.multiplayer?.openLobby();
    $('menu-box').classList.toggle('garage-wide', name === 'garage');
    for (const [key, el] of Object.entries({
      main: this.el.menuMain, garage: this.el.menuGarage,
      controls: this.el.menuControls, settings: this.el.menuSettings,
      multiplayer: $('menu-multiplayer'), map:$('menu-map'), modes:$('menu-modes'), lab:$('menu-lab'),
    })) {
      el?.classList.toggle('show', key === name);
    }
    if (name === 'map') this.drawCityMap();
    if (name === 'garage') {
      this.syncBuild?.();
      this.showroom ||= new Showroom($('showroom-canvas'));
      this.showroom.select(this.game.bike);this.showroom.render(0);
    }
  }

  buildModes() {
    const list = $('mode-list'); if (!list || list.childElementCount) return;
    const modes = this.game.modes?.constructor?.GAME_MODES || [];
    // The module exports the catalog; use the game instance's static list when available.
    const catalog = this.game.modes?.definitions || [];
    const fallback = [
      ['tag','Tag','Catch the moving beacon or a crew rider before the clock runs out.'],['checkpoint','Checkpoint Rush','Chain city gates quickly and keep the streak alive.'],['time-trial','Time Trial','Beat a three-minute route while the clock chases you.'],['stunt','Stunt Score Attack','Bank the biggest combo before the five-minute round ends.'],['fuel-run','Fuel Run','Reach both orange fuel stations before the tank runs dry.'],['cops','Cops & Riders','Escape a pursuit and finish without getting busted.'],['slalom','Slalom Sprint','Thread six gates with clean lines and no crashes.'],['delivery','Courier Dash','Ride a package across town before time expires.'],['night','Night Ride','A low-light free ride with the headlight and neon on.'],['practice','Corner Practice','Learn smooth throttle, countersteer and lean through a calm route.']
    ];
    for (const [id,name,description] of catalog.length ? catalog.map((m) => [m.id,m.name,m.description]) : fallback) {
      const card=document.createElement('button'); card.className='mode-card'; card.innerHTML=`<strong>${name}</strong><span>${description}</span><small>START MODE ↗</small>`;
      card.onclick=()=>{this.game.modes?.start(id);$('mode-status').textContent=`${name} active · ride to begin`;}; list.append(card);
    }
  }

  showMenu(mode) {
    $('game-menu').hidden = true;$('map-open').hidden = true;
    this.el.menu.classList.add('show');
    this.showPanel('main');
    this.el.menuTitle.textContent = mode === 'pause' ? 'PAUSED' : 'HUSH MOTO';
    this.el.resumeBtn.style.display = mode === 'pause' ? '' : 'none';
    $('btn-ride').textContent = mode === 'pause' ? 'Restart ride' : 'Ride solo';
    $('btn-ride').style.display = mode === 'pause' ? 'none' : '';
    $('btn-restart').style.display = mode === 'pause' ? '' : 'none';
    this.updateStats();
  }

  hideMenu() { this.el.menu.classList.remove('show'); $('game-menu').hidden = false;$('map-open').hidden = false; }

  updateStats() {
    const s = this.game.stunts;
    const b = this.game.bike;
    this.el.stats.innerHTML = `
      <div><i>SCORE</i>${Math.round(s.score).toLocaleString()}</div>
      <div><i>BEST</i>${Math.round(s.best).toLocaleString()}</div>
      <div><i>TOP SPEED</i>${s.speedBest.toFixed(0)} km/h</div>
      <div><i>LONGEST WHEELIE</i>${s.wheelieBest.toFixed(1)} s</div>
      <div><i>BEST AIR</i>${s.airBest.toFixed(2)} s</div>
      <div><i>LONGEST JUMP</i>${s.jumpBest.toFixed(0)} m</div>
      <div><i>NEAR MISSES</i>${s.nearMisses}</div>
      <div><i>FLIPS</i>${s.flips}</div>
      <div><i>CRASHES</i>${s.crashes}</div>
      <div><i>DISTANCE</i>${(b.distance / 1000).toFixed(2)} km</div>`;
  }

  setLoading(text) {
    if (text === null) { this.el.loading.classList.remove('show'); return; }
    this.el.loading.classList.add('show');
    this.el.loadingText.textContent = text;
  }
}

void lerp;
