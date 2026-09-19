import { cleanBuild } from './customization.js';
export const MAX_PLAYERS = 8;
export const BIKE_IDS = ['lbx', 'ultrabee', 'starkvarg', 'crf450r', 'superduke', 'r1', 'bobber'];
export const POSE_LIMITS = {
  x: 2000, y: 1000, z: 2000, yaw: 1e8, pitch: 7, roll: 7, steer: 2,
  suspF: 2, suspR: 2, wheelAngleF: 1e9, wheelAngleR: 1e9,
  speed: 200, groundPitch: 7, yawRate: 20, throttle: 1,
};
export function cleanText(value, fallback, max = 24) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || fallback : fallback;
}
export function cleanPose(value) {
  if (!value || !BIKE_IDS.includes(value.bikeId)) return null;
  const pose = { bikeId: value.bikeId, build: cleanBuild(value.build) };
  for (const [key, limit] of Object.entries(POSE_LIMITS)) {
    if (!Number.isFinite(value[key]) || Math.abs(value[key]) > limit) return null;
    pose[key] = value[key];
  }
  for (const key of ['grounded', 'frontDown', 'rearDown', 'brakeLight', 'paused']) pose[key] = value[key] === true;
  if(value.gear) pose.gear=cleanGear(value.gear);
  if(Number.isInteger(value.trickIndex)&&value.trickIndex>=-1&&value.trickIndex<=4)pose.trickIndex=value.trickIndex;
  if(Number.isFinite(value.trickBlend))pose.trickBlend=Math.max(0,Math.min(1,value.trickBlend));
  return pose;
}

export const GEAR_DEFAULTS={helmetM:'#eef1f5',gearA:'#4ef0b3',gearB:'#424a57',gloveM:'#3a3f48',bootM:'#2a2d34',visorM:'#10141c',number:'01',backpack:false};
export function cleanGear(input={}) {
 const gear={...GEAR_DEFAULTS};
 for(const k of ['helmetM','gearA','gearB','gloveM','bootM','visorM'])if(typeof input[k]==='string'&&/^#[0-9a-f]{6}$/i.test(input[k]))gear[k]=input[k];
 if(typeof input.number==='string'&&/^\d{1,2}$/.test(input.number))gear.number=input.number;
 gear.backpack=input.backpack===true;return gear;
}
