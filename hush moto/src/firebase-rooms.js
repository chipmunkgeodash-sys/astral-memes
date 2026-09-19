import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, browserSessionPersistence, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, get, set, update, onValue, onDisconnect, runTransaction,
  serverTimestamp, query, orderByChild, limitToLast, goOnline, goOffline } from 'firebase/database';
import { cleanPose, cleanText, MAX_PLAYERS } from './network-protocol.js';

// Separate Auth instance: game guests never replace an Astral login.
export const ROOM_CONFIG = {
  apiKey: 'AIzaSyCdl9OkkuU1NzNEzgVRbjr7TxnELJQmQnQ',
  authDomain: 'astral-memes-zentraa.firebaseapp.com', projectId: 'astral-memes-zentraa',
  appId: '1:58954353118:web:f145d485847c5c5218354f',
  databaseURL: 'https://astral-memes-zentraa-default-rtdb.firebaseio.com',
};
let services, currentSocket;
function firebaseServices() {
  if (!services) {
    const app = getApps().find(a => a.name === 'hush-moto-riders') || initializeApp(ROOM_CONFIG, 'hush-moto-riders');
    const auth = initializeAuth(app, { persistence: browserSessionPersistence });
    services = { auth, db: getDatabase(app) };
  }
  return services;
}

// Match the existing relay protocol so the local WebSocket server still works.
export class FirebaseRoomSocket {
  constructor() {
    this.readyState = 0; this.bufferedAmount = 0; this.unsubscribers = []; this.hooks = [];
    this.code = null; this.slot = null; this.writing = false; this.lastPose = ''; this.lastPoseAt = 0;
    currentSocket = this;
    this.initialize().catch(error => { if (this.readyState !== 3) { this.onerror?.({ message: friendlyError(error) }); this.close(); } });
  }
  emit(data) { if (this.readyState !== 3) this.onmessage?.({ data: JSON.stringify(data) }); }
  async initialize() {
    const { auth, db } = firebaseServices(); this.db = db;
    await auth.authStateReady();
    const user = auth.currentUser || (await signInAnonymously(auth)).user;
    if (this.readyState === 3) return;
    this.id = user.uid; goOnline(db);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { stop(); reject(Error('Connection timed out. Check your internet connection and try again.')); }, 10000);
      const stop = onValue(ref(db, '.info/connected'), snapshot => {
        if (snapshot.val()) { clearTimeout(timeout); stop(); resolve(); }
      }, error => { clearTimeout(timeout); reject(error); });
    });
    if (this.readyState === 3) return;
    this.serverOffset = await new Promise((resolve, reject) => {
      onValue(ref(db, '.info/serverTimeOffset'), snapshot => resolve(snapshot.val() || 0), reject, { onlyOnce: true });
    });
    if (this.readyState === 3) return;
    this.readyState = 1; this.emit({ type: 'hello', id: this.id });
    this.stopDirectory = onValue(this.directoryQuery(), snapshot => this.emit(this.directoryResult(snapshot)),
      error => this.emit({ type: 'directory-error', message: friendlyError(error) }));
    this.stopConnection = onValue(ref(db, '.info/connected'), snapshot => {
      if (!snapshot.val() && this.readyState === 1) this.close();
    });
  }
  send(raw) {
    const msg = JSON.parse(raw);
    if (msg.type === 'pose') { this.publishPose(msg.pose); return; }
    this.handle(msg).then(result => this.emit({ ...result, request: msg.request }))
      .catch(async error => {
        if (['host', 'join'].includes(msg.type) && this.code) await this.leave();
        this.emit({ type: 'error', request: msg.request, message: friendlyError(error) });
      });
  }
  async handle(msg) {
    if (msg.type === 'list') {
      return this.directoryResult(await get(this.directoryQuery()));
    }
    if (msg.type === 'leave') { await this.leave(); return { type: 'left' }; }
    if (msg.type !== 'host' && msg.type !== 'join') throw Error('Unknown request.');
    if (this.code) throw Error('Leave your current server first.');
    const name = cleanText(msg.name, 'Rider');
    if (msg.type === 'host') {
      // Random six-digit code with atomic reservation: collisions never replace a room.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = [...crypto.getRandomValues(new Uint8Array(3))].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
        const roomRef = ref(this.db, `hushMoto/rooms/${code}`);
        const hook = onDisconnect(roomRef); await hook.remove();
        const meta = { host: this.id, name: cleanText(msg.roomName, 'Night riders', 32), public: msg.public !== false, createdAt: serverTimestamp() };
        const result = await runTransaction(roomRef, current => current ? undefined : { meta, players: { 0: { id: this.id, name } } }, { applyLocally: false });
        if (!result.committed) { await hook.cancel(); continue; }
        this.hooks.push(hook); this.code = code; this.slot = '0'; this.meta = result.snapshot.val().meta;
        if (meta.public) {
          const directory = ref(this.db, `hushMoto/servers/${code}`);
          const directoryHook = onDisconnect(directory); await directoryHook.remove(); this.hooks.push(directoryHook);
          await this.updateDirectory(1);
          this.heartbeat = setInterval(() => this.updateDirectory(this.playerCount || 1).catch(() => {}), 30000);
        }
        break;
      }
      if (!this.code) throw Error('Could not reserve a room. Please try again.');
    } else {
      const code = String(msg.code || '').trim().toUpperCase();
      if (!/^[A-F0-9]{6}$/.test(code)) throw Error('Enter the six-character room code from your host.');
      const room = (await get(ref(this.db, `hushMoto/rooms/${code}/meta`))).val();
      if (!room) throw Error('Server not found. Check the code or ask the host to reopen it.');
      for (let i = 1; i < MAX_PLAYERS; i++) {
        const memberRef = ref(this.db, `hushMoto/rooms/${code}/players/${i}`);
        const result = await runTransaction(memberRef, current => current ? undefined : { id: this.id, name }, { applyLocally: false });
        if (!result.committed) continue;
        this.code = code; this.slot = String(i); this.meta = room;
        const hook = onDisconnect(memberRef); await hook.remove(); this.hooks.push(hook);
        break;
      }
      if (!this.code) throw Error('This server is full (8 riders).');
    }
    if (this.readyState === 3) { await this.leave(); throw Error('Connection closed. Try again.'); }
    const poseHook = onDisconnect(ref(this.db, `hushMoto/rooms/${this.code}/poses/${this.slot}`));
    await poseHook.remove(); this.hooks.push(poseHook);
    const room = (await get(ref(this.db, `hushMoto/rooms/${this.code}`))).val();
    if (!room?.meta) { await this.leave(); throw Error('The host closed this server.'); }
    this.watchRoom();
    return { ...this.roster(room.players), joined: true };
  }
  roster(players = {}) {
    this.players = players;
    return { type: 'room', code: this.code, name: this.meta.name, host: this.meta.host,
      maxPlayers: MAX_PLAYERS, players: Object.entries(players).map(([slot, player]) => ({ ...player, slot })) };
  }
  directoryQuery() {
    return query(ref(this.db, 'hushMoto/servers'), orderByChild('updatedAt'), limitToLast(100));
  }
  directoryResult(snapshot) {
    return { type: 'servers', servers: Object.entries(snapshot.val() || {})
      .filter(([, room]) => room.updatedAt > Date.now() + this.serverOffset - 300000)
      .map(([code, room]) => ({ code, name: room.name, players: room.players, maxPlayers: MAX_PLAYERS })) };
  }
  watchRoom() {
    const base = `hushMoto/rooms/${this.code}`;
    const fail = error => { this.emit({ type: 'closed', message: friendlyError(error) }); this.close(); };
    this.unsubscribers.push(onValue(ref(this.db, `${base}/meta`), snapshot => {
      if (!snapshot.exists()) {
        this.emit({ type: 'closed', message: 'The host closed this server. Host a new one or join another.' });
        this.leave().catch(() => {});
      }
    }, fail));
    this.unsubscribers.push(onValue(ref(this.db, `${base}/players`), snapshot => {
      if (!this.code) return;
      const players = snapshot.val() || {};
      this.emit(this.roster(players)); this.playerCount = Object.keys(players).length;
      if (this.meta.host === this.id && this.meta.public) this.updateDirectory(this.playerCount).catch(() => {});
      this.emitSnapshot();
    }, fail));
    this.unsubscribers.push(onValue(ref(this.db, `${base}/poses`), snapshot => {
      if (!this.code) return;
      this.poses = snapshot.val() || {}; this.emitSnapshot();
    }, fail));
  }
  emitSnapshot() {
    this.emit({ type: 'snapshot', players: Object.entries(this.players || {}).flatMap(([slot, player]) => {
      const pose = cleanPose(this.poses?.[slot]); return pose ? [{ id: player.id, name: player.name, pose }] : [];
    }) });
  }
  async updateDirectory(players) {
    if (!this.code || !this.meta?.public || this.meta.host !== this.id) return;
    await set(ref(this.db, `hushMoto/servers/${this.code}`), {
      host: this.id, name: this.meta.name, players, updatedAt: serverTimestamp(),
    });
  }
  publishPose(value) {
    const pose = cleanPose(value);
    if (!this.code || !pose || this.readyState !== 1 || this.writing || Date.now() - this.lastPoseAt < 100) return;
    for (const key of Object.keys(pose)) if (typeof pose[key] === 'number') pose[key] = Math.round(pose[key] * 1000) / 1000;
    const serialized = JSON.stringify(pose);
    if (serialized === this.lastPose) return;
    this.lastPose = serialized; this.lastPoseAt = Date.now(); this.writing = true;
    set(ref(this.db, `hushMoto/rooms/${this.code}/poses/${this.slot}`), pose).catch(error => {
      this.emit({ type: 'closed', message: friendlyError(error) }); this.close();
    }).finally(() => { this.writing = false; });
  }
  async leave() {
    for (const stop of this.unsubscribers.splice(0)) stop(); clearInterval(this.heartbeat);
    const code = this.code, slot = this.slot, meta = this.meta;
    this.code = null; this.slot = null; this.poses = {}; this.players = {}; this.lastPose = '';
    const hooks = this.hooks.splice(0);
    if (code) {
      try {
        if (meta.host === this.id) await update(ref(this.db), { [`hushMoto/rooms/${code}`]: null, [`hushMoto/servers/${code}`]: null });
        else await update(ref(this.db, `hushMoto/rooms/${code}`), { [`players/${slot}`]: null, [`poses/${slot}`]: null });
        await Promise.all(hooks.map(hook => hook.cancel()));
      } catch { /* onDisconnect remains registered if explicit cleanup fails. */ }
    }
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3; this.stopConnection?.(); this.stopDirectory?.();
    this.leave().finally(() => { if (currentSocket === this && this.db) goOffline(this.db); });
    // Closing the connection also makes server-side presence cleanup immediate.
    if (currentSocket === this && this.db) goOffline(this.db);
    this.onclose?.();
  }
}

function friendlyError(error) {
  const code = String(error?.code || '');
  if (code.includes('permission') || code.includes('PERMISSION')) return 'This room is no longer available. Refresh the server list and try again.';
  if (code.includes('network')) return 'Connection lost. Check your internet connection and try again.';
  if (code.includes('too-many')) return 'Too many connection attempts. Wait a moment and try again.';
  return error?.message || 'Could not connect. Please try again.';
}
