// roadnet.js — road network definition + traffic graph.
//
// The network is authored as polylines. From those we derive:
//   * a rasterisable list of segments (used by the terrain baker + road meshes)
//   * a directed lane graph for the city grid (traffic AI, traffic lights)
//   * closed lane loops for the ring highway (fast circulating traffic)

import { clamp, closestTOnSegment } from './core.js';

export const ROAD = {
  AVENUE: 'avenue',
  STREET: 'street',
  HIGHWAY: 'highway',
  LOT: 'lot',
};

export const GRID_X = [-280, -140, 0, 140, 280];
export const GRID_Z = [-280, -140, 0, 140, 280];
export const RING_HALF = 420;
export const RING_RADIUS = 130; // corner radius
export const WORLD_HALF = 512;

const AVENUE_W = 20;
const STREET_W = 11;
const HIGHWAY_W = 26;

/** Gentle global undulation shared by every road so junctions always match. */
export function baseRoadHeight(x, z) {
  return (
    2.2 * Math.sin(x / 260 + 0.6) * Math.cos(z / 310 - 0.2) +
    1.1 * Math.sin((x + z) / 420 + 1.9)
  );
}

function isAvenueX(x) { return x === 0 || x === -280 || x === 280; }
function isAvenueZ(z) { return z === 0 || z === -280 || z === 280; }

/** Build the ring highway polyline (rounded rectangle, clockwise). */
function ringPolyline() {
  const H = RING_HALF, R = RING_RADIUS;
  const pts = [];
  const corners = [
    [H - R, H - R, 0],        // +x +z
    [-(H - R), H - R, 1],     // -x +z
    [-(H - R), -(H - R), 2],  // -x -z
    [H - R, -(H - R), 3],     // +x -z
  ];
  // Walk: start at (+H, -(H-R)) going +z along east edge.
  pts.push([H, -(H - R)]);
  pts.push([H, H - R]);
  const arcSteps = 10;
  const arcs = [
    { cx: H - R, cz: H - R, a0: 0, a1: Math.PI / 2 },
    { cx: -(H - R), cz: H - R, a0: Math.PI / 2, a1: Math.PI },
    { cx: -(H - R), cz: -(H - R), a0: Math.PI, a1: 1.5 * Math.PI },
    { cx: H - R, cz: -(H - R), a0: 1.5 * Math.PI, a1: 2 * Math.PI },
  ];
  const edgeEnds = [
    [-(H - R), H], // after arc 0 -> north edge to -x
    [-H, -(H - R)], // after arc 1 -> west edge to -z
    [H - R, -H],   // after arc 2 -> south edge to +x
  ];
  for (let i = 0; i < 4; i++) {
    const a = arcs[i];
    for (let s = 1; s <= arcSteps; s++) {
      const t = a.a0 + (a.a1 - a.a0) * (s / arcSteps);
      pts.push([a.cx + Math.cos(t) * R, a.cz + Math.sin(t) * R]);
    }
    if (i < 3) pts.push(edgeEnds[i]);
  }
  pts.push([H, -(H - R)]); // close
  void corners;
  return pts;
}

/**
 * Full road list. Each road: { pts, width, type, lanes (per direction), marked }
 */
export function buildRoads() {
  const roads = [];
  const G0 = GRID_X[0], G1 = GRID_X[GRID_X.length - 1];

  // Vertical roads (constant x).
  for (const x of GRID_X) {
    const avenue = isAvenueX(x);
    const reach = x === 0 ? RING_HALF - 6 : G1;
    roads.push({
      id: `V${x}`,
      axis: 'v',
      coord: x,
      pts: [[x, -reach], [x, reach]],
      width: avenue ? AVENUE_W : STREET_W,
      type: avenue ? ROAD.AVENUE : ROAD.STREET,
      lanes: avenue ? 2 : 1,
      marked: true,
    });
  }
  // Horizontal roads (constant z).
  for (const z of GRID_Z) {
    const avenue = isAvenueZ(z);
    const reach = z === 0 ? RING_HALF - 6 : G1;
    roads.push({
      id: `H${z}`,
      axis: 'h',
      coord: z,
      pts: [[-reach, z], [reach, z]],
      width: avenue ? AVENUE_W : STREET_W,
      type: avenue ? ROAD.AVENUE : ROAD.STREET,
      lanes: avenue ? 2 : 1,
      marked: true,
    });
  }
  void G0;

  // Ring highway.
  roads.push({
    id: 'RING',
    axis: 'ring',
    pts: ringPolyline(),
    width: HIGHWAY_W,
    type: ROAD.HIGHWAY,
    lanes: 2,
    marked: true,
    closed: true,
  });

  return roads;
}

/** Flat asphalt areas: parking lots, plazas, the stunt pad. */
export function buildLots() {
  return [
    { x: -210, z: 210, w: 110, d: 100, kind: 'parking' },
    { x: 210, z: 210, w: 100, d: 90, kind: 'parking' },
    { x: -210, z: -60, w: 90, d: 80, kind: 'parking' },
    { x: 210, z: -210, w: 125, d: 125, kind: 'stunt' },
    { x: 0, z: 0, w: 0, d: 0, kind: 'skip' }, // placeholder, filtered below
    { x: -350, z: -350, w: 150, d: 150, kind: 'plaza' },
  ].filter((l) => l.w > 0);
}

/** Expand roads into straight segments with precomputed bounds. */
export function toSegments(roads) {
  const segs = [];
  for (const r of roads) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      if (ax === bx && az === bz) continue;
      segs.push({
        ax, az, bx, bz,
        w: r.width,
        half: r.width / 2,
        type: r.type,
        road: r,
      });
    }
  }
  return segs;
}

/** Distance from (px,pz) to a segment in XZ. */
export function segDist(s, px, pz) {
  const t = closestTOnSegment(s.ax, s.az, s.bx, s.bz, px, pz);
  const cx = s.ax + (s.bx - s.ax) * t;
  const cz = s.az + (s.bz - s.az) * t;
  const dx = px - cx, dz = pz - cz;
  return Math.sqrt(dx * dx + dz * dz);
}

// ---------------------------------------------------------------------------
// City lane graph
// ---------------------------------------------------------------------------

export function laneOffsets(road) {
  const half = road.width / 2;
  const laneW = half / road.lanes;
  const offs = [];
  for (let i = 0; i < road.lanes; i++) offs.push(laneW * (i + 0.5));
  return offs;
}

/**
 * Directed lane graph over the grid intersections.
 * Nodes: grid crossings. Edges: node -> neighbour node along a road.
 */
export function buildCityGraph(roads) {
  const nodes = [];
  const nodeIdx = new Map();
  const key = (x, z) => `${x}|${z}`;

  for (const x of GRID_X) {
    for (const z of GRID_Z) {
      const vRoad = roads.find((r) => r.axis === 'v' && r.coord === x);
      const hRoad = roads.find((r) => r.axis === 'h' && r.coord === z);
      if (!vRoad || !hRoad) continue;
      const id = nodes.length;
      nodeIdx.set(key(x, z), id);
      nodes.push({
        id, x, z,
        radius: Math.max(vRoad.width, hRoad.width) / 2 + 2,
        out: [],
        in: [],
        light: null,
        vRoad, hRoad,
      });
    }
  }

  const edges = [];
  const addEdge = (aId, bId, road) => {
    const a = nodes[aId], b = nodes[bId];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const dirX = dx / len, dirZ = dz / len;
    // right-hand side normal (travel direction rotated -90deg about Y)
    const rx = dirZ, rz = -dirX;
    const e = {
      id: edges.length,
      a: aId, b: bId,
      road,
      dirX, dirZ, rx, rz, len,
      axis: road.axis, // 'v' or 'h'
      lanes: laneOffsets(road),
    };
    edges.push(e);
    a.out.push(e.id);
    b.in.push(e.id);
    return e;
  };

  for (const road of roads) {
    if (road.axis === 'v') {
      const x = road.coord;
      for (let i = 0; i < GRID_Z.length - 1; i++) {
        const a = nodeIdx.get(key(x, GRID_Z[i]));
        const b = nodeIdx.get(key(x, GRID_Z[i + 1]));
        if (a === undefined || b === undefined) continue;
        addEdge(a, b, road);
        addEdge(b, a, road);
      }
    } else if (road.axis === 'h') {
      const z = road.coord;
      for (let i = 0; i < GRID_X.length - 1; i++) {
        const a = nodeIdx.get(key(GRID_X[i], z));
        const b = nodeIdx.get(key(GRID_X[i + 1], z));
        if (a === undefined || b === undefined) continue;
        addEdge(a, b, road);
        addEdge(b, a, road);
      }
    }
  }

  // The bridge deck and the avenue below are separate graph nodes: traffic
  // cannot turn nine metres down from the deck onto the road underneath.
  const underpass = nodes.find(n => n.x === 140 && n.z === 0);
  if (underpass) {
    const deck = { ...underpass, id: nodes.length, out: [], in: [], light: null, isOverpass: true };
    nodes.push(deck);
    for (const edge of edges) if (edge.axis === 'v') {
      if (edge.a === underpass.id) { edge.a = deck.id;deck.out.push(edge.id); }
      if (edge.b === underpass.id) { edge.b = deck.id;deck.in.push(edge.id); }
    }
    underpass.out = underpass.out.filter(id => edges[id].axis === 'h');
    underpass.in = underpass.in.filter(id => edges[id].axis === 'h');
  }

  // Traffic lights on nodes where both crossing roads are avenues or where
  // 4 ways meet on at least one avenue.
  for (const n of nodes) {
    const busy = n.vRoad.type === ROAD.AVENUE || n.hRoad.type === ROAD.AVENUE;
    if (busy && n.out.length >= 3) {
      n.light = {
        phase: (Math.abs(n.x / 140) + Math.abs(n.z / 140)) % 2 < 1 ? 0 : 1,
        t: Math.random() * 12,
        greenTime: 11 + ((n.id * 7) % 5),
        yellowTime: 2.2,
        state: 'green',
      };
    }
  }

  return { nodes, edges };
}

/** World position of a point along an edge lane. */
export function edgePoint(edge, nodes, lane, t, out) {
  const a = nodes[edge.a], b = nodes[edge.b];
  const off = edge.lanes[lane];
  out.x = a.x + (b.x - a.x) * t + edge.rx * off;
  out.z = a.z + (b.z - a.z) * t + edge.rz * off;
  return out;
}

/** Sample the ring highway lane loop as a closed polyline of points. */
export function ringLaneLoop(roads, laneIndex, dirSign) {
  const ring = roads.find((r) => r.id === 'RING');
  const offs = laneOffsets(ring);
  const off = offs[laneIndex];
  const pts = ring.pts.slice(0, -1);
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    // right normal of the CCW-ish walk
    const rx = dz, rz = -dx;
    out.push([p[0] + rx * off * dirSign, p[1] + rz * off * dirSign]);
  }
  if (dirSign < 0) out.reverse();
  return out;
}

/** Nearest road info for a world point — used for off-road detection & scoring. */
export function nearestRoad(segs, x, z) {
  let best = Infinity, bestSeg = null;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (x < Math.min(s.ax, s.bx) - 60 || x > Math.max(s.ax, s.bx) + 60) continue;
    if (z < Math.min(s.az, s.bz) - 60 || z > Math.max(s.az, s.bz) + 60) continue;
    const d = segDist(s, x, z);
    if (d < best) { best = d; bestSeg = s; }
  }
  return { dist: best, seg: bestSeg };
}

export const clamp01 = (v) => clamp(v, 0, 1);
