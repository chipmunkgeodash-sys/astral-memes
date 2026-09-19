// Small repeatable textures and shared foliage geometry; no network assets.
import * as THREE from 'three';
import { mergeParts } from './parts.js';
import { makeRng } from './core.js';

export function groundTexture() {
  const canvas = document.createElement('canvas');canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'), rng = makeRng(913), pixels = ctx.createImageData(256, 256);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = 175 + rng() * 65;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  for (let i = 0; i < 1400; i++) {
    const x = rng() * 256, y = rng() * 256;
    ctx.strokeStyle = rng() > .5 ? '#a7ab9270' : '#373a2740';ctx.lineWidth = .6;
    ctx.beginPath();ctx.moveTo(x, y);ctx.lineTo(x + rng() * 3 - 1.5, y - 2 - rng() * 6);ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;texture.repeat.set(210, 210);texture.anisotropy = 8;
  return texture;
}

export function foliageAssets(quality = 'high') {
  const canvas = document.createElement('canvas');canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'), rng = makeRng(8831);
  // A branch with individual leaves, with real gaps between them.
  ctx.strokeStyle = '#68523c';ctx.lineWidth = 3;ctx.beginPath();ctx.moveTo(128, 250);ctx.lineTo(125, 25);ctx.stroke();
  for (let i = 0; i < 28; i++) {
    const y = 30 + rng() * 190, side = i % 2 ? -1 : 1, x = 128 + side * (20 + rng() * 65);
    ctx.lineWidth = 1.5;ctx.beginPath();ctx.moveTo(126, y + 20);ctx.lineTo(x, y);ctx.stroke();
    for (let j = 0; j < 5; j++) {
      const lx = x + (rng() - .5) * 40, ly = y + (rng() - .5) * 30;
      ctx.save();ctx.translate(lx, ly);ctx.rotate(rng() * 6.28);
      ctx.fillStyle = ['#829653', '#6f8746', '#536e35', '#94a660', '#607c3c'][i % 5];
      ctx.beginPath();ctx.ellipse(0, 0, 4 + rng() * 3, 10 + rng() * 4, 0, 0, 6.29);ctx.fill();
      ctx.strokeStyle = '#b0bc7b66';ctx.lineWidth = .6;ctx.beginPath();ctx.moveTo(0, -9);ctx.lineTo(0, 9);ctx.stroke();ctx.restore();
    }
  }
  const map = new THREE.CanvasTexture(canvas);map.colorSpace = THREE.SRGBColorSpace;map.anisotropy = 4;
  const parts = [];
  for (let i = 0; i < (quality === 'low' ? 16 : 36); i++) {
    const phi = rng() * Math.PI * 2, y = rng() * 1.9 - .9, r = Math.sqrt(1 - Math.min(.9, y * y)) * (.25 + rng() * .65);
    const geo = new THREE.PlaneGeometry(1.05, 1.22);
    geo.rotateX((rng() - .5) * 2);geo.rotateY(phi + .5);geo.rotateZ((rng() - .5) * 1.2);
    geo.translate(Math.cos(phi) * r, y, Math.sin(phi) * r);parts.push(geo);
  }
  return { geometry: mergeParts(parts), material: new THREE.MeshStandardMaterial({
    map, alphaTest: .45, side: THREE.DoubleSide, roughness: .95, metalness: 0,
  }) };
}
