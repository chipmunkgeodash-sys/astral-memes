// Shared crossing geometry and right-of-way rules for pedestrians and vehicles.
export function sidewalkRoute(graph, edge, side = 1) {
  const off = (edge.road.width / 2 + 1.2) * side;
  return [edge.a, edge.b].map((id, i) => {
    const node = graph.nodes[id], along = (node.radius + 6) * (i ? -1 : 1);
    return { x: node.x + edge.dirX * along + edge.rx * off,
      z: node.z + edge.dirZ * along + edge.rz * off };
  });
}

export function crossingAt(graph, edge, end) {
  const node = graph.nodes[end ? edge.b : edge.a];
  const along = (node.radius + 6) * (end ? -1 : 1);
  return { x: node.x + edge.dirX * along, z: node.z + edge.dirZ * along,
    rx: edge.rx, rz: edge.rz, dx: edge.dirX, dz: edge.dirZ,
    half: edge.road.width / 2, node, axis: edge.axis };
}

export function crossingClear(crossing, vehicles, bike, duration) {
  const hazards = [...vehicles, { x: bike.pos.x, z: bike.pos.z, y: bike.pos.y,
    yaw: bike.yaw || 0, speed: Math.abs(bike.speed), type: { l: 2, w: .9 }, player: true }];
  for (const v of hazards) {
    if (v.active === false || (v.root && !v.root.visible)) continue;
    if (crossing.y !== undefined && Math.abs((v.y || 0) - crossing.y) > 3) continue;
    const dx = crossing.x - v.x, dz = crossing.z - v.z;
    const along = dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw);
    const side = Math.abs(dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw));
    const halfLength = (v.type?.l || 4.5) / 2;
    if (side > crossing.half + 2 || along < -halfLength - 2) continue;
    if (Math.abs(along) < halfLength + 2) return false;
    // Stopped cars behind the stripes are yielding. Moving traffic must clear
    // the entire crossing before a pedestrian steps off the kerb.
    if (v.speed > .35 && along / v.speed < duration + 2) return false;
  }
  return true;
}

export function pedestrianSpeedLimit(vehicle, pedestrians) {
  if (vehicle.onRing) return Infinity;
  let limit = Infinity;
  for (const p of pedestrians) {
    if (!p.active || !p.crossing || (p.state !== 'waiting' && p.state !== 'crossing')) continue;
    const c = p.crossing;
    if (Math.abs((vehicle.y || 0) - p.y) > 3) continue;
    const dx = c.x - vehicle.x, dz = c.z - vehicle.z;
    const along = dx * Math.sin(vehicle.yaw) + dz * Math.cos(vehicle.yaw);
    const side = Math.abs(dx * Math.cos(vehicle.yaw) - dz * Math.sin(vehicle.yaw));
    if (side > c.half + 2 || along < 0 || along > 65) continue;
    const gap = along - (vehicle.type?.l || 4.5) / 2 - 3;
    limit = Math.min(limit, gap < .3 ? 0 : Math.min(gap * .8, Math.sqrt(2 * 4 * gap)));
  }
  return limit;
}
