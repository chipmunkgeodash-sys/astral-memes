// Explicit integration test against the configured game database. Creates only
// temporary anonymous test users/rooms and removes them in finally.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ROOM_CONFIG } from '../src/firebase-rooms.js';
import { POSE_LIMITS } from '../src/network-protocol.js';

const users = [], codes = [];
async function account(method, body) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${ROOM_CONFIG.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(`Test auth ${method}: ${data.error?.message}`);
  return data;
}
async function request(user, path, method = 'GET', body, params = {}) {
  const url = new URL(`${ROOM_CONFIG.databaseURL}/hushMoto/${path}.json`);
  if (user) url.searchParams.set('auth', user.idToken);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
try {
  for (let i = 0; i < 2; i++) users.push(await account('signUp', { returnSecureToken: true }));
  const [host, guest] = users;
  const code = randomBytes(3).toString('hex').toUpperCase(); codes.push(code);
  const room = { meta: { host: host.localId, name: 'Automated QA', public: true, createdAt: { '.sv': 'timestamp' } },
    players: { 0: { id: host.localId, name: 'QA host' } } };
  assert.equal((await request(host, `rooms/${code}`, 'PUT', room)).status, 200, 'host creates room');
  assert.equal((await request(guest, `rooms/${code}/players/1`, 'PUT', { id: guest.localId, name: 'QA guest' })).status, 200, 'guest joins');
  assert.equal((await request(guest, `rooms/${code}/meta/host`, 'PUT', guest.localId)).status, 401, 'guest cannot take host role');
  assert.equal((await request(guest, `rooms/${code}/players/0/name`, 'PUT', 'spoof')).status, 401, 'guest cannot alter host');
  assert.equal((await request(guest, `rooms/${code}/players/8`, 'PUT', { id: guest.localId, name: 'ninth' })).status, 401, 'ninth slot rejected');
  const pose = { ...Object.fromEntries(Object.keys(POSE_LIMITS).map(key => [key, 0])), bikeId: 'lbx',
    grounded: true, frontDown: true, rearDown: true, brakeLight: false, paused: false };
  assert.equal((await request(guest, `rooms/${code}/poses/1`, 'PUT', pose)).status, 200, 'rider publishes pose');
  assert.equal((await request(host, `rooms/${code}/poses/1`)).data.bikeId, 'lbx', 'host receives guest pose');
  assert.equal((await request(guest, `rooms/${code}/poses/1`, 'PUT', { ...pose, bikeId:'lbx', build:{paint:'mint',battery:'chi',controller:'ebmx'} })).status, 200, 'custom LBX pose accepted');
  assert.equal((await request(guest, `rooms/${code}/poses/1`, 'PUT', { ...pose, build:{paint:'invalid',battery:'chi',controller:'ebmx'} })).status, 401, 'invalid customization rejected');
  const gear={helmetM:'#ffffff',gearA:'#112233',gearB:'#424a57',gloveM:'#111111',bootM:'#222222',visorM:'#333333',number:'42',backpack:true};
  assert.equal((await request(guest, `rooms/${code}/poses/1`, 'PUT', {...pose,gear,trickIndex:4,trickBlend:.6})).status,200,'outfit and trick pose accepted');
  assert.equal((await request(host, `rooms/${code}/poses/1`)).data.gear.number,'42','host sees outfit');
  assert.equal((await request(guest, `rooms/${code}/poses/1`, 'PUT', {...pose,gear:{...gear,gearA:'bad'}})).status,401,'invalid gear rejected');
  assert.equal((await request(guest, `rooms/${code}/poses/1`, 'PUT', {...pose,trickIndex:4.2})).status,401,'fractional trick index rejected');
  assert.equal((await request(guest, `rooms/${code}/poses/1`, 'PUT', {...pose,bikeId:'eride'})).status,401,'removed bike rejected');
  assert.equal((await request(guest, `rooms/${code}/poses/0`, 'PUT', pose)).status, 401, 'rider cannot spoof host pose');
  assert.equal((await request(guest, `rooms/${code}/poses/1`, 'PUT', { ...pose, x: 1e20 })).status, 401, 'invalid pose rejected');
  assert.equal((await request(null, `rooms/${code}`)).status, 401, 'unauthenticated room access rejected');
  assert.equal((await request(guest, 'rooms')).status, 401, 'private room enumeration rejected');
  assert.equal((await request(host, `servers/${code}`, 'PUT', { host: host.localId, name: 'Automated QA', players: 2, updatedAt: { '.sv': 'timestamp' } })).status, 200, 'host lists room');
  const directory = await request(guest, 'servers', 'GET', undefined, { orderBy: '"updatedAt"', limitToLast: '100' });
  assert.equal(directory.status, 200); assert.equal(directory.data[code].players, 2, 'guest discovers room');
  assert.equal((await request(guest, 'servers', 'GET', undefined, { orderBy: '"updatedAt"' })).status, 401, 'unbounded directory reads rejected');
  assert.equal((await request(guest, `rooms/${code}`, 'DELETE')).status, 401, 'guest cannot close host room');
  assert.equal((await request(guest, `rooms/${code}/poses/1`, 'DELETE')).status, 200);
  assert.equal((await request(guest, `rooms/${code}/players/1`, 'DELETE')).status, 200, 'guest leaves');
  console.log('PASS: live Firebase host/join, directory, pose exchange, ownership, capacity, validation and leave.');
} finally {
  for (const code of codes) {
    await request(users[0], `servers/${code}`, 'DELETE');
    await request(users[0], `rooms/${code}`, 'DELETE');
  }
  for (const user of users) await account('delete', { idToken: user.idToken });
}
