import { useEffect, useRef, useState } from 'react';
import { downloadBlob } from '../lib/studio';

export default function StudioImages({id}){
 const canvas=useRef(null),[images,setImages]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[palette,setPalette]=useState([]),[notice,setNotice]=useState('');
 const [o,setO]=useState({top:'WHEN THE WHOLE CREW',bottom:'FINALLY GETS ONLINE',width:1080,height:1080,quality:80,angle:0,mirror:false,x:0,y:0,crop:80,watermark:'ASTRAL',opacity:65,filter:'none',pixels:24,columns:2});
 const set=(k,v)=>setO(old=>({...old,[k]:v}));
 const load=async e=>{setBusy(true);setError('');try{const files=[...e.target.files].slice(0,6);const result=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{if(file.size>20*1024*1024)return reject(Error('Each image must be under 20 MB.'));const image=new Image(),url=URL.createObjectURL(file);image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Could not open that image. Try PNG, JPG or WebP.'));};image.src=url;})));setImages(result);if(result[0]){const scale=Math.min(1,2400/result[0].width,2400/result[0].height);setO(old=>({...old,width:Math.round(result[0].width*scale),height:Math.round(result[0].height*scale)}));}}catch(e){setError(e.message);}finally{setBusy(false);}};
 useEffect(()=>{
  const c=canvas.current;if(!c||!images.length)return;const img=images[0];let w=Math.min(2400,img.width),h=Math.round(img.height*w/img.width);if(h>2400){w=Math.round(w*2400/h);h=2400;}
  if(id===5){w=Math.max(16,Math.min(2400,+o.width||16));h=Math.max(16,Math.min(2400,+o.height||16));}
  if(id===2){w=1080;h=Math.min(2400,Math.ceil(images.length/+o.columns)*540);}
  if(id===4&&Number(o.angle)%180){[w,h]=[h,w];}
  if(id===3){w=Math.round(w*o.crop/100);h=Math.round(h*o.crop/100);}
  c.width=w;c.height=h;const x=c.getContext('2d');x.clearRect(0,0,w,h);
  if(id===2){x.fillStyle='#171c2e';x.fillRect(0,0,w,h);const cols=+o.columns,cw=w/cols;images.forEach((image,i)=>{const cellH=h/Math.ceil(images.length/+o.columns),pad=10,k=Math.max((cw-pad*2)/image.width,(cellH-pad*2)/image.height),dx=(i%cols)*cw,dy=Math.floor(i/cols)*cellH;x.save();x.beginPath();x.rect(dx+pad,dy+pad,cw-pad*2,cellH-pad*2);x.clip();x.drawImage(image,dx+(cw-image.width*k)/2,dy+(cellH-image.height*k)/2,image.width*k,image.height*k);x.restore();});}
  else if(id===3){const sw=img.width*o.crop/100,sh=img.height*o.crop/100;x.drawImage(img,(img.width-sw)*o.x/100,(img.height-sh)*o.y/100,sw,sh,0,0,w,h);}
  else if(id===4){x.save();x.translate(w/2,h/2);x.rotate(+o.angle*Math.PI/180);x.scale(o.mirror?-1:1,1);const rotated=Number(o.angle)%180;x.drawImage(img,-(rotated?h:w)/2,-(rotated?w:h)/2,rotated?h:w,rotated?w:h);x.restore();}
  else if(id===10){const small=document.createElement('canvas');small.width=+o.pixels;small.height=Math.max(1,Math.round(+o.pixels*h/w));small.getContext('2d').drawImage(img,0,0,small.width,small.height);x.imageSmoothingEnabled=false;x.drawImage(small,0,0,w,h);}
  else {x.filter=id===9?o.filter:'none';x.drawImage(img,0,0,w,h);x.filter='none';}
  if(id===1){const font=Math.max(14,Math.round(w*.065));x.font=`900 ${font}px Impact, sans-serif`;x.textAlign='center';x.lineWidth=Math.max(2,font*.08);x.strokeStyle='#000';x.fillStyle='#fff';for(const[text,y]of [[o.top,font*1.3],[o.bottom,h-font*.4]]){x.strokeText(text.toUpperCase(),w/2,y,w*.92);x.fillText(text.toUpperCase(),w/2,y,w*.92);}}
  if(id===7){x.globalAlpha=o.opacity/100;x.font=`700 ${Math.max(16,w*.04)}px system-ui`;x.textAlign='right';x.fillStyle='#fff';x.shadowColor='#000';x.shadowBlur=4;x.fillText(o.watermark,w*.96,h*.94,w*.9);x.globalAlpha=1;x.shadowBlur=0;}
  if(id===8){const pixels=x.getImageData(0,0,w,h).data,bins=new Map();for(let i=0;i<pixels.length;i+=Math.max(4,Math.floor(pixels.length/40000/4)*4)){if(pixels[i+3]<200)continue;const hex='#'+[pixels[i],pixels[i+1],pixels[i+2]].map(n=>Math.min(255,Math.round(n/32)*32).toString(16).padStart(2,'0')).join('');bins.set(hex,(bins.get(hex)||0)+1);}setPalette([...bins].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([hex])=>hex));}
 },[id,images,o]);
 const range=(k,label,min,max)=><label>{label} · {o[k]}<input type="range" min={min} max={max} value={o[k]} onChange={e=>set(k,+e.target.value)}/></label>;
 const text=(k,label)=><label>{label}<input maxLength="120" value={o[k]} onChange={e=>set(k,e.target.value)}/></label>;
 return <div className="studio-editor"><aside className="studio-controls"><label className="studio-upload">{busy?'Opening…':'Choose image'+(id===2?'s (up to 6)':'')}<input type="file" accept="image/png,image/jpeg,image/webp" multiple={id===2} onChange={load} disabled={busy}/></label><p className="muted">Images stay in your browser. Export your result before changing categories. Maximum output: 2400 px per side.</p>
 {id===1&&<>{text('top','Top caption')}{text('bottom','Bottom caption')}</>}
 {id===2&&<label>Columns<select value={o.columns} onChange={e=>set('columns',+e.target.value)}><option>1</option><option>2</option><option>3</option></select></label>}
 {id===3&&<>{range('crop','Crop size %',10,100)}{range('x','Horizontal position',0,100)}{range('y','Vertical position',0,100)}</>}
 {id===4&&<><label>Rotation<select value={o.angle} onChange={e=>set('angle',+e.target.value)}>{[0,90,180,270].map(n=><option key={n} value={n}>{n}°</option>)}</select></label><label><input type="checkbox" checked={o.mirror} onChange={e=>set('mirror',e.target.checked)}/> Mirror horizontally</label></>}
 {id===5&&<>{['width','height'].map(k=><label key={k}>{k} in pixels<input type="number" min="16" max="2400" value={o[k]} onChange={e=>set(k,e.target.value)}/></label>)}</>}
 {id===6&&range('quality','JPEG quality',10,100)}
 {id===7&&<>{text('watermark','Watermark text')}{range('opacity','Opacity %',10,100)}</>}
 {id===9&&<label>Filter<select value={o.filter} onChange={e=>set('filter',e.target.value)}>{[['none','Original'],['grayscale(1)','Black and white'],['sepia(1)','Sepia'],['contrast(1.35) saturate(1.4)','Vivid'],['hue-rotate(180deg)','Alien'],['brightness(1.15) saturate(.5)','Faded']].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>}
 {id===10&&range('pixels','Pixel columns',8,100)}
 <button className="btn btn-primary" disabled={!images.length} onClick={()=>canvas.current.toBlob(blob=>{if(blob){downloadBlob(blob,'astral-'+id+(id===6?'.jpg':'.png'));setNotice(`Exported ${(blob.size/1024).toFixed(1)} KB`);}},id===6?'image/jpeg':'image/png',o.quality/100)}>Download {id===6?'JPEG':'PNG'}</button><p role="status">{error||notice}</p></aside>
 <div className="studio-preview">{!images.length&&<div className="studio-empty"><span>✦</span><h3>Your next creation starts here.</h3><p>Choose a photo to begin.</p></div>}<canvas ref={canvas} hidden={!images.length} aria-label="Edited image preview"/>{id===8&&<div className="studio-swatches">{palette.map(color=><button key={color} style={{borderTop:`32px solid ${color}`}} onClick={()=>navigator.clipboard.writeText(color).then(()=>setNotice('Copied '+color)).catch(()=>setNotice(color))}>{color}</button>)}</div>}</div></div>;
}
