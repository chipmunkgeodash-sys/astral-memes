// effects.js — tyre marks, dust, sparks, exhaust and impact particles.

import * as THREE from 'three';
import { clamp, lerp, makeRng } from './core.js';
import { SURF, SURFACE_INFO } from './world.js';

const MAX_MARK_SEGMENTS = 900;
const MAX_PARTICLES = 900;

class TrailRibbon {
  constructor(scene, color, width, maxSegs) {
    this.max = maxSegs;
    this.width = width;
    this.count = 0;
    this.head = 0;
    const positions = new Float32Array(maxSegs * 4 * 3);
    const alphas = new Float32Array(maxSegs * 4);
    const indices = new Uint32Array(maxSegs * 6);
    for (let i = 0; i < maxSegs; i++) {
      const v = i * 4;
      indices[i * 6] = v; indices[i * 6 + 1] = v + 2; indices[i * 6 + 2] = v + 1;
      indices[i * 6 + 3] = v + 1; indices[i * 6 + 4] = v + 2; indices[i * 6 + 5] = v + 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: `
        attribute float aAlpha;
        varying float vA;
        void main() {
          vA = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          if (vA <= 0.003) discard;
          gl_FragColor = vec4(uColor, vA);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.geo = geo;
    this.positions = positions;
    this.alphas = alphas;
    this.last = null;
  }

  reset() { this.last = null; }

  push(x, y, z, dirX, dirZ, intensity, colorMix) {
    if (this.last) {
      const dx = x - this.last.x, dz = z - this.last.z;
      if (dx * dx + dz * dz < 0.045) return;
    }
    const rx = dirZ, rz = -dirX;
    const w = this.width * (0.75 + intensity * 0.45);
    const i = this.head;
    const base = i * 12;
    const p = this.positions;
    const prev = this.last;
    if (!prev) { this.last = { x, y, z, rx, rz, w }; return; }
    p[base + 0] = prev.x + prev.rx * prev.w; p[base + 1] = prev.y; p[base + 2] = prev.z + prev.rz * prev.w;
    p[base + 3] = prev.x - prev.rx * prev.w; p[base + 4] = prev.y; p[base + 5] = prev.z - prev.rz * prev.w;
    p[base + 6] = x + rx * w; p[base + 7] = y; p[base + 8] = z + rz * w;
    p[base + 9] = x - rx * w; p[base + 10] = y; p[base + 11] = z - rz * w;
    const a = clamp(intensity, 0, 1) * 0.85;
    const ab = i * 4;
    this.alphas[ab] = a; this.alphas[ab + 1] = a; this.alphas[ab + 2] = a; this.alphas[ab + 3] = a;
    this.last = { x, y, z, rx, rz, w };
    this.head = (this.head + 1) % this.max;
    this.count = Math.min(this.count + 1, this.max);
    this.geo.setDrawRange(0, this.max * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    void colorMix;
  }

  fade(dt) {
    // Slowly erase the oldest marks so the world does not fill up.
    const a = this.alphas;
    const k = 1 - dt * 0.012;
    let changed = false;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] > 0.002) {
        const v = a[i] * k;
        a[i] = a[i + 1] = a[i + 2] = a[i + 3] = v < 0.002 ? 0 : v;
        changed = true;
      }
    }
    if (changed) this.geo.attributes.aAlpha.needsUpdate = true;
  }

  clear() {
    this.alphas.fill(0);
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.last = null;
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.rng = makeRng(777);
    this.rearMarks = new TrailRibbon(scene, 0x101012, 0.085, MAX_MARK_SEGMENTS);
    this.frontMarks = new TrailRibbon(scene, 0x131316, 0.06, Math.floor(MAX_MARK_SEGMENTS * 0.5));

    // Particle system (billboarded points).
    const pos = new Float32Array(MAX_PARTICLES * 3);
    const col = new Float32Array(MAX_PARTICLES * 3);
    const siz = new Float32Array(MAX_PARTICLES);
    const alp = new Float32Array(MAX_PARTICLES);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 700 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        varying vec3 vC; varying float vA;
        uniform float uScale;
        void main() {
          vC = aColor; vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25 || vA <= 0.004) discard;
          float a = vA * smoothstep(0.25, 0.02, r);
          gl_FragColor = vec4(vC, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.pGeo = geo;
    this.pPos = pos; this.pCol = col; this.pSize = siz; this.pAlpha = alp;
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pMax = new Float32Array(MAX_PARTICLES);
    this.pGrav = new Float32Array(MAX_PARTICLES);
    this.pDrag = new Float32Array(MAX_PARTICLES);
    this.pHead = 0;
    this.live = 0;

    this._skidTime = 0;
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, grav, drag) {
    const i = this.pHead;
    this.pHead = (this.pHead + 1) % MAX_PARTICLES;
    this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = vx; this.pVel[i * 3 + 1] = vy; this.pVel[i * 3 + 2] = vz;
    this.pCol[i * 3] = r; this.pCol[i * 3 + 1] = g; this.pCol[i * 3 + 2] = b;
    this.pSize[i] = size;
    this.pAlpha[i] = 1;
    this.pLife[i] = life; this.pMax[i] = life;
    this.pGrav[i] = grav; this.pDrag[i] = drag;
  }

  burst(x, y, z, n, opts) {
    const o = Object.assign(
      { spread: 3, up: 2, r: 0.8, g: 0.75, b: 0.6, size: 0.35, life: 0.8, grav: -3, drag: 1.4 },
      opts
    );
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const s = this.rng() * o.spread;
      this.spawn(
        x + (this.rng() - 0.5) * 0.4, y + this.rng() * 0.3, z + (this.rng() - 0.5) * 0.4,
        Math.cos(a) * s + (o.vx || 0), this.rng() * o.up + (o.vy || 0), Math.sin(a) * s + (o.vz || 0),
        o.r * (0.85 + this.rng() * 0.3), o.g * (0.85 + this.rng() * 0.3), o.b * (0.85 + this.rng() * 0.3),
        o.size * (0.6 + this.rng() * 0.8), o.life * (0.7 + this.rng() * 0.6), o.grav, o.drag
      );
    }
  }

  /** Per-frame: emit from the bike, then integrate the pool. */
  update(dt, bike, model) {
    const cfg = bike.cfg;
    const surf = bike.surface;
    const info = SURFACE_INFO[surf];
    const cy = Math.cos(bike.yaw), sy = Math.sin(bike.yaw);

    // Contact patch positions.
    const cosP = Math.cos(bike.pitch);
    const rx = bike.pos.x - sy * (cfg.cgRear * cosP);
    const rz = bike.pos.z - cy * (cfg.cgRear * cosP);
    const fx = bike.pos.x + sy * ((cfg.wheelbase - cfg.cgRear) * cosP);
    const fz = bike.pos.z + cy * ((cfg.wheelbase - cfg.cgRear) * cosP);
    const groundY = bike.contactY + 0.015;

    const slipping = Math.abs(bike.rearSlip) > 0.16 || bike.lateralSlip > 0.28;
    const hard = clamp(Math.abs(bike.rearSlip) * 0.9 + bike.lateralSlip * 0.9, 0, 1.2);

    if (!bike.crashed && bike.rearDown && bike.grounded) {
      if (surf === SURF.ASPHALT || surf === SURF.CONCRETE) {
        if (slipping && bike.speed > 1.2) {
          this.rearMarks.push(rx, groundY, rz, sy, cy, clamp(hard, 0.12, 1));
          if (this.rng() < clamp(hard, 0, 1) * 0.7) {
            this.spawn(
              rx, groundY + 0.1, rz,
              (this.rng() - 0.5) * 2 - sy * bike.speed * 0.06,
              0.4 + this.rng() * 1.2,
              (this.rng() - 0.5) * 2 - cy * bike.speed * 0.06,
              0.62, 0.62, 0.64, 0.5 + this.rng() * 0.5, 0.75, 1.2, 1.0
            );
          }
        } else this.rearMarks.reset();
        if (bike.frontDown && Math.abs(bike.frontSlip) > 0.28 && bike.speed > 2) {
          this.frontMarks.push(fx, groundY, fz, sy, cy, 0.5);
        } else this.frontMarks.reset();
      } else {
        this.rearMarks.reset(); this.frontMarks.reset();
        // Dust / dirt roost off-road.
        const roost = clamp(
          (Math.abs(bike.rearSlip) * 1.4 + bike.lateralSlip + bike.speed * 0.035) * info.dust, 0, 2.2
        );
        const n = Math.min(4, Math.floor(roost * 2.4 * (dt * 60)));
        const col = surf === SURF.DIRT ? [0.62, 0.50, 0.36] : [0.45, 0.52, 0.32];
        for (let i = 0; i < n; i++) {
          this.spawn(
            rx + (this.rng() - 0.5) * 0.35, groundY + 0.06, rz + (this.rng() - 0.5) * 0.35,
            -sy * bike.speed * (0.18 + this.rng() * 0.3) + (this.rng() - 0.5) * 2.2,
            0.9 + this.rng() * 2.4,
            -cy * bike.speed * (0.18 + this.rng() * 0.3) + (this.rng() - 0.5) * 2.2,
            col[0], col[1], col[2],
            0.55 + this.rng() * 0.7, 1.0 + this.rng() * 0.8, -1.6, 1.1
          );
        }
      }
    } else {
      this.rearMarks.reset(); this.frontMarks.reset();
    }

    // Rear fender guard: sparks on hard ground, dust on grass and dirt.
    if(bike.fenderScraping&&!bike.crashed&&bike.scrapePoint){
      const p=bike.scrapePoint,hardSurface=p.surface>=2;
      this.scrapeBudget=(this.scrapeBudget||0)+dt*(30+90*bike.scrapeIntensity);
      const count=Math.min(12,Math.floor(this.scrapeBudget));this.scrapeBudget-=count;
      for(let i=0;i<count;i++)this.spawn(p.x,p.y,p.z,
        -sy*bike.speed*.25+(this.rng()-.5)*2,.3+this.rng()*1.8,-cy*bike.speed*.25+(this.rng()-.5)*2,
        hardSurface?1:.55,hardSurface?.65:.45,hardSurface?.18:.30,
        hardSurface?.055:.3,hardSurface?.28:.65,hardSurface?-9:-2,1);
    }else this.scrapeBudget=0;

    // Crash sparks / scraping.
    if (bike.crashed && bike.speed > 3) {
      for (let i = 0; i < 2; i++) {
        this.spawn(
          bike.pos.x + (this.rng() - 0.5) * 0.6, bike.contactY + 0.12, bike.pos.z + (this.rng() - 0.5) * 0.6,
          (this.rng() - 0.5) * 4 - sy * bike.speed * 0.25, 1 + this.rng() * 3, (this.rng() - 0.5) * 4 - cy * bike.speed * 0.25,
          1.0, 0.72, 0.25, 0.12 + this.rng() * 0.12, 0.42, -9, 0.6
        );
      }
    }

    // Exhaust puff on combustion bikes under load.
    if (model && cfg.kind === 'gas' && bike.engineLoad > 0.55 && this.rng() < 0.25) {
      const p = model.getExhaustTip(this._tv || (this._tv = new THREE.Vector3()));
      if (p) {
        this.spawn(p.x, p.y, p.z, -sy * 2 + (this.rng() - 0.5), 0.6, -cy * 2 + (this.rng() - 0.5),
          0.5, 0.5, 0.52, 0.22, 0.5, 0.6, 2.2);
      }
    }

    this.rearMarks.fade(dt);
    this.frontMarks.fade(dt);
    this.integrate(dt);
  }

  integrate(dt) {
    const pos = this.pPos, vel = this.pVel, life = this.pLife, max = this.pMax;
    const alpha = this.pAlpha, size = this.pSize;
    let live = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      life[i] -= dt;
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      const d = Math.exp(-this.pDrag[i] * dt);
      vel[i * 3] *= d;
      vel[i * 3 + 1] = vel[i * 3 + 1] * d + this.pGrav[i] * dt;
      vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const t = life[i] / max[i];
      alpha[i] = t * t * 0.85;
      size[i] += dt * 0.55;
      live++;
    }
    this.live = live;
    this.pGeo.attributes.position.needsUpdate = true;
    this.pGeo.attributes.aAlpha.needsUpdate = true;
    this.pGeo.attributes.aSize.needsUpdate = true;
    this.pGeo.attributes.aColor.needsUpdate = true;
  }

  onLand(bike, impact) {
    const surf = bike.surface;
    const col = surf === SURF.DIRT ? { r: 0.62, g: 0.5, b: 0.36 }
      : surf === SURF.GRASS ? { r: 0.42, g: 0.52, b: 0.3 }
        : { r: 0.62, g: 0.62, b: 0.64 };
    this.burst(bike.pos.x, bike.contactY + 0.1, bike.pos.z, Math.min(28, 6 + impact * 1.6), {
      spread: 1.6 + impact * 0.22, up: 1.6, size: 0.42, life: 0.85, grav: -2.4, drag: 1.6,
      vx: -Math.sin(bike.yaw) * bike.speed * 0.12, vz: -Math.cos(bike.yaw) * bike.speed * 0.12,
      ...col,
    });
  }

  onCrash(bike) {
    this.burst(bike.pos.x, bike.pos.y, bike.pos.z, 34, {
      spread: 5, up: 4.5, size: 0.4, life: 1.2, grav: -5, drag: 1.1,
      r: 0.55, g: 0.53, b: 0.5,
    });
    this.burst(bike.pos.x, bike.pos.y, bike.pos.z, 18, {
      spread: 7, up: 5, size: 0.14, life: 0.5, grav: -11, drag: 0.5,
      r: 1.0, g: 0.75, b: 0.3,
    });
  }

  clearMarks() {
    this.rearMarks.clear();
    this.frontMarks.clear();
  }
}

void lerp;
