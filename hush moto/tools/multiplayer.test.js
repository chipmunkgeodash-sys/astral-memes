import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { attachRooms } from '../server/rooms.mjs';
import { POSE_LIMITS, cleanPose } from '../src/network-protocol.js';
import { cleanBuild } from '../src/customization.js';

test('malformed multiplayer builds fall back safely without throwing', () => {
  for (const value of [null, false, 'bad', 12, {paint:'__proto__',battery:999,controller:{}}]) {
    assert.deepEqual(cleanBuild(value), {paint:'stock',battery:'stock',controller:'stock'});
  }
});

async function setup(t) {
  const server = http.createServer();
  const { wss, rooms } = attachRooms(server);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    for (const socket of wss.clients) socket.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  });
  return { rooms, async client() {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/multiplayer`);
    const queued = [], waiting = [];
    ws.on('message', raw => {
      const msg = JSON.parse(raw);
      const index = waiting.findIndex(w => w.predicate(msg));
      if (index >= 0) waiting.splice(index, 1)[0].resolve(msg); else queued.push(msg);
    });
    const next = predicate => new Promise((resolve, reject) => {
      const index = queued.findIndex(predicate);
      if (index >= 0) return resolve(queued.splice(index, 1)[0]);
      const timer = setTimeout(() => reject(Error('Timed out waiting for server message')), 2000);
      waiting.push({ predicate, resolve: msg => { clearTimeout(timer); resolve(msg); } });
    });
    let sequence = 0;
    const hello = await next(m => m.type === 'hello');
    return { ws, id: hello.id, next, send: data => ws.send(JSON.stringify(data)),
      request(type, data = {}) {
        const request = ++sequence;
        ws.send(JSON.stringify({ type, ...data, request }));
        return next(m => m.request === request);
      } };
  } };
}
const pose = overrides => ({ ...Object.fromEntries(Object.keys(POSE_LIMITS).map(k => [k, 0])),
  bikeId: 'r1', grounded: true, frontDown: true, rearDown: true, ...overrides });

test('host and join exchange rider poses; other rooms stay isolated', async t => {
  const env = await setup(t), host = await env.client(), joiner = await env.client(), outsider = await env.client();
  const room = await host.request('host', { name: 'Host', roomName: 'City crew' });
  assert.match(room.code, /^[A-F0-9]{6}$/);
  const list = await joiner.request('list'); assert.equal(list.servers[0].name, 'City crew');
  const joined = await joiner.request('join', { code: room.code.toLowerCase(), name: 'Guest' });
  assert.equal(joined.players.length, 2); assert.equal(joined.host, host.id);
  await outsider.request('host', { name: 'Elsewhere', public: false });
  host.send({ type: 'pose', pose: pose({ x: 12, z: 50, pitch: .7 }) });
  const snapshot = await joiner.next(m => m.type === 'snapshot' && m.players.length > 0);
  assert.equal(snapshot.players[0].id, host.id); assert.equal(snapshot.players[0].pose.pitch, .7);
  const other = await outsider.next(m => m.type === 'snapshot'); assert.deepEqual(other.players, []);
  host.send({ type: 'pose', pose: pose({ x: 1e20 }) });
  assert.equal(cleanPose(pose({ x: 1e20 })), null);
  const after = await joiner.next(m => m.type === 'snapshot' && m.players.length > 0);
  assert.equal(after.players[0].pose.x, 12);
});

test('unlisted rooms join by code, leave frees a slot and host close clears the room', async t => {
  const env = await setup(t), host = await env.client(), guest = await env.client();
  const room = await host.request('host', { public: false });
  assert.deepEqual((await guest.request('list')).servers, []);
  assert.equal((await guest.request('join', { code: '000000' })).type, 'error');
  await guest.request('join', { code: room.code });
  assert.equal((await guest.request('host')).type, 'error');
  await guest.request('leave'); assert.equal(env.rooms.get(room.code).players.size, 1);
  await guest.request('join', { code: room.code });
  await host.request('leave');
  assert.equal((await guest.next(m => m.type === 'closed')).type, 'closed');
  assert.equal(env.rooms.size, 0);
  assert.equal((await guest.request('host')).joined, true);
});

test('capacity is enforced atomically, disconnect cleanup allows a replacement rider', async t => {
  const env = await setup(t), host = await env.client();
  const room = await host.request('host');
  const guests = await Promise.all(Array.from({ length: 8 }, () => env.client()));
  const results = await Promise.all(guests.map(g => g.request('join', { code: room.code })));
  assert.equal(results.filter(r => r.type === 'room').length, 7);
  assert.equal(results.filter(r => r.type === 'error').length, 1);
  const occupied = guests[results.findIndex(r => r.type === 'room')];
  occupied.ws.close();
  await host.next(m => m.type === 'room' && m.players.length === 7 && m.players.every(p => p.id !== occupied.id));
  const rejected = guests[results.findIndex(r => r.type === 'error')];
  assert.equal((await rejected.request('join', { code: room.code })).players.length, 8);
  host.ws.close();
  await rejected.next(m => m.type === 'closed'); assert.equal(env.rooms.size, 0);
});

test('malformed input is rejected without taking down the server', async t => {
  const env = await setup(t), client = await env.client();
  client.ws.send('not json'); assert.equal((await client.next(m => m.type === 'error')).message, 'Invalid message.');
  client.send(null);
  assert.equal((await client.request('unknown')).type, 'error');
  assert.equal(cleanPose(pose({ yaw: NaN })), null);
  assert.equal(cleanPose(pose({ bikeId: '<script>' })), null);
  assert.equal(cleanPose({ bikeId: 'r1' }), null);
  assert.equal((await client.request('host', { name: 'X'.repeat(100), roomName: 'Y'.repeat(100) })).name.length, 32);
});
