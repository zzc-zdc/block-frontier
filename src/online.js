import { B, BLOCKS } from './blocks.js';
import { HEIGHT, World } from './world.js';

const CHARACTERS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const ROOM_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;
const PLAYER_ID = /^[A-Za-z0-9_-]{1,80}$/;
const PREFIX = 'block-frontier-v1-';
const PROTOCOL = 'block-frontier/1';
const MAX_PLAYERS = 8;
const MAX_EDITS = 200_000;
const MAX_COORDINATE = 2_000_000;
const SNAPSHOT_BATCH = 240;
const CONNECT_TIMEOUT = 18_000;
const JOIN_TIMEOUT = 32_000;

function roomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, value => CHARACTERS[value % CHARACTERS.length]).join('');
}

function playerName(name) {
  const text = typeof name === 'string' ? name.replace(/\p{C}/gu, '').trim() : '';
  return Array.from(text).slice(0, 16).join('') || '冒险家';
}

function settings(config) {
  const { seed, mode, time } = config ?? {};
  if (!(typeof seed === 'string' && seed.length <= 128) && !Number.isFinite(seed)) return null;
  if (mode !== 'creative' && mode !== 'survival') return null;
  if (!validTime(time)) return null;
  return { seed, mode, time };
}

function validTime(time) {
  return Number.isFinite(time) && time >= 0 && time <= 10 ** 10;
}

function blockEdit(value) {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isInteger)) return null;
  const [x, y, z, id] = value;
  if (Math.abs(x) > MAX_COORDINATE || Math.abs(z) > MAX_COORDINATE || y <= 0 || y >= HEIGHT) return null;
  if (id !== B.AIR && id !== B.WATER && !BLOCKS[id]?.placeable) return null;
  return value;
}

const editKey = ([x, y, z]) => `${x},${y},${z}`;

function readPose(value) {
  if (!value || typeof value !== 'object') return null;
  const { x, y, z, yaw } = value;
  if (![x, y, z, yaw].every(Number.isFinite)) return null;
  if (Math.abs(x) > MAX_COORDINATE || Math.abs(z) > MAX_COORDINATE || y < -32 || y > HEIGHT + 2_000) return null;
  return { x, y, z, yaw: yaw % (Math.PI * 2) };
}

function peerOptions() {
  const env = import.meta.env ?? {};
  const options = { debug: 0 };
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
  if (env.VITE_PEER_HOST) options.host = env.VITE_PEER_HOST;
  if (env.VITE_PEER_PORT) options.port = Number(env.VITE_PEER_PORT);
  if (env.VITE_PEER_PATH) options.path = env.VITE_PEER_PATH;
  if (env.VITE_TURN_URL) {
    iceServers.push({
      urls: env.VITE_TURN_URL.split(',').map(url => url.trim()).filter(Boolean),
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    });
  }
  options.config = { iceServers, sdpSemantics: 'unified-plan' };
  return options;
}

function peerError(error) {
  if (error?.type === 'peer-unavailable') return '找不到该房间，请确认房主在线且房间码正确。';
  if (error?.type === 'browser-incompatible') return '此浏览器无法建立联机连接，请使用支持 WebRTC 的浏览器。';
  return '暂时无法连接联机服务，请检查网络后重试。';
}

function send(connection, message, disposable = false) {
  if (!connection?.open) return false;
  if (disposable && (connection.bufferSize > 0 || connection.dataChannel?.bufferedAmount > 80_000)) return false;
  try {
    connection.send(message);
    return true;
  } catch {
    return false;
  }
}

function connectPeer(Peer, id, signal) {
  const peer = new Peer(id, peerOptions());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      peer.off('open', open);
      peer.off('error', finish);
      if (error) {
        peer.destroy();
        reject(error);
      } else resolve(peer);
    };
    const open = () => finish(null);
    const abort = () => finish(new Error('已取消联机连接。'));
    const timer = setTimeout(() => finish(new Error('联机服务连接超时，请检查网络后重试。')), CONNECT_TIMEOUT);
    peer.on('open', open);
    peer.on('error', finish);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

async function loadPeer() {
  if (typeof globalThis.RTCPeerConnection !== 'function') throw new Error('此浏览器无法建立联机连接，请使用支持 WebRTC 的浏览器。');
  const { Peer } = await import('peerjs');
  return Peer;
}

export class Room extends EventTarget {
  constructor() {
    super();
    this.code = '';
    this.name = '';
    this.isHost = false;
    this.players = new Map();
    this.members = new Map();
    this.edits = new Map();
    this.peer = null;
    this.host = null;
    this.controller = null;
    this.state = null;
    this.ownPose = null;
    this.lastPose = 0;
    this.lastSync = 0;
    this.reconnectTimer = null;
  }

  notify(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  begin(name) {
    this.close();
    const controller = new AbortController();
    this.controller = controller;
    this.name = playerName(name);
    return controller;
  }

  async create(config) {
    const initial = settings({ ...config, time: config?.time ?? 0 });
    if (!initial) throw new Error('世界设置无效，无法开房。');
    const controller = this.begin(config.name);
    this.state = initial;
    this.ownPose = { ...new World(initial.seed).spawn, yaw: 0 };
    for (const [key, id] of Object.entries(config.edits ?? {})) {
      const value = blockEdit([...key.split(',').map(Number), id]);
      if (value) this.edits.set(editKey(value), value);
    }
    try {
      if (this.edits.size > MAX_EDITS) throw new Error('这个存档的方块改动过多，无法开房。');
      const Peer = await loadPeer();
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = roomCode();
        try {
          const peer = await connectPeer(Peer, PREFIX + code, controller.signal);
          if (controller.signal.aborted) {
            peer.destroy();
            throw new Error('已取消联机连接。');
          }
          this.code = code;
          this.peer = peer;
          this.isHost = true;
          this.bindPeer(peer);
          peer.on('connection', connection => this.accept(connection));
          return code;
        } catch (error) {
          if (error.type === 'unavailable-id' && attempt < 2) continue;
          throw error;
        }
      }
    } catch (error) {
      if (this.controller === controller) this.close();
      throw error.type ? new Error(peerError(error)) : error;
    }
    throw new Error('暂时无法分配房间码，请重试。');
  }

  async join(rawCode, name) {
    const code = String(rawCode ?? '').toUpperCase().replace(/[\s-]/g, '');
    if (!ROOM_CODE.test(code)) throw new Error('请输入有效的 8 位房间码。');
    const controller = this.begin(name);
    try {
      const Peer = await loadPeer();
      const peer = await connectPeer(Peer, undefined, controller.signal);
      if (controller.signal.aborted) {
        peer.destroy();
        throw new Error('已取消联机连接。');
      }
      this.peer = peer;
      this.bindPeer(peer);
      const host = peer.connect(PREFIX + code, { label: PROTOCOL, metadata: PROTOCOL, reliable: true, serialization: 'json' });
      this.host = host;
      const snapshot = await this.receiveSnapshot(host, peer, controller.signal);
      if (controller.signal.aborted) throw new Error('已取消联机连接。');
      this.code = code;
      this.state = { seed: snapshot.seed, mode: snapshot.mode, time: snapshot.time };
      return snapshot;
    } catch (error) {
      if (this.controller === controller) this.close();
      throw error.type ? new Error(peerError(error)) : error;
    }
  }

  bindPeer(peer) {
    peer.on('disconnected', () => {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        if (this.peer === peer && peer.disconnected && !peer.destroyed) peer.reconnect();
      }, 1_800);
    });
    peer.on('close', () => {
      if (this.peer === peer && this.code) this.disconnect('联机连接已关闭。');
    });
  }

  accept(connection) {
    const id = connection.peer;
    if (connection.label !== PROTOCOL || connection.metadata !== PROTOCOL || !PLAYER_ID.test(id) || this.members.has(id)) {
      connection.on('open', () => connection.close());
      return;
    }
    if (this.members.size >= MAX_PLAYERS - 1) {
      connection.on('open', () => {
        send(connection, { type: 'denied', message: '房间已满，最多容纳 8 位玩家。' });
        setTimeout(() => connection.close(), 900);
      });
      return;
    }
    const member = { connection, player: null, lastPose: 0, editTimes: [], timer: null };
    this.members.set(id, member);
    const remove = () => {
      clearTimeout(member.timer);
      if (this.members.get(id) !== member) return;
      this.members.delete(id);
      if (this.players.delete(id)) {
        this.notify('players', this.players);
        this.broadcast({ type: 'leave', id });
      }
    };
    member.timer = setTimeout(() => {
      remove();
      connection.close();
    }, CONNECT_TIMEOUT);
    connection.on('close', remove);
    connection.on('error', () => {
      remove();
      connection.close();
    });
    connection.on('data', message => this.hostMessage(id, member, message));
  }

  hostMessage(id, member, message) {
    if (this.members.get(id) !== member || !message || typeof message !== 'object') return;
    if (!member.player) {
      if (message.type !== 'hello' || typeof message.name !== 'string') return;
      clearTimeout(member.timer);
      const player = { ...new World(this.state.seed).spawn, yaw: 0, name: playerName(message.name) };
      if (!this.sendSnapshot(member.connection)) {
        member.connection.close();
        return;
      }
      member.player = player;
      this.players.set(id, player);
      this.broadcast({ type: 'player', id, player }, id);
      this.notify('players', this.players);
      return;
    }
    if (message.type === 'pose') {
      const pose = readPose(message.pose);
      const now = performance.now();
      if (!pose || now - member.lastPose < 35) return;
      member.lastPose = now;
      member.player = { ...pose, name: member.player.name };
      this.players.set(id, member.player);
      this.broadcast({ type: 'player', id, player: member.player }, id, true);
      this.notify('players', this.players);
    } else if (message.type === 'edit') {
      const value = blockEdit(message.value);
      if (!value) return;
      const now = performance.now();
      member.editTimes = member.editTimes.filter(time => now - time < 1_000);
      if (member.editTimes.length >= 36 || !this.rememberEdit(value)) return;
      member.editTimes.push(now);
      this.notify('edit', value);
      this.broadcast({ type: 'edit', value });
    }
  }

  sendSnapshot(connection) {
    if (!send(connection, { type: 'start', state: this.state, total: this.edits.size })) return false;
    let batch = [];
    for (const value of this.edits.values()) {
      batch.push(value);
      if (batch.length < SNAPSHOT_BATCH) continue;
      if (!send(connection, { type: 'batch', batch })) return false;
      batch = [];
    }
    if (batch.length && !send(connection, { type: 'batch', batch })) return false;
    const roster = [[this.peer.id, { ...this.ownPose, name: this.name }], ...this.players];
    return send(connection, { type: 'ready', roster });
  }

  receiveSnapshot(host, peer, signal) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let live = false;
      let state = null;
      let expected = 0;
      let received = 0;
      const edits = Object.create(null);
      const finish = (error, snapshot) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        peer.off('error', handlePeerError);
        if (error) reject(error);
        else {
          live = true;
          resolve(snapshot);
        }
      };
      const abort = () => finish(new Error('已取消联机连接。'));
      const handlePeerError = error => finish(new Error(peerError(error)));
      const timer = setTimeout(() => finish(new Error('连接房主超时，请检查双方网络并重试。')), JOIN_TIMEOUT);
      signal.addEventListener('abort', abort, { once: true });
      peer.on('error', handlePeerError);
      host.on('open', () => send(host, { type: 'hello', name: this.name }));
      host.on('error', () => {
        if (!live) finish(new Error('无法连接房主，请检查双方网络后重试。'));
        else if (this.host === host) this.disconnect('与房主的连接中断。');
      });
      host.on('close', () => {
        if (!live) finish(new Error('房间连接已关闭，房主可能已离开。'));
        else if (this.host === host) this.disconnect('房主已离开，房间已关闭。');
      });
      host.on('data', message => {
        if (!message || typeof message !== 'object') return;
        if (live) {
          if (this.host === host) this.guestMessage(message);
          return;
        }
        if (settled) return;
        if (message.type === 'denied') {
          finish(new Error('房间已满，最多容纳 8 位玩家。'));
          return;
        }
        if (message.type === 'start' && !state) {
          state = settings(message.state);
          expected = message.total;
          if (!state || !Number.isInteger(expected) || expected < 0 || expected > MAX_EDITS) finish(new Error('房间返回的世界数据无效。'));
          return;
        }
        if (message.type === 'batch' && state && Array.isArray(message.batch) && message.batch.length <= SNAPSHOT_BATCH) {
          for (const row of message.batch) {
            const value = blockEdit(row);
            if (!value || ++received > expected) {
              finish(new Error('房间返回的方块数据无效。'));
              return;
            }
            edits[editKey(value)] = value[3];
          }
          return;
        }
        if (message.type === 'ready' && state && received === expected && Array.isArray(message.roster) && message.roster.length < MAX_PLAYERS) {
          for (const entry of message.roster) {
            if (Array.isArray(entry) && entry.length === 2) this.receivePlayer(entry[0], entry[1]);
          }
          this.notify('players', this.players);
          finish(null, { ...state, edits });
          return;
        }
        finish(new Error('房间协议不匹配，请让双方刷新页面后重试。'));
      });
      if (signal.aborted) abort();
    });
  }

  guestMessage(message) {
    if (message.type === 'player' && this.receivePlayer(message.id, message.player)) this.notify('players', this.players);
    else if (message.type === 'leave' && this.players.delete(message.id)) this.notify('players', this.players);
    else if (message.type === 'edit') {
      const value = blockEdit(message.value);
      if (value) this.notify('edit', value);
    } else if (message.type === 'time' && validTime(message.time)) this.notify('time', message.time);
    else if (message.type === 'close') this.disconnect('房主已结束游戏，房间已关闭。');
  }

  receivePlayer(id, data) {
    if (typeof id !== 'string' || !PLAYER_ID.test(id) || id === this.peer?.id) return false;
    if (this.players.size >= MAX_PLAYERS - 1 && !this.players.has(id)) return false;
    const pose = readPose(data);
    if (!pose || typeof data.name !== 'string') return false;
    this.players.set(id, { ...pose, name: playerName(data.name) });
    return true;
  }

  broadcast(message, except, disposable = false) {
    for (const [id, member] of this.members) {
      if (member.player && id !== except) send(member.connection, message, disposable);
    }
  }

  move(player) {
    if (!this.code) return;
    const now = performance.now();
    if (now - this.lastPose < 70) return;
    const pose = readPose({ ...(player?.p ?? player), yaw: player?.yaw });
    if (!pose) return;
    const previous = this.ownPose;
    if (previous && this.lastPose && now - this.lastPose < 1000
      && Math.abs(previous.x - pose.x) + Math.abs(previous.y - pose.y) + Math.abs(previous.z - pose.z) < .015
      && Math.abs(previous.yaw - pose.yaw) < .01) return;
    this.ownPose = pose;
    this.lastPose = now;
    if (this.isHost) this.broadcast({ type: 'player', id: this.peer.id, player: { ...pose, name: this.name } }, null, true);
    else send(this.host, { type: 'pose', pose }, true);
  }

  rememberEdit(value) {
    const key = editKey(value);
    if (this.edits.size >= MAX_EDITS && !this.edits.has(key)) return false;
    this.edits.set(key, value);
    return true;
  }

  edit(block) {
    if (!this.code) return false;
    const value = blockEdit(block);
    if (!value) return false;
    if (!this.isHost) return send(this.host, { type: 'edit', value });
    if (!this.rememberEdit(value)) return false;
    this.broadcast({ type: 'edit', value });
    return true;
  }

  sync(time) {
    if (!this.isHost || !validTime(time)) return;
    this.state.time = time;
    const now = performance.now();
    if (now - this.lastSync < 1_500) return;
    this.lastSync = now;
    this.broadcast({ type: 'time', time }, null, true);
  }

  disconnect(message) {
    this.close();
    this.notify('close', message);
  }

  close() {
    if (this.isHost) this.broadcast({ type: 'close' });
    this.controller?.abort();
    this.controller = null;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const peer = this.peer;
    const host = this.host;
    this.peer = null;
    this.host = null;
    this.code = '';
    this.isHost = false;
    this.state = null;
    this.ownPose = null;
    this.lastPose = 0;
    this.lastSync = 0;
    for (const member of this.members.values()) clearTimeout(member.timer);
    this.members.clear();
    const hadPlayers = this.players.size > 0;
    this.players.clear();
    this.edits.clear();
    host?.close();
    peer?.destroy();
    if (hadPlayers) this.notify('players', this.players);
  }
}
