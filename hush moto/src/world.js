// world.js — terrain baking, ground/collision queries and all procedural visuals.

import * as THREE from 'three';
import { mergeParts, tubeBetween } from './parts.js';
import { groundTexture, foliageAssets } from './scenery.js';
import { crossingAt } from './crosswalks.js';
import {
  clamp, lerp, smoothstep, fbm2, makeRng, SpatialHash, TAU,
} from './core.js';
import {
  buildRoads, buildLots, toSegments, segDist, buildCityGraph,
  baseRoadHeight, GRID_X, GRID_Z, RING_HALF, WORLD_HALF, ROAD,
} from './roadnet.js';

export const SURF = { GRASS: 0, DIRT: 1, ASPHALT: 2, CONCRETE: 3 };

export const SURFACE_INFO = [
  { name: 'grass', grip: 0.62, roll: 0.055, dust: 0.55, color: 0x5e7a3e },
  { name: 'dirt', grip: 0.74, roll: 0.045, dust: 1.0, color: 0x8a6b45 },
  { name: 'asphalt', grip: 1.0, roll: 0.016, dust: 0.0, color: 0x3a3a3f },
  { name: 'concrete', grip: 0.94, roll: 0.02, dust: 0.08, color: 0x6b6b6e },
];

const FIELD_N = 513;                 // heightfield resolution
const FIELD_SPAN = WORLD_HALF * 2;   // 1024 m
const FIELD_STEP = FIELD_SPAN / (FIELD_N - 1);

// ---------------------------------------------------------------------------

export class World {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    this.rng = makeRng(20260918);

    this.roads = buildRoads();
    this.segs = toSegments(this.roads);
    this.lots = buildLots();
    this.graph = buildCityGraph(this.roads);

    this.height = new Float32Array(FIELD_N * FIELD_N);
    this.surface = new Uint8Array(FIELD_N * FIELD_N);
    this.roadW = new Float32Array(FIELD_N * FIELD_N);

    /** Elevated ride-on surfaces (ramps, platforms, bridges). */
    this.surfaces = [];
    this.surfHash = new SpatialHash(20);
    /** Solid obstacles (buildings, barriers, poles). */
    this.obstacles = [];
    this.obsHash = new SpatialHash(22);
    this._stamp = 1;
    this._scratch = [];

    this.spawnPoints = [];

    this.bakeTerrain();
    this.buildRampsAndPlatforms();
    this.buildVisuals();
    this.buildSpawnPoints();
  }

  // -------------------------------------------------------------------------
  // Terrain
  // -------------------------------------------------------------------------
  bakeTerrain() {
    const N = FIELD_N;
    const dist = new Float32Array(N * N).fill(999);
    const roadW = this.roadW;
    const lotW = new Float32Array(N * N);

    const toIdx = (v) => Math.round((v + WORLD_HALF) / FIELD_STEP);
    const toWorld = (i) => i * FIELD_STEP - WORLD_HALF;

    // Rasterise road segments into distance + weight fields.
    for (const s of this.segs) {
      const margin = s.half + 42;
      const i0 = clamp(toIdx(Math.min(s.ax, s.bx) - margin), 0, N - 1);
      const i1 = clamp(toIdx(Math.max(s.ax, s.bx) + margin), 0, N - 1);
      const j0 = clamp(toIdx(Math.min(s.az, s.bz) - margin), 0, N - 1);
      const j1 = clamp(toIdx(Math.max(s.az, s.bz) + margin), 0, N - 1);
      for (let j = j0; j <= j1; j++) {
        const z = toWorld(j);
        for (let i = i0; i <= i1; i++) {
          const x = toWorld(i);
          const d = segDist(s, x, z);
          const k = j * N + i;
          if (d < dist[k]) dist[k] = d;
          // road weight: 1 inside, feather over 3.5m
          const w = 1 - smoothstep(clamp((d - s.half) / 3.5, 0, 1));
          if (w > roadW[k]) roadW[k] = w;
        }
      }
    }

    // Rasterise flat lots.
    for (const lot of this.lots) {
      const hw = lot.w / 2, hd = lot.d / 2;
      const i0 = clamp(toIdx(lot.x - hw - 30), 0, N - 1);
      const i1 = clamp(toIdx(lot.x + hw + 30), 0, N - 1);
      const j0 = clamp(toIdx(lot.z - hd - 30), 0, N - 1);
      const j1 = clamp(toIdx(lot.z + hd + 30), 0, N - 1);
      for (let j = j0; j <= j1; j++) {
        const z = toWorld(j);
        for (let i = i0; i <= i1; i++) {
          const x = toWorld(i);
          const dx = Math.max(Math.abs(x - lot.x) - hw, 0);
          const dz = Math.max(Math.abs(z - lot.z) - hd, 0);
          const d = Math.hypot(dx, dz);
          const k = j * N + i;
          if (d < dist[k]) dist[k] = d;
          const w = 1 - smoothstep(clamp(d / 3.5, 0, 1));
          if (w > lotW[k]) lotW[k] = w;
          if (w > roadW[k]) roadW[k] = w;
        }
      }
    }

    // Dirt playground mask (NW outer region) + dirt tracks.
    const dirtZone = (x, z) => {
      // big off-road bowl in the north-west outer ring area
      const d1 = Math.hypot(x + 330, z - 330) / 150;
      const d2 = Math.hypot(x - 340, z - 320) / 130;
      const d3 = Math.hypot(x + 340, z + 320) / 140;
      return clamp(1 - Math.min(d1, Math.min(d2, d3)), 0, 1);
    };

    for (let j = 0; j < N; j++) {
      const z = toWorld(j);
      for (let i = 0; i < N; i++) {
        const x = toWorld(i);
        const k = j * N + i;
        const base = baseRoadHeight(x, z);
        const d = dist[k];

        // Terrain detail only grows away from paved surfaces.
        const away = smoothstep(clamp((d - 7) / 26, 0, 1));
        const dz = dirtZone(x, z);

        let h = base;
        h += (fbm2(x / 220, z / 220, 3, 11) - 0.5) * 9.0 * away;
        h += (fbm2(x / 64, z / 64, 3, 29) - 0.5) * 2.6 * away;
        // dramatic dunes / jumps in the dirt zones
        h += (fbm2(x / 46, z / 46, 2, 71) - 0.5) * 12.0 * away * dz;
        // outer border berm so the player cannot ride off the map
        const edge = Math.max(Math.abs(x), Math.abs(z));
        if (edge > 470) h += (edge - 470) * 0.9;

        const w = roadW[k];
        this.height[k] = lerp(h, base, w);

        let surf;
        const cityCore = Math.max(Math.abs(x), Math.abs(z)) < 300 ? 1 : 0;
        if (w > 0.55) surf = lotW[k] > 0.55 ? SURF.CONCRETE : SURF.ASPHALT;
        else if (dz > 0.18) surf = SURF.DIRT;
        else if (!cityCore && fbm2(x / 110, z / 110, 2, 5) > 0.70) surf = SURF.DIRT;
        else if (cityCore && d > 26 && fbm2(x / 70, z / 70, 2, 5) > 0.78) surf = SURF.DIRT;
        else surf = SURF.GRASS;
        this.surface[k] = surf;
      }
    }
    this._distField = dist;
  }

  /** Bilinear terrain height (no platforms). */
  terrainHeight(x, z) {
    const N = FIELD_N;
    let fx = (x + WORLD_HALF) / FIELD_STEP;
    let fz = (z + WORLD_HALF) / FIELD_STEP;
    fx = clamp(fx, 0, N - 1.0001);
    fz = clamp(fz, 0, N - 1.0001);
    const i = fx | 0, j = fz | 0;
    const tx = fx - i, tz = fz - j;
    const h = this.height;
    const k = j * N + i;
    const h00 = h[k], h10 = h[k + 1], h01 = h[k + N], h11 = h[k + N + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  terrainSurface(x, z) {
    const N = FIELD_N;
    const i = clamp(Math.round((x + WORLD_HALF) / FIELD_STEP), 0, N - 1);
    const j = clamp(Math.round((z + WORLD_HALF) / FIELD_STEP), 0, N - 1);
    return this.surface[j * N + i];
  }

  // Physics must sample the triangles actually drawn, not the finer source
  // heightfield: the two can differ visibly on grass banks and dirt hills.
  terrainMeshHeight(x, z) {
    const geo = this.terrainMesh?.geometry;
    if (!geo) return this.terrainHeight(x, z);
    const count = geo.parameters.widthSegments, stride = count + 1;
    const fx = clamp((x + WORLD_HALF) / FIELD_SPAN * count, 0, count - 1e-7);
    const fz = clamp((z + WORLD_HALF) / FIELD_SPAN * count, 0, count - 1e-7);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const p = geo.attributes.position, k = j * stride + i;
    const a = p.getY(k), b = p.getY(k + 1), c = p.getY(k + stride), d = p.getY(k + stride + 1);
    return tx + tz <= 1 ? a + tx * (b-a) + tz * (c-a)
      : d + (1-tx) * (c-d) + (1-tz) * (b-d);
  }

  roadWeight(x, z) {
    const N = FIELD_N;
    const i = clamp(Math.round((x + WORLD_HALF) / FIELD_STEP), 0, N - 1);
    const j = clamp(Math.round((z + WORLD_HALF) / FIELD_STEP), 0, N - 1);
    return this.roadW[j * N + i];
  }

  // -------------------------------------------------------------------------
  // Ramps / platforms
  // -------------------------------------------------------------------------
  addSurface(def) {
    const s = Object.assign(
      { yaw: 0, curve: 1, surface: SURF.CONCRETE, kind: 'wedge', base: 0, sideWall: false },
      def
    );
    s.base = this.terrainHeight(s.cx, s.cz);
    s.cos = Math.cos(-s.yaw);
    s.sin = Math.sin(-s.yaw);
    const r = Math.hypot(s.len, s.wid) / 2 + 1;
    s.minX = s.cx - r; s.maxX = s.cx + r;
    s.minZ = s.cz - r; s.maxZ = s.cz + r;
    s.top = s.base + Math.max(s.y0, s.y1);
    this.surfaces.push(s);
    this.surfHash.insertAABB(s.minX, s.minZ, s.maxX, s.maxZ, s);
    return s;
  }

  addObstacle(def) {
    const o = Object.assign({ yaw: 0, type: 'box', bounce: 0.15 }, def);
    o.cos = Math.cos(-o.yaw);
    o.sin = Math.sin(-o.yaw);
    const r = Math.hypot(o.w, o.d) / 2;
    this.obstacles.push(o);
    this.obsHash.insertAABB(o.x - r, o.z - r, o.x + r, o.z + r, o);
    return o;
  }

  /** Local height of a ride-on surface at world (x,z); null if outside. */
  surfaceHeightAt(s, x, z) {
    if (s.kind === 'triangle') {
      const dx=x-s.ax,dz=z-s.az;
      const u=(dx*s.cz-dz*s.cx)*s.invDet,v=(s.bx*dz-s.bz*dx)*s.invDet;
      if(u< -1e-6||v< -1e-6||u+v>1+1e-6)return null;
      return s.ay+u*s.by+v*s.cy;
    }
    const dx = x - s.cx, dz = z - s.cz;
    const u = dx * s.cos - dz * s.sin;   // along length
    const v = dx * s.sin + dz * s.cos;   // across width
    if (Math.abs(u) > s.len / 2 || Math.abs(v) > s.wid / 2) return null;
    let t = (u + s.len / 2) / s.len;
    if (s.kind === 'flat') return s.base + s.y0;
    if (s.curve !== 1) t = Math.pow(t, s.curve);
    return s.base + lerp(s.y0, s.y1, t);
  }

  trafficHeight(x, z, edge) {
    let height = this.terrainHeight(x, z) + .05;
    if (edge?.axis === 'v' && edge.road.coord === 140) {
      for (const surface of this.surfaces) if (surface.isBridge) {
        const y = this.surfaceHeightAt(surface, x, z);
        if (y !== null) height = Math.max(height, y + .02);
      }
    }
    return height;
  }

  /**
   * Ground query. Picks the highest ride-on surface at or below `fromY + reach`,
   * falling back to terrain. Returns height, normal and surface material.
   */
  queryGround(x, z, fromY, out) {
    out = out || {};
    let bestSurf = this.terrainSurface(x, z);
    const terrain = bestSurf <= SURF.DIRT ? this.terrainMeshHeight.bind(this) : this.terrainHeight.bind(this);
    const ty = terrain(x, z);
    // Road ribbons sit 5 cm above the heightfield. Match their running surface
    // so tyres do not visibly sink through asphalt when the suspension settles.
    let best = ty + (bestSurf === SURF.ASPHALT ? 0.05 : 0);
    let platform = null;

    const list = this._scratch;
    list.length = 0;
    this.surfHash.queryPoint(x, z, list, this._stamp++);
    const reach = fromY + 1.4;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const h = this.surfaceHeightAt(s, x, z);
      if (h === null) continue;
      if (h <= reach && h > best) { best = h; bestSurf = s.surface; platform = s; }
    }

    out.y = best;
    out.surface = bestSurf;
    out.platform = platform;
    if(platform?.kind==='triangle'){
      out.nx=platform.nx;out.ny=platform.ny;out.nz=platform.nz;return out;
    }

    // Normal via central differences on the chosen surface.
    const e = 0.85;
    let hx1, hx0, hz1, hz0;
    if (platform) {
      hx1 = this.surfaceHeightAt(platform, x + e, z);
      hx0 = this.surfaceHeightAt(platform, x - e, z);
      hz1 = this.surfaceHeightAt(platform, x, z + e);
      hz0 = this.surfaceHeightAt(platform, x, z - e);
      if (hx1 === null) hx1 = best; if (hx0 === null) hx0 = best;
      if (hz1 === null) hz1 = best; if (hz0 === null) hz0 = best;
    } else {
      hx1 = terrain(x + e, z); hx0 = terrain(x - e, z);
      hz1 = terrain(x, z + e); hz0 = terrain(x, z - e);
    }
    const nx = (hx0 - hx1) / (2 * e);
    const nz = (hz0 - hz1) / (2 * e);
    const inv = 1 / Math.sqrt(nx * nx + nz * nz + 1);
    out.nx = nx * inv; out.ny = inv; out.nz = nz * inv;
    return out;
  }

  /**
   * Push a circle (radius r, at height y) out of solid obstacles.
   * Returns { hit, nx, nz, depth } — normal points away from the obstacle.
   */
  collideCircle(x, z, y, r, out, height = 1.6) {
    out = out || {};
    out.hit = false; out.nx = 0; out.nz = 0; out.depth = 0; out.dx = 0; out.dz = 0;
    const list = this._scratch;
    list.length = 0;
    this.obsHash.query(x - r, z - r, x + r, z + r, list, this._stamp++);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (y > o.y + o.h - 0.15) continue;       // riding over the top
      if (y + height < o.y) continue;           // fully below (under a bridge)
      if (o.radius) {
        const dx = x - o.x, dz = z - o.z, distance = Math.hypot(dx, dz);
        const depth = r + o.radius - distance;
        if (depth > out.depth) Object.assign(out, { hit:true, depth,
          nx:distance > 1e-6 ? dx / distance : 1, nz:distance > 1e-6 ? dz / distance : 0, obstacle:o });
        continue;
      }
      const dx = x - o.x, dz = z - o.z;
      const lx = dx * o.cos - dz * o.sin;
      const lz = dx * o.sin + dz * o.cos;
      const hw = o.w / 2, hd = o.d / 2;
      const cx = clamp(lx, -hw, hw);
      const cz = clamp(lz, -hd, hd);
      let ox = lx - cx, oz = lz - cz;
      let d = Math.hypot(ox, oz);
      if (d >= r) continue;
      let depth = r - d;
      if (d < 1e-4) {
        // deep inside: escape along the shallowest axis
        const px = hw - Math.abs(lx), pz = hd - Math.abs(lz);
        if (px < pz) { ox = Math.sign(lx) || 1; oz = 0; }
        else { ox = 0; oz = Math.sign(lz) || 1; }
        depth = r + Math.min(px, pz);d = 1;
      }
      const inv = 1 / d;
      let nlx = ox * inv, nlz = oz * inv;
      // back to world space
      const c = o.cos, s = o.sin;
      const nwx = nlx * c + nlz * s;
      const nwz = -nlx * s + nlz * c;
      if (depth > out.depth) {
        out.hit = true; out.depth = depth; out.nx = nwx; out.nz = nwz; out.obstacle = o;
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Ramps, jumps, the bridge and the stunt park
  // -------------------------------------------------------------------------
  buildRampsAndPlatforms() {
    const S = SURF;

    // --- Elevated bridge over the z = 0 avenue, along the x = 140 street ---
    // yaw = PI/2 puts the ramp's local +u axis along world +z.
    const bx = 140;
    const deckY = 9.0;
    const deckHalf = 28, rampLength = 72;
    const deckTop = this.terrainHeight(bx, 0) + deckY;
    this.bridge = { x: bx, deckY, half: deckHalf };
    const deck = this.addSurface({
      kind: 'flat', cx: bx, cz: 0, yaw: Math.PI / 2, len: deckHalf * 2, wid: 13,
      y0: deckY, y1: deckY, surface: S.ASPHALT, isBridge: true,
    });
    deck.base = 0;deck.y0 = deck.y1 = deckTop;
    for (const sgn of [-1, 1]) {
      const foot = this.terrainHeight(bx, sgn * (deckHalf + rampLength)) + .05;
      const ramp = this.addSurface({
        kind: 'wedge', cx: bx, cz: sgn * (deckHalf + rampLength / 2), yaw: Math.PI / 2,
        len: rampLength, wid: 13,
        y0: sgn > 0 ? deckTop : foot,
        y1: sgn > 0 ? foot : deckTop,
        surface: S.ASPHALT, isBridge: true,
      });
      ramp.base = 0;ramp.top = deckTop;
    }

    // --- Stunt park (lot at 210,-210) ---
    const px = 210, pz = -210;
    // big kicker ramp pointing -x (toward the city)
    this.addSurface({ kind: 'wedge', cx: px - 20, cz: pz - 34, yaw: Math.PI, len: 26, wid: 12, y0: 0, y1: 4.4, curve: 1.7 });
    // landing ramp for it
    this.addSurface({ kind: 'wedge', cx: px - 78, cz: pz - 34, yaw: Math.PI, len: 30, wid: 16, y0: 3.0, y1: 0, curve: 0.75 });
    // symmetric kicker pointing +x
    this.addSurface({ kind: 'wedge', cx: px + 18, cz: pz + 6, yaw: 0, len: 24, wid: 12, y0: 0, y1: 3.6, curve: 1.6 });
    // table top
    this.addSurface({ kind: 'wedge', cx: px - 30, cz: pz + 34, yaw: 0, len: 18, wid: 18, y0: 0, y1: 2.6 });
    this.addSurface({ kind: 'flat', cx: px - 6, cz: pz + 34, yaw: 0, len: 30, wid: 18, y0: 2.6, y1: 2.6 });
    this.addSurface({ kind: 'wedge', cx: px + 18, cz: pz + 34, yaw: 0, len: 18, wid: 18, y0: 2.6, y1: 0 });
    // quarter pipe against the north edge
    this.addSurface({ kind: 'wedge', cx: px + 44, cz: pz - 34, yaw: 0, len: 16, wid: 26, y0: 0, y1: 5.0, curve: 2.4 });

    // --- Dirt zone jumps ---
    const dirtSpots = [
      { x: -330, z: 330, yaw: 0.4 },
      { x: -360, z: 300, yaw: 2.1 },
      { x: 340, z: 320, yaw: -0.8 },
      { x: -340, z: -320, yaw: 1.3 },
    ];
    for (const sp of dirtSpots) {
      this.addSurface({
        kind: 'wedge', cx: sp.x, cz: sp.z, yaw: sp.yaw, len: 22, wid: 14,
        y0: 0, y1: 4.0, curve: 1.6, surface: S.DIRT,
      });
      this.addSurface({
        kind: 'wedge',
        cx: sp.x + Math.cos(sp.yaw) * 48, cz: sp.z - Math.sin(sp.yaw) * 48,
        yaw: sp.yaw, len: 26, wid: 18, y0: 2.6, y1: 0, curve: 0.8, surface: S.DIRT,
      });
    }

    // --- Roadside kickers so there is always something to jump ---
    const kickers = [
      { x: -140, z: 62, yaw: Math.PI / 2 },
      { x: 0, z: -190, yaw: -Math.PI / 2 },
      { x: -62, z: -140, yaw: 0 },
      { x: 300, z: 140, yaw: Math.PI },
      { x: -300, z: -140, yaw: 0 },
    ];
    for (const k of kickers) {
      this.addSurface({
        kind: 'wedge', cx: k.x, cz: k.z, yaw: k.yaw, len: 16, wid: 9,
        y0: 0, y1: 2.8, curve: 1.8, surface: S.CONCRETE,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Visuals
  // -------------------------------------------------------------------------
  buildVisuals() {
    this.buildTerrainMesh();
    this.buildRoadMeshes();
    this.buildRampMeshes();
    this.buildCity();
    this.buildProps();
  }

  buildTerrainMesh() {
    const geo = this.buildTerrainGeometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTexture(), roughness: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.scene.add(mesh);
    this.terrainMesh = mesh;
  }

  buildTerrainGeometry() {
    const segsN = this.quality === 'low' ? 150 : 230;
    const geo = new THREE.PlaneGeometry(FIELD_SPAN, FIELD_SPAN, segsN, segsN);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grass = new THREE.Color(0x89915a);
    const grass2 = new THREE.Color(0x5e7243);
    const dirt = new THREE.Color(0x8d6b46);
    const dirt2 = new THREE.Color(0x6e5334);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let y = this.terrainHeight(x, z);
      const surf = this.terrainSurface(x, z);
      // Roads already sit above terrain. Sinking shared edge vertices used to
      // carve invisible 30 cm troughs into adjoining grass triangles.
      pos.setY(i, y);
      const n = fbm2(x / 17, z / 17, 2, 3);
      if (surf === SURF.DIRT || surf === SURF.CONCRETE) c.copy(dirt).lerp(dirt2, n);
      else c.copy(grass).lerp(grass2, n);
      if (surf === SURF.ASPHALT) c.setRGB(0.22, 0.22, 0.24);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  _ribbon(pts, halfWidth, yOffset, uRepeat, uScale) {
    // Build a ribbon following the baked ground height.
    const positions = [];
    const uvs = [];
    const indices = [];
    let dist = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const prev = pts[Math.max(i - 1, 0)];
      const next = pts[Math.min(i + 1, n - 1)];
      let dx = next[0] - prev[0], dz = next[1] - prev[1];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const rx = dz, rz = -dx;
      if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const lx = p[0] + rx * halfWidth, lz = p[1] + rz * halfWidth;
      const mx = p[0] - rx * halfWidth, mz = p[1] - rz * halfWidth;
      positions.push(lx, this.terrainHeight(lx, lz) + yOffset, lz);
      positions.push(mx, this.terrainHeight(mx, mz) + yOffset, mz);
      const v = dist / uRepeat;
      const u = uScale || 1;
      uvs.push(0, v, u, v);
      if (i > 0) {
        // Wind counter-clockwise seen from above so the surface normal points
        // UP — the other order makes every road silently back-facing.
        const a = (i - 1) * 2, b = a + 1, cc = i * 2, d = cc + 1;
        indices.push(a, b, cc, b, d, cc);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  _densify(pts, step, closed) {
    const out = [];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.ceil(len / step));
      for (let s = 0; s < k; s++) {
        const t = s / k;
        out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
      }
    }
    if (!closed) out.push(pts[pts.length - 1]);
    else out.push(out[0]);
    return out;
  }

  buildRoadMeshes() {
    const asphaltTex = makeAsphaltTexture();
    const roadGeos = [];
    const markGeos = [];

    for (const r of this.roads) {
      const pts = this._densify(r.pts, 10, !!r.closed);
      roadGeos.push(this._ribbon(pts, r.width / 2, 0.05, 12, r.width / 12));
      if (!r.marked) continue;
      // Edge lines
      for (const side of [-1, 1]) {
        const off = (r.width / 2 - 0.55) * side;
        const line = pts.map((p, i) => {
          const prev = pts[Math.max(i - 1, 0)], next = pts[Math.min(i + 1, pts.length - 1)];
          let dx = next[0] - prev[0], dz = next[1] - prev[1];
          const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          return [p[0] + dz * off, p[1] - dx * off];
        });
        markGeos.push(this._ribbon(line, 0.16, 0.075, 1));
      }
      // Centre line(s)
      if (r.type === ROAD.AVENUE || r.type === ROAD.HIGHWAY) {
        for (const side of [-1, 1]) {
          const off = 0.35 * side;
          const line = pts.map((p, i) => {
            const prev = pts[Math.max(i - 1, 0)], next = pts[Math.min(i + 1, pts.length - 1)];
            let dx = next[0] - prev[0], dz = next[1] - prev[1];
            const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
            return [p[0] + dz * off, p[1] - dx * off];
          });
          markGeos.push(this._ribbon(line, 0.13, 0.075, 1));
        }
      }
      // Dashed lane divider
      if (r.lanes > 1) {
        const half = r.width / 2;
        for (const side of [-1, 1]) {
          const off = (half / 2) * side;
          markGeos.push(...this._dashes(pts, off, 5, 6, 0.14));
        }
      } else {
        markGeos.push(...this._dashes(pts, 0, 4, 7, 0.12));
      }
    }

    // Parking lots / plazas
    for (const lot of this.lots) {
      const g = new THREE.PlaneGeometry(lot.w, lot.d, 4, 4);
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.setY(i, this.terrainHeight(lot.x + p.getX(i), lot.z + p.getZ(i)) + 0.06 - this.terrainHeight(lot.x, lot.z));
      }
      g.translate(lot.x, this.terrainHeight(lot.x, lot.z), lot.z);
      g.computeVertexNormals();
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * lot.w / 12, uv.getY(i) * lot.d / 12);
      roadGeos.push(g);
    }

    const roadMat = new THREE.MeshLambertMaterial({
      map: asphaltTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const roadMesh = new THREE.Mesh(mergeParts(roadGeos), roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.name = 'roads';
    this.scene.add(roadMesh);

    const markMat = new THREE.MeshBasicMaterial({
      color: 0xd8d8c8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const markMesh = new THREE.Mesh(mergeParts(markGeos), markMat);
    markMesh.name = 'markings';
    this.scene.add(markMesh);

    this.buildSidewalks();
    this.buildCrosswalks();
    this.buildParkingStripes();
  }

  buildCrosswalks() {
    const stripes = [];
    for (const edge of this.graph.edges) {
      if (edge.a > edge.b) continue;
      for (const end of [0, 1]) {
        const c = crossingAt(this.graph, edge, end);
        if (c.node.isOverpass) continue;
        for (let offset = -c.half + .65; offset < c.half - .3; offset += 1.2) {
          const x = c.x + c.rx * offset, z = c.z + c.rz * offset;
          stripes.push(this._ribbon([[x - c.dx * 1.5, z - c.dz * 1.5],
            [x + c.dx * 1.5, z + c.dz * 1.5]], .32, .085, 1));
        }
      }
    }
    const mesh = new THREE.Mesh(mergeParts(stripes), new THREE.MeshBasicMaterial({
      color: 0xeeeeDC, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
    mesh.name = 'pedestrian-crosswalks';this.scene.add(mesh);
  }

  _dashes(pts, offset, dashLen, gapLen, halfW) {
    const geos = [];
    let acc = 0;
    let carry = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      const rx = dz, rz = -dx;
      let t = carry;
      while (t < len) {
        const t2 = Math.min(t + dashLen, len);
        if (t2 - t > 0.6) {
          const p0 = [a[0] + dx * t + rx * offset, a[1] + dz * t + rz * offset];
          const p1 = [a[0] + dx * t2 + rx * offset, a[1] + dz * t2 + rz * offset];
          if (!this._nearIntersection(p0) && !this._nearIntersection(p1)) {
            geos.push(this._ribbon([p0, p1], halfW, 0.075, 1));
          }
        }
        t += dashLen + gapLen;
      }
      carry = t - len;
      acc += len;
    }
    void acc;
    return geos;
  }

  _nearIntersection(p) {
    for (const n of this.graph.nodes) {
      if (Math.abs(p[0] - n.x) < n.radius + 4 && Math.abs(p[1] - n.z) < n.radius + 4) return true;
    }
    return false;
  }

  buildSidewalks() {
    const geos = [];
    for (const edge of this.graph.edges) {
      if (edge.a > edge.b) continue;
      const a = crossingAt(this.graph, edge, 0), b = crossingAt(this.graph, edge, 1);
      for (const side of [-1, 1]) {
        const off = (edge.road.width / 2 + 1.7) * side;
        const start = [a.x - edge.dirX * 2 + edge.rx * off, a.z - edge.dirZ * 2 + edge.rz * off];
        const end = [b.x + edge.dirX * 2 + edge.rx * off, b.z + edge.dirZ * 2 + edge.rz * off];
        // Dense, sloped kerb cuts at both ends meet the crossing surface.
        const geometry = this._ribbon(this._densify([start, end], 1, false), 1.7, .22, 4);
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i), z = positions.getZ(i);
          const da = Math.abs((x - a.x) * edge.dirX + (z - a.z) * edge.dirZ);
          const db = Math.abs((x - b.x) * edge.dirX + (z - b.z) * edge.dirZ);
          const ramp = clamp((2.2 - Math.min(da, db)) / .7, 0, 1);
          const lateral = Math.abs((x - a.x) * edge.rx + (z - a.z) * edge.rz);
          const drop = .155 * clamp(1 - (lateral - edge.road.width / 2) / .65, 0, 1) * ramp;
          positions.setY(i, positions.getY(i) - drop);
        }
        geometry.computeVertexNormals();geos.push(geometry);
        // Register the actual pavement triangles, including crossing cuts.
        // A visual-only ribbon leaves tyres riding the lower heightfield.
        const index=geometry.index;
        for(let i=0;i<index.count;i+=3){
          const a=new THREE.Vector3().fromBufferAttribute(positions,index.getX(i));
          const b=new THREE.Vector3().fromBufferAttribute(positions,index.getX(i+1));
          const c=new THREE.Vector3().fromBufferAttribute(positions,index.getX(i+2));
          const ab=b.clone().sub(a),ac=c.clone().sub(a),det=ab.x*ac.z-ab.z*ac.x;
          if(Math.abs(det)<1e-8)continue;
          const normal=new THREE.Vector3().crossVectors(ab,ac).normalize();
          if(normal.y<0)normal.negate();
          const triangle={kind:'triangle',surface:SURF.CONCRETE,
            ax:a.x,ay:a.y,az:a.z,bx:ab.x,by:ab.y,bz:ab.z,cx:ac.x,cy:ac.y,cz:ac.z,
            invDet:1/det,nx:normal.x,ny:normal.y,nz:normal.z};
          this.surfHash.insertAABB(Math.min(a.x,b.x,c.x),Math.min(a.z,b.z,c.z),
            Math.max(a.x,b.x,c.x),Math.max(a.z,b.z,c.z),triangle);
        }
      }
    }
    if (!geos.length) return;
    const mat = new THREE.MeshLambertMaterial({ color: 0x9a9a95 });
    const m = new THREE.Mesh(mergeParts(geos), mat);
    m.receiveShadow = true;
    this.scene.add(m);
  }

  buildParkingStripes() {
    const geos = [];
    for (const lot of this.lots) {
      if (lot.kind !== 'parking') continue;
      const rows = Math.floor(lot.d / 26);
      for (let r = 0; r < rows; r++) {
        const z = lot.z - lot.d / 2 + 16 + r * 26;
        const count = Math.floor(lot.w / 3.2);
        for (let i = 0; i <= count; i++) {
          const x = lot.x - lot.w / 2 + 6 + i * 3.2;
          if (x > lot.x + lot.w / 2 - 4) break;
          geos.push(this._ribbon([[x, z - 5.5], [x, z + 5.5]], 0.11, 0.09, 1));
        }
      }
    }
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeParts(geos), new THREE.MeshBasicMaterial({ color: 0xc9c9b4 }));
    this.scene.add(m);
  }

  buildRampMeshes() {
    const geos = { asphalt: [], concrete: [], dirt: [] };
    for (const s of this.surfaces) {
      const g = rampGeometry(s);
      const key = s.surface === SURF.DIRT ? 'dirt' : s.surface === SURF.ASPHALT ? 'asphalt' : 'concrete';
      geos[key].push(g);
    }
    const mats = {
      asphalt: new THREE.MeshLambertMaterial({ color: 0x45454a, side: THREE.DoubleSide }),
      concrete: new THREE.MeshLambertMaterial({ color: 0x8b8b86, side: THREE.DoubleSide }),
      dirt: new THREE.MeshLambertMaterial({ color: 0x7d6042, side: THREE.DoubleSide }),
    };
    for (const k of Object.keys(geos)) {
      if (!geos[k].length) continue;
      const m = new THREE.Mesh(mergeParts(geos[k]), mats[k]);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    }
    this.buildBridgeStructure();
  }

  buildBridgeStructure() {
    const geos = [];
    const b = this.bridge;
    // Pillars under the deck.
    for (const z of [-b.half + 5, b.half - 5]) {
      const g = new THREE.BoxGeometry(2.4, b.deckY, 2.4);
      const ground = this.terrainHeight(b.x, z);
      g.translate(b.x, ground + b.deckY / 2, z);
      geos.push(g);
      this.addObstacle({ x: b.x, z, w: 2.4, d: 2.4, y: ground, h: b.deckY - 0.4, kind: 'pillar' });
    }
    // Guard rails follow both approaches and the deck.
    for (const side of [-1, 1]) {
      for (let z = -100; z < 100; z += 4) {
        const edge = { axis: 'v', road: { coord: b.x } };
        const y0 = this.trafficHeight(b.x, z, edge), y1 = this.trafficHeight(b.x, z + 4, edge);
        const rail = new THREE.BoxGeometry(.35, 1, Math.hypot(4, y1 - y0) + .03);
        rail.rotateX(-Math.atan2(y1 - y0, 4));rail.translate(b.x + side * 6.6, (y0 + y1) / 2 + .5, z + 2);
        geos.push(rail);
        this.addObstacle({ x: b.x + side * 6.6, z: z + 2, w: .35, d: 4.05,
          y: Math.min(y0, y1), h: 1 + Math.abs(y1 - y0), kind: 'guardrail' });
      }
    }
    const m = new THREE.Mesh(mergeParts(geos), new THREE.MeshLambertMaterial({ color: 0x8e8e8a }));
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
  }

  // -------------------------------------------------------------------------
  buildCity() {
    const rng = this.rng;
    const facadeTex = [0, 1, 2, 3].map((i) => makeFacadeTexture(i));
    const buckets = facadeTex.map(() => []);
    const roofGeos = [];

    const blockLots = [];
    for (let i = 0; i < GRID_X.length - 1; i++) {
      for (let j = 0; j < GRID_Z.length - 1; j++) {
        const x0 = GRID_X[i], x1 = GRID_X[i + 1];
        const z0 = GRID_Z[j], z1 = GRID_Z[j + 1];
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const rw = 13, // half road width + pavement clearance
          usable = { x0: x0 + rw, x1: x1 - rw, z0: z0 + rw, z1: z1 - rw };
        blockLots.push({ cx, cz, usable });
      }
    }

    for (const block of blockLots) {
      const { usable, cx, cz } = block;
      // Reserved zones
      const reserved = this.lots.some(
        (l) => Math.abs(l.x - cx) < 70 && Math.abs(l.z - cz) < 70
      );
      if (reserved) continue;

      const distCenter = Math.hypot(cx, cz);
      const isPark = rng() < 0.16;
      if (isPark) { block.park = true; continue; }

      const cols = rng() < 0.5 ? 2 : 3;
      const rows = rng() < 0.5 ? 2 : 3;
      const bw = (usable.x1 - usable.x0) / cols;
      const bd = (usable.z1 - usable.z0) / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rng() < 0.12) continue; // gap / courtyard
          const px = usable.x0 + bw * (c + 0.5);
          const pz = usable.z0 + bd * (r + 0.5);
          const w = bw * (0.62 + rng() * 0.28);
          const d = bd * (0.62 + rng() * 0.28);
          const tall = clamp(1 - distCenter / 420, 0, 1);
          const h = 10 + rng() * (14 + tall * 78);
          const base = this.terrainHeight(px, pz);
          const variant = (rng() * 4) | 0;

          const g = new THREE.BoxGeometry(w, h, d);
          g.translate(px, base + h / 2, pz);
          // Each texture contains four bays by four storeys.
          scaleBoxUV(g, w, h, d, 16.0, 14.4);
          buckets[variant].push(g);

          // Roof cap
          const rg = new THREE.BoxGeometry(w * 1.03, 0.9, d * 1.03);
          rg.translate(px, base + h + 0.3, pz);
          roofGeos.push(rg);
          if (h > 34 && rng() < 0.6) {
            const box = new THREE.BoxGeometry(w * 0.3, 3 + rng() * 5, d * 0.3);
            box.translate(px + (rng() - 0.5) * w * 0.3, base + h + 2.4, pz + (rng() - 0.5) * d * 0.3);
            roofGeos.push(box);
          }
          this.addObstacle({ x: px, z: pz, w, d, y: base, h, kind: 'building' });
        }
      }
    }

    for (let i = 0; i < buckets.length; i++) {
      if (!buckets[i].length) continue;
      const mat = new THREE.MeshStandardMaterial({ map: facadeTex[i], roughness: 0.78 });
      const mesh = new THREE.Mesh(mergeParts(buckets[i]), mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    if (roofGeos.length) {
      const m = new THREE.Mesh(mergeParts(roofGeos), new THREE.MeshLambertMaterial({ color: 0x55565c }));
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    }
    this.blockLots = blockLots;
  }

  buildProps() {
    const rng = this.rng;
    // --- Street lights ---
    const poleGeos = [];
    const lampPos = [];
    for (const r of this.roads) {
      if (r.type === ROAD.STREET) continue;
      const pts = this._densify(r.pts, 46, !!r.closed);
      for (let i = 1; i < pts.length - 1; i += 1) {
        const p = pts[i];
        if (this._nearIntersection(p)) continue;
        const side = i % 2 === 0 ? 1 : -1;
        const prev = pts[i - 1], next = pts[i + 1];
        let dx = next[0] - prev[0], dz = next[1] - prev[1];
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const rx = dz * side, rz = -dx * side;
        const off = r.width / 2 + 1.4;
        const x = p[0] + rx * off, z = p[1] + rz * off;
        const y = this.terrainHeight(x, z);
        const pole = new THREE.CylinderGeometry(0.16, 0.22, 8.4, 6);
        pole.translate(x, y + 4.2, z);
        poleGeos.push(pole);
        const arm = new THREE.BoxGeometry(2.6, 0.18, 0.18);
        arm.translate(x - rx * 1.3, y + 8.3, z - rz * 1.3);
        arm.applyMatrix4(new THREE.Matrix4().makeRotationY(0));
        poleGeos.push(arm);
        lampPos.push([x - rx * 2.4, y + 8.2, z - rz * 2.4]);
        this.addObstacle({ x, z, w: .44, d: .44, radius:.22, y, h: 8.4, kind: 'pole', bounce: 0.05 });
      }
    }
    if (poleGeos.length) {
      const m = new THREE.Mesh(mergeParts(poleGeos), new THREE.MeshLambertMaterial({ color: 0x5a5d63 }));
      m.castShadow = true;
      this.scene.add(m);
    }
    if (lampPos.length) {
      const lg = new THREE.BoxGeometry(1.1, 0.24, 0.5);
      const lm = new THREE.MeshBasicMaterial({ color: 0xffeebb });
      const inst = new THREE.InstancedMesh(lg, lm, lampPos.length);
      const mtx = new THREE.Matrix4();
      lampPos.forEach((p, i) => {
        mtx.makeTranslation(p[0], p[1], p[2]);
        inst.setMatrixAt(i, mtx);
      });
      inst.instanceMatrix.needsUpdate = true;
      this.scene.add(inst);
    }

    // --- Trees ---
    const trunkGeos = [];
    const leafMtx = [];
    const treeSpots = [];
    for (const block of this.blockLots || []) {
      if (!block.park) continue;
      for (let i = 0; i < 26; i++) {
        const x = lerp(block.usable.x0, block.usable.x1, rng());
        const z = lerp(block.usable.z0, block.usable.z1, rng());
        treeSpots.push([x, z, 1]);
      }
    }
    for (let i = 0; i < 620; i++) {
      const x = (rng() - 0.5) * 940;
      const z = (rng() - 0.5) * 940;
      if (this.roadWeight(x, z) > 0.02) continue;
      const s = this.terrainSurface(x, z);
      if (s === SURF.ASPHALT || s === SURF.CONCRETE) continue;
      if (Math.abs(x) < 300 && Math.abs(z) < 300 && rng() < 0.7) continue;
      treeSpots.push([x, z, s === SURF.GRASS ? 1 : 0.8]);
    }
    for (const [x, z, sc] of treeSpots) {
      const y = this.terrainHeight(x, z);
      const h = (3.2 + rng() * 3.4) * sc;
      const tg = new THREE.CylinderGeometry(0.11 * sc, 0.24 * sc, h, 9);
      tg.translate(x, y + h / 2, z);
      trunkGeos.push(tg);
      for (let branch = 0; branch < 5; branch++) {
        const a = branch * 2.4 + rng(), reach = (0.7 + rng()) * sc;
        trunkGeos.push(tubeBetween(x, y + h * .65, z, x + Math.cos(a) * reach,
          y + h + rng() * sc, z + Math.sin(a) * reach, .065 * sc, 6));
      }
      leafMtx.push({ x, y: y + h + 1.5 * sc, z, s: (1.7 + rng() * 1.3) * sc, r: rng() * TAU });
      this.addObstacle({ x, z, w: .48 * sc, d: .48 * sc, radius:.24 * sc, y, h, kind: 'tree', bounce: 0.1 });
    }
    if (trunkGeos.length) {
      const m = new THREE.Mesh(mergeParts(trunkGeos), new THREE.MeshLambertMaterial({ color: 0x5a4227 }));
      m.castShadow = true;
      this.scene.add(m);
      const { geometry: lg, material: lm } = foliageAssets(this.quality);
      const inst = new THREE.InstancedMesh(lg, lm, leafMtx.length);
      inst.castShadow = true;
      inst.receiveShadow = true;
      const mtx = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const v = new THREE.Vector3();
      const sv = new THREE.Vector3();
      leafMtx.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r);
        v.set(t.x, t.y, t.z);
        sv.set(t.s, t.s * 1.15, t.s);
        mtx.compose(v, q, sv);
        inst.setMatrixAt(i, mtx);
        inst.setColorAt(i, new THREE.Color().setHSL(.20 + rng() * .035, .14 + rng() * .15, .65 + rng() * .2));
      });
      inst.instanceMatrix.needsUpdate = true;
      this.scene.add(inst);
    }

    this.buildBarriers();
    this.buildTrafficLightMeshes();
    this.buildSigns();
  }

  buildBarriers() {
    const geos = [];
    // Guard rails along the ring highway outer edge.
    const ring = this.roads.find((r) => r.id === 'RING');
    const pts = this._densify(ring.pts, 12, true);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
      const rx = dz, rz = -dx;
      for (const side of [-1, 1]) {
        const off = (ring.width / 2 + 1.2) * side;
        const mx = (a[0] + b[0]) / 2 + rx * off;
        const mz = (a[1] + b[1]) / 2 + rz * off;
        const y = this.terrainHeight(mx, mz);
        const yaw = Math.atan2(dx, dz);
        const g = new THREE.BoxGeometry(0.3, 0.8, len + 0.4);
        g.rotateY(yaw);
        g.translate(mx, y + 0.65, mz);
        geos.push(g);
        this.addObstacle({ x: mx, z: mz, w: 0.5, d: len, yaw, y, h: 0.9, kind: 'rail', bounce: 0.35 });
      }
    }
    // Concrete blocks scattered around the stunt lot edges.
    for (const lot of this.lots) {
      if (lot.kind !== 'stunt') continue;
      for (let i = 0; i < 12; i++) {
        const t = i / 12;
        const x = lot.x - lot.w / 2 + lot.w * t;
        const z = lot.z + lot.d / 2 - 3;
        const y = this.terrainHeight(x, z);
        const g = new THREE.BoxGeometry(6, 1.0, 1.2);
        g.translate(x, y + 0.5, z);
        geos.push(g);
        this.addObstacle({ x, z, w: 6, d: 1.2, y, h: 1.0, kind: 'block', bounce: 0.3 });
      }
    }
    const m = new THREE.Mesh(mergeParts(geos), new THREE.MeshLambertMaterial({ color: 0xb4b2a8 }));
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
  }

  buildTrafficLightMeshes() {
    const poleGeos = [];
    const lamps = [];
    for (const n of this.graph.nodes) {
      if (!n.light) continue;
      const r = n.radius + 2.5;
      const corners = [[1, 1], [-1, -1], [1, -1], [-1, 1]];
      n.lampIndices = [];
      for (let c = 0; c < 4; c++) {
        const x = n.x + corners[c][0] * r;
        const z = n.z + corners[c][1] * r;
        const y = this.terrainHeight(x, z);
        const pg = new THREE.CylinderGeometry(0.13, 0.16, 6.0, 5);
        pg.translate(x, y + 3, z);
        poleGeos.push(pg);
        const hg = new THREE.BoxGeometry(0.5, 1.4, 0.4);
        hg.translate(x, y + 5.6, z);
        poleGeos.push(hg);
        // Axis that this head governs: alternate NS / EW by corner pairing
        const axis = c < 2 ? 'v' : 'h';
        lamps.push({ x, y: y + 5.6, z, node: n, axis });
        n.lampIndices.push(lamps.length - 1);
        this.addObstacle({ x, z, w: 0.45, d: 0.45, y, h: 6, kind: 'pole', bounce: 0.05 });
      }
    }
    if (!poleGeos.length) return;
    const m = new THREE.Mesh(mergeParts(poleGeos), new THREE.MeshLambertMaterial({ color: 0x3f4247 }));
    m.castShadow = true;
    this.scene.add(m);

    const lg = new THREE.SphereGeometry(0.22, 8, 6);
    const lm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const inst = new THREE.InstancedMesh(lg, lm, lamps.length);
    const mtx = new THREE.Matrix4();
    lamps.forEach((l, i) => {
      mtx.makeTranslation(l.x, l.y, l.z + 0.26);
      inst.setMatrixAt(i, mtx);
      inst.setColorAt(i, new THREE.Color(0x00ff44));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.scene.add(inst);
    this.lampInstances = inst;
    this.lamps = lamps;
    this._lampColor = new THREE.Color();
  }

  buildSigns() {
    const geos = [];
    const rng = this.rng;
    for (let i = 0; i < 46; i++) {
      const road = this.roads[(rng() * this.roads.length) | 0];
      if (road.closed) continue;
      const t = 0.1 + rng() * 0.8;
      const a = road.pts[0], b = road.pts[road.pts.length - 1];
      const x = lerp(a[0], b[0], t) + (road.axis === 'v' ? road.width / 2 + 2.2 : 0);
      const z = lerp(a[1], b[1], t) + (road.axis === 'h' ? road.width / 2 + 2.2 : 0);
      if (this._nearIntersection([x, z])) continue;
      const y = this.terrainHeight(x, z);
      const pg = new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5);
      pg.translate(x, y + 1.3, z);
      geos.push(pg);
      const sg = new THREE.BoxGeometry(0.9, 0.9, 0.08);
      sg.rotateY(road.axis === 'v' ? Math.PI / 2 : 0);
      sg.translate(x, y + 2.4, z);
      geos.push(sg);
    }
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeParts(geos), new THREE.MeshLambertMaterial({ color: 0xc8cbd0 }));
    m.castShadow = true;
    this.scene.add(m);
  }

  buildSpawnPoints() {
    const cand = [
      { x: 0, z: -60, yaw: 0, name: 'Downtown' },
      { x: 140, z: -230, yaw: 0, name: 'Bridge approach' },
      { x: 244, z: -176, yaw: Math.PI, name: 'Stunt park' },
      { x: -280, z: 0, yaw: Math.PI / 2, name: 'West avenue' },
      { x: 0, z: 394, yaw: Math.PI / 2, name: 'Highway ring' },
      { x: -320, z: 300, yaw: -0.6, name: 'Dirt playground' },
      { x: -210, z: 210, yaw: 0, name: 'Parking lot' },
    ];
    // Nudge any spawn that ended up inside a prop rather than trusting the
    // hand-authored coordinates to stay valid as the world changes.
    for (const c of cand) {
      c.y = this.terrainHeight(c.x, c.z);
      for (let i = 0; i < 24; i++) {
        const hit = this.collideCircle(c.x, c.z, c.y + 0.4, 1.0, {});
        if (!hit.hit) break;
        c.x += hit.nx * (hit.depth + 1.2);
        c.z += hit.nz * (hit.depth + 1.2);
        c.y = this.terrainHeight(c.x, c.z);
      }
      this.spawnPoints.push(c);
    }
  }

  // -------------------------------------------------------------------------
  update(dt) {
    // Traffic light cycling.
    let anyChange = false;
    for (const n of this.graph.nodes) {
      const L = n.light;
      if (!L) continue;
      L.t += dt;
      if (L.state === 'green' && L.t > L.greenTime) { L.state = 'yellow'; L.t = 0; anyChange = true; }
      else if (L.state === 'yellow' && L.t > L.yellowTime) {
        L.state = 'green'; L.phase = 1 - L.phase; L.t = 0; anyChange = true;
      }
    }
    if (anyChange && this.lampInstances) this.refreshLamps();
  }

  refreshLamps() {
    const c = this._lampColor;
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i];
      const st = this.lightStateFor(l.node, l.axis);
      c.setHex(st === 'green' ? 0x22ff55 : st === 'yellow' ? 0xffcc22 : 0xff2222);
      this.lampInstances.setColorAt(i, c);
    }
    if (this.lampInstances.instanceColor) this.lampInstances.instanceColor.needsUpdate = true;
  }

  /** 'green' | 'yellow' | 'red' for a given travel axis at a node. */
  lightStateFor(node, axis) {
    const L = node.light;
    if (!L) return 'green';
    const axisPhase = axis === 'v' ? 0 : 1;
    if (L.phase !== axisPhase) return 'red';
    return L.state === 'yellow' ? 'yellow' : 'green';
  }
}

// ---------------------------------------------------------------------------
// Geometry & texture helpers
// ---------------------------------------------------------------------------

function rampGeometry(s) {
  const segments = s.curve !== 1 ? 10 : 1;
  const positions = [];
  const indices = [];
  const hw = s.wid / 2;
  const cos = Math.cos(s.yaw), sin = Math.sin(s.yaw);
  const toWorld = (u, v, y) => {
    // Must match surfaceHeightAt()'s local frame exactly, or the ramp you see
    // is the mirror image of the ramp you actually ride:
    //   +u axis = ( cos yaw, sin yaw)   +v axis = (-sin yaw, cos yaw)
    const x = s.cx + u * cos - v * sin;
    const z = s.cz + u * sin + v * cos;
    return [x, y, z];
  };
  const heightAt = (t) => {
    if (s.kind === 'flat') return s.y0;
    const tt = s.curve !== 1 ? Math.pow(t, s.curve) : t;
    return lerp(s.y0, s.y1, tt);
  };
  const rows = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = -s.len / 2 + s.len * t;
    const y = s.base + heightAt(t);
    rows.push([u, y]);
  }
  // Top surface
  for (let i = 0; i <= segments; i++) {
    const [u, y] = rows[i];
    positions.push(...toWorld(u, -hw, y));
    positions.push(...toWorld(u, hw, y));
  }
  for (let i = 0; i < segments; i++) {
    // Counter-clockwise from above so the ride-on face points up.
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  // The deck is a thin slab; a full-height skirt would hide the underpass.
  const off = (segments + 1) * 2;
  for (let i = 0; i <= segments; i++) {
    const [u, y] = rows[i];
    const bottom = s.isBridge && s.kind === 'flat' ? y - .45 : s.base - .6;
    positions.push(...toWorld(u, -hw, bottom));
    positions.push(...toWorld(u, hw, bottom));
  }
  for (let i = 0; i < segments; i++) {
    // left side
    const t0 = i * 2, t1 = (i + 1) * 2;
    const b0 = off + i * 2, b1 = off + (i + 1) * 2;
    indices.push(t0, b0, t1, t1, b0, b1);
    // right side
    const t0r = i * 2 + 1, t1r = (i + 1) * 2 + 1;
    const b0r = off + i * 2 + 1, b1r = off + (i + 1) * 2 + 1;
    indices.push(t0r, t1r, b0r, b0r, t1r, b1r);
  }
  // Back cap
  const lastT = segments * 2;
  const lastB = off + segments * 2;
  indices.push(lastT, lastT + 1, lastB, lastB, lastT + 1, lastB + 1);
  indices.push(0, off, 1, 1, off, off + 1);
  if (s.isBridge && s.kind === 'flat') indices.push(off, off + 2, off + 1, off + 1, off + 2, off + 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const uv = new Float32Array((positions.length / 3) * 2);
  for (let i = 0; i < positions.length / 3; i++) {
    uv[i * 2] = positions[i * 3] / 6;
    uv[i * 2 + 1] = positions[i * 3 + 2] / 6;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function scaleBoxUV(geo, w, h, d, uScale, vScale) {
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(norm.getX(i)), ny = Math.abs(norm.getY(i));
    let u = uv.getX(i), v = uv.getY(i);
    if (ny > 0.5) { u *= w / uScale; v *= d / uScale; }
    else if (nx > 0.5) { u *= d / uScale; v *= h / vScale; }
    else { u *= w / uScale; v *= h / vScale; }
    uv.setXY(i, u, v);
  }
  void pos;
}

export function makeAsphaltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3c3c41';
  g.fillRect(0, 0, 128, 128);
  const img = g.getImageData(0, 0, 128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 13;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // A few faint patches so long straights are not perfectly uniform.
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},0.030)`;
    g.beginPath();
    g.ellipse(Math.random() * 128, Math.random() * 128,
      6 + Math.random() * 22, 4 + Math.random() * 16, Math.random() * 3, 0, 6.3);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function makeFacadeTexture(variant) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.scale(4, 4);
  const walls = ['#bbb5a5', '#748189', '#a57d63', '#8b8d80'];
  const wins = ['#3d4b58', '#2c3a46', '#455059', '#333d44'];
  g.fillStyle = walls[variant % walls.length];
  g.fillRect(0, 0, 128, 128);
  // subtle vertical banding
  for (let i = 0; i < 128; i += 4) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    g.fillRect(i, 0, 2, 128);
  }
  const cols = 4, rows = 4;
  const cw = 128 / cols, ch = 128 / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lit = Math.random();
      g.fillStyle = wins[variant % wins.length];
      g.globalAlpha = 0.75 + lit * 0.25;
      g.fillRect(i * cw + cw * 0.18, j * ch + ch * 0.18, cw * 0.64, ch * 0.5);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(i * cw + cw * 0.18, j * ch + ch * 0.18, cw * 0.64, ch * 0.08);
      const x = i * cw + cw * .18, y = j * ch + ch * .18, w = cw * .64, h = ch * .5;
      g.strokeStyle = '#252f36';g.lineWidth = .7;g.strokeRect(x, y, w, h);
      g.fillStyle = '#bcc4c4';g.fillRect(x + w * .49, y, .5, h);
      g.fillStyle = '#dedbd0';g.fillRect(x - .8, y + h, w + 1.6, .8);
      g.fillStyle = '#00000024';g.fillRect(x - .8, y + h + .8, w + 1.6, 1.2);
      if (lit > .7) { g.fillStyle = '#a7a297';g.fillRect(x + 1, y + 1, w - 2, h * .32); }
    }
  }
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 1;
  for (let j = 0; j <= rows; j++) {
    g.beginPath(); g.moveTo(0, j * ch); g.lineTo(128, j * ch); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

void clamp;
void RING_HALF;
