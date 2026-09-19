import * as T from 'three';
import { storage } from './core.js';
import { BIKES } from './bikephysics.js';
import { loadBuild, saveBuild, PAINTS } from './customization.js';
import { TRICKS, refuelingAllowed, refuel, canTrick, chargingAllowed, charge, driveControls, recoverEnergy, Trip, Trial, clamp } from './ride-systems.js';

const $=id=>document.getElementById(id);
const read=(key,fallback)=>{try{return JSON.parse(storage.get('hushmoto.lab.'+key,JSON.stringify(fallback)));}catch{return fallback;}};
const save=(key,value)=>storage.set('hushmoto.lab.'+key,JSON.stringify(value));
const defaults={mode:'sport',limit:'0',regen:'0',units:'kmh',headlight:true,neon:'#52f5ba',glow:false,fov:68,cycle:false,scale:100};
const gearDefaults={helmetM:'#eef1f5',gearA:'#4ef0b3',gearB:'#424a57',gloveM:'#3a3f48',bootM:'#2a2d34',visorM:'#10141c',number:'01',backpack:false};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const select=(id,label,options)=>`<label class="mp-label">${label}<select id="lab-${id}">${options.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`;
const button=(id,text)=>`<button class="btn small" id="lab-${id}">${text}</button>`;
const check=(id,text)=>`<label class="mp-check"><input type="checkbox" id="lab-${id}">${text}</label>`;
const section=(name,html)=>`<section class="lab-section"><h3>${name}</h3>${html}</section>`;

export class RideLab {
 constructor(game){
  this.g=game;this.prefs={...defaults,...read('prefs',{})};this.gear={...gearDefaults,...read('gear',{})};
  this.trip=new Trip();this.odometer=Number(read('odometer',0))||0;this.records=read('records',[]);this.badges=read('badges',[]);
  this.bookmarks=read('bookmarks',[]);this.visited=read('visited',[]);this.tokens=read('tokens',[]);this.presets=read('presets',{});
  this.today=new Date().toLocaleDateString('en-CA');this.daily=read('daily',{date:this.today,distance:0});if(this.daily.date!==this.today)this.daily={date:this.today,distance:0};
  this.cruise=0;this.charging=null;this.trick=null;this.trickCooldown=0;this.sequence=[];this.trail=[];this.saveClock=0;this.dayClock=0;
  this.stations=[];this.makeStations();this.makeWorldChallenges();this.buildUI();this.makeLights();
 }
 hint(text){this.g.ui.showHint(text,3500);$('lab-status').textContent=text;}
 buildUI(){
  const menu=document.createElement('div');menu.id='menu-lab';menu.className='panel-page';
  menu.innerHTML=`<div class="page-head"><h2>RIDE LAB</h2><button class="btn small" id="lab-back">Back</button></div><div class="page-inner panel"><p class="mp-note">Your ride, your rules. U opens this menu. E refuels or charges, T holds cruise, J toggles lights, P opens photo mode. Outfits save on this device and appear to your multiplayer crew.</p><p id="lab-status" role="status">40 new tools and challenges · all free</p><div class="lab-grid">`+
   section('01 / Ride setup',select('mode','Power delivery',[['eco','Eco'],['street','Street'],['sport','Sport']])+select('limit','Throttle speed limiter',[['0','Off'],['25','25 km/h'],['50','50 km/h'],['80','80 km/h']])+select('regen','Regenerative braking',[['0','Off'],['1','Gentle'],['2','Strong']])+select('units','Speed units',[['kmh','km/h'],['mph','mph']])+check('headlight','Headlight · J')+check('glow','Underglow')+`<label class="mp-label">Underglow color<input type="color" id="lab-neon"></label><label class="mp-label">Camera FOV <input id="lab-fov" type="range" min="45" max="95"></label>`+button('cruise','Toggle cruise · T'))+
   section('02 / Player customization',Object.entries({helmetM:'Helmet',gearA:'Jersey',gearB:'Pants',gloveM:'Gloves',bootM:'Boots',visorM:'Visor'}).map(([k,v])=>`<label class="mp-label">${v}<input type="color" id="gear-${k}"></label>`).join('')+`<label class="mp-label">Jersey number<input id="gear-number" type="text" maxlength="2" inputmode="numeric" pattern="[0-9]{1,2}"></label><label class="mp-check"><input type="checkbox" id="gear-backpack">Riding backpack</label>`+button('gear-reset','Reset outfit')+button('gear-preview','Preview outfit'))+
   section('03 / Garage & camera',select('slot','Build preset',[['1','Slot 1'],['2','Slot 2'],['3','Slot 3']])+button('save-build','Save current build')+button('load-build','Load saved build')+button('random','Random bike theme')+button('photo','Photo mode · P')+check('cycle','Automatic day / night cycle')+`<label class="mp-label">HUD scale<input id="lab-scale" type="range" min="75" max="130"></label>`)+
   section('04 / Fuel, charging & navigation',select('station','Service station',this.stations.map((s,i)=>[i,s.name]))+button('route-charge','Route to station')+button('travel-charge','Travel to station')+button('charge','Refuel / charge / disconnect · E')+select('target','Charge target',[['1','100%'],['0.8','80%']])+button('home','Return downtown')+button('bookmark','Save current location')+select('bookmark-list','Saved locations',[])+button('route-bookmark','Route to saved location')+button('delete-bookmark','Delete saved location')+button('checkpoint','Set recovery point')+button('recover','Return to recovery point'))+
   section('05 / Trip & challenges',`<p id="lab-trip"></p>`+button('reset-trip','Reset trip')+button('export','Export trip JSON')+select('trial','Performance test',[['acceleration','0–50 km/h'],['braking','50–0 braking distance'],['distance','Timed 1 km']])+button('start-trial','Arm test & ride')+select('challenge','Skill challenge',[['wheelie','Wheelie for 5 seconds'],['air','2 seconds of airtime'],['clean','60 seconds without crashing'],['combo','Bank 1,000 points'],['sequence','Chain 1 → 2 → 3 → 4 → 5']])+button('start-challenge','Start skill challenge')+button('courier','Start delivery')+button('slalom','Start slalom')+button('cancel','Cancel current challenges')+`<p class="mp-note">Explore every district, find 7 floating energy tokens, pass the speed traps, and ride 5 km each day. These objectives save automatically.</p><p id="lab-progress"></p><div id="lab-records"></div><div id="lab-badges"></div>`)+
   section('06 / Trick deck',`<p class="mp-note">Press a number while moving. Hold a wheelie or jump to build your combo. Nac nac and Superman require airtime. Each animation must finish before the next trick. Crashes lose unbanked points.</p>`+TRICKS.map((t,i)=>`<div class="trick-key"><kbd>${i+1}</kbd><span>${t}</span></div>`).join(''))+`</div></div>`;
  $('menu-box').append(menu);
  const entry=document.createElement('button');entry.className='btn';entry.textContent='Ride Lab / Player / Fuel';entry.onclick=()=>this.open();$('menu-main').querySelector('.menu-btns').append(entry);
  const hud=document.createElement('div');hud.id='lab-hud';hud.innerHTML='<strong id="lab-nav"></strong><span id="lab-energy"></span><span id="lab-live"></span>';$('hud').append(hud);
  const photo=document.createElement('div');photo.id='photo-tools';photo.hidden=true;photo.innerHTML=`<strong>PHOTO MODE</strong><label>Orbit<input type="range" id="photo-angle" min="-180" max="180" value="140"></label><label>Distance<input type="range" id="photo-distance" min="2" max="12" step="0.1" value="4"></label><label>Height<input type="range" id="photo-height" min="0.3" max="5" step="0.1" value="1.3"></label>${button('snapshot','Save PNG')}${button('exit-photo','Back to ride')}`;document.body.append(photo);
  $('lab-back').onclick=()=>gamePanel(this.g,'main');
  for(const key of Object.keys(defaults)){
   const el=$('lab-'+key);if(!el)continue;if(el.type==='checkbox')el.checked=!!this.prefs[key];else el.value=this.prefs[key];
   el.oninput=()=>{this.prefs[key]=el.type==='checkbox'?el.checked:el.value;save('prefs',this.prefs);this.applyPreferences();};
  }
  for(const key of Object.keys(gearDefaults)){
   const el=$('gear-'+key);if(el.type==='checkbox')el.checked=!!this.gear[key];else el.value=this.gear[key];
   el.oninput=()=>{this.gear[key]=el.type==='checkbox'?el.checked:key==='number'?el.value.replace(/\D/g,'').slice(0,2):el.value;save('gear',this.gear);this.styleKey=null;this.styleRider();};
  }
  $('lab-gear-reset').onclick=()=>{this.gear={...gearDefaults};save('gear',this.gear);for(const [k,v]of Object.entries(this.gear)){const el=$('gear-'+k);if(el.type==='checkbox')el.checked=v;else el.value=v;}this.styleKey=null;this.styleRider();};
  $('lab-cruise').onclick=()=>this.toggleCruise();$('lab-charge').onclick=()=>this.toggleCharge();
  $('lab-save-build').onclick=()=>{this.presets[$('lab-slot').value]={id:this.g.bikeId,build:loadBuild(this.g.bikeId)};save('presets',this.presets);this.hint('Build preset saved');};
  $('lab-load-build').onclick=async()=>{const p=this.presets[$('lab-slot').value];if(!p||!BIKES.some(b=>b.id===p.id))return this.hint('This slot is empty');saveBuild(p.id,p.build);await this.g.selectBike(p.id,{reload:true});this.hint('Build loaded');};
  $('lab-random').onclick=async()=>{const paints=Object.keys(PAINTS).filter(k=>k!=='stock');saveBuild(this.g.bikeId,{...loadBuild(this.g.bikeId),paint:paints[Math.floor(Math.random()*paints.length)]});await this.g.selectBike(this.g.bikeId,{reload:true});this.hint('Fresh theme applied');};
  $('lab-gear-preview').onclick=()=>this.photoMode();$('lab-photo').onclick=()=>this.photoMode();$('lab-exit-photo').onclick=()=>this.exitPhoto();$('lab-snapshot').onclick=()=>{this.g.renderer.render(this.g.scene,this.g.camera);this.g.canvas.toBlob(blob=>blob&&download(blob,'hush-moto-photo.png'));};
  $('lab-route-charge').onclick=()=>{this.g.ui.waypoint={...this.stations[+$('lab-station').value]};this.hint('Service station marked on map');};
  $('lab-travel-charge').onclick=()=>this.travel(this.stations[+$('lab-station').value]);
  $('lab-home').onclick=()=>this.travel(this.g.world.spawnPoints[0]);
  $('lab-bookmark').onclick=()=>{if(this.bookmarks.length>=10)return this.hint('10 saved locations maximum; delete one first');const p=this.g.bike.pos;this.bookmarks.push({x:p.x,z:p.z,name:`Location ${this.bookmarks.length+1}`});save('bookmarks',this.bookmarks);this.refreshBookmarks();this.hint('Location saved');};
  $('lab-route-bookmark').onclick=()=>{const p=this.bookmarks[+$('lab-bookmark-list').value];if(p){this.g.ui.waypoint={...p};this.hint('Saved location marked');}else this.hint('Save a location first');};
  $('lab-delete-bookmark').onclick=()=>{this.bookmarks.splice(+$('lab-bookmark-list').value,1);save('bookmarks',this.bookmarks);this.refreshBookmarks();};
  $('lab-checkpoint').onclick=()=>{const b=this.g.bike;if(!b.grounded||b.crashed||b.speed>1)return this.hint('Stop on the ground to save a recovery point');this.recovery={x:b.pos.x,z:b.pos.z,y:b.pos.y-b.h,yaw:b.yaw};this.hint('Recovery point set for this session');};
  $('lab-recover').onclick=()=>this.recovery?this.travel(this.recovery):this.hint('Set a recovery point first');
  $('lab-reset-trip').onclick=()=>{this.trip.reset();this.hint('Trip reset');};
  $('lab-export').onclick=()=>download(new Blob([JSON.stringify({date:new Date().toISOString(),bike:this.g.bikeId,seconds:this.trip.seconds,meters:this.trip.distance,topKmh:this.trip.max,odometerMeters:this.odometer,records:this.records},null,2)],{type:'application/json'}),'hush-moto-trip.json');
  $('lab-start-trial').onclick=()=>{const k=$('lab-trial').value;if(k!=='braking'&&this.g.bike.kmh>1)return this.hint('Stop before starting this test');this.cancelChallenges();this.trial=new Trial(k,this.g.bike);this.g.setPaused(false);this.hint(k==='braking'?'Reach 50 km/h, then brake':'Go! Timer starts when you move');};
  $('lab-start-challenge').onclick=()=>{this.cancelChallenges();this.g.stunts.loseCombo();this.challenge={kind:$('lab-challenge').value,time:0,distance:0,score:this.g.stunts.score,version:this.g.bike.resetVersion};this.sequence=[];this.g.setPaused(false);this.hint('Skill challenge started');};
  $('lab-courier').onclick=()=>{this.cancelChallenges();const p=this.g.world.spawnPoints.reduce((best,p)=>distance(p,this.g.bike.pos)>distance(best,this.g.bike.pos)?p:best);this.delivery={...p,time:0,version:this.g.bike.resetVersion};this.g.ui.waypoint={...p};this.g.setPaused(false);this.hint('Delivery picked up. Stop at the marked destination.');};
  $('lab-slalom').onclick=()=>{this.cancelChallenges();this.travel(this.slalomStart);this.slalom={index:0,time:0,version:this.g.bike.resetVersion};this.g.setPaused(false);this.hint('Pass the glowing gates in order');};
  $('lab-cancel').onclick=()=>{this.cancelChallenges();this.hint('Challenges cancelled');};
  this.refreshBookmarks();this.applyPreferences();
 }
 open(){if(this.photo)this.exitPhoto();this.g.setPaused(true);gamePanel(this.g,'lab');}
 applyPreferences(){this.g.cameraRig.baseFov=+this.prefs.fov;$('hud').style.zoom=Number(this.prefs.scale)/100;}
 refreshBookmarks(){const el=$('lab-bookmark-list');el.replaceChildren();this.bookmarks.forEach((p,i)=>{const o=document.createElement('option');o.value=i;o.textContent=p.name;el.append(o);});}
 cancelChallenges(){this.trial=null;this.challenge=null;this.delivery=null;this.slalom=null;this.sequence=[];}
 travel(point){if(this.g.police.busted)return this.hint('Wait until you are released');this.charging=null;this.cruise=0;this.cancelChallenges();this.g.stunts.loseCombo();this.g.bike.reset({...point,y:point.y??this.g.world.terrainHeight(point.x,point.z)});this.g.cameraRig.initialised=false;this.g.cameraRig.lookSmooth.set(point.x,this.g.bike.pos.y+.9,point.z);this.trip.last=null;this.trail.push({x:point.x,z:point.z,break:true});this.g.setPaused(false);this.hint(`Arrived: ${point.name||'recovery point'}`);}
 toggleCruise(){if(this.cruise){this.cruise=0;return this.hint('Cruise off');}if(this.g.bike.kmh<8||this.g.bike.crashed||this.g.police.busted||this.charging)return this.hint('Ride above 8 km/h to enable cruise');this.cruise=this.g.bike.kmh;this.g.setPaused(false);this.hint(`Cruise set · ${Math.round(this.cruise)} km/h · brake to cancel`);}
 toggleCharge(){if(this.charging){const gas=this.charging.kind==='gas';this.charging=null;return this.hint(gas?'Fuel pump stopped':'Charger unplugged');}const b=this.g.bike,s=this.stations.find(s=>chargingAllowed(b,s,this.g.police.busted)||refuelingAllowed(b,s,this.g.police.busted));if(!s)return this.hint(b.cfg.kind==='gas'?'Stop in an orange gas station bay':'Stop inside a mint charging bay');if(s.kind==='gas'){if(b.fuel>=.9999)return this.hint('Fuel tank is full');this.charging=s;this.cruise=0;this.g.setPaused(false);return this.hint('Refueling · E stops the pump');}if(b.battery>=+$('lab-target').value)return this.hint('Battery already at charge target');this.charging=s;this.cruise=0;this.g.setPaused(false);this.hint('Connected · E to unplug · accelerated game charging');}
 beforeStep(input,dt,allowed){const b=this.g.bike;if(this.charging&&!(chargingAllowed(b,this.charging,this.g.police.busted)||refuelingAllowed(b,this.charging,this.g.police.busted)))this.charging=null;const result=driveControls(input,b,this.prefs,this.cruise,allowed);this.cruise=result.cruise;this.previousSpeed=b.speed;this.controls=result.controls;if(this.charging)this.controls={...this.controls,throttle:0,boost:0,brake:1,rearBrake:0,reverse:false,wheelie:0};return this.controls;}
 afterStep(dt){const b=this.g.bike;if(this.charging?.kind==='gas'){refuel(b,dt);if(b.fuel>=1){this.charging=null;this.award('Full tank');this.hint('Tank filled — pump stopped');}}else if(this.charging){charge(b,dt,+$('lab-target').value);if(b.battery>=+$('lab-target').value-.000001){this.charging=null;this.award('Charged up');this.hint('Charge target reached — unplugged');}}else recoverEnergy(b,this.previousSpeed,this.controls,dt,+this.prefs.regen);}
 makeStations(){
  for(const spawn of this.g.world.spawnPoints.filter(s=>['Parking lot','Dirt playground','Stunt park','West avenue','Bridge approach'].includes(s.name))){
   const s={...spawn,kind:['West avenue','Bridge approach'].includes(spawn.name)?'gas':'electric'};if(s.kind==='gas'){s.x=spawn.name==='West avenue'?-210:210;s.z=spawn.name==='West avenue'?-60:210;s.y=this.g.world.terrainHeight(s.x,s.z);s.yaw=0;}s.y=this.g.world.queryGround(s.x,s.z,s.y+5,{}).y;s.name=s.kind==='gas'?(s.x<0?'West plaza gas station':'East plaza gas station'):spawn.name+' charger';
   // The bay uses an already collision-checked spawn; the pedestal is placed outside it.
   let px=s.x+3.3,pz=s.z;
   for(let i=0;i<16;i++){const a=i*Math.PI/8;const x=s.x+Math.cos(a)*3.3,z=s.z+Math.sin(a)*3.3,y=this.g.world.terrainHeight(x,z);if(!this.g.world.collideCircle(x,z,y+.5,.6,{}).hit){px=x;pz=z;break;}}
   const y=this.g.world.queryGround(px,pz,this.g.world.terrainHeight(px,pz)+5,{}).y;s.pedestal=new T.Vector3(px,y+1.1,pz);
   const root=new T.Group();const mat=new T.MeshStandardMaterial({color:0x202c34,metalness:.65,roughness:.38});
   const body=new T.Mesh(new T.BoxGeometry(.5,1.4,.35),mat);body.position.set(px,y+.7,pz);body.castShadow=true;root.add(body);
   const screen=new T.Mesh(new T.BoxGeometry(.36,.40,.025),new T.MeshStandardMaterial({color:0x64ffbe,emissive:0x1dbc79,emissiveIntensity:1.3}));screen.position.set(px,y+1.1,pz+.19);root.add(screen);
   const ring=new T.Mesh(new T.RingGeometry(2.4,2.55,48),new T.MeshBasicMaterial({color:s.kind==='gas'?0xffbd70:0x66ffd0,side:T.DoubleSide}));ring.geometry.rotateX(-Math.PI/2);const rp=ring.geometry.attributes.position;for(let j=0;j<rp.count;j++){const x=rp.getX(j),z=rp.getZ(j);rp.setY(j,this.g.world.queryGround(s.x+x,s.z+z,s.y+5,{}).y-s.y+.11);}ring.geometry.computeVertexNormals();ring.position.set(s.x,s.y,s.z);root.add(ring);
   if(s.kind==='gas'){const roof=new T.Mesh(new T.BoxGeometry(6,.25,4),new T.MeshStandardMaterial({color:0xd97736,roughness:.5}));roof.position.set(s.x,s.y+3.7,s.z);root.add(roof);for(const side of [-1,1])for(const end of [-1,1]){const cx=s.x+side*2.8,cz=s.z+end*1.8,cy=this.g.world.queryGround(cx,cz,s.y+5,{}).y;const pole=new T.Mesh(new T.CylinderGeometry(.09,.09,s.y+3.7-cy,8),mat);pole.position.set(cx,(s.y+3.7+cy)/2,cz);root.add(pole);this.g.world.addObstacle({x:cx,z:cz,y:cy,w:.18,d:.18,radius:.09,h:s.y+3.7-cy,kind:'fuel-canopy'});}const trim=new T.Mesh(new T.BoxGeometry(.55,.15,.4),new T.MeshStandardMaterial({color:0xff9f45}));trim.position.set(px,y+1.45,pz);root.add(trim);}
   const label=this.sign(s.kind==='gas'?'ASTRAL FUEL / E':'CHARGE / E');label.position.set(px,y+2,pz);root.add(label);
   const points=[s.pedestal.clone(),new T.Vector3(px+.6,y+.3,pz),new T.Vector3(px+.25,y+.65,pz)];
   s.cable=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),16,.025,5,false),new T.MeshStandardMaterial({color:0x0b1217}));root.add(s.cable);
   this.g.scene.add(root);this.g.world.addObstacle({x:px,z:pz,y,w:.5,d:.35,h:1.4,kind:'charger'});this.stations.push(s);
  }
 }
 sign(text){const c=document.createElement('canvas');c.width=512;c.height=96;const x=c.getContext('2d');x.fillStyle='#11251f';x.fillRect(0,0,512,96);x.fillStyle='#8fffd2';x.font='bold 42px system-ui';x.textAlign='center';x.fillText(text,256,63);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const sprite=new T.Sprite(new T.SpriteMaterial({map:tex}));sprite.scale.set(2.7,.5,1);return sprite;}
 makeLights(){this.light=new T.SpotLight(0xd8ecff,35,35,.48,.55,1);this.g.scene.add(this.light,this.light.target);this.glow=new T.PointLight(0x52f5ba,5,3,2);this.g.scene.add(this.glow);}
 makeWorldChallenges(){
  this.collectibles=this.g.world.spawnPoints.map((p,i)=>{const mesh=new T.Mesh(new T.OctahedronGeometry(.5),new T.MeshStandardMaterial({color:0xffd877,emissive:0xa55b10,metalness:.5,roughness:.2}));mesh.position.set(p.x,p.y+1.5,p.z+4);mesh.visible=!this.tokens.includes(i);this.g.scene.add(mesh);return{mesh,id:i,x:p.x,z:p.z+4,y:p.y};});
  this.traps=this.g.world.spawnPoints.filter(s=>['Downtown','West avenue'].includes(s.name)).map(p=>({...p,inside:false}));
  this.traps.forEach(p=>{const sign=this.sign('SPEED TRAP');sign.position.set(p.x+4,p.y+2,p.z);this.g.scene.add(sign);});
  this.slalomStart={...this.g.world.spawnPoints.find(s=>s.name==='Dirt playground')||this.g.world.spawnPoints[0]};
  this.gates=[];
  for(let i=0;i<6;i++){let x=this.slalomStart.x+(i%2?3:-3),z=this.slalomStart.z+12+i*12,y=this.g.world.terrainHeight(x,z);if(this.g.world.collideCircle(x,z,y+.5,2,{}).hit){x=this.slalomStart.x;z=this.slalomStart.z+12+i*12;y=this.g.world.terrainHeight(x,z);}const mesh=new T.Mesh(new T.TorusGeometry(2,.12,6,24),new T.MeshBasicMaterial({color:0x62ffc5}));mesh.position.set(x,y+2,z);mesh.visible=false;this.g.scene.add(mesh);this.gates.push({x,y,z,mesh});}
 }
 styleRider(){for(const model of [this.g.model,this.g.ui.showroom?.model].filter(Boolean))stylePlayer(model,this.gear);}
 trickStart(index){const b=this.g.bike;if(this.trickCooldown>0||this.trick||this.charging||this.g.police.busted)return;if(!canTrick(b,index))return this.hint(index>=3?'Jump first for this trick':'Start riding to perform tricks');this.trick={index,time:0};this.trickCooldown=1.1;this.hint(`${index+1} · ${TRICKS[index]}`);}
 update(dt){
  const g=this.g,b=g.bike,playing=!g.paused;this.styleRider();
  if(g.input.wasPressed('lab'))this.open();
  if(g.input.wasPressed('photo'))this.photo?this.exitPhoto():this.photoMode();
  if(playing){if(g.input.wasPressed('charge'))this.toggleCharge();if(g.input.wasPressed('cruise'))this.toggleCruise();if(g.input.wasPressed('headlight')){this.prefs.headlight=!this.prefs.headlight;$('lab-headlight').checked=this.prefs.headlight;save('prefs',this.prefs);}for(let i=0;i<5;i++)if(g.input.wasPressed('trick'+(i+1)))this.trickStart(i);}
  if(this.photo){const angle=+$('photo-angle').value*Math.PI/180,dist=+$('photo-distance').value;g.camera.position.set(b.pos.x+Math.sin(angle)*dist,b.pos.y+ +$('photo-height').value,b.pos.z+Math.cos(angle)*dist);g.camera.lookAt(b.pos.x,b.pos.y+.45,b.pos.z);}
  if(!playing){this.cruise=0;this.trick=null;b.trickIndex=-1;}else{
   this.sequenceGrace=Math.max(0,(this.sequenceGrace||0)-dt);if(!this.sequenceGrace||b.crashed||this.sequenceVersion!==b.resetVersion)this.sequence=[];this.sequenceVersion=b.resetVersion;
   const moved=this.trip.update(b,dt);this.odometer+=moved;this.daily.distance+=moved;this.trickCooldown=Math.max(0,this.trickCooldown-dt);
   if(this.trick){this.trick.time+=dt;b.trickIndex=this.trick.index;b.trickBlend=Math.sin(Math.min(1,this.trick.time/.9)*Math.PI);
    if(!canTrick(b,this.trick.index)){this.trick=null;b.trickIndex=-1;}else if(this.trick.time>=.9){const i=this.trick.index;g.stunts.addTrick(TRICKS[i],(i+1)*90,'manual'+i);g.stunts.popup(TRICKS[i],'good');this.sequenceGrace=2.4;this.sequence.push(i+1);if(this.sequence.length>5)this.sequence.shift();this.trick=null;b.trickIndex=-1;if(this.sequence.join('')==='12345'){g.stunts.addTrick('Five trick flow',1000,'flow');this.award('Five trick flow');}}}
   this.updateObjectives(dt,moved);
   this.saveClock+=dt;if(this.saveClock>5){this.saveClock=0;const today=new Date().toLocaleDateString('en-CA');if(today!==this.today){this.today=today;this.daily={date:today,distance:0};}save('odometer',this.odometer);save('daily',this.daily);if(!this.trail.length||distance(b.pos,this.trail[this.trail.length-1])>2){this.trail.push({x:b.pos.x,z:b.pos.z});if(this.trail.length>300)this.trail.shift();}}
   if(this.prefs.cycle){this.dayClock+=dt;const k=(Math.sin(this.dayClock/80)+1)/2;g.sun.intensity=.45+k*1.4;g.scene.fog.color.set(0x162838).lerp(new T.Color(0xa6bdc9),k);g.scene.background=g.scene.fog.color.clone();}
   if(b.cfg.kind==='electric'&&b.battery<.15&&!this.lowWarning){this.lowWarning=true;this.hint('Low battery · Ride Lab → route to a charger');}if(b.battery>.2)this.lowWarning=false;if(b.cfg.kind==='gas'&&b.fuel<.15&&!this.fuelWarning){this.fuelWarning=true;this.hint('Low fuel · Ride Lab → gas station');}if(b.fuel>.2)this.fuelWarning=false;
   const near=this.stations.find(s=>chargingAllowed(b,s,g.police.busted)||refuelingAllowed(b,s,g.police.busted));if(near&&!this.charging)$('lab-live').textContent=b.cfg.kind==='gas'?'Fuel bay · E to refuel':'Charging bay · E to plug in';
   if(g.ui.waypoint&&distance(b.pos,g.ui.waypoint)<10){g.ui.waypoint=null;this.hint('Waypoint reached');}
  }
  this.light.visible=!!this.prefs.headlight;this.light.position.set(b.pos.x,b.pos.y+.4,b.pos.z);this.light.target.position.set(b.pos.x+Math.sin(b.yaw)*15,b.pos.y-1,b.pos.z+Math.cos(b.yaw)*15);this.glow.visible=!!this.prefs.glow;this.glow.color.set(this.prefs.neon);this.glow.position.set(b.pos.x,b.pos.y-.3,b.pos.z);
  this.stations.forEach(s=>{if(this.charging===s||s.wasConnected){const end=this.charging===s?new T.Vector3(b.pos.x+.2,b.pos.y+.1,b.pos.z):s.pedestal.clone().add(new T.Vector3(.25,-.45,0));const mid=s.pedestal.clone().lerp(end,.5);mid.y=s.y+.12;s.cable.geometry.dispose();s.cable.geometry=new T.TubeGeometry(new T.CatmullRomCurve3([s.pedestal,mid,end]),16,.025,5,false);s.wasConnected=this.charging===s;}});
  const heading=((Math.round(b.yaw*180/Math.PI)%360)+360)%360;const dir=['N','NE','E','SE','S','SW','W','NW'][Math.round(heading/45)%8];$('lab-nav').textContent=`${dir} ${heading}° · ${this.prefs.mode.toUpperCase()}${this.cruise?' · CRUISE':''}`;
  const range=b.battery*(b.cfg.batteryWh||0)/35;$('lab-energy').textContent=b.cfg.kind==='electric'?`${Math.round(b.battery*100)}% · est. ${range.toFixed(0)} km${this.charging?' · CHARGING':''}`:`Fuel ${Math.round(b.fuel*100)}% · ${(b.fuel*b.cfg.tankLiters).toFixed(1)} L${this.charging?' · REFUELING':''}`;
  const near=this.stations.find(s=>chargingAllowed(b,s,g.police.busted)||refuelingAllowed(b,s,g.police.busted));$('lab-live').textContent=this.trial?`${this.trial.kind}: ${this.trial.done?this.trial.result:this.trial.time.toFixed(1)+'s'}`:this.challenge?`Challenge: ${this.challenge.kind} · ${this.challenge.time.toFixed(1)}s`:this.delivery?`Delivery · ${Math.round(distance(b.pos,this.delivery))}m`:this.slalom?`Slalom ${this.slalom.index}/6 · ${this.slalom.time.toFixed(1)}s`:this.charging?(this.charging.kind==='gas'?'E to stop refueling':'E to unplug'):near?(b.cfg.kind==='gas'?'E to refuel':'E to plug in'):'1–5 tricks · U Ride Lab';
  if(g.ui.activePanel==='lab')this.refreshStats();
 }
 updateObjectives(dt,moved){
  const b=this.g.bike;
  if(this.trial){const was=this.trial.done;this.trial.update(b,dt,moved);if(this.trial.done&&!was){this.hint(this.trial.result);if(!this.trial.result.startsWith('Cancelled'))this.record(this.trial.kind,this.trial.result);}}
  if(this.challenge){const c=this.challenge;if(b.crashed||c.version!==b.resetVersion){this.hint('Challenge ended: crash or reset');this.challenge=null;}else{c.distance+=moved;const active=c.kind==='wheelie'?b.grounded&&b.pitch-b.groundPitch>.18&&b.speed>2:c.kind==='air'?!b.grounded:true;c.time=active?c.time+dt:0;const won=c.kind==='wheelie'?c.time>=5:c.kind==='air'?c.time>=2:c.kind==='clean'?c.time>=60&&c.distance>30:c.kind==='combo'?this.g.stunts.score-c.score>=1000:this.sequence.join('')==='12345';if(won){this.award(c.kind+' challenge');this.record(c.kind,'Complete');this.challenge=null;}}}
  if(this.delivery){this.delivery.time+=dt;if(b.crashed||this.delivery.version!==b.resetVersion){this.delivery=null;this.hint('Delivery cancelled');}else if(distance(b.pos,this.delivery)<8&&b.speed<1){this.record('Delivery',this.delivery.time.toFixed(1)+' s');this.award('Courier');this.delivery=null;}}
  if(this.slalom){const s=this.slalom;s.time+=dt;if(b.crashed||s.version!==b.resetVersion){this.slalom=null;this.hint('Slalom cancelled');}else if(distance(b.pos,this.gates[s.index])<2.8&&Math.abs(b.pos.y-this.gates[s.index].y)<4){s.index++;if(s.index===6){this.record('Slalom',s.time.toFixed(2)+' s');this.award('Cone carver');this.slalom=null;}}}
  this.gates.forEach((gate,i)=>{gate.mesh.visible=!!this.slalom;gate.mesh.material.color.set(this.slalom&&i===this.slalom.index?0xffdc77:0x315347);});
  this.collectibles.forEach(c=>{c.mesh.rotation.y+=dt;if(!this.tokens.includes(c.id)&&distance(b.pos,c)<2&&Math.abs(b.pos.y-c.y)<3){this.tokens.push(c.id);save('tokens',this.tokens);c.mesh.visible=false;this.hint(`Energy token ${this.tokens.length}/${this.collectibles.length}`);if(this.tokens.length===this.collectibles.length)this.award('Token collector');}});
  this.g.world.spawnPoints.forEach((p,i)=>{if(distance(b.pos,p)<15&&!this.visited.includes(i)){this.visited.push(i);save('visited',this.visited);this.hint(`Discovered ${p.name}`);if(this.visited.length===this.g.world.spawnPoints.length)this.award('City explorer');}});
  this.traps.forEach(t=>{const inside=distance(b.pos,t)<5;if(inside&&!t.inside&&b.kmh>15){this.record(t.name+' speed trap',Math.round(b.kmh)+' km/h');}t.inside=inside;});
  if(this.odometer>=1000)this.award('First kilometer');if(this.odometer>=10000)this.award('10 km club');if(this.daily.distance>=5000)this.award('Daily 5 km · '+this.today);
 }
 award(name){if(this.badges.includes(name))return;this.badges.push(name);save('badges',this.badges);this.hint('Badge unlocked: '+name);}
 record(name,value){this.records.unshift({name,value,date:new Date().toLocaleString()});this.records=this.records.slice(0,20);save('records',this.records);this.hint(name+': '+value);}
 refreshStats(){const t=this.trip;$('lab-trip').textContent=`Trip ${(t.distance/1000).toFixed(2)} km · ${Math.floor(t.seconds/60)}m ${Math.floor(t.seconds%60)}s · Avg ${(t.seconds?t.distance/t.seconds*3.6:0).toFixed(1)} km/h · Max ${t.max.toFixed(1)} km/h · Odometer ${(this.odometer/1000).toFixed(2)} km`;$('lab-progress').textContent=`Daily ride: ${(this.daily.distance/1000).toFixed(2)} / 5 km · Tokens ${this.tokens.length}/7 · Districts ${this.visited.length}/7`;$('lab-records').textContent=this.records.length?'Recent records: '+this.records.map(r=>r.name+' '+r.value).join(' · '):'Complete a test to set your first record.';$('lab-badges').textContent='Badges: '+(this.badges.join(' · ')||'Your first badge is waiting.');}
 photoMode(){this.g.setPaused(true);this.photo=true;$('menu').classList.remove('show');$('ui').style.visibility='hidden';$('photo-tools').hidden=false;}
 exitPhoto(){this.photo=false;$('ui').style.visibility='';$('photo-tools').hidden=true;this.g.setPaused(false);}
 drawMap(ctx,scale){const point=p=>[(p.x+512)*scale,(512-p.z)*scale];ctx.strokeStyle='#6cd1ea80';ctx.lineWidth=2;ctx.beginPath();this.trail.forEach((p,i)=>{const [x,y]=point(p);i&&!p.break?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();ctx.font='bold 12px system-ui';this.stations.forEach(p=>{const[x,y]=point(p);ctx.fillStyle=p.kind==='gas'?'#ffbd70':'#7cffbb';ctx.fillRect(x-5,y-5,10,10);ctx.fillText(p.kind==='gas'?'FUEL':'⚡',x+8,y+5);});this.collectibles.forEach(p=>{if(this.tokens.includes(p.id))return;const[x,y]=point(p);ctx.fillStyle='#ffcf74';ctx.fillText('◆',x,y);});}
}
function gamePanel(game,name){game.ui.showPanel(name);}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function stylePlayer(model, gear) {
 const r=model.rider,key=JSON.stringify(gear);if(!r||r.labStyle===key)return;r.labStyle=key;
   for(const k of ['helmetM','gearA','gearB','gloveM','bootM','visorM'])if(/^#[0-9a-f]{6}$/i.test(gear[k]))r.mats[k].color.set(gear[k]);r.mats.gearC.color.copy(r.mats.gearA.color);
   if(!r.pack){r.pack=new T.Mesh(new T.BoxGeometry(.23,.3,.12),new T.MeshStandardMaterial({color:0x242d37,roughness:.85}));r.pack.position.set(0,.2,-.18);r.torso.add(r.pack);}r.pack.visible=!!gear.backpack;
   if(r.number){r.number.material.map.dispose();r.number.material.dispose();r.number.geometry.dispose();r.number.removeFromParent();}
   const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#e9fff5';ctx.font='900 90px system-ui';ctx.textAlign='center';ctx.fillText(String(gear.number).replace(/\D/g,'').slice(0,2)||'01',64,96);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;r.number=new T.Mesh(new T.PlaneGeometry(.15,.15),new T.MeshStandardMaterial({map:tex,transparent:true,roughness:.8}));r.number.rotation.y=Math.PI;r.number.position.set(0,.22,gear.backpack?-.245:-.119);r.torso.add(r.number);
}
