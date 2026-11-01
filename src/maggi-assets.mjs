// "2 Baje Ki Maggi" — everything the soundtrack needs, generated from code.
//   node src/maggi-assets.mjs
//
//  · 11 voice lines (Edge neural TTS, cached)
//  · a 60 s hostel-comedy bed that changes character per act
//  · every SFX: stomach growl, phone buzz, knocks, creak, match, flame,
//    water, boil, sprinkle, clink, end sting
import fs from 'node:fs';
import { P } from './paths.mjs';
import { speak, decode, tighten, SR } from './audio.mjs';

const DIR = P('assets/maggi');
fs.mkdirSync(DIR, { recursive: true });
const CACHE = P('.cache/tts');
const DUR = 60;

/* ------------------------------------------------------------ 1. dialogue */
const K = { voice: 'hi-IN-MadhurNeural', pitch: 8 };
const W = { voice: 'hi-IN-SwaraNeural', pitch: -12 };
const LINES = [
  { id: 'k1', ...K, rate: -8, text: 'Bhai... neend hi nahi aa rahi.' },
  { id: 'k2', ...K, rate: -2, text: 'Aur pet... pet toh seedha Maggi maang raha hai.' },
  { id: 'k3', ...K, rate: -10, text: 'Warden ki aankh... abhi bandi honi chahiye.' },
  { id: 'k4', ...K, rate: 0, text: 'Arre wah! Kasam se... hotel se bhi accha hai.' },
  { id: 'w1', ...W, rate: 2, text: 'Kabir! Is waqt kitchen mein kya kar rahe ho?' },
  { id: 'k5', ...K, rate: 6, text: 'Kuch nahi ma\'am... bas, paani pi raha hoon.' },
  { id: 'w2', ...W, rate: -14, text: 'Maggi?' },
  { id: 'w3', ...W, rate: -8, text: 'Ek plate meri bhi.' },
  { id: 'k6', ...K, rate: 8, text: 'Ji ma\'am!' },
  { id: 'w4', ...W, rate: -10, text: 'Kisi ko batana nahi.' },
  { id: 'k7', ...K, rate: 2, text: 'Waise ma\'am... chai bhi bana doon?' },
];
const linesOut = {};
for (const l of LINES) {
  const f = await speak(l.text, { voice: l.voice, pitchHz: l.pitch, ratePct: l.rate, cacheDir: CACHE });
  const pcm = tighten(decode(f));
  linesOut[l.id] = { file: f, dur: +(pcm.length / SR).toFixed(2), text: l.text };
}
fs.writeFileSync(`${DIR}/lines.json`, JSON.stringify(linesOut, null, 2));
console.log('lines:', Object.entries(linesOut).map(([k, v]) => `${k} ${v.dur}s`).join(' · '));

/* ------------------------------------------------------------- 2. helpers */
function wav(name, sig, gain = 0.9) {
  let peak = 0;
  for (let i = 0; i < sig.length; i++) { const a = Math.abs(sig[i]); if (a > peak) peak = a; }
  if (!peak) peak = 1;
  const n = sig.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, (sig[i] / peak) * gain));
    b.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(`${DIR}/${name}`, b);
}
const rnd = (() => { let a = 987654321; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
const N = (s) => Math.floor(s * SR);
const buf = (s) => new Float64Array(N(s));
const fade = (sig, f = 0.006) => {
  const k = Math.min(N(f), Math.floor(sig.length / 2));
  for (let i = 0; i < k; i++) { sig[i] *= i / k; sig[sig.length - 1 - i] *= i / k; }
  return sig;
};
// one-pole low-pass / high-pass
const lp = (sig, cut) => { const a = Math.exp(-2 * Math.PI * cut / SR); let y = 0; return sig.map((x) => (y = (1 - a) * x + a * y)); };
const hp = (sig, cut) => { const a = Math.exp(-2 * Math.PI * cut / SR); let y = 0, px = 0; return sig.map((x) => { y = a * (y + x - px); px = x; return y; }); };

/* ----------------------------------------------------------- 3. sound fx */
// stomach growl: slow wobbling sub + gurgle grains
{
  const s = buf(1.9);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = 46 + 12 * Math.sin(2 * Math.PI * 1.7 * t) + 6 * Math.sin(2 * Math.PI * 5.3 * t);
    const env = Math.min(1, t / 0.25) * Math.exp(-Math.max(0, t - 0.9) * 3.2);
    s[i] = 0.85 * env * Math.sin(2 * Math.PI * f * t * (1 + 0.02 * Math.sin(2 * Math.PI * 9 * t)));
  }
  const gurgle = buf(1.9).map(() => (rnd() * 2 - 1));
  const g2 = lp(hp(gurgle, 140), 900);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] += 0.5 * g2[i] * Math.exp(-Math.max(0, t - 0.7) * 2.4) * Math.min(1, t / 0.3) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3.1 * t));
  }
  wav('growl.wav', fade(s, 0.02), 0.8);
}
// phone notification: two soft blips
{
  const s = buf(0.6);
  for (const [at, f] of [[0, 1046], [0.14, 1318]]) {
    const st = N(at), n = N(0.22);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      s[st + i] += 0.5 * Math.exp(-t * 26) * Math.sin(2 * Math.PI * f * t) * Math.min(1, t / 0.004);
    }
  }
  wav('buzz.wav', fade(s), 0.5);
}
// knocks: three knuckle thumps with a woody body
{
  const s = buf(0.95);
  for (const [at, g] of [[0, 1], [0.17, 0.9], [0.34, 1]] ) {
    const st = N(at), n = N(0.25);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.002) * Math.exp(-t * 34);
      s[st + i] += g * env * (0.75 * Math.sin(2 * Math.PI * 128 * t) + 0.35 * Math.sin(2 * Math.PI * 210 * t) + 0.2 * (rnd() * 2 - 1));
    }
  }
  wav('knock.wav', fade(s), 0.95);
}
// floorboard creak
{
  const s = buf(0.85);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = 300 + 260 * Math.sin(2 * Math.PI * 1.1 * t) + 120 * Math.sin(2 * Math.PI * 7.3 * t);
    ph += 2 * Math.PI * f / SR;
    const env = Math.min(1, t / 0.08) * Math.exp(-Math.max(0, t - 0.35) * 5);
    s[i] = env * (0.5 * Math.sin(ph) + 0.25 * (rnd() * 2 - 1));
  }
  wav('creak.wav', fade(lp(s, 2600)), 0.55);
}
// door hinge + latch
{
  const s = buf(1.1);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = 520 - 300 * t + 60 * Math.sin(2 * Math.PI * 13 * t);
    ph += 2 * Math.PI * f / SR;
    const env = Math.min(1, t / 0.15) * Math.exp(-Math.max(0, t - 0.6) * 6);
    s[i] = 0.45 * env * Math.sin(ph) + 0.18 * env * (rnd() * 2 - 1);
  }
  wav('door.wav', fade(s), 0.55);
}
// match strike then a soft flame whoosh
{
  const s = buf(1.0);
  for (let i = 0; i < N(0.16); i++) {
    const t = i / SR;
    s[i] = 0.9 * Math.exp(-t * 26) * (rnd() * 2 - 1) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 180 * t));
  }
  const whoosh = buf(0.7).map(() => rnd() * 2 - 1);
  const w2 = lp(whoosh, 1500);
  for (let i = 0; i < w2.length; i++) {
    const t = i / SR;
    s[N(0.16) + i] += 0.7 * w2[i] * (Math.min(1, t / 0.05) * Math.exp(-t * 3.4));
  }
  wav('match.wav', fade(s, 0.01), 0.75);
}
// water pour
{
  const s = buf(1.3).map(() => rnd() * 2 - 1);
  const a = hp(lp(s, 5200), 700);
  for (let i = 0; i < a.length; i++) {
    const t = i / SR;
    a[i] *= Math.min(1, t / 0.18) * Math.min(1, (1.3 - t) / 0.35) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 7 * t));
  }
  wav('pour.wav', fade(a), 0.5);
}
// boiling pot: bubbling grains over low rumble
{
  const s = buf(2.8);
  const bed = lp(buf(2.8).map(() => rnd() * 2 - 1), 300);
  for (let i = 0; i < s.length; i++) s[i] += 0.25 * bed[i];
  for (let t = 0.05; t < 2.7; t += 0.045 + rnd() * 0.11) {
    const st = N(t), n = N(0.055);
    const f = 320 + rnd() * 520;
    for (let i = 0; i < n && st + i < s.length; i++) {
      const tt = i / SR;
      s[st + i] += 0.3 * Math.exp(-tt * 70) * Math.sin(2 * Math.PI * f * tt * (1 + 6 * tt));
    }
  }
  wav('boil.wav', fade(s, 0.03), 0.55);
}
// masala sprinkle: tiny crackles
{
  const s = buf(1.0);
  for (let t = 0; t < 0.9; t += 0.012 + rnd() * 0.03) {
    const st = N(t), n = N(0.02);
    const g = 0.4 + rnd() * 0.6;
    for (let i = 0; i < n && st + i < s.length; i++) {
      s[st + i] += g * Math.exp(-(i / SR) * 260) * (rnd() * 2 - 1);
    }
  }
  wav('sprinkle.wav', fade(hp(s, 1600), 0.01), 0.45);
}
// steel bowl clink
{
  const s = buf(0.7);
  const partials = [[1180, 0.5], [1720, 0.32], [2540, 0.22], [3160, 0.14]];
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    let v = 0;
    for (const [f, g] of partials) v += g * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (10 + f / 900));
    s[i] = v * Math.min(1, t / 0.001);
  }
  wav('clink.wav', fade(s, 0.004), 0.6);
}
// sniff: a short inhale, band-passed nose noise
{
  const s = buf(0.5);
  const raw = buf(0.5).map(() => rnd() * 2 - 1);
  const bp = lp(hp(raw, 900), 3200);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.05) * Math.exp(-Math.max(0, t - 0.12) * 14);
    s[i] = bp[i] * env;
  }
  wav('sniff.wav', fade(s, 0.01), 0.5);
}
// end-card sting: three warm plucks
{
  const s = buf(1.6);
  const notes = [[0, 523.25], [0.16, 659.26], [0.34, 783.99]];
  for (const [at, f] of notes) {
    const st = N(at), n = N(1.1);
    for (let i = 0; i < n && st + i < s.length; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.006) * Math.exp(-t * 5.2);
      s[st + i] += 0.5 * env * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t) + 0.15 * Math.sin(6 * Math.PI * f * t));
    }
  }
  wav('sting.wav', fade(s), 0.7);
}
console.log('sfx written');

/* --------------------------------------------------------- 4. music bed */
// 96 BPM, A minor, four acts: sneaky → walk → kitchen → warm resolve.
{
  const n = N(DUR);
  const mix = new Float64Array(n);
  const addAt = (at, sig, gain) => {
    const st = N(at);
    for (let i = 0; i < sig.length && st + i < n; i++) mix[st + i] += sig[i] * gain;
  };
  const pluck = (freq, dur = 0.75, decay = 7) => {
    const out = buf(dur);
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.004) * Math.exp(-t * decay);
      out[i] = env * (Math.sin(2 * Math.PI * freq * t) + 0.42 * Math.sin(4 * Math.PI * freq * t) + 0.16 * Math.sin(6 * Math.PI * freq * t));
    }
    return out;
  };
  const bass = (freq, dur = 0.7) => {
    const out = buf(dur);
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      out[i] = Math.min(1, t / 0.006) * Math.exp(-t * 4.4) * (Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(4 * Math.PI * freq * t));
    }
    return out;
  };
  const shaker = () => {
    const out = buf(0.08);
    for (let i = 0; i < out.length; i++) out[i] = Math.exp(-(i / SR) * 70) * (rnd() * 2 - 1);
    return hp(out, 3500);
  };
  const wood = () => {
    const out = buf(0.11);
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      out[i] = Math.exp(-t * 46) * (Math.sin(2 * Math.PI * 780 * t) + 0.4 * Math.sin(2 * Math.PI * 1240 * t));
    }
    return out;
  };
  const pad = (freqs, dur) => {
    const out = buf(dur);
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      let v = 0;
      for (const f of freqs) v += Math.sin(2 * Math.PI * f * t) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.7 * t));
      out[i] = v / freqs.length;
    }
    return out;
  };

  const A = [220.0, 261.63, 329.63];
  const F = [174.61, 220.0, 261.63];
  const C = [261.63, 329.63, 392.0];
  const G = [196.0, 246.94, 293.66];
  const Dm = [146.83, 174.61, 220.0];
  const prog = [A, F, C, G];
  const roots = [110.0, 87.31, 130.81, 98.0];
  const BEAT = 60 / 96, BAR = BEAT * 2;

  // act map: 0 sneaky (0-14.5) · 1 walk (14.5-24.5) · 2 kitchen (24.5-34.5)
  //          3 tension (34.5-43.5) · 4 warm (43.5-52.5) · 5 outro (52.5-60)
  const act = (t) => (t < 14.5 ? 0 : t < 24.5 ? 1 : t < 34.5 ? 2 : t < 43.5 ? 3 : t < 52.5 ? 4 : 5);

  for (let b = 0; b * BAR < DUR; b++) {
    const t0 = b * BAR;
    const a = act(t0);
    const ch = a === 3 ? (b % 2 ? Dm : A) : a === 4 ? (b % 2 ? F : C) : prog[b % 4];
    const root = a === 3 ? (b % 2 ? 73.42 : 110.0) : a === 4 ? (b % 2 ? 87.31 : 130.81) : roots[b % 4];

    if (a === 3) {
      // tension: low drone + ticking woodblock + a slow swell
      if (b % 2 === 0) addAt(t0, pad(ch, BAR * 2), 0.16);
      for (let k = 0; k < 4; k++) addAt(t0 + k * BEAT * 0.5, wood(), 0.16);
      addAt(t0, bass(root, 1.2), 0.30);
      continue;
    }
    // plucked arpeggio on eighths
    const arp = [0, 1, 2, 1, 2, 0, 1, 2];
    for (let k = 0; k < 8; k++) {
      const at = t0 + k * (BAR / 8);
      if (at > DUR) break;
      const dens = a === 0 ? (k % 2 === 0) : a === 1 ? 1 : 1;
      if (dens) addAt(at, pluck(ch[arp[k]] * (a === 5 ? 2 : 1), 0.7, a === 5 ? 5 : 7), a === 2 ? 0.13 : 0.15);
    }
    addAt(t0, bass(root, 0.8), a === 1 ? 0.34 : 0.27);
    addAt(t0 + BAR * 0.5, bass(root * 1.5, 0.6), 0.2);
    if (a >= 1) for (let k = 0; k < 8; k++) addAt(t0 + k * (BAR / 8), shaker(), a === 1 ? 0.14 : 0.1);
    if (a === 2) for (let k = 0; k < 2; k++) addAt(t0 + k * BEAT, wood(), 0.12);
    if (a === 4 || a === 5) addAt(t0, pad(ch, BAR), 0.10);
  }

  // master fade in/out for the mix buffer
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const g = Math.min(1, t / 0.8, (DUR - t) / 1.6);
    mix[i] *= g;
  }
  wav('bed.wav', mix, 0.8);
  console.log(`bed.wav ${DUR}s`);
}
console.log('done');
