// Private models stay in IndexedDB on this device. No upload endpoint exists.
function database(){return new Promise((resolve,reject)=>{
  const request=indexedDB.open('hushmoto-private-models',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('bikes');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
export async function readLocalBike(id){
  if(typeof indexedDB==='undefined')return null;
  const db=await database();
  try{return await new Promise((resolve,reject)=>{
    const request=db.transaction('bikes').objectStore('bikes').get(id);
    request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);
  });}finally{db.close();}
}
export function validateLocalBike(name,buffer){
  const id=name.toLowerCase()==='lbx.glb'?'lbx':name.toLowerCase()==='ultra.glb'?'ultrabee':null;
  if(!id)throw Error('Choose the prepared lbx.glb or ultra.glb file.');
  const view=new DataView(buffer);
  if(buffer.byteLength<24||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw Error('This file is not a complete GLB model.');
  const length=view.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
  if([...json.buffers||[],...json.images||[]].some(item=>item.uri))throw Error('Use a self-contained GLB; external texture links are not supported.');
  for(const joint of ['Steering','FrontSuspension','FrontWheel','RearSwing','RearWheel','GripLeft','GripRight','PegLeft','PegRight']){
    if(!json.nodes?.some(n=>n.name===joint))throw Error('This model needs the prepared riding rig. Use the converted game GLB.');
  }
  return id;
}
export async function saveLocalBikeFiles(files){
  if(!files.length)throw Error('Choose at least one model.');
  const entries=[];
  for(const file of files){
    if(file.size>50*1024*1024)throw Error('Each model must be smaller than 50 MB.');
    const buffer=await file.arrayBuffer();entries.push([validateLocalBike(file.name,buffer),buffer]);
  }
  const db=await database();
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction('bikes','readwrite');
    for(const [id,buffer] of entries)tx.objectStore('bikes').put(buffer,id);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Model storage was cancelled.'));
  });}finally{db.close();}
  return entries.length;
}
