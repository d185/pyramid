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
const fmt = s => (s < 0 ? '0:00' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'));

const ui = {
  title: $('#title'), state: $('#state'), seek: $('#seek'), cur: $('#cur'), rem: $('#rem'),
  play: $('#play'), tracks: $('#tracks'), chat: $('#chat'), chatInput: $('#chatInput'),
  mic: $('#mic'), music: $('#music'), voice: $('#voice'), role: $('#role'),
  peers: $('#peers'), duck: $('#duck'), diag: $('#diag'), invite: $('#invite'),
  transfer: $('#transfer'), headphones: $('#headphones'), upload: $('#upload')
};

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
  const t = tracks.find(x => x.id === trackId);
  if (!t) return;
  currentTrack = t;
  ui.title.textContent = t.title;
  ui.state.textContent = 'загружаю';
  stopSource();
  buffer = null;
  const res = await fetch(t.url);
  const bytes = await res.arrayBuffer();
  buffer = await actx.decodeAudioData(bytes);
  ui.state.textContent = 'готов, жду второго';
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
  ui.play.textContent = '❚❚';
  ui.state.textContent = 'играет';
  source.onended = () => { if (playing && pos >= buffer.duration - 0.3) { playing = false; ui.play.textContent = '▶'; ui.state.textContent = 'кончился'; } };
}

/* ожидаемая позиция по общим часам */
function expectedPos() {
  return serverOffset + (now() - serverStartAt) / 1000;
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
  } else if (Math.abs(drift) > 0.004) {
    corrections++;
    rate = Math.max(0.97, Math.min(1.03, 1 - drift * 0.6));
    source.playbackRate.setTargetAtTime(rate, actx.currentTime, 0.08);
  } else if (rate !== 1) {
    rate = 1;
    source.playbackRate.setTargetAtTime(1, actx.currentTime, 0.1);
  }
}, 250);

/* полоса прокрутки и время */
setInterval(() => {
  if (!buffer) return;
  const p = playing ? pos : serverOffset;
  if (!seeking) ui.seek.value = Math.min(100, (p / buffer.duration) * 100);
  ui.cur.textContent = fmt(p);
  ui.rem.textContent = '−' + fmt(buffer.duration - p);
}, 200);

/* ---------------- 3. голос ---------------- */
let pc = null, localStream = null, remoteAudio = $('#remoteAudio');
let makingOffer = false, ignoreOffer = false, polite = true;
let micOn = true, headphones = false;
let selfSpeaking = false, peerSpeaking = false;
let stats = { rtt: 0, loss: 0, jitter: 0 };

async function getMic() {
  const constraints = {
    audio: {
      // в наушниках эхоподавление только вредит голосу, без него звук шире
      echoCancellation: !headphones,
      noiseSuppression: !headphones,
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

function makePeer() {
  pc = new RTCPeerConnection({ iceServers: cfg.iceServers, bundlePolicy: 'max-bundle' });

  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.ontrack = e => {
    remoteAudio.srcObject = e.streams[0];
    remoteAudio.volume = +ui.voice.value / 100;
    remoteAudio.play().catch(() => { });
  };
  pc.onicecandidate = e => {
    if (e.candidate) ws.send(JSON.stringify({ type: 'signal', data: { candidate: e.candidate } }));
  };
  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true;
      await pc.setLocalDescription();
      ws.send(JSON.stringify({ type: 'signal', data: { description: pc.localDescription } }));
    } catch (e) { console.warn(e); } finally { makingOffer = false; }
  };
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed') { toast('Связь просела, поднимаю заново'); pc.restartIce(); }
    if (pc.iceConnectionState === 'disconnected') setTimeout(() => {
      if (pc && pc.iceConnectionState === 'disconnected') pc.restartIce();
    }, 2500);
  };

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
  if (!pc) return;
  const d = m.data;
  try {
    if (d.description) {
      const offerCollision = d.description.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
      ignoreOffer = !polite && offerCollision;
      if (ignoreOffer) return;
      await pc.setRemoteDescription(d.description);
      if (d.description.type === 'offer') {
        await pc.setLocalDescription();
        ws.send(JSON.stringify({ type: 'signal', data: { description: pc.localDescription } }));
      }
    } else if (d.candidate) {
      try { await pc.addIceCandidate(d.candidate); } catch (e) { if (!ignoreOffer) throw e; }
    }
  } catch (e) { console.warn('сигналинг', e); }
}

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

/* приглушение: когда кто-то говорит, музыка отходит на шаг назад */
function applyDuck() {
  if (!duckGain) return;
  const on = selfSpeaking || peerSpeaking;
  duckGain.gain.setTargetAtTime(on ? 0.45 : 1, actx.currentTime, on ? 0.06 : 0.25);
  ui.duck.classList.toggle('on', on);
}

/* ---------------- связь с сервером ---------------- */
let reconnectDelay = 500;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host);

  ws.onopen = () => {
    reconnectDelay = 500;
    ws.send(JSON.stringify({ type: 'hello', room: roomId, name: localStorage.getItem('pyr-name') || 'Гость' }));
    for (let i = 0; i < 8; i++) setTimeout(ping, i * 120);   // быстрая первичная настройка часов
  };

  ws.onmessage = async ev => {
    const m = JSON.parse(ev.data);
    switch (m.type) {
      case 'pong': onPong(m); break;

      case 'welcome':
        selfId = m.selfId; masterId = m.masterId; tracks = m.tracks;
        polite = selfId !== m.masterId;                    // Мастер ведёт переговоры, гость уступает
        renderTracks(); renderRole(m.peers);
        m.chat.forEach(addChat);
        if (m.state.trackId) {
          await loadTrack(m.state.trackId);
          if (m.state.playing) startAt(m.state.startAt, m.state.offset);
          else { serverOffset = m.state.offset; }
        }
        if (m.peers.length > 1 && !pc) { makePeer(); }
        break;

      case 'peers':
        masterId = m.masterId;
        polite = selfId !== masterId;
        renderRole(m.peers);
        if (m.peers.length > 1 && !pc) makePeer();
        break;

      case 'peer-left':
        if (pc) { pc.close(); pc = null; }
        remoteAudio.srcObject = null;
        peerSpeaking = false; applyDuck();
        break;

      case 'signal': onSignal(m); break;
      case 'tracks': tracks = m.tracks; renderTracks(); break;
      case 'load': await loadTrack(m.trackId); break;
      case 'play':
        if (!buffer || currentTrack?.id !== m.trackId) await loadTrack(m.trackId);
        startAt(m.startAt, m.offset);
        break;
      case 'paused':
        stopSource(); serverOffset = m.offset; pos = m.offset;
        ui.play.textContent = '▶'; ui.state.textContent = 'пауза';
        break;
      case 'speaking': peerSpeaking = m.on; applyDuck(); break;
      case 'chat': addChat(m.msg); break;
      case 'readyState': break;
    }
  };

  ws.onclose = () => {
    ui.state.textContent = reconnectDelay < 3000
      ? 'связь потеряна, соединяюсь заново'
      : 'сервер просыпается, это занимает до минуты';
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(8000, reconnectDelay * 1.7);
  };
}
setInterval(ping, 2000);

/* ---------------- интерфейс ---------------- */
function renderTracks() {
  ui.tracks.innerHTML = '';
  tracks.forEach(t => {
    const b = document.createElement('button');
    b.className = 'item';
    b.innerHTML = '<span class="art"></span><span class="cap">' + t.title + '</span>';
    if (currentTrack && t.id === currentTrack.id) b.setAttribute('aria-current', 'true');
    b.onclick = () => {
      if (!isMaster) return toast('Музыку ведёт Мастер');
      ws.send(JSON.stringify({ type: 'select', trackId: t.id }));
    };
    ui.tracks.appendChild(b);
  });
}

function renderRole(peers) {
  isMaster = selfId === masterId;
  ui.role.textContent = isMaster ? 'Вы Мастер' : 'Вы Гость — музыку ведёт Мастер';
  ui.peers.textContent = peers.length > 1 ? 'в комнате двое' : 'вы один, ждём гостя';
  document.body.classList.toggle('guest', !isMaster);
  ui.seek.disabled = !isMaster;
  ui.transfer.style.display = isMaster && peers.length > 1 ? '' : 'none';
}

function addChat(msg) {
  const d = document.createElement('div');
  d.className = 'msg';
  d.innerHTML = '<b>' + msg.from + ':</b> ' + msg.text.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
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

ui.play.onclick = () => {
  if (!isMaster) return toast('Музыку ведёт Мастер');
  if (playing) ws.send(JSON.stringify({ type: 'pause', offset: pos }));
  else ws.send(JSON.stringify({ type: 'resume' }));
};

ui.music.oninput = () => { if (musicGain) musicGain.gain.value = +ui.music.value / 100; };
ui.voice.oninput = () => { remoteAudio.volume = +ui.voice.value / 100; };

ui.mic.onclick = () => {
  micOn = !micOn;
  if (localStream) localStream.getAudioTracks().forEach(t => (t.enabled = micOn));
  ui.mic.setAttribute('aria-pressed', micOn ? 'true' : 'false');
  if (!micOn && selfSpeaking) setSelfSpeaking(false);
  toast(micOn ? 'Микрофон включён' : 'Микрофон выключен — музыка в полном качестве');
};

ui.headphones.onclick = async () => {
  headphones = !headphones;
  ui.headphones.setAttribute('aria-pressed', headphones ? 'true' : 'false');
  ui.headphones.textContent = headphones ? 'Я в наушниках' : 'Я на динамике';
  try { await getMic(); } catch (e) { }
  toast(headphones ? 'Эхоподавление выключено, голос шире' : 'Эхоподавление включено');
};

ui.transfer.onclick = () => ws.send(JSON.stringify({ type: 'transfer' }));

ui.invite.onclick = async () => {
  const link = location.origin + '/?room=' + encodeURIComponent(roomId);
  try { await navigator.clipboard.writeText(link); toast('Ссылка скопирована'); }
  catch (e) { prompt('Ссылка для гостя', link); }
};

ui.chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && ui.chatInput.value.trim()) {
    ws.send(JSON.stringify({ type: 'chat', text: ui.chatInput.value.trim() }));
    ui.chatInput.value = '';
  }
});

ui.upload.onchange = async () => {
  const f = ui.upload.files[0];
  if (!f) return;
  toast('Загружаю ' + f.name);
  const r = await fetch('/api/upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f });
  const j = await r.json();
  toast('Готово, трек в списке');
  if (isMaster) ws.send(JSON.stringify({ type: 'select', trackId: j.id }));
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
    ['часы с сервером', (clock.offset >= 0 ? '+' : '') + Math.round(clock.offset) + ' мс, круг ' + clock.rtt + ' мс'],
    ['расхождение музыки', (drift * 1000).toFixed(1) + ' мс'],
    ['правок темпа', corrections + ', перезаводов ' + hardResyncs],
    ['голос', pc ? (pc.iceConnectionState + ', круг ' + stats.rtt + ' мс, дрожание ' + stats.jitter + ' мс, потери ' + stats.loss) : 'нет собеседника'],
    ['эхоподавление', headphones ? 'выключено (наушники)' : 'включено (динамик)']
  ];
  ui.diag.innerHTML = rows.map(r => '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
}, 1000);

/* ---------------- вход ---------------- */
$('#enter').onclick = async () => {
  const name = $('#name').value.trim() || 'Гость';
  localStorage.setItem('pyr-name', name);
  try {
    initAudio();
    await actx.resume();
    await getMic();
  } catch (e) {
    toast('Без микрофона голосовая связь не поднимется');
  }
  $('#gate').classList.add('gone');
  fetch('/api/config').then(r => r.json()).then(c => { cfg = c; connect(); });
};

roomId = new URL(location).searchParams.get('room') || Math.random().toString(36).slice(2, 8);
history.replaceState(null, '', '/?room=' + roomId);
$('#roomName').textContent = roomId;
