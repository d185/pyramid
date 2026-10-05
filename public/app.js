'use strict';
/*
 * Клиент Pyramid.
 * Три независимых механизма:
 *   1) часы — общее время с сервером, точность порядка единиц миллисекунд;
 *   2) музыка — свой файл у каждого, заводится по общему времени, дрейф правится темпом;
 *   3) голос — WebRTC напрямую между устройствами, через <audio>, а не через Web Audio.
 * Музыка НИКОГДА не идёт через микрофон: в микрофон она только просачивается,
 * и эту утечку давит эхоподавление.
 */

const $ = s => document.querySelector(s);

/* Одна невидимая ошибка однажды убила половину приложения.
   Теперь любая всплывает на экран, а не прячется в журнале. */
const errLog = [];
function noteError(msg) {
  msg = String(msg || 'ошибка').slice(0, 160);
  if (errLog[errLog.length - 1] !== msg) errLog.push(msg);
  if (errLog.length > 5) errLog.shift();
  const box = document.querySelector('#toast');
  if (!box) return;
  box.textContent = '⚠ ' + msg;
  box.classList.add('on');
  setTimeout(() => box.classList.remove('on'), 6000);
}
window.addEventListener('error', e => noteError(e.message));
// ошибки в асинхронном коде (загрузка трека, расшифровка) раньше терялись
window.addEventListener('unhandledrejection', e => {
  const r = e.reason;
  noteError(r && r.message ? r.message : (typeof r === 'string' ? r : 'async: ' + (r && r.name || 'ошибка')));
});
const fmt = s => (s < 0 ? '0:00' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'));

const ui = {
  title: $('#title'), state: $('#state'), seek: $('#seek'), cur: $('#cur'), rem: $('#rem'),
  play: $('#play'), pause: $('#pause'), stop: $('#stop'), back15: $('#back15'), fwd15: $('#fwd15'),
  chat: $('#chat'), chatInput: $('#chatInput'),
  music: $('#music'), voice: $('#voice'), duck: $('#duck'), diag: $('#diag'), invite: $('#invite'),
  transfer: $('#transfer'), upload: $('#upload'), lang: $('#lang'),
  hpSpk: $('#hpSpk'), hpHp: $('#hpHp'),
  toRooms: $('#toRooms'), goRooms: $('#goRooms'),
  chatBox: $('#chatBox'), rbRole: $('#rbRole'), rbDot: $('#rbDot'),
  libMenu: $('#libMenu'), libLbl: $('#libLbl'), addLbl: $('#addLbl'),
  exit: $('#exitBtn')
};

var roomStyle = 'green';   // какая комната открыта у обоих

/* ---------------- язык ---------------- */
let lang = localStorage.getItem('pyr-lang') || 'en';
if (!window.I18N[lang]) lang = 'en';

function t(key, vars) {
  let s = (window.I18N[lang] && window.I18N[lang][key]) || window.I18N.en[key] || key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}

function applyLang() {
  document.documentElement.lang = lang;
  localStorage.setItem('pyr-lang', lang);
  $('#gateLead').textContent = t('gate.lead', { room: roomId });
  $('#name').placeholder = t('gate.name');
  $('#enter').textContent = t('gate.enter');
  $('#gateMic').textContent = t('gate.mic');
  ui.libLbl.textContent = t('lib.btn');
  $('#libTitle').textContent = t('lib.btn');
  ui.addLbl.textContent = t('add.btn');
  $('#miFile').textContent = t('add.file');
  $('#miUrl').textContent = t('add.url');
  ui.chatInput.placeholder = t('chat.placeholder');
  $('#invLbl').textContent = t('btn.invite');
  $('#trfLbl').textContent = t('btn.transfer');
  ui.invite.title = t('btn.invite');
  ui.transfer.title = t('btn.transfer');
  ui.toRooms.title = t('room.change');
  $('#diagBtn').title = t('diag.title');
  $('#rmLbl').textContent = t('btn.room');
  requestAnimationFrame(fitBar);
  $('#exitLbl').textContent = t('btn.exit');
  ui.hpSpk.title = t('mode.speaker');
  ui.hpHp.title = t('mode.headphones');
  $('#musicBtn').title = t('vol.music');
  $('#voiceBtn').title = t('vol.voice');
  $('#micOn').title = t('mic.live');
  $('#micOff').title = t('mic.muted');
  ui.chatInput.placeholder = t('chat.placeholder');
  $('#musicBtn').title = t('vol.music');
  $('#voiceBtn').title = t('vol.voice');
  ui.back15.title = t('tr.back15'); ui.play.title = t('tr.play');
  ui.pause.title = t('tr.pause'); ui.stop.title = t('tr.stop'); ui.fwd15.title = t('tr.fwd15');
  ui.duck.textContent = t('duck.badge');
  $('#diagTitle').textContent = t('diag.title');
  $('#diagHint').textContent = t('diag.hint');
  $('#inviteTitle').textContent = t('invite.title');
  $('#inviteNote').textContent = t('invite.note');
  $('#optSms').lastElementChild.textContent = t('invite.sms');
  $('#optMail').lastElementChild.textContent = t('invite.email');
  $('#optWa').lastElementChild.textContent = t('invite.whatsapp');
  $('#optCopy').lastElementChild.textContent = t('invite.copy');
  $('#optClose').textContent = t('invite.close');
  $('#homeTag').textContent = t('home.tagline');
  $('#homeLead').textContent = t('home.lead');
  $('#goRooms').textContent = t('home.enter');
  $('#enterTop').textContent = t('home.signin');
  $('#roomsTitle').textContent = t('home.rooms');
  $('#goRooms').textContent = t('home.enter');
  $('#enterTop').textContent = t('home.signin');
  $('#roomsHint').textContent = t('home.roomshint');
  $('#tHolTitle').textContent = t('home.holidays');
  $('#tQuotesTitle').textContent = t('home.quotes');
  [['Pyr', 'green'], ['Gld', 'gold'], ['Slv', 'silver']].forEach(function (p) {
    $('#rn' + p[0]).textContent = t('room.' + p[1]);
    $('#rd' + p[0]).textContent = t('room.' + p[1] + '.d');
  });
  $('#perks').innerHTML = ['perk.sync', 'perk.voice', 'perk.link', 'perk.walls']
    .map(function (k, i) { return '<div class="perk" data-n="' + (i + 1) + '">' + t(k) + '</div>'; }).join('');
  $('#roomsH').textContent = t('home.roomsH');
  renderToday();
  renderMode();
  if (!currentTrack) ui.title.textContent = t('player.none');
  if (lastState) ui.state.textContent = t(lastState);
  renderTracks();
}

function renderToday() {
  var d = new Date();
  $('#tDate').textContent = d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' });
  $('#tHol').innerHTML = window.DAYS.pick(d, lang).map(function (x) {
    return '<div><span class="dot">◆</span><span>' + x.text + '</span></div>';
  }).join('');
  $('#tQuotes').innerHTML = window.DAYS.twoQuotes(d, lang).map(function (q) {
    return '<figure class="quote"><q>' + q.text + '</q><cite>' + q.who + '</cite></figure>';
  }).join('');
  if (weatherText) $('#tMeta').textContent = weatherText;
}

/* Погода по адресу: две открытые службы без ключей.
   Если не отвечают — блок просто молчит, ломать из-за этого нечего. */
var weatherText = '';
function loadWeather() {
  fetch('https://ipapi.co/json/').then(function (r) { return r.json(); }).then(function (p) {
    if (!p || !p.latitude) throw 0;
    return fetch('https://api.open-meteo.com/v1/forecast?latitude=' + p.latitude +
      '&longitude=' + p.longitude + '&current=temperature_2m').then(function (r) { return r.json(); })
      .then(function (w) {
        var c = w && w.current ? Math.round(w.current.temperature_2m) : null;
        weatherText = p.city ? (p.city + (c === null ? '' : ' · ' + (c > 0 ? '+' : '') + c + '°')) : '';
        $('#tMeta').textContent = weatherText;
      });
  }).catch(function () { $('#tMeta').textContent = t('home.weatherfail'); });
}

let lastState = '';
function setState(key) { lastState = key; ui.state.textContent = t(key); }

/* ---------------- состояние ---------------- */
let ws, selfId = null, masterId = null, roomId = null, isMaster = false;
let cfg = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let tracks = [], currentTrack = null;

/* ---------------- 1. часы ---------------- */
const clock = { offset: 0, rtt: 0, samples: [] };
const now = () => Date.now() + clock.offset;

function ping() {
  if (!ws || ws.readyState !== 1) return;
  const t0 = Date.now();
  pending.set(t0, true);
  ws.send(JSON.stringify({ type: 'ping', t0 }));
}
const pending = new Map();

function onPong(m) {
  const t2 = Date.now(), rtt = t2 - m.t0;
  if (!pending.delete(m.t0)) return;
  // предполагаем симметричную задержку: смещение = серверное время минус середина запроса
  const offset = m.t1 - (m.t0 + t2) / 2;
  clock.samples.push({ rtt, offset });
  if (clock.samples.length > 12) clock.samples.shift();
  // берём выборку с наименьшим кругом: она наименее искажена
  const best = clock.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
  clock.offset = best.offset;
  clock.rtt = best.rtt;
}

/* ---------------- 2. музыка ---------------- */
/* Раньше трек целиком расшифровывался в память: 8 минут — это 180 МБ,
   получас — больше 600. Айфон на этом отказывался открывать файл
   («нужен другой формат») или Safari убивал вкладку и перезагружал её.
   Теперь музыка идёт потоком через обычный звуковой элемент: в памяти
   держится лишь несколько секунд, длина трека значения не имеет. */
let actx = null, musicGain = null, duckGain = null, voiceGain = null, actxAfterMic = false;
/* Голосу нужен звуковой движок, созданный ПОСЛЕ включения микрофона: на айфоне
   движок, созданный раньше, получает голоса пустыми. Обычно это тот же движок,
   что у музыки. Но если микрофон дали позже — например, гость сначала отказал, —
   для голоса заводится отдельный, свежий движок. */
let vctx = null, vctxAfterMic = false;
function ensureVoiceCtx(force) {
  if (vctx && !force) return;
  if (vctx && vctx !== actx) { try { vctx.close(); } catch (e) { } }   // лишние движки закрываем: айфон даёт их мало
  if (actx && actxAfterMic) vctx = actx;
  else { try { vctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { vctx = actx; } }
  if (!vctx) return;
  vctxAfterMic = !!localStream;
  voiceGain = vctx.createGain();
  voiceGain.gain.value = +ui.voice.value / 100;
  voiceGain.connect(vctx.destination);
  outAn = vctx.createAnalyser(); outAn.fftSize = 512;
  voiceGain.connect(outAn);
  if (vctx.state !== 'running') { try { vctx.resume().catch(() => { }); } catch (e) { } }
  voiceNode = null; remoteAn = null;
  if (remoteStream && connectedNow()) probeVoice(remoteStream);
}
/* ---------- музыка: расшифровка по кускам и игра буферами ----------
   Раньше музыка шла через звуковой элемент, пропущенный в движок способом
   createMediaElementSource. На айфоне это давняя ошибка WebKit: звук трещит
   и прерывается, особенно при подстройке скорости (отчёты 211394, 215314,
   221553 и жалобы проигрывателя wavesurfer.js). А звук, выведенный буферами
   прямо в движок, на айфоне идёт в громкий динамик даже в режиме звонка.
   Целиком трек в память не помещается, поэтому — куски по 20 секунд со
   склейкой по совпадению звука (модуль chunker.js), в памяти три куска. */
const CHUNK_SEC = 20, PRE = 40, FADE = 0.015;
let musicBlocked = false, stalls = 0;
let buffer = null;                 // признак «трек готов»: { duration }
let playing = false, serverStartAt = 0, serverOffset = 0, pos = 0, rate = 1;
let drift = 0, corrections = 0, hardResyncs = 0, loadToken = 0;
let track = null;                  // { parsed, plan, chunks: Map, spfCtx, delta, whole }
let sched = [];                    // запущенные куски: { k, src, gain, from, to }
let anchorCtx = 0, anchorTrack = 0; // в момент anchorCtx звучит секунда anchorTrack

function blessMusic() { }          // звукового элемента для музыки больше нет — разрешать нечего
function retryMusic() {
  if (actx && actx.state !== 'running') actx.resume().then(() => { if (actx.state === 'running') musicBlocked = false; }).catch(() => { });
  if (vctx && vctx !== actx && vctx.state !== 'running') vctx.resume().catch(() => { });
}
['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, retryMusic, { passive: true }));

let keepAlive = null;
function silenceStream(ctx) {
  const osc = ctx.createOscillator(), dst = ctx.createMediaStreamDestination();
  osc.connect(dst); osc.start();
  const tr = dst.stream.getAudioTracks()[0];
  if (tr) tr.enabled = false;
  return dst.stream;
}
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { noteError(t('toast.noaudio')); return; }
  musicGain = actx.createGain();
  duckGain = actx.createGain();
  musicGain.gain.value = +ui.music.value / 100;
  duckGain.gain.value = 1;
  musicGain.connect(duckGain).connect(actx.destination);
  actxAfterMic = !!localStream;
  /* Как у веб-Телеграма: звуковой элемент всё время играет беззвучный поток —
     так звук страницы остаётся «разогретым» и не засыпает между касаниями. */
  try {
    keepAlive = new Audio();
    keepAlive.setAttribute('playsinline', 'true');
    keepAlive.srcObject = silenceStream(actx);
    const p = keepAlive.play(); if (p && p.catch) p.catch(() => { });
  } catch (e) { }
}

function decodeAB(ab) {
  return new Promise((res, rej) => {
    try { const r = actx.decodeAudioData(ab, res, rej); if (r && r.then) r.then(res, rej); }
    catch (e) { rej(e); }
  });
}
function monoOf(ab) {
  const ch = []; for (let i = 0; i < Math.min(2, ab.numberOfChannels); i++) ch.push(ab.getChannelData(i));
  return MP3Chunker.mono(ch);
}

/* Расшифровать кусок k и найти, с какого отсчёта трека он начинается */
async function getChunk(k) {
  const T = track;
  if (!T) return null;
  if (T.chunks.has(k)) return T.chunks.get(k);
  if (T.whole) return T.chunks.get(0);
  const c = T.plan[k];
  if (!c) return null;
  const p = (async () => {
    let ab;
    try { ab = await decodeAB(MP3Chunker.slice(T.parsed, c.from, c.to).buffer); }
    catch (e1) {
      // некоторые расшифровщики не принимают кусок без начала файла — подклеиваем первые кадры
      if (k === 0) throw e1;
      const head = MP3Chunker.slice(T.parsed, 0, 2), body = MP3Chunker.slice(T.parsed, c.from, c.to);
      const both = new Uint8Array(head.length + body.length); both.set(head, 0); both.set(body, head.length);
      ab = await decodeAB(both.buffer);
      T.headed = true;
    }
    let start;
    if (k === 0) start = 0;
    else {
      // по совпадению звука с предыдущим куском, если он под рукой
      const prevEntry = T.chunks.get(k - 1);
      const prev = prevEntry && prevEntry.ab ? prevEntry : (prevEntry && await prevEntry.p);
      if (prev && prev.ab) {
        const expect = Math.round((c.from - T.plan[k - 1].from) * T.spfCtx);
        const r = MP3Chunker.align(monoOf(prev.ab), monoOf(ab), Math.round((PRE - 20) * T.spfCtx), expect,
          Math.round(3000 * actx.sampleRate / 44100));
        start = prev.start + (r.score > 0.6 ? r.lag : expect);
        T.lastScore = r.score;
        if (r.score > 0.6) T.delta = start - c.from * T.spfCtx;   // запомнить задержку этого браузера
      } else {
        start = Math.round(c.from * T.spfCtx + (T.delta || 0));   // перемотка в середину: по счёту кадров
      }
    }
    const e = { k, ab, start, p: null };
    if (track === T) T.chunks.set(k, e);
    return e;
  })();
  T.chunks.set(k, { k, p });
  try { return await p; } catch (e) { T.chunks.delete(k); throw e; }
}
/* с какого отсчёта трека играет кусок k (у первого — с нуля, у остальных — после разгона) */
function playFrom(e) { return e.k === 0 ? 0 : e.start + Math.round((PRE - 8) * track.spfCtx); }
function chunkOfSample(sample) {
  if (!track || track.whole) return 0;
  const f = sample / track.spfCtx;
  return Math.max(0, Math.min(track.plan.length - 1, Math.floor(f / track.plan[0].to)));
}

/* моменты движка ↔ общие часы сервера */
function outLatency() { return actx ? (actx.outputLatency || actx.baseLatency || 0) : 0; }
function ctxForServer(ts) { return actx.currentTime + (ts - now()) / 1000 - outLatency(); }
function expectedPos() { return serverOffset + (now() - serverStartAt) / 1000; }
function musicPos() {
  if (!playing || !actx) return serverOffset;
  return anchorTrack + (actx.currentTime - anchorCtx);
}

/* Запустить кусок e так, чтобы он вступил ровно с отсчёта трека fromSample */
function launch(e, fromSample, fadeIn) {
  const sr = actx.sampleRate;
  // привязка заново к общим часам при каждом куске — так расхождение не накапливается
  anchorCtx = ctxForServer(serverStartAt);
  anchorTrack = serverOffset;
  const whenTrack = fromSample / sr;
  let when = anchorCtx + (whenTrack - anchorTrack);
  let offset = (fromSample - e.start) / sr;
  const late = actx.currentTime + 0.02 - when;
  if (late > 0) { when += late; offset += late; fromSample += Math.round(late * sr); }
  if (offset >= e.ab.duration) return null;
  const src = actx.createBufferSource(), g = actx.createGain();
  src.buffer = e.ab;
  src.connect(g).connect(musicGain);
  if (fadeIn) { g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + FADE); }
  src.start(when, Math.max(0, offset));
  const item = { k: e.k, src, gain: g, from: fromSample, startCtx: when };
  src.onended = () => { sched = sched.filter(x => x !== item); };
  sched.push(item);
  return item;
}

/* Подготовить следующий кусок заранее и вклеить его в нужный момент */
let scheduling = false;
async function scheduleAhead() {
  if (scheduling || !playing || !track || track.whole || !actx) return;
  const last = sched[sched.length - 1];
  if (!last) return;
  const k = last.k + 1;
  if (k >= track.plan.length || sched.some(x => x.k === k)) return;
  const secLeft = (track.chunks.get(last.k).start + track.chunks.get(last.k).ab.length) / actx.sampleRate - musicPos();
  if (secLeft > 8) return;                       // рано — память бережём
  scheduling = true;
  try {
    const tok = loadToken;
    const e = await getChunk(k);
    if (!e || tok !== loadToken || !playing) return;
    const from = playFrom(e);
    const cur = sched.find(x => x.k === k - 1);
    const item = launch(e, from, true);
    if (item && cur) {                           // старый кусок гаснет там же, где вступает новый
      cur.gain.gain.setValueAtTime(1, item.startCtx);
      cur.gain.gain.linearRampToValueAtTime(0, item.startCtx + FADE);
      try { cur.src.stop(item.startCtx + FADE + 0.01); } catch (er) { }
    } else if (!item) stalls++;
    // память: держим только соседние куски
    for (const key of [...track.chunks.keys()]) if (key < k - 1) track.chunks.delete(key);
  } catch (er) { stalls++; }
  finally { scheduling = false; }
}

function stopSource() {
  sched.forEach(x => { try { x.src.onended = null; x.src.stop(); } catch (e) { } });
  sched = [];
  playing = false;
}

async function startAt(startAtServer, offset) {
  if (!buffer || !track) return;
  stopSource();
  serverStartAt = startAtServer; serverOffset = offset;
  if (actx.state !== 'running') { try { await actx.resume(); } catch (e) { } }
  if (actx.state !== 'running') { musicBlocked = true; toast(t('toast.tapmusic')); }
  const tok = ++loadToken;
  const sr = actx.sampleRate;
  const target = Math.max(0, Math.round(expectedPos() * sr));
  const k = chunkOfSample(target);
  let e;
  try { e = await getChunk(k); } catch (er) { reportTrack(currentTrack, 'badformat'); return; }
  if (tok !== loadToken) return;
  playing = true;
  // если перемотали глубже начала куска — стартуем с нужного места внутри него
  const from = Math.max(playFrom(e), Math.round(expectedPos() * sr));
  launch(e, from, k > 0);
  setState('state.playing');
}

/* Трек скачивается целиком в сжатом виде — около мегабайта на минуту — и режется
   на куски уже в памяти телефона. */
async function fetchWhole(url, token) {
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) { const e = new Error('http'); e.status = r.status; throw e; }
  const total = +r.headers.get('content-length') || 0;
  if (!r.body || !r.body.getReader) return new Uint8Array(await r.arrayBuffer());
  const reader = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (token !== loadToken) { try { reader.cancel(); } catch (e) { } throw new Error('cancelled'); }
    parts.push(value); got += value.length;
    if (total) ui.state.textContent = t('state.loading') + ' ' + Math.round(got / total * 100) + '%';
  }
  const out = new Uint8Array(got); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function reportTrack(tr, reason) {
  setState(reason === 'badformat' ? 'state.badformat' : 'state.loadfail');
  const text = t('bad.' + reason, { title: tr ? tr.title : '' });
  toast(text);
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'note', text }));
}

async function loadTrack(trackId) {
  const tr = tracks.find(x => x.id === trackId);
  if (!tr) return;
  const token = ++loadToken;
  currentTrack = tr;
  ui.title.textContent = tr.title;
  setState('state.loading');
  stopSource();
  buffer = null; track = null;
  if (tr.bad) { reportTrack(tr, tr.bad); return; }
  initAudio();
  let bytes;
  try { bytes = await fetchWhole(tr.url, token); }
  catch (e) {
    if (token !== loadToken || e.message === 'cancelled') return;
    reportTrack(tr, e.status === 404 ? 'missing' : 'network');
    return;
  }
  if (token !== loadToken) return;
  const parsed = MP3Chunker.parse(bytes);
  try {
    if (parsed && parsed.frames > 10) {
      const T = { parsed, plan: MP3Chunker.plan(parsed, CHUNK_SEC, PRE), chunks: new Map(),
        spfCtx: parsed.spf * actx.sampleRate / parsed.sampleRate, delta: 0, whole: false };
      track = T;
      await getChunk(0);                         // первый кусок — сразу, остальные по ходу
      buffer = { duration: parsed.duration };
    } else {
      // не mp3 (wav, m4a…): расшифровываем целиком
      const ab = await decodeAB(bytes.buffer);
      track = { whole: true, chunks: new Map([[0, { k: 0, ab, start: 0 }]]), plan: [{ from: 0, to: 0 }], spfCtx: 1 };
      buffer = { duration: ab.duration };
    }
  } catch (e) {
    if (token === loadToken) reportTrack(tr, 'badformat');
    return;
  }
  if (token !== loadToken) return;
  setState('state.ready');
  ws.send(JSON.stringify({ type: 'ready', trackId }));
}

/* каждые 300 мс: подготовить следующий кусок, проверить конец и общие часы */
setInterval(() => {
  if (!playing || !buffer || !actx) return;
  if (actx.state !== 'running') { musicBlocked = true; return; }
  scheduleAhead();
  pos = musicPos();
  drift = pos - expectedPos() - outLatency();
  if (pos >= buffer.duration - 0.05) { playing = false; setState('state.ended'); }
  // сильно разошлись (телефон уснул, вкладка была в фоне) — перезапуск с нужного места
  if (Math.abs(drift) > 0.25) { hardResyncs++; startAt(serverStartAt, serverOffset); }
}, 300);

/* полоса прокрутки и время */
setInterval(() => {
  var c = $('#tClock');
  if (c) c.textContent = new Date().toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  if (!buffer || !buffer.duration) return;
  const p = musicPos();
  if (!seeking) ui.seek.value = Math.min(100, (p / buffer.duration) * 100);
  ui.cur.textContent = fmt(Math.max(0, p));
  ui.rem.textContent = '−' + fmt(Math.max(0, buffer.duration - p));
}, 200);

/* ---------------- 3. голос ---------------- */
/* На айфоне громкость звукового элемента заблокирована Apple: ставишь 0,5,
   читаешь — там снова 1. Поэтому ползунок голоса ни на что не влиял.
   Проверяем это при запуске и на таких устройствах пускаем голос через
   собственный регулятор громкости в Web Audio. */
const VOLUME_LOCKED = (() => {
  try { const a = document.createElement('audio'); a.volume = 0.5; return Math.abs(a.volume - 0.5) > 0.01; }
  catch (e) { return false; }
})();
let voiceNode = null, remoteAn = null, voiceFallback = false, remoteLevel = 0, outLevel = 0, outAn = null;
let voiceRoute = 'element', statsRemote = 0, statsSelf = 0, deafSince = 0, remoteStream = null;
/* Голос собеседника сначала идёт обычным звуковым элементом — так он слышен
   всегда. Собственный регулятор громкости в это время только слушает.
   Как только он услышал живой звук — переключаемся на него, и ползунок начинает
   работать. Если регулятор глух, мы на нём никогда и не окажемся. А если
   оказались и он оглох, хотя по сведениям соединения голос идёт, — возврат. */
function lvl(an) {
  const a = new Uint8Array(an.fftSize); an.getByteTimeDomainData(a);
  let s = 0; for (let i = 0; i < a.length; i++) { const v = (a[i] - 128) / 128; s += v * v; }
  return Math.sqrt(s / a.length);
}
function connectedNow() { return !!pc && (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed'); }
/* Схема веб-Телеграма для голоса собеседника: поток → звуковой движок →
   регулятор громкости → динамик. Поток при этом подключён к НЕМОМУ звуковому
   элементу: без этого Chrome не отдаёт звук в движок. Подключаем только после
   установки соединения — раньше узел выдаёт тишину. Запасной путь: если движок
   молчит, а по сведениям соединения голос идёт, — включаем звук элемента. */
function lvl(an) {
  const a = new Uint8Array(an.fftSize); an.getByteTimeDomainData(a);
  let s = 0; for (let i = 0; i < a.length; i++) { const v = (a[i] - 128) / 128; s += v * v; }
  return Math.sqrt(s / a.length);
}
function probeVoice(stream) {
  if (!vctx) ensureVoiceCtx();
  if (!vctx || !voiceGain || voiceFallback) return;
  if (voiceNode && voiceNode.mediaStream === stream) return;
  try {
    if (voiceNode) voiceNode.disconnect();
    voiceNode = vctx.createMediaStreamSource(stream);
    remoteAn = vctx.createAnalyser(); remoteAn.fftSize = 512;
    voiceNode.connect(remoteAn);
    voiceNode.connect(voiceGain);          // главный путь — сразу, как у Телеграма
    voiceRoute = 'gain';
    remoteAudio.muted = true;              // элемент только «потребляет» поток
    if (vctx.state !== 'running') vctx.resume().catch(() => { });
  } catch (e) { voiceNode = null; remoteAn = null; voiceRoute = 'element'; remoteAudio.muted = false; }
}
function useElementRoute(stuck) {
  if (voiceNode && voiceRoute === 'gain') { try { voiceNode.disconnect(voiceGain); } catch (e) { } }
  voiceRoute = 'element';
  if (stuck) voiceFallback = true;
  remoteAudio.muted = false;
  playRemote();
}
setInterval(() => {
  if (outAn) outLevel = lvl(outAn);
  if (!remoteAn) return;
  remoteLevel = lvl(remoteAn);
  if (voiceRoute === 'gain') {
    const theySpeak = statsRemote > 0.02 || peerSpeaking;
    if (theySpeak && remoteLevel < 0.001) {
      if (!deafSince) deafSince = performance.now();
      else if (performance.now() - deafSince > 2000) useElementRoute(true);
    } else deafSince = 0;
  }
}, 200);
setInterval(() => { if (duckGain) applyDuck(); }, 300);
/* уровни прямо из соединения: работают на любом телефоне, без звукового движка */
setInterval(async () => {
  if (!pc || pc.iceConnectionState === 'closed') return;
  try {
    const st = await pc.getStats();
    st.forEach(r => {
      if (r.kind !== 'audio' || typeof r.audioLevel !== 'number') return;
      if (r.type === 'inbound-rtp') statsRemote = r.audioLevel;
      if (r.type === 'media-source') statsSelf = r.audioLevel;
    });
  } catch (e) { }
}, 400);
/* Айфон не даёт звучать входящему голосу без касания пользователя.
   Поэтому пробуем сразу, а если отказали — повторяем при первом же касании. */
let remoteBlocked = false;
function playRemote() {
  const a = document.querySelector('#remoteAudio');
  if (!a || !a.srcObject) return;
  // на своём регуляторе элемент молчит, но играет: иначе Chrome не отдаёт звук
  a.muted = voiceRoute === 'gain';
  const p = a.play();
  if (p && p.catch) p.then(() => { remoteBlocked = false; }).catch(() => { remoteBlocked = true; });
}
['touchend', 'click', 'keydown'].forEach(ev =>
  document.addEventListener(ev, () => { if (remoteBlocked) playRemote(); }, { passive: true }));
let pc = null, localStream = null, remoteAudio = $('#remoteAudio');
let makingOffer = false, polite = true, isInitiator = false;
let otherId = null, queuedSignals = [], gotRemote = false, stalled = 0;
let pendingCandidates = [], iceSent = 0, iceGot = 0, iceDropped = 0;
/* Сообщения по сети приходят пачкой, и каждое обрабатывается само по себе.
   Кандидат мог обогнать предложение — тогда браузер его отвергал, и связь
   оставалась без единой пары адресов. Поэтому обрабатываем строго по очереди. */
let signalChain = Promise.resolve();
function enqueueSignal(m) {
  signalChain = signalChain.then(() => onSignal(m)).catch(e => console.warn('сигнал', e));
  return signalChain;
}
let micOn = true, headphones = false, micError = null, selfLevel = 0;
/* Беззвучная дорожка-заглушка. Если микрофон не дали, соединение всё равно
   строится с ней, а когда доступ появится — она просто заменяется настоящей,
   без перезвона. Раньше без микрофона соединение собиралось кривым. */
function silentTrack() {
  try {
    const dst = actx.createMediaStreamDestination();
    const osc = actx.createOscillator(), g = actx.createGain();
    g.gain.value = 0; osc.connect(g).connect(dst); osc.start();
    return dst.stream.getAudioTracks()[0];
  } catch (e) { return null; }
}
let selfSpeaking = false, peerSpeaking = false;
let stats = { rtt: 0, loss: 0, jitter: 0 };

async function getMic() {
  const constraints = {
    audio: {
      // в наушниках эхоподавление только вредит голосу, без него звук шире
      // портит голос именно эхоподавление, поэтому в наушниках снимаем его
      // и автогромкость, а подавление шума оставляем — оно полезно всегда
      echoCancellation: !headphones,
      noiseSuppression: true,
      autoGainControl: !headphones,
      channelCount: 1
    }, video: false
  };
  const s = await navigator.mediaDevices.getUserMedia(constraints);
  micError = null;
  const track = s.getAudioTracks()[0];
  if (!track) throw Object.assign(new Error('no audio track'), { name: 'NoTrack' });
  track.enabled = micOn;
  if (pc) {
    // дорожка в соединении уже есть (настоящая или беззвучная заглушка) — меняем её
    const sender = pc.getSenders().find(x => x.track && x.track.kind === 'audio');
    if (sender) await sender.replaceTrack(track);
  }
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  localStream = s;
  watchLevel(s);
  if (vctx && !vctxAfterMic) ensureVoiceCtx(true);
  return s;
}

/* Первое предложение делает ровно один из двоих — тот, у кого меньше
   идентификатор. Так не бывает встречных предложений, а значит и тупика.
   Роль Мастера тут ни при чём: её можно передавать, не трогая связь. */
function setupPeer(peers) {
  const other = peers.find(p => p.id !== selfId);
  if (!other) return;
  otherId = other.id;
  isInitiator = selfId < otherId;
  polite = !isInitiator;
  if (!pc) makePeer();
}

function flushSignals() {
  const q = queuedSignals; queuedSignals = [];
  for (const m of q) enqueueSignal(m);
}

function makePeer() {
  pc = new RTCPeerConnection({ iceServers: cfg.iceServers, bundlePolicy: 'max-bundle' });
  gotRemote = false; stalled = 0; pendingCandidates = []; iceSent = iceGot = iceDropped = 0;

  const myTrack = localStream ? localStream.getAudioTracks()[0] : silentTrack();
  if (myTrack) pc.addTrack(myTrack, localStream || new MediaStream([myTrack]));

  /* Приём голоса собеседника — так, как это сделано в веб-версии Телеграма:
     поток в звуковой элемент, звук включён, playsinline, сразу play().
     Дорожка сначала приходит «немой» и оживает, когда реально пошли пакеты;
     в этот момент поток подключается к элементу заново и снова play() —
     это обход известной ошибки Safari, когда собеседника не слышно,
     хотя дорожка «живая» (отчёт WebKit 198545). К звуковому движку поток
     подключаем только после установки соединения: если раньше, узел
     навсегда выдаёт тишину. */
  pc.ontrack = e => {
    gotRemote = true;
    const stream = e.streams[0] || new MediaStream([e.track]);
    remoteStream = stream;
    voiceRoute = 'element';
    remoteAudio.srcObject = stream;
    remoteAudio.muted = false;
    remoteAudio.setAttribute('playsinline', 'true');
    remoteAudio.volume = +ui.voice.value / 100;
    playRemote();
    e.track.onunmute = () => {
      if (voiceRoute !== 'gain') { remoteAudio.srcObject = stream; remoteAudio.muted = false; }
      playRemote();
      if (connectedNow()) probeVoice(stream);
    };
    if (connectedNow()) probeVoice(stream);
  };
  pc.onicecandidate = e => {
    if (!e.candidate) return;
    iceSent++;
    ws.send(JSON.stringify({ type: 'signal', data: { candidate: e.candidate } }));
  };
  pc.onnegotiationneeded = async () => {
    if (!isInitiator) return;                  // отвечающая сторона предложений не шлёт
    try {
      makingOffer = true;
      await pc.setLocalDescription();
      ws.send(JSON.stringify({ type: 'signal', data: { description: pc.localDescription } }));
    } catch (e) { console.warn('предложение', e); } finally { makingOffer = false; }
  };
  pc.oniceconnectionstatechange = () => {
    if (connectedNow() && remoteStream && !voiceNode) probeVoice(remoteStream);
    if (pc.iceConnectionState === 'failed') { toast(t('toast.icefail')); pc.restartIce(); }
    if (pc.iceConnectionState === 'disconnected') setTimeout(() => {
      if (pc && pc.iceConnectionState === 'disconnected') pc.restartIce();
    }, 2500);
  };

  flushSignals();

  // ограничиваем голос: моно, немного, но стабильно
  setTimeout(async () => {
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
    if (!sender) return;
    const p = sender.getParameters();
    p.encodings = [{ maxBitrate: 40000, networkPriority: 'high', priority: 'high' }];
    try { await sender.setParameters(p); } catch (e) { }
  }, 500);
}

async function onSignal(m) {
  if (!pc) { queuedSignals.push(m); return; }
  const d = m.data;
  try {
    if (d.needOffer) {                              // собеседник просит повторить
      if (isInitiator) {
        await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
        ws.send(JSON.stringify({ type: 'signal', data: { description: pc.localDescription } }));
      }
      return;
    }
    if (d.description) {
      const collision = d.description.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
      if (collision) {
        if (!polite) return;                        // невежливая сторона своё предложение не бросает
        try { await pc.setLocalDescription({ type: 'rollback' }); } catch (e) { }
      }
      await pc.setRemoteDescription(d.description);
      // описание есть — теперь придержанные кандидаты можно отдать браузеру
      const held = pendingCandidates; pendingCandidates = [];
      for (const c of held) {
        try { await pc.addIceCandidate(c); iceGot++; } catch (e) { iceDropped++; }
      }
      if (d.description.type === 'offer') {
        await pc.setLocalDescription();
        ws.send(JSON.stringify({ type: 'signal', data: { description: pc.localDescription } }));
      }
    } else if (d.candidate) {
      if (!pc.remoteDescription || !pc.remoteDescription.type) { pendingCandidates.push(d.candidate); return; }
      try { await pc.addIceCandidate(d.candidate); iceGot++; } catch (e) { iceDropped++; }
    }
  } catch (e) { console.warn('сигналинг', e); }
}

/* Сторож: если через несколько секунд связь так и не сдвинулась,
   предложение отправляется заново. Дешевле, чем разбираться потом. */
setInterval(() => {
  if (!pc || !otherId || gotRemote) { stalled = 0; return; }
  stalled++;
  if (stalled < 5) return;
  stalled = 0;
  if (isInitiator) {
    pc.createOffer({ iceRestart: true })
      .then(o => pc.setLocalDescription(o))
      .then(() => ws.send(JSON.stringify({ type: 'signal', data: { description: pc.localDescription } })))
      .catch(() => { });
  } else {
    ws.send(JSON.stringify({ type: 'signal', data: { needOffer: true } }));
  }
}, 1000);

/* определяем, что человек говорит — по своему микрофону, а не по чужому потоку */
let levelTimer = null, levelSrc = null;
function watchLevel(stream) {
  initAudio();
  if (levelTimer) clearInterval(levelTimer);
  if (levelSrc) { try { levelSrc.disconnect(); } catch (e) { } }
  const src = levelSrc = actx.createMediaStreamSource(stream);
  const an = actx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const data = new Uint8Array(an.fftSize);
  let above = 0, below = 0;
  levelTimer = setInterval(() => {
    an.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
    const rms = Math.max(Math.sqrt(sum / data.length), statsSelf);
    selfLevel = rms;
    const loud = micOn && rms > 0.045;
    if (loud) { above++; below = 0; } else { below++; above = 0; }
    if (above === 2 && !selfSpeaking) setSelfSpeaking(true);
    if (below === 12 && selfSpeaking) setSelfSpeaking(false);
  }, 50);
}

function setSelfSpeaking(on) {
  selfSpeaking = on;
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'speaking', on }));
  applyDuck();
}

/* Насколько музыка отходит назад, когда кто-то говорит.
   0.72 — это примерно четверть громкости долой: слышно, но не провал. */
const DUCK = 0.72;

/* приглушение: когда кто-то говорит, музыка отходит на шаг назад */
function applyDuck() {
  const theyTalk = peerSpeaking || statsRemote > 0.04 || remoteLevel > 0.04;
  if (!duckGain) return;
  const on = selfSpeaking || theyTalk;
  duckGain.gain.setTargetAtTime(on ? DUCK : 1, actx.currentTime, on ? 0.06 : 0.25);
  ui.duck.classList.toggle('on', on);
}

/* ---------------- связь с сервером ---------------- */
let reconnectDelay = 500;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host);

  ws.onopen = () => {
    reconnectDelay = 500;
    ws.send(JSON.stringify({ type: 'hello', room: roomId, style: roomStyle, name: localStorage.getItem('pyr-name') || t('name.guest') }));
    for (let i = 0; i < 8; i++) setTimeout(ping, i * 120);   // быстрая первичная настройка часов
  };

  ws.onmessage = async ev => {
    const m = JSON.parse(ev.data);
    switch (m.type) {
      case 'pong': onPong(m); break;

      case 'welcome':
        selfId = m.selfId; masterId = m.masterId; tracks = m.tracks;
        if (m.state.style && m.state.style !== roomStyle) {
          roomStyle = m.state.style;
          if (document.body.classList.contains('in-room') && window.Scene.supported())
            if (!window.Scene.restyle(roomStyle)) { try { window.Scene.enter(roomStyle, $('#gl')); } catch (e) { noteError('3D: ' + e.message); } }
        }
        renderTracks(); renderRole(m.peers);
        m.chat.forEach(addChat);
        // голос поднимаем ДО загрузки трека: иначе предложение собеседника
        // придёт, пока мы качаем файл, и потеряется
        setupPeer(m.peers);
        if (m.state.trackId) {
          await loadTrack(m.state.trackId);
          if (m.state.playing) startAt(m.state.startAt, m.state.offset);
          else { serverOffset = m.state.offset; }
        }
        break;

      case 'peers':
        masterId = m.masterId;
        renderRole(m.peers);
        setupPeer(m.peers);
        break;

      case 'peer-left':
        if (pc) { pc.close(); pc = null; }
        remoteAudio.srcObject = null;
        if (voiceNode) { try { voiceNode.disconnect(); } catch (e) { } voiceNode = null; }
        remoteAn = null; voiceFallback = false; voiceRoute = 'element'; deafSince = 0; statsRemote = 0;
        queuedSignals = []; otherId = null; gotRemote = false;
        peerSpeaking = false; applyDuck();
        break;

      case 'note': addChat({ from: m.from || '', id: m.id, text: m.text, sys: true }); break;

      case 'style':
        roomStyle = m.style;
        if (window.Scene.supported() && !window.Scene.restyle(roomStyle))
          try { window.Scene.enter(roomStyle, $('#gl')); } catch (e) { noteError('3D: ' + e.message); }
        break;

      case 'signal': enqueueSignal(m); break;
      case 'tracks': tracks = m.tracks; renderTracks(); break;
      case 'load': await loadTrack(m.trackId); break;
      case 'play':
        if (!buffer || currentTrack?.id !== m.trackId) await loadTrack(m.trackId);
        startAt(m.startAt, m.offset);
        break;
      case 'paused':
        stopSource(); serverOffset = m.offset; pos = m.offset;
        setState(m.offset > 0.05 ? 'state.paused' : 'state.stopped');
        break;
      case 'speaking': peerSpeaking = m.on; applyDuck(); break;
      case 'chat': addChat(m.msg); break;
      case 'readyState': break;
    }
  };

  ws.onclose = () => {
    setState(reconnectDelay < 3000 ? 'state.lost' : 'state.waking');
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(8000, reconnectDelay * 1.7);
  };
}
setInterval(ping, 2000);

/* ---------------- интерфейс ---------------- */
/* Левая кнопка: медитации, демо и загрузки. Файлы, положенные в
   tracks/meditations на сервере, попадают в первую группу. */
function renderTracks() {
  if (!ui.libMenu) return;
  /* Каждая папка в tracks на сервере — своя группа. Добавили папку —
     она появилась здесь сама, ничего править не надо. */
  const order = [], byGroup = {};
  tracks.forEach(x => {
    const g = x.group || 'upload';
    if (!byGroup[g]) { byGroup[g] = []; order.push(g); }
    byGroup[g].push(x);
  });
  order.sort((a, b) => (b === 'upload') - (a === 'upload') || a.localeCompare(b));
  let html = '';
  if (!order.length) html = '<div class="mi empty">' + t('lib.empty') + '</div>';
  order.forEach(g => {
    const name = g === 'upload' ? t('lib.uploads') : g.replace(/[-_]/g, ' ');
    html += '<div class="gh">' + name + '</div>';
    byGroup[g].forEach(x => {
      const cur = currentTrack && x.id === currentTrack.id ? ' aria-current="true"' : '';
      if (x.bad) {
        html += '<div class="mi broken" title="' + t('bad.' + x.bad, { title: x.title }) + '">' + x.title +
          '<small>' + t('badshort.' + x.bad) + '</small></div>';
        return;
      }
      html += '<button class="mi" data-track="' + encodeURIComponent(x.id) + '"' + cur + '>' + x.title + '</button>';
    });
  });
  ui.libMenu.innerHTML = html;
  ui.libMenu.querySelectorAll('[data-track]').forEach(b => {
    b.onclick = () => {
      closeDrops(); closeLib();
      if (needMaster()) return;
      ws.send(JSON.stringify({ type: 'select', trackId: decodeURIComponent(b.dataset.track) }));
    };
  });
  if (ui.libCount) ui.libCount.textContent = tracks.length ? String(tracks.length) : '';
}

/* ---------- выпадающие меню ---------- */
function closeDrops() {
  document.querySelectorAll('.drop').forEach(d => d.classList.remove('open'));
  const u = $('#urlBox'); if (u) u.classList.remove('on');
}
function toggleDrop(el) {
  const open = el.classList.contains('open');
  closeDrops();
  if (!open) el.classList.add('open');
}
document.addEventListener('click', e => {
  const trigger = e.target.closest('[data-drop]');
  if (trigger) {
    if (trigger.dataset.drop === 'dropLib') { openLib(); return; }
    toggleDrop($('#' + trigger.dataset.drop)); return;
  }
  if (!e.target.closest('.menu')) closeDrops();
});
/* Фонотека открывается шторкой снизу на всю ширину, как в музыкальных
   плеерах: всё помещается, прокручивается и ничего не перекрывает. */
function openLib() {
  closeDrops();
  renderTracks();
  $('#libSheet').classList.add('on');
}
function closeLib() { $('#libSheet').classList.remove('on'); }
$('#libSheet').onclick = e => { if (e.target === $('#libSheet')) closeLib(); };
$('#libClose').onclick = closeLib;

function renderRole(peers) {
  isMaster = selfId === masterId;
  ui.rbRole.textContent = (isMaster ? t('role.master') : t('role.guest'))
    + ' · ' + (peers.length > 1 ? t('peers.two') : t('peers.alone'));
  ui.rbDot.classList.toggle('solo', peers.length < 2);
  document.body.classList.toggle('guest', !isMaster);
  ui.seek.disabled = !isMaster;
  ui.seek.disabled = !isMaster;
  ui.transfer.hidden = !(isMaster && peers.length > 1);
  ui.toRooms.hidden = !isMaster;
  requestAnimationFrame(fitBar);
}

function addChat(msg) {
  const d = document.createElement('div');
  // своё сообщение узнаём по номеру участника, а не по имени: имена могут совпасть
  const mine = msg.id ? msg.id === selfId : msg.from === (localStorage.getItem('pyr-name') || '');
  if (msg.sys) {
    d.className = 'bub sys';
    d.textContent = (msg.from ? msg.from + ': ' : '') + msg.text;
  } else {
    d.className = 'bub ' + (mine ? 'me' : 'them');
    if (!mine && msg.from) {
      const n = document.createElement('span');
      n.className = 'who'; n.textContent = msg.from;
      d.appendChild(n);
    }
    const tx = document.createElement('span');
    tx.textContent = msg.text;
    d.appendChild(tx);
  }
  const atBottom = ui.chat.scrollHeight - ui.chat.scrollTop - ui.chat.clientHeight < 30;
  ui.chat.appendChild(d);
  if (atBottom || mine) ui.chat.scrollTop = ui.chat.scrollHeight;
}

let toastT;
function toast(t) {
  const e = $('#toast'); e.textContent = t; e.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 2200);
}

let seeking = false;
ui.seek.addEventListener('input', () => { seeking = true; });
ui.seek.addEventListener('change', () => {
  seeking = false;
  if (!isMaster || !buffer) return;
  ws.send(JSON.stringify({ type: 'seek', offset: (ui.seek.value / 100) * buffer.duration }));
});

function needMaster() {
  if (isMaster) return false;
  toast(t('toast.masterleads'));
  return true;
}
/* Перемотка: если играет — двигаем и продолжаем, если стоит — просто
   переставляем метку, чтобы кнопка не заводила музыку исподтишка. */
function jump(sec) {
  if (needMaster() || !buffer) return;
  const from = musicPos();
  const to = Math.max(0, Math.min(buffer.duration - 0.2, from + sec));
  if (playing) ws.send(JSON.stringify({ type: 'seek', offset: to }));
  else ws.send(JSON.stringify({ type: 'pause', offset: to }));
}

ui.play.onclick = () => {
  if (needMaster()) return;
  if (playing) return;
  ws.send(JSON.stringify({ type: 'resume' }));
};
ui.pause.onclick = () => {
  if (needMaster() || !playing) return;
  ws.send(JSON.stringify({ type: 'pause', offset: musicPos() }));
};
ui.stop.onclick = () => {
  if (needMaster()) return;
  ws.send(JSON.stringify({ type: 'pause', offset: 0 }));
};
ui.back15.onclick = () => jump(-15);
ui.fwd15.onclick = () => jump(15);

/* кнопки гаснут, когда нажимать нечего */
setInterval(() => {
  const can = isMaster && !!buffer;
  ui.play.disabled = !can || playing;
  ui.pause.disabled = !can || !playing;
  ui.stop.disabled = !can;
  ui.back15.disabled = !can;
  ui.fwd15.disabled = !can;
}, 300);

ui.music.oninput = () => {
  if (musicGain) musicGain.gain.value = +ui.music.value / 100;
  $('#musicVal').textContent = ui.music.value;
};
ui.voice.oninput = () => {
  const v = +ui.voice.value / 100;
  remoteAudio.volume = v;
  if (voiceGain) voiceGain.gain.value = v;
  $('#voiceVal').textContent = ui.voice.value;
};

async function setMic(on) {
  if (on && (!localStream || micError)) {
    try { await getMic(); } catch (e) { micError = (e && e.name) || 'error'; toast(t('toast.micdenied')); return; }
  }
  if (micOn === on && !micError) { $('#micOn').classList.toggle('on', micOn); $('#micOff').classList.toggle('on', !micOn); return; }
  micOn = on;
  if (localStream) localStream.getAudioTracks().forEach(x => (x.enabled = micOn));
  $('#micOn').classList.toggle('on', micOn);
  $('#micOff').classList.toggle('on', !micOn);
  if (!micOn && selfSpeaking) setSelfSpeaking(false);
  toast(micOn ? t('toast.micon') : t('toast.micoff'));
}
$('#micOn').onclick = () => setMic(true);
$('#micOff').onclick = () => setMic(false);

/* громкость: нажатие раскрывает ползунок под строкой кнопок */
function toggleSlide(which) {
  const a = $('#' + which + 'Slide'), other = $(which === 'music' ? '#voiceSlide' : '#musicSlide');
  other.classList.remove('on');
  a.classList.toggle('on');
}
$('#musicBtn').onclick = e => { e.stopPropagation(); toggleSlide('music'); };
$('#voiceBtn').onclick = e => { e.stopPropagation(); toggleSlide('voice'); };
document.addEventListener('click', e => {
  if (e.target.closest('.pop') || e.target.closest('.vb')) return;
  document.querySelectorAll('.pop').forEach(p => p.classList.remove('on'));
});

function renderMode() {
  ui.hpSpk.classList.toggle('on', !headphones);
  ui.hpHp.classList.toggle('on', headphones);
}
async function setMode(hp) {
  if (headphones === hp) return;
  headphones = hp;
  renderMode();
  try { await getMic(); } catch (e) { }
  toast(headphones ? t('toast.headphones') : t('toast.speaker'));
}
ui.hpSpk.onclick = () => setMode(false);
ui.hpHp.onclick = () => setMode(true);

ui.lang.onchange = () => { lang = ui.lang.value; applyLang(); };

$('#miFile').onclick = () => { closeDrops(); $('#upload').click(); };
$('#miUrl').onclick = e => { e.stopPropagation(); $('#urlBox').classList.toggle('on'); $('#urlInput').focus(); };
$('#urlGo').onclick = async () => {
  const u = $('#urlInput').value.trim();
  if (!u) return;
  closeDrops(); $('#urlInput').value = ''; toast(t('toast.fetching'));
  try {
    const r = await fetch('/api/fetch?url=' + encodeURIComponent(u), { method: 'POST' });
    const txt = await r.text();
    if (!r.ok) return toast(t('toast.uploadfail', { e: txt }));
    const j = JSON.parse(txt);
    toast(t('toast.uploaded'));
    if (isMaster) ws.send(JSON.stringify({ type: 'select', trackId: j.id }));
  } catch (e) { toast(t('toast.uploaderr')); }
};

/* Полный выход: раньше глушилась только картинка, а музыка,
   микрофон и соединение с собеседником продолжали жить. */
ui.exit.onclick = () => {
  stopSource();
  buffer = null; currentTrack = null; playing = false;
  track = null;
  if (remoteAudio) { remoteAudio.pause(); remoteAudio.srcObject = null; }
  if (localStream) { localStream.getTracks().forEach(x => x.stop()); localStream = null; }
  if (voiceNode) { try { voiceNode.disconnect(); } catch (e) { } voiceNode = null; }
  remoteAn = null; voiceRoute = 'element'; voiceFallback = false;
  if (pc) { try { pc.close(); } catch (e) { } pc = null; }
  if (ws) { try { ws.onclose = null; ws.close(); } catch (e) { } ws = null; }
  if (actx) { try { actx.suspend(); } catch (e) { } }
  analyser = null; gotRemote = false; otherId = null; queuedSignals = [];
  window.Scene.dispose();
  ui.chat.innerHTML = '';
  history.replaceState(null, '', '/');
  showView('home');
  loadWeather();
};

ui.transfer.onclick = () => ws.send(JSON.stringify({ type: 'transfer' }));
$('#diagBtn').onclick = () => $('#diagSheet').classList.toggle('on');

function inviteLink() { return location.origin + '/?room=' + encodeURIComponent(roomId); }

ui.invite.onclick = () => {
  const link = inviteLink(), text = t('invite.text', { link });
  const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  // у Apple разделитель в ссылке sms другой, иначе текст просто не подставится
  $('#optSms').href = 'sms:' + (isApple ? '&' : '?') + 'body=' + encodeURIComponent(text);
  $('#optMail').href = 'mailto:?subject=' + encodeURIComponent(t('invite.subject')) + '&body=' + encodeURIComponent(text);
  $('#optWa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
  $('#inviteBack').classList.add('on');
};
$('#optCopy').onclick = async () => {
  const link = inviteLink();
  try { await navigator.clipboard.writeText(link); toast(t('toast.copied')); }
  catch (e) { prompt('', link); }
  $('#inviteBack').classList.remove('on');
};
$('#optClose').onclick = () => $('#inviteBack').classList.remove('on');
$('#inviteBack').onclick = e => { if (e.target === $('#inviteBack')) $('#inviteBack').classList.remove('on'); };
['#optSms', '#optMail', '#optWa'].forEach(id => {
  $(id).addEventListener('click', () => setTimeout(() => $('#inviteBack').classList.remove('on'), 300));
});

$('#chatSend').onclick = e => {
  e.stopPropagation();
  if (!ui.chatInput.value.trim()) return;
  ws.send(JSON.stringify({ type: 'chat', text: ui.chatInput.value.trim() }));
  ui.chatInput.value = '';
};
ui.chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') $('#chatSend').click();
});

ui.upload.onchange = () => {
  const f = ui.upload.files[0];
  if (!f) return;
  if (f.size > 80e6) return toast(t('toast.uploadbig'));
  // XHR, а не fetch: только он показывает ход загрузки на телефоне
  const x = new XMLHttpRequest();
  x.open('POST', '/api/upload?name=' + encodeURIComponent(f.name));
  x.upload.onprogress = e => {
    if (e.lengthComputable) toast(t('toast.uploading', { p: Math.round(e.loaded / e.total * 100) }));
  };
  x.onload = () => {
    if (x.status !== 200) return toast(t('toast.uploadfail', { e: x.responseText || x.status }));
    let j; try { j = JSON.parse(x.responseText); } catch (e) { return toast(t('toast.oddanswer')); }
    toast(t('toast.uploaded'));
    if (isMaster) ws.send(JSON.stringify({ type: 'select', trackId: j.id }));
  };
  x.onerror = () => toast(t('toast.uploaderr'));
  x.send(f);
  ui.upload.value = '';
};

/* ---------------- диагностика ---------------- */
let checkingSince = 0;
function voiceVerdict() {
  if (!pc) return '—';
  const st = pc.iceConnectionState;
  if (st === 'checking') { if (!checkingSince) checkingSince = Date.now(); }
  else checkingSince = 0;
  if (st === 'connected' || st === 'completed')
    return remoteBlocked ? t('diag.v_tap') : t('diag.v_ok');
  if (st === 'failed' || (checkingSince && Date.now() - checkingSince > 12000))
    return cfg.hasTurn ? t('diag.v_failturn') : t('diag.v_needturn');
  return t('diag.v_wait');
}
setInterval(async () => {
  if (pc) {
    try {
      const s = await pc.getStats();
      s.forEach(r => {
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null)
          stats.rtt = Math.round(r.currentRoundTripTime * 1000);
        if (r.type === 'inbound-rtp' && r.kind === 'audio') {
          stats.jitter = Math.round((r.jitter || 0) * 1000);
          stats.loss = r.packetsLost || 0;
        }
      });
    } catch (e) { }
  }
  const rows = [
    [t('diag.clock'), (clock.offset >= 0 ? '+' : '') + Math.round(clock.offset) + ' ms, ' + t('diag.round') + ' ' + clock.rtt + ' ms'],
    [t('diag.drift'), (drift * 1000).toFixed(1) + ' ms'],
    [t('diag.corr'), corrections + ', ' + t('diag.resets') + ' ' + hardResyncs],
    [t('diag.voice'), pc ? (pc.iceConnectionState + ', ' + t('diag.round') + ' ' + stats.rtt + ' ms, ' + t('diag.jitter') + ' ' + stats.jitter + ' ms, ' + t('diag.loss') + ' ' + stats.loss) : t('diag.nopeer')],
    [t('diag.relay'), cfg.hasTurn ? t('diag.relayon') : t('diag.relayoff')],
    [t('diag.verdict'), voiceVerdict()],
    [t('diag.ice'), !pc ? '—' : (t('diag.sent') + ' ' + iceSent + ', ' + t('diag.got') + ' ' + iceGot
        + (iceDropped ? ', ' + t('diag.rejected') + ' ' + iceDropped : '')
        + (pendingCandidates.length ? ', ' + t('diag.holding') + ' ' + pendingCandidates.length : ''))],
    [t('diag.stream'), !pc ? '—' : (gotRemote ? (remoteAudio.paused ? t('diag.streamsilent') : t('diag.streamplays')) : t('diag.streamnone'))],
    [t('diag.me'), pc ? (isInitiator ? t('diag.calling') : t('diag.answering')) : '—'],
    [t('diag.aec'), headphones ? t('diag.aecoff') : t('diag.aecon')],
    [t('diag.mymic'), micError ? t('diag.mic_denied') : !localStream ? '—' : !micOn ? t('diag.mic_off') : t('diag.mic_level') + ' ' + Math.round(selfLevel * 300) + '%'],
    [t('diag.musicstate'), !buffer ? '—' : musicBlocked ? t('diag.m_blocked') : (!playing ? t('diag.m_paused') : t('diag.m_playing')) +
      (track && !track.whole && sched[0] ? ', ' + t('diag.chunk') + ' ' + (sched[sched.length - 1].k + 1) + '/' + track.plan.length : '') + ', ' + t('diag.stalls') + ' ' + stalls],
    [t('diag.voicepath'), !gotRemote ? '—' : voiceRoute === 'gain'
      ? t('diag.vp_gain') + ': ' + t('diag.vp_in') + ' ' + Math.round(remoteLevel * 300) + '%, ' + t('diag.vp_out') + ' ' + Math.round(outLevel * 300) + '%'
      : t('diag.vp_el') + ', ' + t('diag.vp_net') + ' ' + Math.round(statsRemote * 300) + '%'],
    [t('diag.level'), Math.round(lastLevel * 100) + '%' + (window.Scene.supported() ? ', ' + window.Scene.fps() + ' fps' : '')],
    [t('diag.errors'), errLog.length ? errLog.slice(-3).join(' · ') : '—']
  ];
  ui.diag.innerHTML = rows.map(r => '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
}, 1000);

/* Фон главной — настоящий мрамор, тем же генератором, что и стены комнат.
   Рисуется один раз, лежит картинкой и медленно плывёт. */
/* Фон главной и грани логотипа — тот же камень, испечённый видеокартой.
   Считается один раз за доли секунды, картинок не скачивается. */
/* Картинку камня для логотипа печёт видеокарта. Айфон при самом первом
   обращении к ней иногда отдаёт пустую, почти чёрную картинку — отсюда
   чёрный логотип на миг при первом входе. Теперь картинка проверяется,
   и если она тёмная — ставится зелёная заглушка и через полсекунды повтор. */
function looksEmpty(cv) {
  try {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 64) { sum += d[i] + d[i + 1] + d[i + 2]; n++; }
    return sum / n < 12;
  } catch (e) { return false; }
}
function goodImage(kind, w, h) {
  const c = window.Scene.image(kind, w, h);
  return c && !looksEmpty(c) ? c : null;
}
let artTries = 0;
function paintMarbleArt() {
  if (!window.Scene || !window.Scene.supported()) return;
  const probe = goodImage('green', 32, 32);
  if (!probe) { if (++artTries < 4) setTimeout(paintMarbleArt, 600); return; }
  const hero = $('#heroMarble');
  const img = goodImage('green', 512, 384);
  if (hero && img) {
    hero.width = 512; hero.height = 384;
    hero.getContext('2d').drawImage(img, 0, 0);
  }
  const small = goodImage('green', 128, 200);
  if (small) {
    const url = small.toDataURL();
    document.querySelectorAll('.pyr .face').forEach(f => {
      f.style.backgroundImage = 'url(' + url + ')';
      f.style.backgroundSize = 'cover';
    });
  }
  [['bgPyr', 'green'], ['bgGld', 'gold'], ['bgSlv', 'silver']].forEach(p => {
    const el = $('#' + p[0]);
    const c = goodImage(p[1], 256, 240);
    if (el && c) { el.style.backgroundImage = 'url(' + c.toDataURL() + ')'; el.style.backgroundSize = 'cover'; }
  });
}

/* блоки появляются при прокрутке */
function watchReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(i => i.classList.add('seen'));
    return;
  }
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); } });
  }, { threshold: .15 });
  items.forEach(i => io.observe(i));
}

/* логотип слегка ведёт за курсором */
(function () {
  const L = $('#heroLogo');
  if (!L) return;
  addEventListener('pointermove', e => {
    if (document.body.classList.contains('in-room')) return;
    const x = (e.clientX / innerWidth - .5) * 16, y = (e.clientY / innerHeight - .5) * 10;
    L.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
  });
})();

/* Верхняя строка всегда в одну линию. Если подписи не влезают, они
   превращаются в значки по одной: передача роли, приглашение, комната, выход. */
function fitBar() {
  const bar = document.querySelector('#roomBar');
  if (!bar || !document.body.classList.contains('in-room')) return;
  bar.classList.remove('c0', 'c1', 'c2', 'c3');
  const steps = ['c0', 'c1', 'c2', 'c3'];
  for (let i = 0; i < steps.length && bar.scrollWidth > bar.clientWidth + 1; i++) bar.classList.add(steps[i]);
}
addEventListener('resize', () => requestAnimationFrame(fitBar));

/* ---------------- экраны ---------------- */
function showView(name) {
  ['Home', 'Room'].forEach(function (v) {
    $('#view' + v).classList.toggle('on', v.toLowerCase() === name);
  });
  const inRoom = name === 'room';
  document.body.classList.toggle('in-room', inRoom);
  ui.toRooms.hidden = !(inRoom && isMaster);
  ui.invite.hidden = !inRoom;
  ui.transfer.hidden = true;
  if (!inRoom) window.Scene.dispose();
  else requestAnimationFrame(fitBar);
  window.scrollTo(0, 0);
}

/* Анализатор висит на выходе музыки: стены разгораются от того же звука,
   который слышит человек, а не от выдуманного ритма. */
let analyser = null, levelData = null, lastLevel = 0;
function attachAnalyser() {
  if (!actx || analyser) return;
  analyser = actx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = .75;
  duckGain.connect(analyser);          // ветка только на замер, в динамики не идёт
  levelData = new Uint8Array(analyser.fftSize);
}
setInterval(() => {
  if (!analyser || !window.Scene) return;
  analyser.getByteTimeDomainData(levelData);
  let sum = 0;
  for (let i = 0; i < levelData.length; i++) { const v = (levelData[i] - 128) / 128; sum += v * v; }
  const rms = Math.sqrt(sum / levelData.length);
  lastLevel = Math.min(1, rms * 3.6);
  window.Scene.setLevel(lastLevel);
  window.Scene.setPlaying(playing);
}, 60);

async function enterRoom(style) {
  roomStyle = style || roomStyle;
  if (!roomId) roomId = Math.random().toString(36).slice(2, 8);
  history.replaceState(null, '', '/?room=' + roomId);
  showView('room');
  // графика не должна тянуть за собой звук: если 3D не поднялось, комната работает без неё
  if (window.Scene.supported()) {
    try { if (!window.Scene.enter(roomStyle, $('#gl'))) noteError(t('toast.no3d')); }
    catch (e) { noteError('3D: ' + e.message); }
  }
  attachAnalyser();
  if (ws && ws.readyState === 1) {
    if (isMaster) ws.send(JSON.stringify({ type: 'style', style: roomStyle }));
  } else if (!ws) {
    connect();
  }
}

/* Из комнаты «другая комната» ведёт на главную, к тем же трём пирамидам */
/* Смена камня на лету: сцена не разбирается, музыка играет,
   гость остаётся на месте — меняются только стены. */
function renderStylePop() {
  const grid = $('#spGrid');
  if (!grid || !window.Scene.supported()) return;
  grid.innerHTML = '';
  window.Scene.list().forEach(k => {
    const b = document.createElement('button');
    b.className = 'sp-item';
    b.dataset.pick = k;
    if (k === roomStyle) b.setAttribute('aria-current', 'true');
    const img = window.Scene.image(k, 96, 92);
    b.innerHTML = '<span class="sp-tri"' + (img ? ' style="background-image:url(' + img.toDataURL() + ')"' : '') +
      '></span><span>' + t('room.' + k) + '</span>';
    b.onclick = () => {
      $('#stylePop').classList.remove('on');
      if (k === roomStyle) return;
      roomStyle = k;
      window.Scene.restyle(k);
      if (isMaster && ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'style', style: k }));
      renderStylePop();
    };
    grid.appendChild(b);
  });
}
ui.toRooms.onclick = () => {
  if (!isMaster) return;
  renderStylePop();
  $('#spTitle').textContent = t('home.rooms');
  $('#stylePop').classList.add('on');
};
$('#stylePop').onclick = e => { if (e.target === $('#stylePop')) $('#stylePop').classList.remove('on'); };

let pendingStyle = 'green';
async function startRoom(style) {
  pendingStyle = style || pendingStyle || 'green';
  if (localStorage.getItem('pyr-name')) { await unlock(); enterRoom(pendingStyle); }
  else { $('#gate').classList.remove('gone'); $('#name').focus(); }
}
document.querySelectorAll('[data-style]').forEach(b => { b.onclick = () => startRoom(b.dataset.style); });
$('#enterTop').onclick = () => startRoom('green');
ui.goRooms.onclick = e => { e.preventDefault(); startRoom('green'); };

/* ---------------- вход ---------------- */
/* Порядок важен. Айфон при включении микрофона перестраивает весь звук
   телефона под режим звонка. Звуковой движок, созданный ДО этого, потом
   получает голоса пустыми (микрофон 0%, голос 0%) и выводит музыку
   с перебоями. Поэтому сначала микрофон, и только потом движок.
   Пока микрофон включён, айфон разрешает звуку играть и без нового касания. */
async function unlock() {
  /* На iOS 17+ можно прямо сказать Safari, что это звонок, — иначе он угадывает
     режим сам и может увести звук в разговорный динамик у уха. */
  try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) { }
  blessMusic();                       // разрешение музыкального элемента — сразу, в касании
  try { const a = document.querySelector('#remoteAudio'); a.muted = true; a.play().catch(() => { }); } catch (e) { }
  const name = $('#name').value.trim() || t('name.guest');
  localStorage.setItem('pyr-name', name);
  try { await getMic(); }
  catch (e) { micError = (e && e.name) || 'error'; toast(t('gate.nomic')); }
  initAudio();                        // если движок уже создан замером микрофона — ничего не делает
  try { await actx.resume(); } catch (e) { }
  if (musicGain) musicGain.gain.value = +ui.music.value / 100;
  if (localStream && !levelTimer) watchLevel(localStream);
  ensureVoiceCtx();
  attachAnalyser();
  try { cfg = await (await fetch('/api/config')).json(); } catch (e) { }
}

$('#enter').onclick = async () => {
  $('#gate').classList.add('gone');
  await unlock();
  if (!roomId) roomId = Math.random().toString(36).slice(2, 8);
  // выбор пирамиды всегда главнее: раньше застрявший в адресе номер комнаты
  // заставлял открывать гамму по умолчанию
  enterRoom(pendingStyle);
};

const askedRoom = new URL(location).searchParams.get('room');
const invitedDirectly = !!askedRoom;
roomId = askedRoom || null;
if (invitedDirectly) pendingStyle = roomStyle;

window.LANGS.forEach(l => {
  const o = document.createElement('option');
  o.value = l.code; o.textContent = l.name;
  if (l.code === lang) o.selected = true;
  ui.lang.appendChild(o);
});
$('#name').value = localStorage.getItem('pyr-name') || '';
applyLang();
setTimeout(paintMarbleArt, 250);
watchReveal();
addEventListener('scroll', () => {
  const top = document.querySelector('.top');
  if (top) top.classList.toggle('solid', scrollY > 24);
}, { passive: true });
loadWeather();
if (!invitedDirectly) $('#gate').classList.add('gone');
setInterval(renderToday, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderToday(); });

/* Окошко для самопроверки: только чтение состояния и отправка команды.
   Им пользуется автоматический тест, на работу приложения не влияет. */
window.__pyr = {
  state: () => ({
    voiceGain: voiceGain ? voiceGain.gain.value : null,
    voiceFallback, selfId, micOn, micError: micError || null, voiceRoute, selfLevel,
    actxState: actx ? actx.state : null, vctxState: vctx ? vctx.state : null, ownVoiceCtx: !!vctx && vctx !== actx, muted: remoteAudio.muted, stalls,
    musicPos: musicPos(), expected: playing ? expectedPos() : null, chunks: track && track.chunks ? track.chunks.size : 0, sched: sched.length,
    schedInfo: sched.map(x => ({ k: x.k, from: x.from, start: x.startCtx })), lastScore: track ? track.lastScore : null,
    sr: actx ? actx.sampleRate : null, playing, drift, hardResyncs, audioSession: navigator.audioSession ? navigator.audioSession.type : null
  }),
  send: m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); },
  setPeerSpeaking: v => { peerSpeaking = v; },
  setMic: on => setMic(on)
};
