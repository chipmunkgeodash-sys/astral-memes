// Remove the old body only after its replacement has validated successfully.
// Some imports reuse the configured wheels, so protect shared resources.
export function retireProceduralBody(owner, incoming, anchors = []) {
  const keep = new Set([owner.rider.root, ...anchors]);
  for (const limb of [...owner.rider.arms, ...owner.rider.legs]) {
    for (const node of Object.values(limb)) if (node?.isObject3D) keep.add(node);
  }
  const retired = owner.chassis.children.filter(node => !keep.has(node) && !node.userData.keepOnImport);
  for (const node of retired) owner.chassis.remove(node);
  const resources = root => {
    const result = new Set();
    root.traverse(node => {
      if (node.geometry) result.add(node.geometry);
      for (const material of [].concat(node.material || [])) {
        result.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) result.add(value);
      }
    });
    return result;
  };
  const retained = new Set([...resources(owner.chassis), ...resources(incoming)]);
  const obsolete = new Set(retired.flatMap(node => [...resources(node)]));
  for (const resource of obsolete) if (!retained.has(resource)) resource.dispose();
}
