import * as THREE from 'three';
import { storage } from './core.js';
import { WORLD_HALF } from './roadnet.js';
import { loadBuild, saveBuild } from './customization.js';
const $=id=>document.getElementById(id);
export function installGarageTools(ui) {
  const game=ui.game;
  const sync=()=>{
    const build=loadBuild(game.bikeId),electric=game.bike.cfg.kind==='electric';
    for(const key of ['paint','battery','controller'])$('custom-'+key).value=build[key];
    $('custom-battery').disabled=$('custom-controller').disabled=!electric;
    $('custom-status').textContent=`${game.bike.cfg.name} · ${Math.round(game.bike.cfg.peakPower/1000*10)/10 || '—'} kW · ${Math.round(game.bike.cfg.batteryWh || 0)} Wh · ${Math.round(game.bike.cfg.topSpeed*2.23694)} mph tune`;
  };
  ui.syncBuild=sync;
  $('custom-apply').onclick=async()=>{
    const button=$('custom-apply');button.disabled=true;
    try {
      saveBuild(game.bikeId,Object.fromEntries(['paint','battery','controller'].map(k=>[k,$('custom-'+k).value])));
      await game.selectBike(game.bikeId,{reload:true});
      ui.showroom?.select(game.bike,{reload:true});sync();
      $('custom-status').textContent+=' · Build saved';
    } finally {button.disabled=false;}
  };
  $('custom-reset').onclick=async()=>{saveBuild(game.bikeId,{});await game.selectBike(game.bikeId,{reload:true});ui.showroom?.select(game.bike,{reload:true});sync();};
  $('btn-map').onclick=()=>ui.showPanel('map');
  $('map-open').onclick=()=>{game.setPaused(true);ui.showPanel('map');};
  $('map-clear').onclick=()=>{ui.waypoint=null;ui.drawCityMap();};
  const canvas=$('city-map');
  canvas.onclick=event=>{const rect=canvas.getBoundingClientRect();ui.waypoint={x:(event.clientX-rect.left)/rect.width*WORLD_HALF*2-WORLD_HALF,z:WORLD_HALF-(event.clientY-rect.top)/rect.height*WORLD_HALF*2};ui.drawCityMap();};
  const original={background:game.scene.background,fog:game.scene.fog.color.clone(),sun:game.sun.color.clone(),intensity:game.sun.intensity};
  const themes={day:null,sunset:{sky:0x967a8b,fog:0x967a8b,sun:0xffba75,intensity:1.8},night:{sky:0x142438,fog:0x1d3045,sun:0x94b7f1,intensity:.8}};
  const atmosphere=()=>{
    const theme=themes[$('map-atmosphere').value];
    game.scene.background=theme?new THREE.Color(theme.sky):original.background;
    game.scene.fog.color.set(theme?theme.fog:original.fog);
    game.sun.color.set(theme?theme.sun:original.sun);game.sun.intensity=theme?theme.intensity:original.intensity;
    storage.set('hushmoto.atmosphere',$('map-atmosphere').value);
  };
  $('map-atmosphere').value=Object.hasOwn(themes,storage.get('hushmoto.atmosphere','day'))?storage.get('hushmoto.atmosphere','day'):'day';
  $('map-atmosphere').onchange=atmosphere;atmosphere();
  ui.drawCityMap=()=>{
    const ctx=canvas.getContext('2d'),size=canvas.width,scale=size/(2*WORLD_HALF);
    ctx.drawImage(ui.mapBase,0,0,size,size);
    game.rideLab?.drawMap(ctx,scale);
    const point=(pos,color,r=5)=>{const x=(pos.x+WORLD_HALF)*scale,y=(WORLD_HALF-pos.z)*scale;ctx.fillStyle=color;ctx.strokeStyle='#09131a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.stroke();return {x,y};};
    for(const remote of game.multiplayer?.remotes.values()||[])point(remote.state.pos,'#81bcff');
    const rider=point(game.bike.pos,'#70ffc3',8);ctx.font='600 13px system-ui';ctx.fillStyle='#ffffff';ctx.fillText('YOU',rider.x+12,rider.y+4);
    if(ui.waypoint){const dest=point(ui.waypoint,'#ffd27a',7);ctx.setLineDash([7,7]);ctx.strokeStyle='#ffd27a';ctx.beginPath();ctx.moveTo(rider.x,rider.y);ctx.lineTo(dest.x,dest.y);ctx.stroke();ctx.setLineDash([]);$('map-distance').textContent=`Waypoint · ${Math.round(Math.hypot(ui.waypoint.x-game.bike.pos.x,ui.waypoint.z-game.bike.pos.z))} m away`;}
    else $('map-distance').textContent='Click the map to set a waypoint.';
  };
}
