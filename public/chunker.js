/* Нарезка mp3 на куски и бесшовная склейка.

   Зачем. На айфоне музыка, пропущенная через звуковой движок способом
   createMediaElementSource, трещит и прерывается — это давняя ошибка WebKit
   (отчёты 211394, 215314, 221553). Надёжный путь — расшифровывать звук самим
   и играть буферами. Но целиком получасовой трек занимает в памяти больше
   600 МБ, и айфон падает. Поэтому расшифровываем по кускам в 20 секунд.

   Сложность. У mp3 на стыке кусков бывает сдвиг: расшифровщик добавляет
   задержку, а первые кадры куска без предыстории портятся. И у каждого
   браузера задержка своя. Поэтому каждый кусок захватывает перед собой
   секунду «разгона», а точный стык ищется по совпадению самого звука
   в общей части двух кусков. */
(function (root) {
  'use strict';

  var BITRATES = {
    // [версия][слой][индекс] — только слой III, он и есть mp3
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
  };
  var RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };

  function frameAt(u8, i) {
    if (i + 4 > u8.length) return null;
    if (u8[i] !== 0xFF || (u8[i + 1] & 0xE0) !== 0xE0) return null;
    var vbits = (u8[i + 1] >> 3) & 3, layer = (u8[i + 1] >> 1) & 3;
    if (vbits === 1 || layer !== 1) return null;           // только MPEG слой III
    var ver = vbits === 3 ? 1 : vbits === 2 ? 2 : 25;
    var bi = (u8[i + 2] >> 4) & 15, ri = (u8[i + 2] >> 2) & 3, pad = (u8[i + 2] >> 1) & 1;
    if (bi === 0 || bi === 15 || ri === 3) return null;
    var br = BITRATES[ver === 1 ? 1 : 2][bi] * 1000, sr = RATES[ver][ri];
    var spf = ver === 1 ? 1152 : 576;
    var len = Math.floor((spf / 8) * br / sr) + pad;
    if (len < 24) return null;
    return { len: len, sr: sr, spf: spf };
  }

  /* Разбор файла: где начинается каждый кадр */
  function parse(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var i = 0;
    if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) {     // тег ID3v2
      var size = ((u8[6] & 127) << 21) | ((u8[7] & 127) << 14) | ((u8[8] & 127) << 7) | (u8[9] & 127);
      i = 10 + size + ((u8[5] & 0x10) ? 10 : 0);
    }
    var offs = [], sr = 0, spf = 0, guard = 0;
    while (i < u8.length - 4) {
      var f = frameAt(u8, i);
      // кадр признаём, только если за ним сразу идёт следующий: так не спутаем с мусором
      if (f && (i + f.len >= u8.length - 4 || frameAt(u8, i + f.len))) {
        if (!sr) { sr = f.sr; spf = f.spf; }
        offs.push(i);
        i += f.len;
      } else {
        i++;
        if (++guard > 1e6 && !offs.length) break;
      }
    }
    if (!offs.length) return null;
    offs.push(Math.min(i, u8.length));                      // конец последнего кадра
    return { u8: u8, offs: offs, frames: offs.length - 1, sampleRate: sr, spf: spf,
             duration: (offs.length - 1) * spf / sr };
  }

  /* Байты кадров [f0, f1) — готовый маленький mp3 для расшифровки */
  function slice(p, f0, f1) {
    f0 = Math.max(0, f0); f1 = Math.min(p.frames, f1);
    return p.u8.slice(p.offs[f0], p.offs[f1]);
  }

  /* План кусков: каждый кусок захватывает PRE кадров «разгона» перед собой */
  function plan(p, chunkSec, preFrames) {
    var n = Math.max(1, Math.round(chunkSec * p.sampleRate / p.spf));
    var out = [];
    for (var k = 0; k * n < p.frames; k++) {
      var core0 = k * n, core1 = Math.min(p.frames, (k + 1) * n);
      out.push({ k: k, core0: core0, core1: core1, from: k === 0 ? 0 : Math.max(0, core0 - preFrames), to: core1 });
    }
    return out;
  }

  function mono(buf) {                                      // buf: массив каналов Float32Array
    if (buf.length === 1) return buf[0];
    var a = buf[0], b = buf[1], m = new Float32Array(a.length);
    for (var i = 0; i < a.length; i++) m[i] = (a[i] + b[i]) * 0.5;
    return m;
  }

  /* Найти сдвиг: в каком месте предыдущего куска начинается следующий.
     prev, next — моно-сигналы; j0 — где в next взять окно (внутри общей части);
     expect — ожидаемый ответ по счёту кадров; range — сколько искать в обе стороны. */
  function align(prev, next, j0, expect, range) {
    var W = 2048, D = 4;
    if (j0 + W > next.length) return { lag: expect, score: 0 };
    // грубо: каждые 4 отсчёта
    var best = -2, bestLag = expect;
    var nw = new Float32Array(W / D), ne = 0;
    for (var i = 0; i < W / D; i++) { var v = next[j0 + i * D]; nw[i] = v; ne += v * v; }
    if (ne < 1e-6) return { lag: expect, score: 0 };        // в окне тишина — сравнивать нечего
    for (var lag = expect - range; lag <= expect + range; lag += D) {
      var base = j0 + lag;
      if (base < 0 || base + W > prev.length) continue;
      var s = 0, pe = 0;
      for (var q = 0; q < W / D; q++) { var x = prev[base + q * D]; s += x * nw[q]; pe += x * x; }
      var c = s / Math.sqrt(pe * ne + 1e-12);
      if (c > best) { best = c; bestLag = lag; }
    }
    // точно: по каждому отсчёту рядом с грубым ответом
    var nf = next.subarray(j0, j0 + W), nfe = 0;
    for (i = 0; i < W; i++) nfe += nf[i] * nf[i];
    var fine = bestLag, fbest = -2;
    for (lag = bestLag - D; lag <= bestLag + D; lag++) {
      base = j0 + lag;
      if (base < 0 || base + W > prev.length) continue;
      s = 0; pe = 0;
      for (q = 0; q < W; q++) { x = prev[base + q]; s += x * nf[q]; pe += x * x; }
      c = s / Math.sqrt(pe * nfe + 1e-12);
      if (c > fbest) { fbest = c; fine = lag; }
    }
    return { lag: fine, score: fbest };
  }

  root.MP3Chunker = { parse: parse, slice: slice, plan: plan, align: align, mono: mono };
  if (typeof module !== 'undefined') module.exports = root.MP3Chunker;
})(typeof window !== 'undefined' ? window : globalThis);
