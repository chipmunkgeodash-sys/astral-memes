import fs from 'node:fs';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
const bytes=fs.readFileSync(process.argv[2]);
const g=new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
const p=g.attributes.position, count=p.count/3, parent=Int32Array.from({length:count},(_,i)=>i), vertex=new Map();
function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
for(let i=0;i<p.count;i++){
  const key=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1000)).join(',');
  const t=Math.floor(i/3), other=vertex.get(key);
  if(other!==undefined)parent[root(t)]=root(other);else vertex.set(key,t);
}
const pieces=new Map();
for(let t=0;t<count;t++){
 const key=root(t);let c=pieces.get(key);if(!c){c={triangles:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};pieces.set(key,c);}c.triangles++;
 for(let i=t*3;i<t*3+3;i++)[p.getX(i),p.getY(i),p.getZ(i)].forEach((v,a)=>{c.min[a]=Math.min(c.min[a],v);c.max[a]=Math.max(c.max[a],v);});
}
console.log([...pieces.values()].sort((a,b)=>b.triangles-a.triangles).slice(0,25));
