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
window.addEventListener('error', e => {
  const box = document.querySelector('#toast');
  if (!box) return;
  box.textContent = '⚠ ' + (e.message || 'ошибка');
  box.classList.add('on');
  setTimeout(() => box.classList.remove('on'), 6000);
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
  mic: $('#micBtn'), chatBox: $('#chatBox'), rbRole: $('#rbRole'), rbDot: $('#rbDot'),
  libMenu: $('#libMenu'), libLbl: $('#libLbl'), addLbl: $('#addLbl'),
  exit: $('#exitBtn'), micKnob: $('#micBtn')
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
  $('#exitLbl').textContent = t('btn.exit');
  ui.hpSpk.title = t('mode.speaker');
  ui.hpHp.title = t('mode.headphones');
  $('#musicBtn').title = t('vol.music');
  $('#voiceBtn').title = t('vol.voice');
  $('#micBtn').title = t('vol.voice');
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
  $('#quotesH').textContent = t('home.quotesH');
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
    var tag = x.when === 'today' ? t('day.today') : x.when === 'soon' ? t('day.soon') : t('day.fun');
    return '<div><span class="tag">' + tag + '</span><span>' + x.text + '</span></div>';
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
let actx = null, musicGain = null, duckGain = null;
let buffer = null, source = null;
let startCtx = 0, posAtStart = 0, lastCtx = 0, pos = 0, rate = 1;
let playing = false, serverStartAt = 0, serverOffset = 0;
let drift = 0, corrections = 0, hardResyncs = 0;

function initAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
  musicGain = actx.createGain();
  duckGain = actx.createGain();
  musicGain.gain.value = +ui.music.value / 100;
  duckGain.gain.value = 1;
  musicGain.connect(duckGain).connect(actx.destination);
}

async function loadTrack(trackId) {
  const tr = tracks.find(x => x.id === trackId);
  if (!tr) return;
  currentTrack = tr;
  ui.title.textContent = tr.title;
  setState('state.loading');
  stopSource();
  buffer = null;
  try {
    const res = await fetch(tr.url);
    if (!res.ok) throw new Error('файл не отдался');
    const bytes = await res.arrayBuffer();
    buffer = await actx.decodeAudioData(bytes);
  } catch (e) {
    buffer = null;
    setState('state.badformat');
    toast(t('toast.badformat'));
    ws.send(JSON.stringify({ type: 'note', text: t('note.badformat', { title: tr.title }) }));
    return;
  }
  setState('state.ready');
  ws.send(JSON.stringify({ type: 'ready', trackId }));
}

function stopSource() {
  if (source) { try { source.stop(); } catch (e) { } source.disconnect(); source = null; }
  playing = false;
}

/* завести буфер так, чтобы позиция совпала с общим временем */
function startAt(startAtServer, offset) {
  if (!buffer) return;
  stopSource();
  serverStartAt = startAtServer; serverOffset = offset;
  const lead = (startAtServer - now()) / 1000;
  source = actx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = 1;
  source.connect(musicGain);
  let when, off;
  if (lead > 0.02) { when = actx.currentTime + lead; off = offset; }
  else { when = actx.currentTime + 0.02; off = offset - lead + 0.02; }  // опоздали — стартуем дальше по треку
  if (off >= buffer.duration) return;
  source.start(when, off);
  startCtx = when; posAtStart = off; lastCtx = when; pos = off; rate = 1;
  playing = true;
  setState('state.playing');
  source.onended = () => { if (playing && pos >= buffer.duration - 0.3) { playing = false; setState('state.ended'); } };
}

/* Задержка вывода у каждого устройства своя: у Мака одна, у телефона другая.
   Выравнивать надо то, что слышно, поэтому каждый забегает вперёд ровно
   на свою задержку. Это убирает постоянный сдвиг в несколько миллисекунд. */
function outLatency() {
  if (!actx) return 0;
  return actx.outputLatency || actx.baseLatency || 0;
}
function expectedPos() {
  return serverOffset + (now() - serverStartAt) / 1000 + outLatency();
}

/* каждые 250 мс: считаем расхождение и правим темпом, а не рывком */
setInterval(() => {
  if (!playing || !source || !buffer) return;
  const t = actx.currentTime;
  pos += (t - lastCtx) * rate;
  lastCtx = t;
  const exp = expectedPos();
  drift = pos - exp;

  if (Math.abs(drift) > 0.25) {
    hardResyncs++;
    startAt(now() + 120, exp + 0.12);           // разошлись сильно — перезаводим
  } else if (Math.abs(drift) > 0.007) {
    corrections++;
    rate = Math.max(0.98, Math.min(1.02, 1 - drift * 0.4));
    source.playbackRate.setTargetAtTime(rate, actx.currentTime, 0.08);
  } else if (rate !== 1) {
    rate = 1;
    source.playbackRate.setTargetAtTime(1, actx.currentTime, 0.1);
  }
}, 250);

/* полоса прокрутки и время */
setInterval(() => {
  var c = $('#tClock');
  if (c) c.textContent = new Date().toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  if (!buffer) return;
  const p = playing ? pos : serverOffset;
  if (!seeking) ui.seek.value = Math.min(100, (p / buffer.duration) * 100);
  ui.cur.textContent = fmt(p);
  ui.rem.textContent = '−' + fmt(buffer.duration - p);
}, 200);

/* ---------------- 3. голос ---------------- */
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
let micOn = true, headphones = false;
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
  if (localStream && pc) {
    const sender = pc.getSenders().find(x => x.track && x.track.kind === 'audio');
    if (sender) await sender.replaceTrack(s.getAudioTracks()[0]);
    localStream.getTracks().forEach(t => t.stop());
  }
  localStream = s;
  watchLevel(s);
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

  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.ontrack = e => {
    gotRemote = true;
    remoteAudio.srcObject = e.streams[0];
    remoteAudio.volume = +ui.voice.value / 100;
    remoteAudio.play().catch(() => { });
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
function watchLevel(stream) {
  initAudio();
  const src = actx.createMediaStreamSource(stream);
  const an = actx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const data = new Uint8Array(an.fftSize);
  let above = 0, below = 0;
  setInterval(() => {
    an.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / data.length);
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
  if (!duckGain) return;
  const on = selfSpeaking || peerSpeaking;
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
            if (!window.Scene.restyle(roomStyle)) window.Scene.enter(roomStyle, $('#gl'));
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
        queuedSignals = []; otherId = null; gotRemote = false;
        peerSpeaking = false; applyDuck();
        break;

      case 'note': addChat({ from: '', text: m.text, sys: true }); break;

      case 'style':
        roomStyle = m.style;
        if (window.Scene.supported() && !window.Scene.restyle(roomStyle))
          window.Scene.enter(roomStyle, $('#gl'));
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
  const groups = [
    { key: 'lib.meditations', items: tracks.filter(x => x.group === 'meditation') },
    { key: 'lib.demos', items: tracks.filter(x => x.group === 'demo') },
    { key: 'lib.uploads', items: tracks.filter(x => x.group === 'upload') }
  ];
  let html = '';
  groups.forEach(g => {
    if (!g.items.length && g.key !== 'lib.meditations') return;
    html += '<div class="gh">' + t(g.key) + '</div>';
    if (!g.items.length) { html += '<div class="mi empty">' + t('lib.nomeditations') + '</div>'; return; }
    g.items.forEach(x => {
      const cur = currentTrack && x.id === currentTrack.id ? ' aria-current="true"' : '';
      html += '<button class="mi" data-track="' + encodeURIComponent(x.id) + '"' + cur + '>' + x.title + '</button>';
    });
  });
  ui.libMenu.innerHTML = html;
  ui.libMenu.querySelectorAll('[data-track]').forEach(b => {
    b.onclick = () => {
      closeDrops();
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
  if (trigger) { toggleDrop($('#' + trigger.dataset.drop)); return; }
  if (!e.target.closest('.menu')) closeDrops();
});

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
}

function addChat(msg) {
  const d = document.createElement('div');
  const mine = msg.from === (localStorage.getItem('pyr-name') || '');
  d.className = 'bub ' + (msg.sys ? 'sys' : mine ? 'me' : 'them');
  d.textContent = msg.sys ? msg.text : msg.text;
  ui.chat.appendChild(d);
  ui.chat.scrollTop = ui.chat.scrollHeight;
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
  const from = playing ? pos : serverOffset;
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
  ws.send(JSON.stringify({ type: 'pause', offset: pos }));
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
  remoteAudio.volume = +ui.voice.value / 100;
  $('#voiceVal').textContent = ui.voice.value;
};

ui.mic.onclick = () => {
  micOn = !micOn;
  if (localStream) localStream.getAudioTracks().forEach(x => (x.enabled = micOn));
  ui.mic.setAttribute('aria-checked', micOn ? 'true' : 'false');
  ui.mic.querySelector('.mknob').innerHTML = $(micOn ? '#icMic' : '#icMicOff').innerHTML;
  ui.mic.title = micOn ? t('mic.live') : t('mic.muted');
  if (!micOn && selfSpeaking) setSelfSpeaking(false);
  toast(micOn ? t('toast.micon') : t('toast.micoff'));
};

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

ui.exit.onclick = () => {
  window.Scene.dispose();
  if (ws) { try { ws.onclose = null; ws.close(); } catch (e) { } ws = null; }
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
    [t('diag.ice'), !pc ? '—' : (t('diag.sent') + ' ' + iceSent + ', ' + t('diag.got') + ' ' + iceGot
        + (iceDropped ? ', ' + t('diag.rejected') + ' ' + iceDropped : '')
        + (pendingCandidates.length ? ', ' + t('diag.holding') + ' ' + pendingCandidates.length : ''))],
    [t('diag.stream'), !pc ? '—' : (gotRemote ? (remoteAudio.paused ? t('diag.streamsilent') : t('diag.streamplays')) : t('diag.streamnone'))],
    [t('diag.me'), pc ? (isInitiator ? t('diag.calling') : t('diag.answering')) : '—'],
    [t('diag.aec'), headphones ? t('diag.aecoff') : t('diag.aecon')],
    [t('diag.level'), Math.round(lastLevel * 100) + '%' + (window.Scene.supported() ? ', ' + window.Scene.fps() + ' fps' : '')]
  ];
  ui.diag.innerHTML = rows.map(r => '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
}, 1000);

/* Фон главной — настоящий мрамор, тем же генератором, что и стены комнат.
   Рисуется один раз, лежит картинкой и медленно плывёт. */
/* Фон главной и грани логотипа — тот же камень, испечённый видеокартой.
   Считается один раз за доли секунды, картинок не скачивается. */
function paintMarbleArt() {
  if (!window.Scene || !window.Scene.supported()) return;
  const hero = $('#heroMarble');
  const img = window.Scene.image('green', 512, 384);
  if (hero && img) {
    hero.width = 512; hero.height = 384;
    hero.getContext('2d').drawImage(img, 0, 0);
  }
  const small = window.Scene.image('green', 128, 200);
  if (small) {
    const url = small.toDataURL();
    document.querySelectorAll('.pyr .face').forEach(f => {
      f.style.backgroundImage = 'url(' + url + ')';
      f.style.backgroundSize = 'cover';
    });
  }
  [['bgPyr', 'green'], ['bgGld', 'gold'], ['bgSlv', 'silver']].forEach(p => {
    const el = $('#' + p[0]);
    const c = window.Scene.image(p[1], 256, 240);
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
  if (window.Scene.supported()) window.Scene.enter(roomStyle, $('#gl'));
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

/* ---------------- вход ---------------- */
async function unlock() {
  const name = $('#name').value.trim() || t('name.guest');
  localStorage.setItem('pyr-name', name);
  try {
    initAudio();
    await actx.resume();
    await getMic();
  } catch (e) {
    toast(t('gate.nomic'));
  }
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
paintMarbleArt();
watchReveal();
addEventListener('scroll', () => {
  const top = document.querySelector('.top');
  if (top) top.classList.toggle('solid', scrollY > 24);
}, { passive: true });
loadWeather();
if (!invitedDirectly) $('#gate').classList.add('gone');
setInterval(renderToday, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderToday(); });
