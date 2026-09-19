import { useEffect, useRef, useState } from 'react';
import { Sparkles,Star,Search,ArrowUpRight } from 'lucide-react';
import { STUDIO_GROUPS,STUDIO_TOOLS } from '../lib/studio';
import { useStudio } from '../components/StudioShared';
import StudioImages from '../components/StudioImages';
import StudioWriting from '../components/StudioWriting';
import StudioPlanning from '../components/StudioPlanning';
import StudioDesign from '../components/StudioDesign';
import StudioTogether from '../components/StudioTogether';
import '../studio.css';

export default function StudioPage({router}){
 const requested=Number(router?.segments[1])||1,tool=STUDIO_TOOLS.find(t=>t.id===requested)||STUDIO_TOOLS[0];
 const[group,setGroup]=useState('All'),[search,setSearch]=useState(''),[onlyStars,starsOnly]=useState(false),[favorites,setFavorites]=useStudio('favorites',[]);
 const workspace=useRef(null);useEffect(()=>{if(router?.segments[1])workspace.current?.scrollIntoView({block:'start'});},[tool.id]);
 const shown=STUDIO_TOOLS.filter(t=>(group==='All'||t.group===group)&&(!onlyStars||favorites.includes(t.id))&&t.name.toLowerCase().includes(search.toLowerCase()));
 const descriptions={Images:'Make something worth sharing. Photos are processed in your browser.',Writing:'Shape your next post, clean up a draft, or find a new idea.',Planning:'A little space to organize your next big thing.',Design:'Build your own look with colors, shapes and original artwork.',Together:'Get the crew organized. Make some noise. Try something new.'};
 return <div className="astral-studio"><header className="studio-hero"><div><span className="eyebrow"><Sparkles size={14}/> NEW / ASTRAL STUDIO</span><h1>Make it<br/><em>your thing.</em></h1><p>50 free tools for your next post, project, or night with the crew.</p><div className="wrap"><span className="chip">50 tools</span><span className="chip">No paid unlocks</span><a className="chip" href="/hushmoto">Ride Hush Moto <ArrowUpRight size={13}/></a></div></div><div className="studio-orbit" aria-hidden="true"><span>✦</span><small>CREATE · PLAN · PLAY</small></div></header>
 <div className="studio-layout"><aside className="studio-directory"><label className="studio-search"><Search size={16}/><input value={search} placeholder="Find a tool…" aria-label="Search Studio tools" onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Tool category" value={group} onChange={e=>setGroup(e.target.value)}><option>All</option>{STUDIO_GROUPS.map(([g])=><option key={g}>{g}</option>)}</select><button className={'btn btn-sm '+(onlyStars?'btn-primary':'')} aria-pressed={onlyStars} onClick={()=>starsOnly(v=>!v)}><Star size={13}/> Favorites</button><small className="muted">{shown.length} tools</small><div className="studio-tool-list">{shown.map(t=><div className={'studio-tool '+(tool.id===t.id?'selected':'')} key={t.id}><button onClick={()=>router.navigate('/studio/'+t.id)} aria-current={tool.id===t.id?'page':undefined}><small>{String(t.id).padStart(2,'0')}</small><span>{t.name}</span></button><button className="studio-star" aria-label={(favorites.includes(t.id)?'Unfavorite ':'Favorite ')+t.name} aria-pressed={favorites.includes(t.id)} onClick={()=>setFavorites(old=>old.includes(t.id)?old.filter(n=>n!==t.id):[...old,t.id])}>{favorites.includes(t.id)?'★':'☆'}</button></div>)}{!shown.length&&<p className="muted">No matches. Try another category or search.</p>}</div></aside>
 <section ref={workspace} className="studio-workspace" aria-label={tool.name}><header><span className="eyebrow">{tool.group} / {String(tool.id).padStart(2,'0')}</span><h2>{tool.name}</h2><p className="muted">{descriptions[tool.group]}</p></header>
 {tool.id<=10?<StudioImages id={tool.id}/>:tool.id<=20?<StudioWriting key={tool.id} id={tool.id}/>:tool.id<=30?<StudioPlanning key={tool.id} id={tool.id}/>:tool.id<=40?<StudioDesign key={tool.id} id={tool.id}/>:<StudioTogether key={tool.id} id={tool.id}/>}
 </section></div><p className="studio-footnote">Drafts and favorites save on this device. Files stay local unless you choose to share them. Studio never publishes a post for you.</p></div>;
}
