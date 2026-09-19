export const STUDIO_GROUPS = [
 ['Images', ['Meme maker','Photo collage','Image cropper','Rotate & mirror','Image resizer','Image compressor','Watermark maker','Image palette extractor','Photo filters','Pixelate image']],
 ['Writing', ['Word counter','Case converter','Find & replace','Remove duplicate lines','Sort lines','Text comparison','Markdown preview','Fancy text','Word frequency','Caption prompts']],
 ['Planning', ['Private notebook','Checklist','Kanban board','Focus timer','Stopwatch','Event countdown','Habit tracker','Weekly planner','Idea board','Decision spinner']],
 ['Design', ['Gradient builder','Contrast checker','Color palette generator','Shadow designer','Border designer','Avatar maker','Banner maker','Pixel art editor','Sketch pad','Pattern generator']],
 ['Together', ['Team shuffler','Tournament bracket','Tier list maker','Poll card maker','Date calculator','Unit converter','Read aloud','Synth soundboard','Beat sequencer','Metronome']],
];
export const STUDIO_TOOLS=STUDIO_GROUPS.flatMap(([group,names],g)=>names.map((name,i)=>({id:g*10+i+1,name,group})));
export const lines=s=>s.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
export function shuffle(values,random=Math.random){const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export function textTool(id,text,options={}){
 const words=text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)||[];
 if(id===11)return `${words.length} words · ${[...text].length} characters · ${lines(text).length} nonempty lines · ${Math.max(1,Math.ceil(words.length/200))} min read`;
 if(id===12)return options.mode==='lower'?text.toLowerCase():options.mode==='title'?text.toLowerCase().replace(/(^|\s)\p{L}/gu,s=>s.toUpperCase()):text.toUpperCase();
 if(id===13)return options.find?text.split(options.find).join(options.replace||''):text;
 if(id===14)return [...new Set(lines(text))].join('\n');
 if(id===15)return lines(text).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})*(options.mode==='reverse'?-1:1)).join('\n');
 if(id===18)return [...text].map(c=>/[A-Z]/.test(c)?String.fromCodePoint(0x1d400+c.charCodeAt(0)-65):/[a-z]/.test(c)?String.fromCodePoint(0x1d41a+c.charCodeAt(0)-97):c).join('');
 if(id===19){const counts=Object.create(null);for(const w of words){const k=w.toLowerCase();counts[k]=(counts[k]||0)+1;}return Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([w,n])=>`${w}: ${n}`).join('\n');}
 return text;
}
export function contrast(a,b){const luminance=h=>{const v=h.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function teams(names,count,random=Math.random){const groups=Array.from({length:Math.min(names.length,Math.max(1,Math.floor(count)||1))},()=>[]);shuffle(names,random).forEach((n,i)=>groups[i%groups.length].push(n));return groups;}
export function bracket(names){let size=2;while(size<names.length)size*=2;const entrants=names.slice();while(entrants.length<size)entrants.push(null);const rounds=[];for(let n=size;n>=2;n/=2)rounds.push(Array.from({length:n/2},()=>[null,null]));rounds[0]=Array.from({length:size/2},(_,i)=>[entrants[i],entrants[size-1-i]]);return rounds;}
export const escapeXML=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function dateDifference(a,b){const x=Date.parse(a+'T00:00:00Z'),y=Date.parse(b+'T00:00:00Z');return Number.isFinite(x)&&Number.isFinite(y)?Math.round((y-x)/86400000):null;}
export const UNITS={speed:{'km/h':1,mph:1.609344,'m/s':3.6},distance:{km:1000,m:1,miles:1609.344,feet:.3048},mass:{kg:1,lb:.45359237,g:.001},volume:{liters:1,'US gallons':3.785411784,ml:.001}};
export function convert(value,category,from,to){return Number(value)*UNITS[category][from]/UNITS[category][to];}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export const exportText=(text,name='astral.txt')=>downloadBlob(new Blob([text],{type:'text/plain;charset=utf-8'}),name);
