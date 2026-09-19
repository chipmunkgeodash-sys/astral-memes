// Convert the user's How2Random print kit into an assembled, articulated GLB.
// Usage: node tools/build-lbx.mjs <extracted-kit-directory>
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();}); }
};
const source=process.argv[2], loader=new STLLoader();
const material=(name,color,metalness=0,roughness=.65)=>new T.MeshStandardMaterial({name,color,metalness,roughness});
const black=material('Black alloy',0x202429,.6,.38), rubber=material('Rubber',0x111315,0,.95);
const metal=material('Machined aluminium',0xa9afb4,.8,.33), seat=material('Seat',0x14171a,0,.95);
const gold=material('Fork stanchions',0xb99448,.8,.28), plastic=material('Black plastic',0x24272a,0,.54);
const root=new T.Group();root.name='Light Bee X · How2Random';
function group(name,position,parent=root){const g=new T.Group();g.name=name;g.position.fromArray(position);parent.add(g);return g;}
const steer=group('Steering',[0,.91,.38]), fork=group('FrontSuspension',[0,0,0],steer);
const front=group('FrontWheel',[0,.318-.91,.68-.38],fork);
const swing=group('RearSwing',[0,.485,-.089]), rear=group('RearWheel',[0,.318-.485,-.58+.089],swing);
const bodyMatrix=new T.Matrix4().set(-.01,0,0,0, 0,0,.0085,.3876, 0,.01,0,.036, 0,0,0,1);
function read(file){const b=fs.readFileSync(path.join(source,file));return loader.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));}
function add(g,name,mat,parent=root,matrix){if(matrix)g.applyMatrix4(matrix);g.deleteAttribute('normal');g=mergeVertices(g,1e-5);g.computeVertexNormals();const m=new T.Mesh(g,mat);m.name=name;parent.add(m);return m;}
function localMatrix(parent,world){root.updateMatrixWorld(true);return parent.matrixWorld.clone().invert().multiply(world);}
function components(g){
 const p=g.attributes.position,n=p.count/3,parents=Int32Array.from({length:n},(_,i)=>i),seen=new Map();
 const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1000)).join(',');const t=Math.floor(i/3),old=seen.get(key);if(old===undefined)seen.set(key,t);else parents[find(t)]=find(old);}
 const parts=new Map();for(let t=0;t<n;t++){const key=find(t);if(!parts.has(key))parts.set(key,[]);const a=parts.get(key);for(let i=t*9;i<t*9+9;i++)a.push(p.array[i]);}
 return [...parts.values()].sort((a,b)=>b.length-a.length).map(a=>new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(a,3)));
}
const frameParts=components(read('Surron X Full Frame.stl'));
frameParts.forEach((g,i)=>add(g,i===1?'Swingarm':'Frame component '+i,i>1?metal:black,i===1?swing:root,localMatrix(i===1?swing:root,bodyMatrix)));
for(const [file,mat] of [
 ['FULL SUSPENSION Frame - Battery Hatch (1).stl',plastic],['FULL SUSPENSION Frame - Controller (1).stl',black],
 ['FULL SUSPENSION Frame - Foot Peg LEFT (1).stl',metal],['FULL SUSPENSION Frame - Foot Peg RIGHT (1).stl',metal],
 ['FULL SUSPENSION Frame - Motor.stl',black],['FULL SUSPENSION Frame - Rear Mudguard (1).stl',plastic],['FULL SUSPENSION Frame - Seat (1).stl',seat]
])add(read(file),file,mat,root,bodyMatrix);
add(read('Battery - Battery (3).stl'),'Battery',black,root,bodyMatrix.clone().multiply(new T.Matrix4().makeTranslation(0,10,8)).multiply(new T.Matrix4().makeRotationX(-.2)));

function wheel(files,parent,radius,width){
 const g=mergeGeometries(files.map(read));const p=g.attributes.position,parts=[[],[],[]];
 for(let i=0;i<p.count;i+=3){let r=0;for(let v=i;v<i+3;v++)r+=Math.hypot(p.getX(v),p.getZ(v))/3;const k=r>25.0?0:r>22.0?1:2;for(let j=i*3;j<i*3+9;j++)parts[k].push(p.array[j]);}
 const scale=radius/(parent===front?31.67:31.3),thickness=parent===front?11.9:14.5;
 const transform=new T.Matrix4().makeRotationZ(Math.PI/2).multiply(new T.Matrix4().makeScale(scale,width/thickness,scale));
 parts.forEach((a,i)=>add(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(a,3)),['Tyre','Rim','Spokes'][i],[rubber,black,metal][i],parent,transform));
}
wheel(['Front Wheel - FRONT Wheel P1 (8).stl','Front Wheel - FRONT Wheel P2 (8).stl'],front,.318,.07);
wheel(['Rear wheel - REAR Wheel P1 (8).stl','Rear wheel - REAR Wheel P2 (8).stl'],rear,.318,.08);
for(const wheelNode of [front,rear]){
 const g=read('Brake Rotor - Brake Disc.stl');g.rotateZ(Math.PI/2);g.scale(.0078,.0078,.0078);add(g,'Brake rotor',metal,wheelNode);
}
const forkWorld=new T.Matrix4().makeTranslation(0,.318,.68)
 .multiply(new T.Matrix4().makeRotationX(-.47))
 .multiply(new T.Matrix4().set(-.0075,0,0,0,0,0,.0063,0,0,.0063,0,0,0,0,0,1));
for(const [file,mat,parent] of [
 ['Fork - Fork Body (2).stl',black,fork],['Fork - Fork Stanchion LEFT (5).stl',gold,steer],
 ['Fork - Fork stanchion RIGHT (5).stl',gold,steer],['Fork - Steerer tube (10).stl',black,steer]
])add(read(file),file,mat,parent,localMatrix(parent,forkWorld));
const barWorld=new T.Matrix4().makeTranslation(0,.98,.36).multiply(new T.Matrix4().set(-.009,0,0,0,0,0,.009,0,0,.009,0,0,0,0,0,1)).multiply(new T.Matrix4().makeTranslation(0,-468,-737));
const stemWorld=new T.Matrix4().makeTranslation(0,.969,.36).multiply(new T.Matrix4().set(-.006,0,0,0,0,0,.0085,0,0,.006,0,0,0,0,0,1));
add(read('Stem - Stem (10).stl'),'Handlebar stem',black,steer,localMatrix(steer,stemWorld));
for(const file of fs.readdirSync(source).filter(f=>f.startsWith('Cockpit -'))){add(read(file),file,/Grip|Throttle/.test(file)?rubber:black,steer,localMatrix(steer,barWorld));}
group('GripLeft',[-.345,.985-.91,.36-.38],steer);group('GripRight',[.345,.985-.91,.36-.38],steer);
group('PegLeft',[-.16,.37,-.102]);group('PegRight',[.16,.37,-.102]);
root.userData={author:'How2Random',source:'https://makerworld.com/en/models/1607238-mini-surron-light-bee-x-scale-electric-dirt-bike',adaptation:'Assembled from user-provided print parts; materials, proportions and pivots adapted for local gameplay. Not an OEM CAD model.'};
fs.mkdirSync('assets/bikes/how2random',{recursive:true});
const result=await new GLTFExporter().parseAsync(root,{binary:true});fs.writeFileSync('assets/bikes/how2random/lbx.glb',Buffer.from(result));
console.log(`Assembled LBX: ${result.byteLength} bytes`);
