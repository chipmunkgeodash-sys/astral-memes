import { stylePlayer } from './ride-lab.js';
import { cleanGear } from './network-protocol.js';
import * as THREE from 'three';
import { Bike } from './bikephysics.js';
import { BikeModel } from './bikemodel.js';
import { POSE_LIMITS } from './network-protocol.js';
import { storage } from './core.js';
import { FirebaseRoomSocket } from './firebase-rooms.js';
  var $ = (i) => document.getElementById(i), builtInServer = (typeof HUSH_MULTIPLAYER_URL === "string" ? HUSH_MULTIPLAYER_URL : "") || "firebase", Multiplayer = class {
    constructor(e) {
      this.game = e, this.remotes = /* @__PURE__ */ new Map(), this.pending = /* @__PURE__ */ new Map(), this.sequence = 0, this.room = null, this.id = null, this.elapsed = 0, this.busy = false, $("mp-name").value = storage.get("hushmoto.rider", "Rider");
      let t = storage.get("hushmoto.server", builtInServer);
      (!t || /^wss:\/\/(c7mh9f9g2u|mq5bi2szqu|cw2exkq6jo|hush-moto)\.web\.app\/multiplayer\/?$/.test(t)) && (t = builtInServer), $("mp-endpoint").value = t, $("mp-reset-connection").onclick = () => {
        this.room || this.busy || (this.disconnect(), $("mp-endpoint").value = "firebase", storage.set("hushmoto.server", "firebase"), this.status("Automatic online connection restored. You can host or join now."));
      }, $("mp-host").onclick = () => this.action(() => this.enter("host")), $("mp-join").onclick = () => this.action(() => this.enter("join")), $("mp-refresh").onclick = () => this.action(() => this.refresh()), $("mp-code").oninput = () => {
        $("mp-code").value = $("mp-code").value.toUpperCase().replace(/[^A-F0-9]/g, "");
      }, $("mp-leave").onclick = () => this.action(async () => {
        await this.request("leave"), this.clearRoom(), this.status("You left the server. Solo riding is ready."), await this.refresh();
      }), $("mp-ride").onclick = () => e.setPaused(false), $("mp-copy").onclick = () => this.action(async () => {
        await navigator.clipboard.writeText(this.room.code), this.status("Room code copied. Send it to your friends.");
      }), $("mp-badge").onclick = () => {
        e.setPaused(true), e.ui.showPanel("multiplayer");
      }, $("mp-endpoint").onchange = () => {
        this.room || (this.disconnect(), storage.set("hushmoto.server", $("mp-endpoint").value.trim()));
      }, window.addEventListener("pagehide", () => this.disconnect()), this.renderRoom();
      this.directoryTimer = setInterval(() => {
        if (e.paused && e.ui.activePanel === 'multiplayer' && !this.busy && !(this.socket instanceof FirebaseRoomSocket)) this.openLobby();
      }, 15000);
    }
    status(e) {
      $("mp-status").textContent = e;
    }
    openLobby() { if (!this.busy) this.action(() => this.refresh()); }
    async action(e) {
      if (!this.busy) {
        this.busy = true, this.renderRoom();
        try {
          await e();
        } catch (t) {
          this.status(t.message);
        } finally {
          this.busy = false, this.renderRoom();
        }
      }
    }
    async connect() {
      if (this.socket?.readyState === WebSocket.OPEN && this.id) return;
      this.disconnect();
      let e = $("mp-endpoint").value.trim().toLowerCase() === "firebase", t;
      if (!e) try {
        t = new URL($("mp-endpoint").value.trim());
      } catch {
        throw Error("Use Restore automatic connection below to reconnect.");
      }
      if (!e && (!["ws:", "wss:"].includes(t.protocol) || location.protocol === "https:" && t.protocol !== "wss:")) throw Error("Use a wss:// server address for a secure page (ws:// works for local play).");
      this.status("Connecting to the multiplayer server\u2026"), await new Promise((n, s) => {
        let r = e ? new FirebaseRoomSocket() : new WebSocket(t);
        this.socket = r;
        let o = setTimeout(() => {
          r.close(), s(Error("Connection timed out. Check your internet connection and try again."));
        }, 2e4);
        r.onmessage = (a) => {
          if (this.socket !== r) return;
          let c;
          try {
            c = JSON.parse(a.data);
          } catch {
            return;
          }
          c.type === "hello" && (clearTimeout(o), this.id = c.id, n()), this.receive(c);
        }, r.onerror = (a) => {
          clearTimeout(o), s(Error(a.message || "Cannot reach the multiplayer service. Check your internet connection and try again."));
        }, r.onclose = () => {
          if (clearTimeout(o), s(Error("The connection closed. Try connecting again.")), this.socket !== r) return;
          let a = !!this.room;
          this.socket = null, this.id = null, this.rejectPending(), this.clearRoom(), a && (this.status("Disconnected from the server. Rejoin when the connection is back."), this.game.ui.showHint("Server disconnected \u2014 you are riding solo.", 6e3));
        };
      });
    }
    rejectPending() {
      for (let e of this.pending.values()) clearTimeout(e.timeout), e.reject(Error("Connection lost. Please try again."));
      this.pending.clear();
    }
    disconnect() {
      let e = this.socket;
      this.socket = null, this.id = null, e?.close(), this.rejectPending(), this.clearRoom();
    }
    async request(e, t = {}) {
      return await this.connect(), new Promise((n, s) => {
        let r = ++this.sequence, o = setTimeout(() => {
          this.pending.delete(r), s(Error("The server did not respond. Reconnect and try again.")), this.disconnect();
        }, 8e3);
        this.pending.set(r, { resolve: n, reject: s, timeout: o }), this.socket.send(JSON.stringify({ type: e, ...t, request: r }));
      });
    }
    receive(e) {
      if (e.type === 'servers') this.renderServers(e.servers);
      if (e.type === 'directory-error') $('mp-directory-status').textContent = e.message;
      if (e.type === "room" && (this.room = e, this.renderRoom()), e.type === "closed" && (this.clearRoom(), this.status(e.message), this.game.ui.showHint(e.message, 6e3)), e.type === "snapshot" && this.room) {
        let n = /* @__PURE__ */ new Set();
        for (let s of e.players) {
          if (s.id === this.id) continue;
          n.add(s.id);
          let r = this.remotes.get(s.id);
          r && (r.bikeId !== s.pose.bikeId || r.buildKey !== JSON.stringify(s.pose.build)) && (this.removeRemote(s.id), r = null), r || (r = new RemoteRider(this.game, s), this.remotes.set(s.id, r)), r.target = s.pose;
        }
        for (let s of this.remotes.keys()) n.has(s) || this.removeRemote(s);
      }
      let t = this.pending.get(e.request);
      t && (clearTimeout(t.timeout), this.pending.delete(e.request), e.type === "error" ? t.reject(Error(e.message)) : t.resolve(e));
    }
    async enter(e, t = $("mp-code").value) {
      if (e === "join" && !/^[A-F0-9]{6}$/i.test(t.trim())) throw Error("Enter the six-character room code from your host.");
      let n = $("mp-name").value.trim() || "Rider";
      storage.set("hushmoto.rider", n), await this.request(e, { name: n, code: t, roomName: $("mp-room-name").value, public: !$("mp-private").checked }), this.status("Connected. Share your room code, then ride together."), this.game.startRide();
      let s = this.room.players.findIndex((c) => c.id === this.id), r = this.game.bike, o = [0, 2.8, -2.8][s % 3], a = Math.floor(s / 3) * 5;
      r.reset({ x: r.pos.x + Math.cos(r.yaw) * o - Math.sin(r.yaw) * a, z: r.pos.z - Math.sin(r.yaw) * o - Math.cos(r.yaw) * a, y: r.pos.y, yaw: r.yaw });
    }
    async refresh() {
      $('mp-directory-status').textContent = 'Finding public servers…';
      try { await this.request('list'); if (!this.room) this.status('Online. Join a public server above or host your own ride.'); }
      catch (error) { $('mp-directory-status').textContent = 'Could not load servers. Press Refresh to retry.'; throw error; }
    }
    renderServers(servers) {
      this.servers = servers;
      const list = $('mp-servers'); list.replaceChildren();
      $('mp-directory-status').textContent = `${servers.length} public ${servers.length === 1 ? 'server' : 'servers'} · updates automatically`;
      if (!servers.length) {
        const empty = document.createElement('p'); empty.className = 'mp-empty';
        empty.textContent = 'No public rides yet. Host a public server below and it will appear here for everyone.'; list.append(empty);
      }
      for (const server of [...servers].sort((a,b) => a.name.localeCompare(b.name))) {
        const button = document.createElement('button'); button.className = 'mp-server btn';
        const name = document.createElement('strong'); name.textContent = server.name;
        const detail = document.createElement('span');
        detail.textContent = `${server.players}/${server.maxPlayers} riders · ${server.code} · ${this.room?.code === server.code ? 'YOUR ROOM' : server.players >= server.maxPlayers ? 'FULL' : 'JOIN ↗'}`;
        button.append(name, detail); button.disabled = this.busy || !!this.room || server.players >= server.maxPlayers;
        button.onclick = () => this.action(() => this.enter('join', server.code)); list.append(button);
      }
    }
    renderRoom() {
      if (this.servers) this.renderServers(this.servers);
      let e = this.room;
      $("mp-connected").hidden = !e, $("mp-create").hidden = !!e, $("mp-endpoint").disabled = !!e || this.busy, $("mp-reset-connection").disabled = !!e || this.busy;
      for (let t of ["mp-host", "mp-join", "mp-refresh", "mp-leave", "mp-copy"]) $(t).disabled = this.busy;
      $("mp-badge").textContent = e ? `${e.name} \xB7 ${e.players.length}/8 \xB7 ${e.code}` : "SOLO \xB7 MULTIPLAYER", $("mp-badge").classList.toggle("connected", !!e), e && ($("mp-room-title").textContent = e.name, $("mp-share-code").textContent = e.code, $("mp-leave").textContent = e.host === this.id ? "Close server" : "Leave server", $("mp-roster").replaceChildren(...e.players.map((t) => {
        let n = document.createElement("li");
        return n.textContent = `${t.name}${t.id === this.id ? " (you)" : ""}${t.id === e.host ? " \xB7 HOST" : ""}`, n;
      })));
    }
    clearRoom() {
      this.room = null;
      for (let e of this.remotes.keys()) this.removeRemote(e);
      this.renderRoom();
    }
    removeRemote(e) {
      this.remotes.get(e)?.dispose(), this.remotes.delete(e);
    }
    update(e) {
      if (this.room) {
        if (this.elapsed += e, this.elapsed >= 0.05 && this.socket?.readyState === WebSocket.OPEN) {
          this.elapsed = 0;
          let t = this.game.bike, n = { bikeId: this.game.bikeId, paused: this.game.paused, build: t.cfg.build, gear: cleanGear(this.game.rideLab?.gear), trickIndex: t.trickIndex ?? -1, trickBlend: t.trickBlend || 0 };
          for (let s of Object.keys(POSE_LIMITS)) n[s] = ["x", "y", "z"].includes(s) ? t.pos[s] : t[s] || 0;
          for (let s of ["grounded", "frontDown", "rearDown", "brakeLight"]) n[s] = !!t[s];
          this.socket.bufferedAmount < 65536 && this.socket.send(JSON.stringify({ type: "pose", pose: n }));
        }
        for (let t of this.remotes.values()) t.update(e);
      }
    }
  }, RemoteRider = class {
    constructor(e, t) {
      this.game = e, this.bikeId = t.pose.bikeId, this.target = t.pose, this.buildKey = JSON.stringify(t.pose.build);
      let n = new Bike(e.world, this.bikeId, t.pose.build);
      this.state = { ...n, speed: 0, pos: new THREE.Vector3(t.pose.x, t.pose.y, t.pose.z) }, this.model = new BikeModel(n.cfg), e.scene.add(this.model.root);
      let s = document.createElement("canvas");
      s.width = 512, s.height = 80;
      let r = s.getContext("2d");
      r.fillStyle = "#101820dd", r.fillRect(0, 0, 512, 80), r.fillStyle = "#a6f5ce", r.font = "bold 32px sans-serif", r.textAlign = "center", r.fillText(t.name, 256, 51, 480), this.texture = new THREE.CanvasTexture(s), this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthTest: false })), this.label.scale.set(2.1, 0.33, 1), e.scene.add(this.label), this.first = true;
    }
    update(e) {
      let t = this.state, n = this.target, s = Math.hypot(t.pos.x - n.x, t.pos.y - n.y, t.pos.z - n.z), r = this.first || s > 25 ? 1 : 1 - Math.exp(-18 * e);
      for (let o of ["x", "y", "z"]) t.pos[o] += (n[o] - t.pos[o]) * r;
      for (let o of Object.keys(POSE_LIMITS)) {
        if (["x", "y", "z"].includes(o)) continue;
        let a = t[o] || 0, c = o === "yaw" ? Math.atan2(Math.sin(n[o] - a), Math.cos(n[o] - a)) : n[o] - a;
        t[o] = a + c * r;
      }
      for (let o of ["grounded", "frontDown", "rearDown", "brakeLight"]) t[o] = n[o];
      t.trickIndex = n.trickIndex ?? -1;t.trickBlend = n.trickBlend || 0;
      stylePlayer(this.model,cleanGear(n.gear));
      this.model.update(t, e, 0), this.label.position.copy(t.pos), this.label.position.y += 2.4, this.first = false;
    }
    dispose() {
      this.model.cancelAssetLoad?.(), this.game.scene.remove(this.model.root, this.label);
      let e = /* @__PURE__ */ new Set();
      this.model.root.traverse((t) => {
        t.geometry && e.add(t.geometry);
        for (let n of [].concat(t.material || [])) {
          e.add(n);
          for (let s of Object.values(n)) s?.isTexture && e.add(s);
        }
      });
      for (let t of e) t.dispose();
      this.texture.dispose(), this.label.material.dispose();
    }
  };

export { Multiplayer };
