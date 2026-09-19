import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { cleanPose, cleanText, MAX_PLAYERS } from '../src/network-protocol.js';

// The relay owns membership, capacity and room lifecycle. Riding is client-side
// free roam, with no PvP collisions or competitive score authority.
export function attachRooms(server) {
  const wss = new WebSocketServer({ server, path: '/multiplayer', maxPayload: 4096 });
  const rooms = new Map();
  const send = (client, data) => {
    if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 65536) client.send(JSON.stringify(data));
  };
  const roster = room => ({ type: 'room', code: room.code, name: room.name, host: room.host,
    maxPlayers: MAX_PLAYERS, players: [...room.players.values()].map(p => ({ id: p.id, name: p.name })) });
  const broadcast = (room, data) => { for (const player of room.players.values()) send(player, data); };
  function leave(client) {
    const room = rooms.get(client.room);
    client.room = null;
    client.pose = null;
    if (!room) return;
    room.players.delete(client.id);
    if (room.host === client.id) {
      for (const player of room.players.values()) { player.room = null; player.pose = null; }
      broadcast(room, { type: 'closed', message: 'The host closed this server. Host a new one or join another.' });
      rooms.delete(room.code);
    } else broadcast(room, roster(room));
  }
  wss.on('connection', client => {
    client.id = randomUUID(); client.alive = true; client.windowAt = Date.now(); client.messages = 0;
    client.on('pong', () => { client.alive = true; });
    client.on('error', () => {});
    send(client, { type: 'hello', id: client.id });
    client.on('message', raw => {
      if (Date.now() - client.windowAt > 1000) { client.windowAt = Date.now(); client.messages = 0; }
      if (++client.messages > 60) { client.close(1008, 'Too many messages'); return; }
      let msg;
      try { msg = JSON.parse(raw); } catch { send(client, { type: 'error', message: 'Invalid message.' }); return; }
      if (!msg || typeof msg !== 'object') return;
      const fail = message => send(client, { type: 'error', request: msg.request, message });
      const reply = data => send(client, { ...data, request: msg.request });
      if (msg.type === 'list') {
        reply({ type: 'servers', servers: [...rooms.values()].filter(r => r.public).map(r => ({
          code: r.code, name: r.name, players: r.players.size, maxPlayers: MAX_PLAYERS,
        })).slice(0, 100) });
      } else if (msg.type === 'host' || msg.type === 'join') {
        if (client.room) return fail('Leave your current server first.');
        let room;
        if (msg.type === 'host') {
          if (rooms.size >= 100) return fail('The server directory is full. Try again later.');
          let code;
          do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
          room = { code, name: cleanText(msg.roomName, 'Night riders', 32), host: client.id, public: msg.public !== false, players: new Map() };
          rooms.set(code, room);
        } else {
          room = rooms.get(typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '');
          if (!room) return fail('Server not found. Check the code or ask the host to reopen it.');
          if (room.players.size >= MAX_PLAYERS) return fail('This server is full (8 riders).');
        }
        client.name = cleanText(msg.name, 'Rider'); client.room = room.code;
        client.pose = null; room.players.set(client.id, client);
        reply({ ...roster(room), joined: true });
        broadcast(room, roster(room));
      } else if (msg.type === 'leave') {
        leave(client); reply({ type: 'left' });
      } else if (msg.type === 'pose') {
        if (!client.room) return;
        const pose = cleanPose(msg.pose);
        if (pose) client.pose = pose;
      } else fail('Unknown request.');
    });
    client.on('close', () => leave(client));
  });
  const tick = setInterval(() => {
    for (const room of rooms.values()) broadcast(room, { type: 'snapshot', players: [...room.players.values()]
      .filter(p => p.pose).map(p => ({ id: p.id, name: p.name, pose: p.pose })) });
  }, 50);
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!client.alive) { client.terminate(); continue; }
      client.alive = false; client.ping();
    }
  }, 15000);
  wss.on('close', () => { clearInterval(tick); clearInterval(heartbeat); });
  return { wss, rooms };
}
