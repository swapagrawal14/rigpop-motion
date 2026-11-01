// Generates (and caches) everything "Cutting Chai" needs: voice lines + music bed + SFX.
// Run once:  node rigpop-motion/chai-assets.mjs
import fs from 'node:fs';
import { P } from './paths.mjs';
import { spawnSync } from 'node:child_process';
import { speak, decode, tighten, SR } from './audio.mjs';
import ffmpegPath from 'ffmpeg-static';

const DIR = P('assets/chai');
fs.mkdirSync(DIR, { recursive: true });
const CACHE = P('.cache/tts');

/* ---------- 1. dialogue ---------- */
const LINES = [
  { id: 'l1', voice: 'hi-IN-MadhurNeural', pitch: 8,  rate: 2,  text: 'Bhaiya! Ek cutting chai dena — kadak!' },
  { id: 'l2', voice: 'hi-IN-MadhurNeural', pitch: 8,  rate: 0,  text: 'Aur haan... cheeni kam.' },
  { id: 'l3', voice: 'hi-IN-MadhurNeural', pitch: 12, rate: 6,  text: 'Arre! Meri chai kahan gayi?!' },
  { id: 'l4', voice: 'hi-IN-MadhurNeural', pitch: 4,  rate: -4, text: 'Haan theek hai... bhaiya, do cutting chai!' },
];
const linesOut = {};
for (const l of LINES) {
  const f = await speak(l.text, { voice: l.voice, pitchHz: l.pitch, ratePct: l.rate, cacheDir: CACHE });
  const pcm = tighten(decode(f));
  linesOut[l.id] = { file: f, dur: +(pcm.length / SR).toFixed(2) };
}
fs.writeFileSync(`${DIR}/lines.json`, JSON.stringify(linesOut, null, 2));
console.log('lines:', Object.entries(linesOut).map(([k, v]) => `${k} ${v.dur}s`).join(', '));

/* ---------- 2. audio helpers ---------- */
function wav(name, sig) {
  let peak = 0;
  for (let i = 0; i < sig.length; i++) { const a = Math.abs(sig[i]); if (a > peak) peak = a; }
  if (!peak) peak = 1;
  const out = new Array(sig.length);
  for (let i = 0; i < sig.length; i++) out[i] = Math.round((sig[i] / peak) * 0.85 * 32767);
  const b = Buffer.alloc(44 + out.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + out.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(out.length * 2, 40);
  out.forEach((v, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, v)), 44 + i * 2));
  fs.writeFileSync(`${DIR}/${name}`, b);
}

const rnd = (() => { let a = 12345; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();

/* ---------- 3. music bed: 100 BPM, C–Am–F–G ---------- */
const DUR = 32, N = Math.floor(SR * DUR);
const mix = new Float64Array(N);
const addAt = (at, sig, gain) => {
  const s = Math.floor(at * SR);
  for (let i = 0; i < sig.length && s + i < N; i++) mix[s + i] += sig[i] * gain;
};
const pluck = (freq, dur = 0.9, decay = 6) => {
  const n = Math.floor(dur * SR), out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const env = (1 - Math.exp(-tt * 180)) * Math.exp(-tt * decay);
    out[i] = env * (Math.sin(2 * Math.PI * freq * tt) + 0.45 * Math.sin(4 * Math.PI * freq * tt) + 0.18 * Math.sin(6 * Math.PI * freq * tt));
  }
  return out;
};
const bassSig = (freq, dur = 0.55) => {
  const n = Math.floor(dur * SR), out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    out[i] = (1 - Math.exp(-tt * 60)) * Math.exp(-tt * 5.5) * (Math.sin(2 * Math.PI * freq * tt) + 0.3 * Math.sin(4 * Math.PI * freq * tt));
  }
  return out;
};
const shakerSig = () => {
  const n = Math.floor(0.09 * SR), out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.exp(-(i / SR) * 55) * (rnd() * 2 - 1);
  return out;
};
const chords = [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]];
const roots = [130.81, 110.0, 87.31, 98.0];
const beat = 60 / 100, bar = beat * 2;
for (let b = 0; b < Math.ceil(DUR / bar); b++) {
  const t0 = b * bar, ch = chords[b % 4], root = roots[b % 4];
  ch.forEach((f, i) => { addAt(t0 + i * beat * 0.5, pluck(f, 0.9, 6), 0.16); addAt(t0 + i * beat * 0.5 + beat, pluck(f, 0.7, 7), 0.12); });
  addAt(t0, bassSig(root, 0.55), 0.15);
  addAt(t0 + beat, bassSig(root, 0.5), 0.12);
  for (let k = 0; k < 4; k++) addAt(t0 + k * beat * 0.5, shakerSig(), k % 2 ? 0.045 : 0.028);
}
// sparkle in the outro
for (let k = 0; k < Math.floor(8 / beat); k++) addAt(DUR - 8 + k * beat, pluck([523.25, 587.33, 659.25, 783.99][k % 4], 0.5, 9), 0.07);
for (let i = 0; i < N; i++) {
  const tt = i / SR;
  mix[i] *= Math.min(1, tt / 0.9) * Math.min(1, (DUR - tt) / 1.6);
}
wav('bed.wav', mix);
console.log('bed ok');

/* ---------- 4. SFX ---------- */
{ // meow
  const n = Math.floor(0.75 * SR), out = new Float64Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const f = 520 + 340 * Math.sin(Math.PI * Math.min(1, tt / 0.55)) - 120 * tt;
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, tt / 0.05) * Math.exp(-Math.max(0, tt - 0.35) * 6);
    out[i] = env * (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph) + 0.02 * (rnd() * 2 - 1));
  }
  wav('meow.wav', out);
}
{ // step
  const n = Math.floor(0.16 * SR), out = new Float64Array(n);
  for (let i = 0; i < n; i++) { const tt = i / SR; out[i] = Math.exp(-tt * 38) * (Math.sin(2 * Math.PI * 90 * tt) * 0.6 + 0.5 * (rnd() * 2 - 1) * Math.exp(-tt * 70)); }
  wav('step.wav', out);
}
{ // whoosh
  const n = Math.floor(0.5 * SR), out = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc = acc * 0.86 + (rnd() * 2 - 1) * 0.14; out[i] = acc * Math.exp(-Math.abs(i / SR - 0.18) * 9); }
  wav('whoosh.wav', out);
}
{ // steam
  const n = Math.floor(1.4 * SR), out = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc = acc * 0.92 + (rnd() * 2 - 1) * 0.08; const tt = i / SR; out[i] = acc * Math.min(1, tt / 0.2) * Math.exp(-Math.max(0, tt - 0.5) * 3); }
  wav('steam.wav', out);
}
{ // slurp
  const n = Math.floor(0.5 * SR), out = new Float64Array(n);
  let ph = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const f = 300 + 900 * Math.pow(tt / 0.5, 1.6);
    ph += (2 * Math.PI * f) / SR;
    const noise = rnd() * 2 - 1;
    const hp = noise - prev * 0.92; prev = noise;
    const env = Math.min(1, tt / 0.06) * Math.exp(-Math.max(0, tt - 0.25) * 7);
    out[i] = env * (0.55 * hp + 0.5 * Math.sin(ph));
  }
  wav('slurp.wav', out);
}
{ // gulp
  const n = Math.floor(0.32 * SR), out = new Float64Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { const tt = i / SR; const f = 190 - 70 * (tt / 0.32); ph += (2 * Math.PI * f) / SR; out[i] = (1 - Math.exp(-tt * 90)) * Math.exp(-tt * 13) * Math.sin(ph); }
  wav('gulp.wav', out);
}
console.log('sfx ok ->', DIR);
