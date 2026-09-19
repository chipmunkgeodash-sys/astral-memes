import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { roundedBox } from '../src/parts.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
const source=process.argv[2]||'tools/asset-work/eride',loader=new STLLoader(),root=new T.Group();root.name='E Ride Pro SS 3.0';
const mat=(name,color,metalness=.4)=>new T.MeshStandardMaterial({name,color,metalness,roughness:.5});
const black=mat('Frame alloy',0x252c32),silver=mat('Metal',0xa8b5bf,.8),rubber=mat('Seat rubber',0x101416,0),gold=mat('Stanchion gold',0xc9a456,.8);
function group(name,pos,parent=root){const g=new T.Group();g.name=name;g.position.fromArray(pos);parent.add(g);return g;}
const steer=group('Steering',[0,.94,.40]),fork=group('FrontSuspension',[0,0,0],steer),front=group('FrontWheel',[0,.33-.94,.72-.40],fork);
const swing=group('RearSwing',[0,.47,-.08]),rear=group('RearWheel',[0,.33-.47,-.60+.08],swing);
function read(file){const b=fs.readFileSync(path.join(source,file));return loader.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));}
function add(g,name,material,parent=root){g.deleteAttribute('normal');g=mergeVertices(g,1e-5);g.computeVertexNormals();const mesh=new T.Mesh(g,material);mesh.name=name;parent.add(mesh);return mesh;}
// The frame and swingarm arrive in one STL, separated by disconnected shells.
const g=read('Eride Pro SS.stl'),p=g.attributes.position,n=p.count/3,parents=Int32Array.from({length:n},(_,i)=>i),seen=new Map();
const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1000)).join(',');const t=Math.floor(i/3),old=seen.get(key);if(old===undefined)seen.set(key,t);else parents[find(t)]=find(old);}
const pieces=new Map();for(let t=0;t<n;t++){const k=find(t);if(!pieces.has(k))pieces.set(k,[]);for(let i=t*9;i<t*9+9;i++)pieces.get(k).push(p.array[i]);}
const matrix=new T.Matrix4().set(0,.0095,0,0, 0,0,.009,.30, -.0095,0,0,-.11, 0,0,0,1);
[...pieces.values()].sort((a,b)=>b.length-a.length).forEach((v,i)=>{const shape=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(v,3));shape.applyMatrix4(matrix);const parent=i===1?swing:root;shape.translate(-parent.position.x,-parent.position.y,-parent.position.z);add(shape,i===1?'Swingarm':'Frame '+i,black,parent);});
// Preserve print-kit proportions: rotate from the print bed, then uniformly scale.
function part(file,name,scale,position,material,parent=root,orient=()=>{}) {
 const g=read(file);orient(g);g.computeBoundingBox();const c=g.boundingBox.getCenter(new T.Vector3());
 g.translate(-c.x,-c.y,-c.z);g.scale(scale,scale,scale);g.translate(...position);return add(g,name,material,parent);
}
const upright=g=>g.rotateX(-Math.PI/2);
part('Battery - Battery (3).stl','Battery',.0095,[0,.61,.13],black,root,upright);
part('FULL SUSPENSION Frame - Controller (1).stl','Controller',.009,[0,.56,.31],black,root,g=>{g.rotateX(-Math.PI/2);});
part('FULL SUSPENSION Frame - Motor.stl','Motor',.009,[0,.42,-.10],black,root,g=>g.rotateY(Math.PI/2));
part('FULL SUSPENSION Frame - Seat (1).stl','Seat',.0095,[0,.865,-.28],rubber,root,g=>{g.rotateX(.52);g.rotateX(-Math.PI/2);});
// Forks follow the head angle; both legs meet the axle and slide along the same line.
const rake=.47,axis=new T.Vector3(0,Math.cos(rake),-Math.sin(rake));
function rod(name,a,b,r,material,parent=root){a=new T.Vector3(...a);b=new T.Vector3(...b);const g=new T.CylinderGeometry(r,r,a.distanceTo(b),16);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...a.add(b).multiplyScalar(.5).toArray());return add(g,name,material,parent);}
for(const side of [-1,1]) {
 const axle=new T.Vector3(side*.10,.33,.72),top=axle.clone().addScaledVector(axis,.69);
 const lower=axle.clone().addScaledVector(axis,.31);
 rod('Fork lower',axle.clone().sub(steer.position).toArray(),lower.clone().sub(steer.position).toArray(),.025,black,fork);
 rod('Fork stanchion',lower.clone().sub(steer.position).toArray(),top.clone().sub(steer.position).toArray(),.019,silver,steer);
 part(side<0?'Cockpit - Grip LEFT (13).stl':'Cockpit - Throttle (2).stl','Grip',.0075,[side*.34,.065,-.035],rubber,steer,g=>g.rotateY(Math.PI/2));
 group(side<0?'GripLeft':'GripRight',[side*.34,.065,-.035],steer);
 part(side<0?'FULL SUSPENSION Frame - Foot Peg LEFT (1).stl':'FULL SUSPENSION Frame - Foot Peg RIGHT (1).stl','Foot peg',.007,[side*.16,.36,-.08],silver);
 group(side<0?'PegLeft':'PegRight',[side*.16,.36,-.08]);
 rod('Seat support',[side*.065,.62,-.15],[side*.065,.82,-.43],.012,black);
}
rod('Lower triple clamp',[-.105,-.11,.055],[.105,-.11,.055],.026,black,steer);
rod('Upper triple clamp',[-.105,-.01,.005],[.105,-.01,.005],.022,black,steer);
part('Stem - Stem (18).stl','Stem',.005,[0,.033,-.022],black,steer,g=>g.rotateX(-Math.PI/2));
part('Cockpit - Handlebar (16).stl','Handlebars',.0095,[0,.065,-.035],black,steer,g=>g.rotateZ(Math.PI/2));
const plastic=mat('Graphite plastics',0x30383e,.1);
function box(name,size,pos,material,parent=root,tilt=0){const g=roundedBox(...size,Math.min(.008,size[1]/3));g.rotateX(tilt);g.translate(...pos);return add(g,name,material,parent);}
box('Battery hatch',[.18,.035,.23],[0,.79,.12],plastic,root,-.13);
box('Front number plate',[.19,.20,.025],[0,-.075,.075],plastic,steer,-.47);
box('Headlight',[.13,.035,.035],[0,.035,.057],silver,steer);
function fender(name,length,width,position,parent,tilt){const shape=new T.Shape();shape.moveTo(-width*.33,-length/2);shape.lineTo(width*.33,-length/2);shape.lineTo(width/2,length*.25);shape.quadraticCurveTo(width*.5,length*.5,0,length*.5);shape.quadraticCurveTo(-width*.5,length*.5,-width/2,length*.25);shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:true,bevelSize:.006,bevelThickness:.003,bevelSegments:2,steps:1});g.rotateX(Math.PI/2+tilt);g.translate(...position);add(g,name,plastic,parent);}
fender('Front mudguard',.42,.16,[0,-.19,.17],steer,-.06);
fender('Rear mudguard',.31,.17,[0,.865,-.57],root,-.15);
for(const side of [-1,1]){
 const shape=new T.Shape();shape.moveTo(-.43,.82);shape.lineTo(-.08,.80);shape.lineTo(.04,.75);shape.lineTo(-.15,.72);shape.closePath();
 const g=new T.ExtrudeGeometry(shape,{depth:.009,bevelEnabled:true,bevelSize:.004,bevelThickness:.002,bevelSegments:2,steps:1});g.rotateY(-Math.PI/2);g.translate(side*.083,0,0);add(g,'Side panel',plastic);
}
box('Bash guard',[.20,.035,.24],[0,.325,-.01],black);
rod('Rear shock',[0,.48,-.20],[0,.75,-.15],.025,silver);
for(let i=0;i<9;i++){const g=new T.TorusGeometry(.034,.006,6,18);g.rotateX(Math.PI/2);g.translate(0,.51+i*.023,-.194+i*.004);add(g,'Shock spring',gold);}
root.userData={sourceArchive:'Mini+E+Ride+Pro+SS+3.0.zip',adaptation:'User-supplied print kit assembled for gameplay. Geometry and tuning are approximations; not factory CAD.'};
fs.mkdirSync('assets/bikes/eride',{recursive:true});fs.writeFileSync('assets/bikes/eride/eride.glb',Buffer.from(await new GLTFExporter().parseAsync(root,{binary:true})));
console.log('E Ride Pro assembled with steering, suspension, rider anchors and runtime wheels.');
