/* 75 секунд «музыки»: несколько плывущих тонов и шум — не периодично, как настоящая музыка */
import * as L from '@breezystack/lamejs'; import fs from 'fs';
const lame = L.default || L, rate = 44100, sec = +process.argv[2] || 75, n = rate * sec;
const enc = new lame.Mp3Encoder(2, rate, 160);
const l = new Int16Array(n), r = new Int16Array(n);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
let p1 = 0, p2 = 0, p3 = 0;
for (let i = 0; i < n; i++) {
  const t = i / rate;
  p1 += 2 * Math.PI * (220 + 40 * Math.sin(t * 0.37)) / rate;
  p2 += 2 * Math.PI * (330 + 55 * Math.sin(t * 0.23 + 1)) / rate;
  p3 += 2 * Math.PI * (523 + 70 * Math.sin(t * 0.61 + 2)) / rate;
  const env = 0.6 + 0.4 * Math.sin(t * 1.3);
  const s = (Math.sin(p1) * 0.35 + Math.sin(p2) * 0.25 * env + Math.sin(p3) * 0.15 + rnd() * 0.08);
  l[i] = s * 12000; r[i] = (s * 0.8 + Math.sin(p2 * 1.5) * 0.1) * 12000;
}
const out = [];
for (let i = 0; i < n; i += 1152) { const b = enc.encodeBuffer(l.subarray(i, i + 1152), r.subarray(i, i + 1152)); if (b.length) out.push(Buffer.from(b)); }
out.push(Buffer.from(enc.flush()));
fs.mkdirSync('real/meditations', { recursive: true });
const name = process.argv[3] || 'Long Track';
fs.writeFileSync('real/meditations/' + name + '.mp3', Buffer.concat(out));
console.log(name + ':', sec, 'с,', fs.statSync('real/meditations/' + name + '.mp3').size, 'байт');
