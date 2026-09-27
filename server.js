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

/* ---------- фонотека: каждая подпапка в tracks — своя группа ---------- */
const TRACK_DIRS = [path.join(ROOT, 'tracks'), path.join(ROOT, 'track')];
for (const d of TRACK_DIRS) if (!fs.existsSync(d)) { try { fs.mkdirSync(d, { recursive: true }); } catch (e) { } }

function listTracks() {
  const out = [];
  for (const base of TRACK_DIRS) {
    if (!fs.existsSync(base)) continue;
    const rel = path.basename(base);
    let entries = [];
    try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of entries) {
      if (e.isDirectory()) {
        let files = [];
        try { files = fs.readdirSync(path.join(base, e.name)); } catch (err) { continue; }
        files.filter(f => AUDIO_RE.test(f)).forEach(f => out.push({
          id: rel + '/' + e.name + '/' + f,
          title: f.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          url: '/tracks/' + encodeURIComponent(rel) + '/' + encodeURIComponent(e.name) + '/' + encodeURIComponent(f),
          group: e.name
        }));
      } else if (AUDIO_RE.test(e.name)) {
        out.push({
          id: rel + '/' + e.name,
          title: e.name.replace(/^[a-z0-9]{7,12}-/, '').replace(/\.[^.]+$/, ''),
          url: '/tracks/' + encodeURIComponent(rel) + '/' + encodeURIComponent(e.name),
          group: 'upload'
        });
      }
    }
  }
  return out;
}

/* куда класть присланный файл */
const UPLOAD_DIR = path.join(ROOT, 'tracks');

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
    const dest = path.join(UPLOAD_DIR, name);
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

  if (p === '/api/fetch' && req.method === 'POST') {
    const raw = url.searchParams.get('url') || '';
    let target;
    try { target = new URL(raw); } catch (e) { res.writeHead(400); return res.end('это не ссылка'); }
    if (!/^https?:$/.test(target.protocol)) { res.writeHead(400); return res.end('нужна ссылка http или https'); }
    // не пускаем сервер стучаться внутрь себя и в локальную сеть
    if (/^(localhost|0\.0\.0\.0|\[?::1\]?|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(target.hostname)) {
      res.writeHead(400); return res.end('такой адрес недоступен');
    }
    fetch(target.href, { redirect: 'follow' }).then(async r => {
      if (!r.ok) { res.writeHead(502); return res.end('источник ответил ' + r.status); }
      const len = +(r.headers.get('content-length') || 0);
      if (len > 80e6) { res.writeHead(413); return res.end('файл больше 80 МБ'); }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 80e6) { res.writeHead(413); return res.end('файл больше 80 МБ'); }
      let base = decodeURIComponent(target.pathname.split('/').pop() || 'track');
      let ext = (base.match(/\.[A-Za-z0-9]{1,5}$/) || [''])[0].toLowerCase();
      base = base.slice(0, base.length - ext.length).replace(/[^\wА-Яа-яЁё .\-]/g, '_').trim() || 'track';
      if (!ext || !AUDIO_RE.test('x' + ext)) {
        const ct = (r.headers.get('content-type') || '').split(';')[0];
        ext = Object.keys(MIME).find(k => MIME[k] === ct) || '.mp3';
      }
      const name = Date.now().toString(36) + '-' + base + ext;
      fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
      console.log('скачан по ссылке', name, Math.round(buf.length / 1e6) + ' МБ');
      broadcastAll({ type: 'tracks', tracks: listTracks() });
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      res.end(JSON.stringify({ id: name, title: base }));
    }).catch(e => { res.writeHead(502); res.end('не смог забрать файл'); });
    return;
  }

  if (p.startsWith('/tracks/')) {
    const parts = p.slice(8).split('/').filter(Boolean).map(x => path.basename(x));
    if (!parts.length) { res.writeHead(404); return res.end('нет файла'); }
    const base = parts[0] === 'track' || parts[0] === 'tracks'
      ? path.join(ROOT, parts.shift()) : path.join(ROOT, 'tracks');
    return serveFile(res, path.join(base, ...parts));
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
      state: { trackId: null, playing: false, offset: 0, startAt: 0, style: 'pyramid' },
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
      if (!room.masterId) {
        room.masterId = selfId;                        // первый вошёл — тот и Мастер
        if (m.style) room.state.style = m.style;       // и он же выбирает комнату
      }
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

      case 'style':
        if (!isMaster) return;
        st.style = m.style;
        broadcast(room, { type: 'style', style: st.style }, selfId);
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
