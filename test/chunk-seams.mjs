import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { MPEGDecoder } = require('mpg123-decoder');
const C = require('../public/chunker.js');
const bytes = new Uint8Array(fs.readFileSync('real/meditations/Long Track.mp3'));
const p = C.parse(bytes);
console.log('кадров', p.frames, '| частота', p.sampleRate, '| длительность', p.duration.toFixed(1), 'с');

async function decode(u8) { const d = new MPEGDecoder(); await d.ready; const r = d.decode(u8); d.free(); return r.channelData; }
const ref0 = C.mono(await decode(bytes));

/* имитация браузеров: задержка расшифровщика — разная у первого куска и у остальных */
for (const [name, d0, dmid] of [['без задержки', 0, 0], ['как Chrome (529/529)', 529, 529], ['разные задержки (1105/529)', 1105, 529]]) {
  const pad = (a, n) => { const o = new Float32Array(a.length + n); o.set(a, n); return o; };
  const ref = pad(ref0, d0);
  const PRE = 40, plan = C.plan(p, 20, PRE), spf = p.spf;
  const parts = [];
  for (const c of plan) {
    const dec = C.mono(await decode(C.slice(p, c.from, c.to)));
    parts.push({ c, buf: pad(dec, c.k === 0 ? d0 : dmid), start: 0 });
  }
  /* где начинается каждый кусок — по совпадению звука с предыдущим */
  const scores = [];
  for (let k = 1; k < parts.length; k++) {
    const prev = parts[k - 1], next = parts[k];
    const expect = (next.c.from - prev.c.from) * spf + (k === 1 ? dmid - d0 : 0) * 0;   // ожидание без знания задержек
    const j0 = (PRE - 20) * spf;
    const r = C.align(prev.buf, next.buf, j0, expect, 3000);
    next.start = prev.start + r.lag; scores.push(r.score.toFixed(3));
  }
  /* склейка с плавным переходом 15 мс */
  const F = Math.round(0.015 * p.sampleRate), out = new Float32Array(ref.length + 4096);
  let maxSeam = 0;
  for (let k = 0; k < parts.length; k++) {
    const P = parts[k], S0 = k === 0 ? 0 : P.start + (PRE - 8) * spf;                  // откуда играет этот кусок
    const S1 = k + 1 < parts.length ? parts[k + 1].start + (PRE - 8) * spf : P.start + P.buf.length;
    /* переход [S, S+F): старый кусок гаснет, новый нарастает — в одном и том же месте */
    for (let t = S0; t < Math.min(S1 + F, P.start + P.buf.length); t++) {
      const v = P.buf[t - P.start]; if (v === undefined || t < 0 || t >= out.length) continue;
      let w = 1;
      if (k && t < S0 + F) w = (t - S0) / F;                       // вход
      if (k + 1 < parts.length && t >= S1) w = 1 - (t - S1) / F;   // выход
      out[t] += v * w;
    }
  }
  /* насколько склейка отличается от расшифровки целиком */
  let maxErr = 0, at = 0;
  for (let t = 0; t < Math.min(ref.length, p.frames * spf - 2000); t++) { const e = Math.abs(out[t] - ref[t]); if (e > maxErr) { maxErr = e; at = t; } }
  let peak = 0; for (const v of ref) peak = Math.max(peak, Math.abs(v));
  console.log(name.padEnd(28), 'кусков', parts.length, '| совпадение на стыках', scores.join(' '),
    '| наибольшее отличие от целого', (maxErr / peak * 100).toFixed(3) + '% громкости', 'на', (at / p.sampleRate).toFixed(2), 'с');
}
