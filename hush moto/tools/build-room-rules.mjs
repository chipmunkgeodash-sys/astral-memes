import fs from 'node:fs/promises';
import { POSE_LIMITS, BIKE_IDS } from '../src/network-protocol.js';

const owner = "root.child('hushMoto/rooms').child($code).child('meta/host').val() === auth.uid";
const member = "root.child('hushMoto/rooms').child($code).child('players').child($slot).child('id').val() === auth.uid";
const bools = ['grounded', 'frontDown', 'rearDown', 'brakeLight', 'paused'];
const requiredPose = ['bikeId', ...Object.keys(POSE_LIMITS), ...bools];
const pose = {
  '.write': `auth != null && (${member} || (!data.exists() && !newData.exists()))`,
  '.validate': `$slot.matches(/^[0-7]$/) && newData.hasChildren(${JSON.stringify(requiredPose)})`,
  build: {
    '.validate': "newData.hasChildren(['paint','battery','controller'])",
    paint: { '.validate': "newData.isString() && newData.val().matches(/^(stock|mint|ice|ember|violet|white)$/)" },
    battery: { '.validate': "newData.isString() && newData.val().matches(/^(stock|chi)$/)" },
    controller: { '.validate': "newData.isString() && newData.val().matches(/^(stock|ebmx)$/)" },
    '$other': { '.validate': false },
  },
  gear: {
    '.validate': "newData.hasChildren(['helmetM','gearA','gearB','gloveM','bootM','visorM','number','backpack'])",
    ...Object.fromEntries(['helmetM','gearA','gearB','gloveM','bootM','visorM'].map(key=>[key,{'.validate':"newData.isString() && newData.val().matches(/^#[0-9a-fA-F]{6}$/)"}])),
    number: {'.validate':"newData.isString() && newData.val().matches(/^[0-9]{1,2}$/)"},
    backpack: {'.validate':'newData.isBoolean()'},
    '$other': {'.validate':false},
  },
  trickIndex:{'.validate':'newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= -1 && newData.val() <= 4'},
  trickBlend:{'.validate':'newData.isNumber() && newData.val() >= 0 && newData.val() <= 1'},
  bikeId: { '.validate': `newData.isString() && (${BIKE_IDS.map(id => `newData.val() === '${id}'`).join(' || ')})` },
  ...Object.fromEntries(Object.entries(POSE_LIMITS).map(([key, limit]) => [key, { '.validate': `newData.isNumber() && newData.val() >= -${limit} && newData.val() <= ${limit}` }])),
  ...Object.fromEntries(bools.map(key => [key, { '.validate': 'newData.isBoolean()' }])),
  '$other': { '.validate': false },
};
const rules = { rules: {
  '.read': false, '.write': false,
  hushMoto: {
    rooms: { '$code': {
      '.read': 'auth != null',
      '.write': "auth != null && ((!data.exists() && (!newData.exists() || newData.child('meta/host').val() === auth.uid)) || (data.child('meta/host').val() === auth.uid && !newData.exists()))",
      '.validate': "$code.matches(/^[A-F0-9]{6}$/) && newData.hasChildren(['meta', 'players'])",
      meta: {
        '.write': `auth != null && ${owner}`,
        '.validate': "newData.hasChildren(['host','name','public','createdAt'])",
        host: { '.validate': 'newData.isString() && newData.val() === auth.uid && (!data.exists() || newData.val() === data.val())' },
        name: { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 32' },
        public: { '.validate': 'newData.isBoolean()' },
        createdAt: { '.validate': 'newData.isNumber() && newData.val() <= now + 1000' },
        '$other': { '.validate': false },
      },
      players: { '$slot': {
        '.write': "auth != null && root.child('hushMoto/rooms').child($code).child('meta').exists() && ((!data.exists() && (!newData.exists() || newData.child('id').val() === auth.uid)) || data.child('id').val() === auth.uid)",
        '.validate': "$slot.matches(/^[0-7]$/) && newData.hasChildren(['id','name'])",
        id: { '.validate': 'newData.isString() && newData.val() === auth.uid && (!data.exists() || newData.val() === data.val())' },
        name: { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 24' },
        '$other': { '.validate': false },
      } },
      poses: { '$slot': pose },
      '$other': { '.validate': false },
    } },
    servers: {
      '.read': "auth != null && query.orderByChild === 'updatedAt' && query.limitToLast != null && query.limitToLast <= 100",
      '.indexOn': ['updatedAt'],
      '$code': {
        '.read': 'auth != null',
        '.write': `auth != null && ((!data.exists() && (!newData.exists() || (${owner} && newData.child('host').val() === auth.uid))) || data.child('host').val() === auth.uid)`,
        '.validate': "$code.matches(/^[A-F0-9]{6}$/) && newData.hasChildren(['host','name','players','updatedAt']) && root.child('hushMoto/rooms').child($code).child('meta/public').val() === true",
        host: { '.validate': `newData.isString() && newData.val() === auth.uid && ${owner}` },
        name: { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 32' },
        players: { '.validate': 'newData.isNumber() && newData.val() >= 1 && newData.val() <= 8' },
        updatedAt: { '.validate': 'newData.isNumber() && newData.val() <= now + 1000 && newData.val() >= now - 10000' },
        '$other': { '.validate': false },
      },
    },
  },
} };
await fs.writeFile(new URL('../../database.rules.json', import.meta.url), JSON.stringify(rules, null, 2) + '\n');
console.log('Generated narrowly scoped Hush Moto room rules.');
