"""Настоящая проверка: два браузера Chromium, настоящий WebRTC, настоящий (тестовый)
микрофон и настоящая расшифровка mp3. В отличие от test/two-browsers.js, соединение
здесь не имитируется — ловятся ошибки, которые видны только в живом браузере.

  python3 test/real-webrtc.py            (нужны: playwright для python, node)
Сервер запускается сам; треки берутся из TRACKS_FROM (по умолчанию ./real/meditations).
"""
import os, sys, time, json, shutil, subprocess, glob, wave, struct, math, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PORT = int(os.environ.get('PORT', '8070'))
BASE = 'http://localhost:%d' % PORT
FROM = os.environ.get('TRACKS_FROM', '/home/claude/real/meditations')
results = []

def ok(name, cond, note=''):
    results.append(bool(cond))
    print(('✓ ' if cond else '✗ ') + name + (' — ' + str(note) if note != '' else ''), flush=True)

def wait(fn, timeout=20, step=0.25):
    t = time.time()
    while time.time() - t < timeout:
        try:
            v = fn()
            if v: return v
        except Exception:
            pass
        time.sleep(step)
    return None

HOOK = """
(() => {
  window.__pcs = [];
  const O = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...a) { const pc = new O(...a); window.__pcs.push(pc); return pc; };
  window.RTCPeerConnection.prototype = O.prototype;
  window.RTCPeerConnection.generateCertificate = O.generateCertificate;
  window.__errs = [];
  addEventListener('error', e => window.__errs.push(String(e.message)));
  addEventListener('unhandledrejection', e => window.__errs.push('rej: ' + (e.reason && e.reason.message || e.reason)));
  localStorage.setItem('pyr-name', NAME);
})();
"""

STATS = """
async () => {
  const live = (window.__pcs || []).filter(p => p.signalingState !== 'closed');
  const pc = live[live.length - 1];
  if (!pc) return null;
  const o = { ice: pc.iceConnectionState, n: live.length };
  (await pc.getStats()).forEach(r => {
    if (r.type === 'inbound-rtp' && r.kind === 'audio') { o.inPackets = r.packetsReceived; o.inEnergy = r.totalAudioEnergy || 0; o.inLost = r.packetsLost; }
    if (r.type === 'outbound-rtp' && r.kind === 'audio') o.outPackets = r.packetsSent;
  });
  return o;
}
"""

RECV = """() => { const a = document.querySelector('#remoteAudio'); const st = a.srcObject;
  return { paused: a.paused, muted: a.muted, ready: a.readyState, vol: a.volume,
           tracks: st ? st.getAudioTracks().map(t => ({ muted: t.muted, state: t.readyState, enabled: t.enabled })) : 'нет потока' }; }"""

def S(p): return p.evaluate("window.__pyr.state()")

def dump(p, who):
    st = S(p)
    print('   ┌ подробности (%s): путь %s | узел %s | собств. движок голоса %s | движки %s/%s | регулятор %s | уровень по статистике %.3f | инициатор: %s' % (
        who, st['voiceRoute'], st['hasVoiceNode'], st['ownVoiceCtx'], st['actxState'], st['vctxState'], st['voiceGain'], st['statsRemote'] or 0, st['selfId'] < (st['otherId'] or '')))
    print('   └ звуковой элемент:', p.evaluate(RECV))

def hears(p, seconds=5):
    """Слышит ли эта сторона собеседника: растёт ли энергия входящего звука и виден ли он в регуляторе."""
    a = p.evaluate(STATS); peak = 0.0; end = time.time() + seconds
    while time.time() < end:
        peak = max(peak, S(p)['remoteLevel'] or 0); time.sleep(0.2)
    b = p.evaluate(STATS)
    return a, b, peak

def make_tone(path):
    """Речеподобный сигнал: слоги по ~4 Гц, гармоники, плавающий тон. Ровную синусоиду
    шумоподавление Chromium принимает за шум и гасит — уровень падал бы со временем."""
    import random; random.seed(7)
    sr, secs = 48000, 12
    out = []
    ph = 0.0
    for i in range(sr * secs):
        tt = i / sr
        syl = (tt * 4) % 1.0
        env = math.sin(math.pi * syl / 0.62) ** 2 if syl < 0.62 else 0.0
        f0 = 130 + 40 * math.sin(2 * math.pi * 0.7 * tt) + 25 * math.sin(2 * math.pi * 3.1 * tt)
        ph += 2 * math.pi * f0 / sr
        v = sum(math.sin(k * ph) / k ** 0.8 for k in range(1, 14)) / 3.2
        v = v * env * 0.5 + random.uniform(-0.01, 0.01)
        out.append(struct.pack('<h', int(max(-1, min(1, v)) * 30000)))
    w = wave.open(path, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes(b''.join(out)); w.close()

def listen_both(M, G, seconds=5):
    """Обе стороны слушаем в одно и то же время: порядок замеров не влияет на результат."""
    res = {'M': [0, 0, 0.0, 0.0, 0], 'G': [0, 0, 0.0, 0.0, 0]}   # n, звучало, пик до, пик после, пакетов/с
    end = time.time() + seconds
    while time.time() < end:
        for k, p in (('M', M), ('G', G)):
            st = S(p); r = st['remoteLevel'] or 0; o = st['outLevel'] or 0; x = res[k]
            x[0] += 1; x[1] += r > 0.008; x[2] = max(x[2], r); x[3] = max(x[3], o)
        time.sleep(0.2)
    return res

def pair(br, tone, room=None):
    def mk(name):
        c = br.new_context(permissions=['microphone'], viewport={'width': 420, 'height': 860})
        c.add_init_script(HOOK.replace('NAME', json.dumps(name)))
        pg = c.new_page(); pg.on('pageerror', lambda e: print('   [pageerror]', str(e)[:140])); return c, pg
    cm, M = mk('Мастер'); cg, G = mk('Гость')
    M.goto(BASE + '/'); M.wait_for_function('window.__pyr'); M.click('[data-style="green"]')
    room = wait(lambda: M.evaluate("new URL(location).searchParams.get('room')"), 10)
    G.goto(BASE + '/?room=' + room); G.wait_for_function('window.__pyr'); G.click('#enter')
    both = wait(lambda: (M.evaluate(STATS) or {}).get('ice') in ('connected', 'completed') and
                        (G.evaluate(STATS) or {}).get('ice') in ('connected', 'completed'), 25)
    return cm, M, cg, G, room, both

def voice_both_ways(M, G, tag):
    res = listen_both(M, G, 5)
    for who, p, k in (('гость слышит Мастера', G, 'G'), ('Мастер слышит гостя', M, 'M')):
        n, act, pin, pout, _ = res[k]; st = S(p)
        # слоги идут с паузами, поэтому «звучало» — хотя бы пятая часть замеров
        good = act / max(n, 1) >= 0.2 and pin > 0.02 and st['voiceRoute'] == 'gain' and pout > 0.005
        ok('%s%s' % (tag, who), good, 'звучало %.0f%% замеров, пик до регулятора %.2f, после %.2f, путь %s' % (
            act / max(n, 1) * 100, pin, pout, st['voiceRoute']))
        if not good: dump(p, who)


def long_track(M):
    tr = json.loads(M.evaluate("fetch('/api/tracks').then(r => r.text())"))
    return next((x for x in tr if x['title'] == 'Long Track'), None)

def scenarios(br, tone):
    # --- регулятор оглох, а пакеты идут: голос не должен пропасть ---
    c1, M, c2, G, rm, both = pair(br, tone)
    ok('оглохший регулятор: соединение', both)
    wait(lambda: S(G)['voiceRoute'] == 'gain', 10)
    G.evaluate('window.__pyr.breakEngine()')
    deadline = time.time() + 14
    while time.time() < deadline and S(G)['voiceRoute'] != 'element':
        G.evaluate('window.__pyr.setPeerSpeaking(true)'); time.sleep(0.3)
    st = S(G)
    ok('регулятор оглох — голос вернулся на звуковой элемент', st['voiceRoute'] == 'element' and not st['muted'],
       'путь %s, элемент %s' % (st['voiceRoute'], 'немой' if st['muted'] else 'звучит'))
    c1.close(); c2.close()

    # --- у Мастера оборвалась связь на секунду: роль его, гость остаётся ---
    c1, M, c2, G, rm, both = pair(br, tone)
    t_ = long_track(M)
    if t_: M.evaluate("id => window.__pyr.send({ type: 'select', trackId: id })", t_['id'])
    wait(lambda: S(M)['playing'] and S(G)['playing'], 15)
    M.evaluate('window.__pyr.closeSocket()')
    ok('связь Мастера мигнула — музыка у гостя встала', wait(lambda: not S(G)['playing'], 4), 'играет: %s' % S(G)['playing'])
    ok('Мастер вернулся и снова Мастер', wait(lambda: S(M)['isMaster'] and S(M)['view'] == 'room', 8))
    time.sleep(1.5)
    ok('гость остался в комнате', S(G)['view'] == 'room', S(G)['view'])
    c1.close(); c2.close()

    # --- Мастер пропал совсем (вкладку убили): после ожидания гость уходит на главную ---
    c1, M, c2, G, rm, both = pair(br, tone)
    if t_: M.evaluate("id => window.__pyr.send({ type: 'select', trackId: id })", t_['id'])
    wait(lambda: S(M)['playing'] and S(G)['playing'], 15)
    t0 = time.time(); c1.close()
    ok('Мастер пропал — музыка у гостя встала сразу', wait(lambda: not S(G)['playing'], 4), '%.1f с' % (time.time() - t0))
    ok('Мастер не вернулся — гость сам ушёл на главную', wait(lambda: S(G)['view'] == 'home', 10), '%.1f с, экран: %s' % (time.time() - t0, S(G)['view']))
    c2.close()

def main():
    tdir = os.path.join(ROOT, 'tracks', 'meditations'); os.makedirs(tdir, exist_ok=True)
    for f in glob.glob(os.path.join(FROM, '*.mp3')): shutil.copy(f, tdir)
    env = dict(os.environ, PORT=str(PORT), MASTER_GRACE_MS='4000')
    srv = subprocess.Popen(['node', 'server.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        if not wait(lambda: subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', BASE + '/'], capture_output=True).stdout == b'200', 15):
            print('сервер не поднялся'); return 1
        with sync_playwright() as pw:
            tone = os.path.join(tempfile.gettempdir(), 'pyr-tone.wav'); make_tone(tone)
            br = pw.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
                                          '--use-file-for-fake-audio-capture=' + tone,
                                          '--autoplay-policy=no-user-gesture-required', '--no-sandbox'])
            for i in range(int(os.environ.get('ROUNDS', '3'))):
                c1, A, c2, B, rm, both = pair(br, tone)
                ok('раунд %d: соединение у обоих' % (i + 1), both)
                time.sleep(1.5); voice_both_ways(A, B, 'раунд %d: ' % (i + 1))
                c1.close(); c2.close()
            if os.environ.get('SKIP_FLOW') == '1':
                br.close(); print('\nИТОГ: %d из %d' % (sum(results), len(results))); return 0 if all(results) else 1
            def mk(name):
                c = br.new_context(permissions=['microphone'], viewport={'width': 420, 'height': 860})
                c.add_init_script(HOOK.replace('NAME', json.dumps(name)))
                return c, c.new_page()
            cm, M = mk('Мастер'); cg, G = mk('Гость')
            for p in (M, G): p.on('pageerror', lambda e, n=p: print('   [pageerror]', str(e)[:140]))

            # ---- вход ----
            M.goto(BASE + '/'); M.wait_for_function('window.__pyr')
            M.click('[data-style="green"]')
            room = wait(lambda: M.evaluate("new URL(location).searchParams.get('room')"), 10)
            ok('Мастер вошёл в комнату', bool(room) and S(M)['view'] == 'room', room)
            G.goto(BASE + '/?room=' + room); G.wait_for_function('window.__pyr')
            G.click('#enter')
            ok('гость вошёл по ссылке', wait(lambda: S(G)['view'] == 'room', 10) and wait(lambda: S(G)['masterId'], 5) is not None)
            ok('роли: Мастер — Мастер, гость — гость', wait(lambda: S(M)['isMaster'] and not S(G)['isMaster'], 5))

            # ---- голос ----
            conn = wait(lambda: (M.evaluate(STATS) or {}).get('ice') in ('connected', 'completed') and
                                (G.evaluate(STATS) or {}).get('ice') in ('connected', 'completed'), 25)
            ok('соединение установлено у обоих', conn, 'Мастер %s, гость %s' % ((M.evaluate(STATS) or {}).get('ice'), (G.evaluate(STATS) or {}).get('ice')))
            time.sleep(1.5)
            voice_both_ways(M, G, '')

            # ---- музыка у обоих, настоящим расшифровщиком Chromium ----
            tr = json.loads(M.evaluate("fetch('/api/tracks').then(r => r.text())"))
            long_ = next((t for t in tr if t['title'] == 'Long Track'), None)
            if long_:
                M.evaluate("id => window.__pyr.send({ type: 'select', trackId: id })", long_['id'])
                ok('музыка заиграла у обоих', wait(lambda: S(M)['playing'] and S(G)['playing'], 15),
                   'Мастер %s, гость %s' % (S(M)['playing'], S(G)['playing']))
                time.sleep(3)
                d = abs(S(M)['musicPos'] - S(G)['musicPos'])
                ok('Мастер и гость звучат синхронно', d < 0.06, '%.0f мс' % (d * 1000))
                ok('голос не пропал, пока играет музыка', (G.evaluate(STATS) or {}).get('ice') in ('connected', 'completed'))

            # ---- выход Мастера ----
            if os.environ.get('SKIP_LEAVE') != '1':
                M.click('#exitBtn')
                ok('Мастер вышел — гость сразу на главной странице', wait(lambda: S(G)['view'] == 'home', 6),
                   'экран гостя: ' + S(G)['view'])
                ok('у гостя музыка остановилась', not S(G)['playing'])
                ok('у гостя нет «призрачной» комнаты на сервере', wait(
                    lambda: json.loads(subprocess.run(['curl', '-s', BASE + '/api/rooms'], capture_output=True).stdout or b'{"rooms":0}').get('rooms', 0) == 0, 4) is not None)

            scenarios(br, tone)
            for n, p in (('Мастера', M), ('гостя', G)):
                errs = p.evaluate('window.__errs')
                ok('нет ошибок в консоли ' + n, not errs, errs[:2])
            br.close()
    finally:
        srv.terminate()
        shutil.rmtree(os.path.join(ROOT, 'tracks'), ignore_errors=True)
    print('\nИТОГ: %d из %d' % (sum(results), len(results)))
    return 0 if all(results) else 1

if __name__ == '__main__':
    sys.exit(main())
