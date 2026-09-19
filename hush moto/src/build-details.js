import * as T from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { PAINTS } from './customization.js';
import { roundedBox } from './parts.js';

function labelTexture(kind,theme) {
 const c=document.createElement('canvas');c.width=512;c.height=256;const x=c.getContext('2d');
 x.fillStyle='#171d24';x.fillRect(0,0,512,256);x.fillStyle=theme;x.fillRect(0,232,512,24);x.fillStyle='#f3f5ef';
 if(kind==='chi'){
  // Interlocking triangular Chi mark, drawn from the manufacturer's pack photo.
  x.strokeStyle='#f3f5ef';x.lineWidth=12;x.lineJoin='miter';
  x.beginPath();x.moveTo(127,47);x.lineTo(69,181);x.lineTo(168,199);x.lineTo(127,94);x.lineTo(104,155);x.lineTo(141,155);x.stroke();
  x.beginPath();x.moveTo(139,37);x.lineTo(192,173);x.lineTo(155,165);x.stroke();
  x.font='bold 45px sans-serif';x.fillText('CHI',224,105);x.font='bold 19px sans-serif';x.fillText('BATTERY SYSTEMS',224,139);x.font='16px sans-serif';x.fillText('PERFORMANCE PACK',224,172);
 }else if(kind==='ebmx'){
  x.font='italic 900 110px Arial';x.textAlign='center';x.fillText('EBMX',254,140);x.fillRect(53,154,387,9);x.fillRect(53,172,335,7);x.font='bold 22px sans-serif';x.fillText('X-9000',256,215);
 }else{
  x.fillStyle=theme;x.beginPath();x.moveTo(0,0);x.lineTo(180,0);x.lineTo(55,256);x.lineTo(0,256);x.fill();x.fillStyle='#f4f7f8';x.font='italic 900 66px Arial';x.fillText(kind,150,122);x.font='bold 28px Arial';x.fillText('HUSH MOTO',155,174);
 }
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;
}
function boxMesh(size,material){return new T.Mesh(roundedBox(...size,.006),material);}
function badge(parent,texture,width,height,pos,rotation){const m=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshStandardMaterial({map:texture,roughness:.55,polygonOffset:true,polygonOffsetFactor:-2}));m.position.fromArray(pos);m.rotation.y=rotation;m.name='Build decal';parent.add(m);}
export function addBuildDetails(owner){
 if(typeof document==='undefined'||typeof document.createElement!=='function')return;
 const cfg=owner.cfg,build=cfg.build||{},root=owner.importedRig?.imported;
 const accent=PAINTS[build.paint]??0x9ba9b7,css='#'+new T.Color(accent).getHexString();
 const casing=new T.MeshStandardMaterial({color:0x202630,roughness:.52,metalness:.5});
 for(const key of ['battery','controller']){
  if(cfg.kind!=='electric'||!build[key]||build[key]==='stock')continue;
  let target;root?.traverse(o=>{if(o.isMesh&&(key==='battery'?o.name==='Battery':/controller/i.test(o.name)))target=o;});
  const group=new T.Group();group.name=key==='battery'?'Chi performance battery':'EBMX finned controller';
  let size=new T.Vector3(key==='battery'?.18:.17,key==='battery'?.33:.23,key==='battery'?.20:.08);
  group.position.set(0,(key==='battery'?.61:.52)-cfg.cgHeight,key==='battery'?.09:.30);
  if(target){
   target.geometry.computeBoundingBox();const bounds=target.geometry.boundingBox.clone();size=bounds.getSize(new T.Vector3());
   // Mount in the source mesh's coordinates, inheriting its rig transform.
   group.position.copy(bounds.getCenter(new T.Vector3()));target.add(group);target.material=[].concat(target.material).map(m=>{const copy=m.clone();copy.visible=false;return copy;});
  }else owner.chassis.add(group);
  const shell=boxMesh(size.toArray(),casing);shell.name=group.name+' casing';shell.castShadow=shell.receiveShadow=true;group.add(shell);
  const tex=labelTexture(build[key],css);
  for(const side of [-1,1])badge(group,tex,Math.min(.18,size.z*.93),Math.min(.09,size.y*.6),[side*(size.x/2+.002),0,0],side*Math.PI/2);
  const metal=new T.MeshStandardMaterial({color:0x989fa6,metalness:.86,roughness:.3});
  const dark=new T.MeshStandardMaterial({color:0x0f141a,metalness:.55,roughness:.45});
  const bolt=(x,y,z)=>{const m=new T.Mesh(new T.CylinderGeometry(.006,.006,.005,6),metal);m.rotation.x=Math.PI/2;m.position.set(x,y,z);group.add(m);};
  if(key==='controller'){
   // Tall longitudinal heat-sink fins and machined mounting ears, like X-9000 hardware.
   for(let i=0;i<13;i++){const fin=boxMesh([size.x*.022,size.y*.83,.018],dark);fin.position.set(-size.x*.43+i*size.x*.072,0,size.z/2+.008);group.add(fin);}
   for(const side of [-1,1]){
    const ear=boxMesh([size.x*.22,size.y*.14,.016],dark);ear.position.set(side*size.x*.34,size.y*.51,0);group.add(ear);
    bolt(side*size.x*.35,size.y*.38,size.z/2+.022);bolt(side*size.x*.35,-size.y*.38,size.z/2+.022);
    const connector=new T.Mesh(new T.CylinderGeometry(.014,.014,.035,10),dark);connector.position.set(side*size.x*.24,-size.y*.53,0);group.add(connector);
   }
   // Silver lightning X across the fin bank; the lower plate carries the brand.
   for(const side of [-1,1]){const slash=boxMesh([size.x*.1,size.y*.5,.008],metal);slash.rotation.z=side*.55;slash.position.set(0,size.y*.05,size.z/2+.022);group.add(slash);}
   badge(group,tex,size.x*.9,size.y*.23,[0,-size.y*.26,size.z/2+.024],0);
  }else{
   const lid=boxMesh([size.x+.014,.024,size.z+.014],dark);lid.position.y=size.y/2;group.add(lid);
   const base=boxMesh([size.x+.008,.018,size.z+.008],dark);base.position.y=-size.y/2;group.add(base);
   for(const side of [-1,1]){
    const support=boxMesh([.018,.045,.027],dark);support.position.set(side*size.x*.25,size.y/2+.028,0);group.add(support);
    for(const end of [-1,1]){const screw=new T.Mesh(new T.CylinderGeometry(.006,.006,.005,6),metal);screw.position.set(side*size.x*.4,size.y/2+.015,end*size.z*.4);group.add(screw);}
    for(let i=0;i<3;i++){const seam=boxMesh([.002,size.y*.8,.004],dark);seam.position.set(side*(size.x/2+.001),0,-size.z*.32+i*size.z*.08);group.add(seam);}
   }
   const handle=boxMesh([size.x*.57,.018,.028],dark);handle.position.y=size.y/2+.055;group.add(handle);
   const port=new T.Mesh(new T.CylinderGeometry(.014,.014,.02,12),metal);port.rotation.x=Math.PI/2;port.position.set(size.x*.27,size.y*.3,size.z/2+.008);group.add(port);
   const lead=[new T.Vector3(size.x*.27,size.y*.3,size.z/2+.02),new T.Vector3(size.x*.3,size.y*.17,size.z/2+.05),new T.Vector3(size.x*.3,-size.y*.3,size.z/2+.025)];group.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(lead),12,.005,6,false),dark));
   badge(group,tex,size.x*.88,size.y*.3,[0,-size.y*.12,size.z/2+.004],0);
  }
 }
 // Project the livery onto actual plastics, so merged print-kit meshes work too.
 if(root&&['lbx','ultrabee'].includes(cfg.id)&&build.paint!=='stock'){
  const tex=labelTexture('SUR-RON',css),targets=[];
  root.updateWorldMatrix(true,true);
  root.traverse(mesh=>{if(mesh.isMesh&&(/Side panel|plastic|mudguard/i.test(mesh.name)||mesh.name==='Battery'))targets.push(mesh);});
  for(const side of [-1,1]){
   const p=root.localToWorld(new T.Vector3(side*.14,cfg.seatH-.15,-.13));
   const rotation=new T.Euler().setFromQuaternion(root.getWorldQuaternion(new T.Quaternion()).multiply(new T.Quaternion().setFromEuler(new T.Euler(0,side*Math.PI/2,0))));
   for(const mesh of targets){
    const geometry=new DecalGeometry(mesh,p,rotation,new T.Vector3(.30,.11,.22));
    if(!geometry.attributes.position.count){geometry.dispose();continue;}
    geometry.applyMatrix4(root.matrixWorld.clone().invert());
    const decal=new T.Mesh(geometry,new T.MeshStandardMaterial({map:tex,roughness:.55,polygonOffset:true,polygonOffsetFactor:-4,depthWrite:false}));decal.name='Themed body graphics';root.add(decal);
   }
  }
 }
}
