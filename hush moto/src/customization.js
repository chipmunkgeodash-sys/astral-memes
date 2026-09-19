import * as THREE from 'three';
import { storage } from './core.js';
export const PAINTS = { stock:null, mint:0x46e9b1, ice:0x75bbff, ember:0xf2744c, violet:0xaa81ed, white:0xe8edf0 };
export function cleanBuild(value={}) {
  if (!value || typeof value !== 'object') value = {};
  return { paint:Object.hasOwn(PAINTS,value.paint)?value.paint:'stock',
    battery:['stock','chi'].includes(value.battery)?value.battery:'stock',
    controller:['stock','ebmx'].includes(value.controller)?value.controller:'stock' };
}
export function loadBuild(id) { try { return cleanBuild(JSON.parse(storage.get(`hushmoto.build.${id}`,'{}'))); } catch { return cleanBuild(); } }
export function saveBuild(id,build) { storage.set(`hushmoto.build.${id}`,JSON.stringify(cleanBuild(build))); }
export function tuneBike(base,options={}) {
  const build=cleanBuild(options),cfg={...base,build};
  if(build.paint!=='stock') {cfg.color=PAINTS[build.paint];cfg.accent=build.paint==='white'?0x243744:new THREE.Color(PAINTS[build.paint]).lerp(new THREE.Color(0xffffff),.65).getHex();cfg.frameColor=0x30383e;};
  if(base.kind==='electric') {
    if(build.battery==='chi'){cfg.batteryWh=base.batteryWh*1.5;cfg.mass=base.mass+4;cfg.peakPower=base.peakPower*1.18;cfg.peakWheelTorque=base.peakWheelTorque*1.1;cfg.topSpeed=base.topSpeed*1.15;}
    if(build.controller==='ebmx'){cfg.peakPower*=1.3;cfg.peakWheelTorque*=1.15;cfg.topSpeed*=1.1;}
  } else { build.battery='stock';build.controller='stock'; }
  return cfg;
}

// Match material roles as well as node names: several imports merge all plastics.
export function themeRole(mesh,material) {
 const name=(mesh.name+' '+material.name).toLowerCase();
 if(/decal|graphic|sticker|number.?plate|shroud|barpad/.test(name))return 'graphic';
 if(/plastic|fender|mud.?guard|hatch|fairing|body|cover|panel|dark.trim|fuel.?tank/.test(name))return 'plastic';
 return null;
}
function themedTexture(source,color,atlas=false) {
 if(typeof document==='undefined'||!source?.image)return source;
 const canvas=document.createElement('canvas'),img=source.image;
 canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),rgb=new THREE.Color(color).convertLinearToSRGB();
 for(let i=0;i<pixels.data.length;i+=4){const d=pixels.data,r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255,hi=Math.max(r,g,b),lo=Math.min(r,g,b);
  if(atlas&&hi-lo<.12)continue; // Shared KTM atlas: retain tyres, seat and metal.
  const luminance=.2126*r+.7152*g+.0722*b;
  const shade=.32+luminance*.68;
  for(let c=0;c<3;c++)d[i+c]=Math.round(255*shade*[rgb.r,rgb.g,rgb.b][c]);
 }
 ctx.putImageData(pixels,0,0);const texture=source.clone();texture.image=canvas;texture.needsUpdate=true;return texture;
}
export function paintModel(owner) {
 const color=PAINTS[owner.cfg.build?.paint];if(color==null)return;
 const root=owner.importedRig?.imported;if(!root)return;
 const textures=new Map();
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const list=[].concat(mesh.material).map(material=>{
   const role=themeRole(mesh,material),atlas=owner.cfg.id==='ktm690' || /Toon_SuperDuke/.test(material.name);
   if(!role&&!atlas)return material;
   const m=material.clone();m.userData.theme=owner.cfg.build.paint;
   m.color?.setHex(role==='graphic'?owner.cfg.accent:color);
   if(m.map){const key=m.map.uuid+role;if(!textures.has(key))textures.set(key,themedTexture(m.map,role==='graphic'?owner.cfg.accent:color,atlas));m.map=textures.get(key);m.color?.setHex(0xffffff);}
   m.roughness=.43;m.metalness=Math.min(m.metalness||0,.2);return m;
  });mesh.material=Array.isArray(mesh.material)?list:list[0];
 });
}
