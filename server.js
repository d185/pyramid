'use strict';
/*
 * Pyramid — сервер комнаты.
 * Делает три вещи: раздаёт статику и треки, служит точкой обмена для WebRTC
 * и держит единые часы, по которым оба устройства заводят музыку.
 * Сам звук через сервер НЕ идёт: голос — напрямую peer-to-peer,
 * музыка — локальный файл у каждого, синхронизированный по времени.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const TRACKS = path.join(ROOT, 'tracks');

/* ---------- демо-треки: делаются в памяти при первом запросе ---------- */
const DEMOS = [
  { id: 'demo-1-tishina.wav', title: 'Демо 1 · тишина', seconds: 60, voices: [
    { f: 110, a: .34, lfo: .05, ph: 0 }, { f: 164.81, a: .22, lfo: .07, ph: 1 },
    { f: 220, a: .16, lfo: .04, ph: 2 }, { f: 329.63, a: .09, lfo: .09, ph: 3 }] },
  { id: 'demo-2-potok.wav', title: 'Демо 2 · поток', seconds: 60, voices: [
    { f: 146.83, a: .30, lfo: .08, ph: 0 }, { f: 220, a: .20, lfo: .11, ph: 1.5 },
    { f: 293.66, a: .14, lfo: .06, ph: .5 }, { f: 440, a: .07, lfo: .13, ph: 2.5 }] },
  { id: 'demo-3-sad.wav', title: 'Демо 3 · сад', seconds: 60, voices: [
    { f: 196, a: .28, lfo: .12, ph: 0 }, { f: 246.94, a: .19, lfo: .09, ph: 2 },
    { f: 392, a: .12, lfo: .15, ph: 1 }, { f: 587.33, a: .06, lfo: .2, ph: 3 }] }
];
const demoCache = new Map();

function renderWav(d) {
  const rate = 22050, n = Math.floor(rate * d.seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);

  const V = d.voices.length;
  const step = d.voices.map(v => 2 * Math.PI * v.f / rate);
  const phase = new Float64Array(V);
  const amp = new Float64Array(V);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    if ((i & 127) === 0) {           // медленное дыхание считаем редко, это не слышно
      for (let v = 0; v < V; v++) {
        const q = d.voices[v];
        amp[v] = q.a * (0.6 + 0.4 * Math.sin(2 * Math.PI * q.lfo * t + q.ph));
      }
    }
    let s = 0;
    for (let v = 0; v < V; v++) { s += Math.sin(phase[v]) * amp[v]; phase[v] += step[v]; }
    const env = Math.min(1, t / 2) * Math.min(1, (d.seconds - t) / 2);
    const x = Math.max(-1, Math.min(1, s * env * 0.55));
    buf.writeInt16LE((x * 32767) | 0, 44 + i * 2);
  }
  return buf;
}

function getDemo(id) {
  if (demoCache.has(id)) return demoCache.get(id);
  const d = DEMOS.find(x => x.id === id);
  if (!d) return null;
  const t = Date.now();
  const buf = renderWav(d);
  console.log('собран демо-трек', id, Date.now() - t, 'мс');
  demoCache.set(id, buf);
  return buf;
}

if (!fs.existsSync(TRACKS)) fs.mkdirSync(TRACKS, { recursive: true });

function listTracks() {
  const demos = DEMOS.map(d => ({ id: d.id, title: d.title, url: '/tracks/' + d.id }));
  const demoIds = new Set(DEMOS.map(d => d.id));
  const files = fs.readdirSync(TRACKS)
    .filter(f => AUDIO_RE.test(f) && !demoIds.has(f))
    .map(f => ({ id: f, title: f.replace(/^[a-z0-9]+-/, '').replace(/\.[^.]+$/, ''), url: '/tracks/' + encodeURIComponent(f) }));
  return demos.concat(files);
}

/* ---------- статика ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg', '.mpga': 'audio/mpeg', '.mp2': 'audio/mpeg',
  '.m4a': 'audio/mp4', '.m4b': 'audio/mp4', '.mp4': 'audio/mp4', '.aac': 'audio/aac',
  '.adts': 'audio/aac', '.wav': 'audio/wav', '.wave': 'audio/wav',
  '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.aifc': 'audio/aiff', '.caf': 'audio/x-caf',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
  '.weba': 'audio/webm', '.webm': 'audio/webm', '.amr': 'audio/amr',
  '.wma': 'audio/x-ms-wma', '.3gp': 'audio/3gpp', '.alac': 'audio/mp4'
};

/* Всё, что похоже на звук. Открыть файл в итоге должен браузер:
   Safari не умеет ogg и opus, Chrome не умеет alac и wma.
   Поэтому берём файл любой, а о неудаче честно сообщаем в комнату. */
const AUDIO_RE = /\.(mp3|mpga|mp2|m4a|m4b|mp4|aac|adts|wav|wave|aif|aiff|aifc|caf|flac|ogg|oga|opus|weba|webm|amr|wma|alac|3gp)$/i;

function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('нет такого файла'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Cache-Control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);

  if (p === '/healthz') { res.writeHead(200); return res.end('ok'); }

  if (p === '/api/config') {
    const ice = [{ urls: (process.env.STUN_URL || 'stun:stun.l.google.com:19302').split(',') }];
    if (process.env.TURN_URL) {
      ice.push({
        urls: process.env.TURN_URL.split(','),
        username: process.env.TURN_USER || '',
        credential: process.env.TURN_PASS || ''
      });
    }
    res.writeHead(200, { 'Content-Type': MIME['.json'] });
    return res.end(JSON.stringify({ iceServers: ice, hasTurn: !!process.env.TURN_URL }));
  }

  if (p === '/api/tracks') {
    res.writeHead(200, { 'Content-Type': MIME['.json'] });
    return res.end(JSON.stringify(listTracks()));
  }

  if (p === '/api/upload' && req.method === 'POST') {
    const given = (url.searchParams.get('name') || 'upload').slice(-90);
    let ext = (given.match(/\.[A-Za-z0-9]{1,5}$/) || [''])[0].toLowerCase();
    let base = given.slice(0, given.length - ext.length).replace(/[^\wА-Яа-яЁё .\-]/g, '_').trim() || 'трек';
    // iPhone иногда отдаёт файл без расширения — тогда считаем его mp4-аудио
    if (!ext || !AUDIO_RE.test('x' + ext)) ext = ext && MIME[ext] ? ext : '.m4a';
    const name = Date.now().toString(36) + '-' + base + ext;
    const dest = path.join(TRACKS, name);
    const out = fs.createWriteStream(dest);
    let size = 0, tooBig = false;
    req.on('data', c => { size += c.length; if (size > 80e6) { tooBig = true; req.destroy(); } });
    req.on('aborted', () => { out.destroy(); fs.existsSync(dest) && fs.unlinkSync(dest); });
    req.pipe(out);
    out.on('error', () => { res.writeHead(500); res.end('не смог сохранить'); });
    out.on('finish', () => {
      if (tooBig) { fs.existsSync(dest) && fs.unlinkSync(dest); res.writeHead(413); return res.end('файл больше 80 МБ'); }
      if (!size) { fs.existsSync(dest) && fs.unlinkSync(dest); res.writeHead(400); return res.end('пустой файл'); }
      console.log('принят файл', name, Math.round(size / 1e6) + ' МБ');
      broadcastAll({ type: 'tracks', tracks: listTracks() });
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      res.end(JSON.stringify({ id: name, title: base }));
    });
    return;
  }

  if (p.startsWith('/tracks/')) {
    const name = path.basename(p);
    const demo = getDemo(name);
    if (demo) {
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': demo.length, 'Cache-Control': 'public, max-age=86400' });
      return res.end(demo);
    }
    return serveFile(res, path.join(TRACKS, name));
  }
  const file = p === '/' ? path.join(PUBLIC, 'index.html') : path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  serveFile(res, file);
});

/* ---------- комнаты ---------- */
const wss = new WebSocketServer({ server });
const rooms = new Map();

function getRoom(id) {
  if (!rooms.has(id)) {
    rooms.set(id, {
      id, peers: new Map(), masterId: null,
      state: { trackId: null, playing: false, offset: 0, startAt: 0 },
      chat: []
    });
  }
  return rooms.get(id);
}

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj, except) {
  for (const [id, p] of room.peers) if (id !== except) send(p.ws, obj);
}
function broadcastAll(obj) { for (const room of rooms.values()) broadcast(room, obj); }

function peersInfo(room) {
  return [...room.peers.entries()].map(([id, p]) => ({ id, name: p.name, role: id === room.masterId ? 'master' : 'guest' }));
}

/* когда оба зарядили трек — назначаем общий момент старта */
function maybeStart(room) {
  const st = room.state;
  if (!st.trackId || st.playing) return;
  const peers = [...room.peers.values()];
  if (!peers.length) return;
  if (!peers.every(p => p.ready === st.trackId)) return;
  st.startAt = Date.now() + 500;      // запас на доставку команды
  st.playing = true;
  broadcast(room, { type: 'play', startAt: st.startAt, offset: st.offset, trackId: st.trackId });
}

wss.on('connection', ws => {
  let room = null, selfId = null;

  ws.on('message', data => {
    let m; try { m = JSON.parse(data); } catch (e) { return; }

    /* часы: отвечаем как можно быстрее и без обработки */
    if (m.type === 'ping') return send(ws, { type: 'pong', t0: m.t0, t1: Date.now() });

    if (m.type === 'hello') {
      room = getRoom((m.room || 'main').slice(0, 64));
      selfId = crypto.randomBytes(6).toString('hex');
      room.peers.set(selfId, { ws, name: (m.name || 'Гость').slice(0, 40), ready: null, speaking: false });
      if (!room.masterId) room.masterId = selfId;      // первый вошёл — тот и Мастер
      send(ws, {
        type: 'welcome', selfId, room: room.id,
        masterId: room.masterId, peers: peersInfo(room),
        state: room.state, tracks: listTracks(), chat: room.chat.slice(-50), serverTime: Date.now()
      });
      broadcast(room, { type: 'peers', peers: peersInfo(room), masterId: room.masterId }, selfId);
      return;
    }

    if (!room || !selfId) return;
    const isMaster = room.masterId === selfId;
    const st = room.state;

    switch (m.type) {
      /* обмен SDP и кандидатами — сервер только пересылает */
      case 'signal':
        broadcast(room, { type: 'signal', from: selfId, data: m.data }, selfId);
        break;

      case 'select':
        if (!isMaster) return;
        st.trackId = m.trackId; st.offset = 0; st.playing = false; st.startAt = 0;
        for (const p of room.peers.values()) p.ready = null;
        broadcast(room, { type: 'load', trackId: st.trackId, offset: 0 });
        break;

      case 'ready': {
        const me = room.peers.get(selfId);
        if (me) me.ready = m.trackId;
        broadcast(room, { type: 'readyState', id: selfId, trackId: m.trackId });
        maybeStart(room);
        break;
      }

      case 'pause':
        if (!isMaster) return;
        st.offset = Math.max(0, +m.offset || 0);
        st.playing = false;
        broadcast(room, { type: 'paused', offset: st.offset });
        break;

      case 'resume':
        if (!isMaster) return;
        st.playing = false;
        maybeStart(room);
        break;

      case 'seek': {
        if (!isMaster) return;
        st.offset = Math.max(0, +m.offset || 0);
        st.playing = false;
        st.startAt = Date.now() + 250;
        st.playing = true;
        broadcast(room, { type: 'play', startAt: st.startAt, offset: st.offset, trackId: st.trackId });
        break;
      }

      case 'speaking': {
        const me = room.peers.get(selfId);
        if (me) me.speaking = !!m.on;
        broadcast(room, { type: 'speaking', id: selfId, on: !!m.on }, selfId);
        break;
      }

      case 'note': {
        const who = room.peers.get(selfId)?.name || '?';
        broadcast(room, { type: 'note', text: who + ': ' + String(m.text || '').slice(0, 200) });
        break;
      }

      case 'chat': {
        const msg = { from: room.peers.get(selfId)?.name || '?', text: String(m.text || '').slice(0, 500), at: Date.now() };
        room.chat.push(msg); if (room.chat.length > 200) room.chat.shift();
        broadcast(room, { type: 'chat', msg });
        break;
      }

      case 'transfer': {
        if (!isMaster) return;
        const other = [...room.peers.keys()].find(id => id !== selfId);
        if (other) {
          room.masterId = other;
          broadcast(room, { type: 'peers', peers: peersInfo(room), masterId: room.masterId });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!room || !selfId) return;
    room.peers.delete(selfId);
    if (room.masterId === selfId) room.masterId = [...room.peers.keys()][0] || null;
    if (!room.peers.size) { rooms.delete(room.id); return; }
    broadcast(room, { type: 'peers', peers: peersInfo(room), masterId: room.masterId });
    broadcast(room, { type: 'peer-left', id: selfId });
  });
});

process.on('SIGTERM', () => {
  console.log('получен SIGTERM, закрываюсь');
  for (const room of rooms.values()) broadcast(room, { type: 'bye' });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});

server.listen(PORT, () => {
  console.log('Pyramid слушает http://localhost:' + PORT);
  if (!process.env.TURN_URL) console.log('TURN не настроен: за строгим NAT связь может не подняться. См. README.');
});
