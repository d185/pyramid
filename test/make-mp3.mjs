import * as L from '@breezystack/lamejs';
import fs from 'fs';
const lame = L.default || L;
function mp3(file, sec, freq) {
  const rate = 44100, enc = new lame.Mp3Encoder(1, rate, 128), n = rate * sec, s = new Int16Array(n);
  for (let i = 0; i < n; i++) s[i] = Math.sin(2 * Math.PI * freq * i / rate) * 8000;
  const out = [];
  for (let i = 0; i < n; i += 1152) { const b = enc.encodeBuffer(s.subarray(i, i + 1152)); if (b.length) out.push(Buffer.from(b)); }
  out.push(Buffer.from(enc.flush()));
  fs.writeFileSync(file, Buffer.concat(out));
}
fs.mkdirSync('real/meditations', { recursive: true });
mp3('real/meditations/Full Moon.mp3', 20, 220);
mp3('real/meditations/Утро.mp3', 12, 330);
for (const f of fs.readdirSync('real/meditations'))
  console.log(f, '—', fs.statSync('real/meditations/' + f).size, 'байт, начало', fs.readFileSync('real/meditations/' + f).slice(0, 2).toString('hex'));
