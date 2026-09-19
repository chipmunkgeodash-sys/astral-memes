// Simulation helpers shared by the Ride Lab and its headless tests.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const TRICKS = ['One hand', 'No hands', 'One footer', 'Nac nac', 'Superman'];
export function canTrick(bike, index) {
  return !bike.crashed && bike.speed > 3 && (index < 3 || !bike.grounded);
}
export function chargingAllowed(bike, station, busted = false) {
  return !!station && station.kind!=='gas' && bike.cfg.kind === 'electric' && !bike.crashed && !busted && bike.speed < .7 &&
    Math.hypot(bike.pos.x-station.x, bike.pos.z-station.z) < 3 && Math.abs(bike.pos.y-station.y) < 2;
}
export function charge(bike, seconds, target = 1) {
  // Deliberately accelerated sandbox charging: 60 seconds for a 2 kWh pack.
  const previous = bike.battery;
  bike.battery = Math.min(Math.max(previous, target), previous + seconds * 2000 / (60 * bike.cfg.batteryWh));
  return (bike.battery-previous)*bike.cfg.batteryWh;
}
export function driveControls(input, bike, prefs, cruise, permitted = true) {
  const c = { ...input };
  if (!permitted || bike.crashed || c.brake > .05 || c.rearBrake > .05 || c.reverse) cruise = 0;
  if (!permitted || bike.crashed) return { controls: c, cruise: 0 };
  if (cruise) c.throttle = Math.max(c.throttle, clamp((cruise-bike.kmh)*.18, 0, 1));
  const mode = { eco: .48, street: .78, sport: 1 }[prefs.mode] ?? 1;
  c.throttle *= mode;
  if (prefs.mode !== 'sport') c.boost = 0;
  const limit = Number(prefs.limit) || 0;
  if (limit) c.throttle *= clamp((limit-bike.kmh)/4, 0, 1);
  const regen = Number(prefs.regen) || 0;
  if (regen && bike.cfg.kind === 'electric' && bike.grounded && c.throttle < .02 && bike.speed > 2 && !c.reverse)
    c.brake = Math.max(c.brake, regen*.1);
  return { controls: c, cruise };
}
export function recoverEnergy(bike, previousSpeed, controls, seconds, regen) {
  if (!regen || bike.cfg.kind !== 'electric' || !bike.grounded || bike.crashed || controls.throttle > .02 || controls.brake < .01) return 0;
  const energy = Math.min(Math.max(0, .5*bike.m*(previousSpeed**2-bike.speed**2)), 2500*seconds)*.55/3600;
  bike.battery = Math.min(1, bike.battery + energy/bike.cfg.batteryWh);
  return energy;
}
export class Trip {
  constructor() { this.reset(); }
  reset() { this.seconds=0;this.distance=0;this.max=0;this.last=null;this.version=null; }
  update(bike, dt) {
    let distance=0;
    if (this.last && this.version===bike.resetVersion) {
      const d=Math.hypot(bike.pos.x-this.last.x,bike.pos.z-this.last.z);
      if (d < Math.max(2, bike.speed*dt*2+1)) distance=d;
    }
    this.last={x:bike.pos.x,z:bike.pos.z};this.version=bike.resetVersion;
    this.seconds+=dt;this.distance+=distance;this.max=Math.max(this.max,bike.kmh);
    return distance;
  }
}
export class Trial {
  constructor(kind, bike) { this.kind=kind;this.time=0;this.distance=0;this.started=false;this.done=false;this.result='';this.version=bike.resetVersion;this.prev=bike.kmh; }
  update(bike, dt, distance) {
    if(this.done)return;
    if(bike.crashed || bike.resetVersion!==this.version) {this.done=true;this.result='Cancelled: crash or reset';return;}
    if(!this.started) {
      if(this.kind==='braking' ? this.prev>=50 && bike.kmh<50 : bike.kmh>1) this.started=true;
    }
    this.prev=bike.kmh;
    if(!this.started)return;
    this.time+=dt;this.distance+=distance;
    const finished=this.kind==='acceleration'?bike.kmh>=50:this.kind==='braking'?bike.kmh<1:this.distance>=1000;
    if(finished){this.done=true;this.result=this.kind==='braking'?`${this.distance.toFixed(1)} m`:`${this.time.toFixed(2)} s`;}
  }
}

export function refuelingAllowed(bike,station,busted=false){
 return !!station&&station.kind==='gas'&&bike.cfg.kind==='gas'&&!bike.crashed&&!busted&&bike.speed<.7&&Math.hypot(bike.pos.x-station.x,bike.pos.z-station.z)<3&&Math.abs(bike.pos.y-station.y)<2;
}
export function refuel(bike,seconds){const before=bike.fuel;bike.fuel=Math.min(1,before+Math.max(0,seconds)*.6/bike.cfg.tankLiters);return(bike.fuel-before)*bike.cfg.tankLiters;}
