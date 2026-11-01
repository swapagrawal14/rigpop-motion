// rigpop-motion · "2 Baje Ki Maggi" — a 60 s hostel comedy short
//   node src/maggi-short.mjs            → out/maggi-short.mp4
//   node src/maggi-short.mjs --stills 8,18,30,45,55   → out/stills/*.png
//
// Shots: cold open → the craving (bust) → corridor walk (flip-book, gesture locked to
// the stride) → kitchen → the knock → the warden → payoff. Every character and plate is
// generated artwork; the motion, camera, lip-sync and score are all ours.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import ffmpegPath from 'ffmpeg-static';
import { P } from './paths.mjs';
import { decode, SR, FFMPEG } from './audio.mjs';

const W = 720, H = 1280, FPS = 30, DUR = 60.0;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, k) => a + (b - a) * k;

/* ---------------------------------------------------------------- timeline */
const M = P('assets/maggi');
const LINES = JSON.parse(fs.readFileSync(`${M}/lines.json`, 'utf8'));
const S = {
  cold: [0.0, 5.0],
  room: [5.0, 14.0],
  walk: [14.0, 24.0],
  kitchen: [24.0, 34.0],
  knock: [34.0, 43.0],
  warden: [43.0, 52.0],
  payoff: [52.0, 60.0],
};
const CUES = [
  { id: 'k1', at: 6.2, who: 'kabir' },
  { id: 'k2', at: 9.6, who: 'kabir' },
  { id: 'k3', at: 17.6, who: 'kabir' },
  { id: 'k4', at: 29.2, who: 'kabir' },
  { id: 'w1', at: 36.0, who: 'warden' },
  { id: 'k5', at: 40.2, who: 'kabir' },
  { id: 'w2', at: 45.0, who: 'warden' },
  { id: 'w3', at: 47.3, who: 'warden' },
  { id: 'k6', at: 49.4, who: 'kabir' },
  { id: 'w4', at: 53.0, who: 'warden' },
  { id: 'k7', at: 55.2, who: 'kabir' },
];
const SUBS = [
  { id: 'k1', a: 6.2, who: 'kabir' },
  { id: 'k2', a: 9.6, who: 'kabir' },
  { id: 'k3', a: 17.6, who: 'kabir', whisper: true },
  { id: 'k4', a: 29.2, who: 'kabir' },
  { id: 'w1', a: 36.0, who: 'warden', off: true },
  { id: 'k5', a: 40.2, who: 'kabir' },
  { id: 'w2', a: 45.0, who: 'warden' },
  { id: 'w3', a: 47.3, who: 'warden' },
  { id: 'k6', a: 49.4, who: 'kabir' },
  { id: 'w4', a: 53.0, who: 'warden' },
  { id: 'k7', a: 55.2, who: 'kabir' },
  { id: 'x1', a: 13.0, b: 13.6, text: '(pet se: gurrrrr)' },
  { id: 'x3', a: 42.2, b: 43.0, text: '...' },
];
const subOf = (c) => (c.text ? c.text : LINES[c.id].text);

/* ------------------------------------------------------------------ assets */
const A = {};
A.room = await loadImage(`${M}/room.jpg`);
A.kitchen = await loadImage(`${M}/kitchen.jpg`);
A.corridor = await loadImage(`${M}/corridor.jpg`);
A.kabir = await loadImage(P('characters/kabir-side/kabir_base.png'));
A.kPatch = {
  A: [250, 260, 88, 44], E: [250, 260, 88, 44], O: [250, 260, 88, 44],
  blink: [222, 182, 144, 42],
};
A.kImgs = {};
for (const k of ['A', 'E', 'O', 'blink']) A.kImgs[k] = await loadImage(P(`characters/kabir-side/kabir_${k}.png`));

const WMETA = JSON.parse(fs.readFileSync(P('characters/warden/warden.json'), 'utf8'));
A.warden = await loadImage(P('characters/warden/' + WMETA.sprite));
A.wImgs = {};
for (const k of Object.keys(WMETA.patches)) A.wImgs[k] = await loadImage(P('characters/warden/' + WMETA.patches[k].file));

A.poses = [];
for (let i = 0; i < 6; i++) A.poses.push(await loadImage(P(`characters/kabir-side/poses/pose_${i}.png`)));
const POSES = JSON.parse(fs.readFileSync(P('characters/kabir-side/poses/poses.json'), 'utf8'));

/* --------------------------------------------------------------- sound mix */
function buildAudio() {
  const N = Math.ceil(DUR * SR);
  const mix = new Float32Array(N);
  const voice = new Float32Array(N);
  const add = (buf, at, gain = 1, into = mix) => {
    const s = Math.max(0, Math.floor(at * SR));
    for (let i = 0; i < buf.length && s + i < N; i++) into[s + i] += buf[i] * gain;
  };
  const sfx = (name) => decode(`${M}/${name}`);

  // score
  const bed = decode(`${M}/bed.m4a`);
  // duck the bed under dialogue: envelope follower on the voice bus
  const win = 512;
  const env = new Float32Array(Math.ceil(N / win));
  for (let w = 0; w < env.length; w++) {
    let s2 = 0;
    for (let i = 0; i < win; i++) { const x = voice[w * win + i] || 0; s2 += x * x; }
    env[w] = Math.sqrt(s2 / win);
  }
  // (voice is filled below; compute duck after it is)
  const lines = {};
  for (const c of CUES) {
    const pcm = decode(LINES[c.id].file);
    lines[c.id] = pcm;
    add(pcm, c.at, 1.0, voice);
  }
  // recompute the envelope now that the voice bus exists, then apply to the bed
  for (let w = 0; w < env.length; w++) {
    let s2 = 0;
    for (let i = 0; i < win; i++) { const x = voice[w * win + i] || 0; s2 += x * x; }
    env[w] = Math.sqrt(s2 / win);
  }
  let e = 0;
  for (let i = 0; i < N; i++) {
    const w = Math.min(env.length - 1, Math.floor(i / win));
    e = Math.max(env[w], e * 0.9993);            // fast attack, slow release
    const duck = 1 - 0.42 * clamp(e / 0.06, 0, 1);
    const fade = Math.min(1, i / (SR * 0.6), (N - i) / (SR * 1.2));
    mix[i] += (bed[i] || 0) * 0.52 * duck * fade;
  }
  for (let i = 0; i < N; i++) mix[i] += voice[i] * 1.0;

  // ---- foley, cue-locked ----
  add(sfx('buzz.wav'), 3.2, 0.5);
  add(sfx('growl.wav'), 4.3, 0.75);
  add(sfx('growl.wav'), 11.5, 0.55);
  add(decode(P('assets/chai/whoosh.wav')), 14.0, 0.35);
  // footsteps: one per stride (stride = 1/3 s) across the walk, minus the freeze
  const step = decode(P('assets/chai/step.wav'));
  for (let k = 0; ; k++) {
    const at = 14.5 + k * 0.333;
    if (at > 23.3) break;
    if (at > 21.25 && at < 22.0) continue;   // he froze
    add(step, at, k % 2 ? 0.30 : 0.40);
  }
  add(sfx('creak.wav'), 21.3, 0.85);
  add(decode(P('assets/chai/whoosh.wav')), 24.0, 0.3);
  add(sfx('match.wav'), 24.7, 0.6);
  add(sfx('pour.wav'), 25.5, 0.5);
  add(sfx('boil.wav'), 26.4, 0.5);
  add(sfx('sprinkle.wav'), 27.7, 0.55);
  add(sfx('clink.wav'), 29.0, 0.35);
  add(sfx('boil.wav'), 31.2, 0.32);
  add(sfx('knock.wav'), 35.0, 0.95);
  add(sfx('knock.wav'), 35.9, 0.75);
  add(sfx('clink.wav'), 41.3, 0.3);
  add(sfx('door.wav'), 43.1, 0.6);
  add(sfx('sniff.wav'), 44.5, 0.7);
  add(sfx('sniff.wav'), 45.3, 0.45);
  add(sfx('clink.wav'), 52.3, 0.45);
  add(sfx('clink.wav'), 53.4, 0.3);
  add(decode(P('assets/chai/slurp.wav')), 54.6, 0.7);
  add(decode(P('assets/chai/slurp.wav')), 56.4, 0.55);
  add(sfx('sting.wav'), 57.4, 0.6);

  // master: soft clip guard, then peak normalise
  let peak = 0;
  for (let i = 0; i < N; i++) { const a = Math.abs(mix[i]); if (a > peak) peak = a; }
  const g = peak > 0 ? 0.92 / peak : 1;
  for (let i = 0; i < N; i++) mix[i] = Math.tanh(mix[i] * g * 1.05) * 0.98;
  return { mix, lines };
}

/* ----------------------------------------------------------- mouth driving */
const NF = Math.ceil(DUR * FPS);
function mouthTrack(lines, who) {
  const N = Math.ceil(DUR * SR);
  const pcm = new Float32Array(N);
  for (const c of CUES) {
    if (c.who !== who) continue;
    const src = lines[c.id];
    if (!src) continue;
    const s = Math.floor(c.at * SR);
    for (let i = 0; i < src.length && s + i < N; i++) pcm[s + i] += src[i];
  }
  const out = new Array(NF).fill(null);
  const NEG = 1024;
  let peak = 0.05;
  for (let f = 0; f < NF; f++) {
    const st = Math.max(0, Math.floor((f / FPS) * SR) - NEG);
    let s2 = 0;
    for (let i = 0; i < NEG; i++) { const x = pcm[st + i] || 0; s2 += x * x; }
    const rms = Math.sqrt(s2 / NEG);
    peak = Math.max(rms, peak * 0.995, 0.02);
    const lv = clamp((rms / peak) * 1.05, 0, 1);
    out[f] = lv < 0.14 ? null : lv > 0.62 ? 'A' : lv > 0.34 ? 'E' : 'O';
  }
  return out;
}

/* ---------------------------------------------------------------- drawing */
const INK = '#14110f';
const ink = (g, lw = 6) => { g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = lw; g.strokeStyle = INK; };

function textPop(g, s, x, y, size, colour = '#ffd94a', rot = -0.05) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.font = `bold ${size}px sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.lineJoin = 'round'; g.lineWidth = size * 0.30; g.strokeStyle = INK;
  g.strokeText(s, 0, 0);
  g.fillStyle = colour; g.fillText(s, 0, 0);
  g.restore();
}

function cover(g, img, { zoom = 1, panX = 0, panY = 0, focusX = 0.5, focusY = 0.5 } = {}) {
  const s = Math.max(W / img.width, H / img.height) * zoom;
  const dw = img.width * s, dh = img.height * s;
  const dx = (W - dw) * focusX + panX;
  const dy = (H - dh) * focusY + panY;
  g.drawImage(img, dx, dy, dw, dh);
  return { s, dx, dy, dw, dh };
}

// ---- character busts -------------------------------------------------------
function bust(g, { img, patches, imgs, cx, bottom, height, talk, mouth, blink, extras = [], rot = 0, alpha = 1 }) {
  const s = height / img.height;
  const dw = img.width * s, dh = img.height * s;
  const x = cx - dw / 2, y = bottom - dh;
  g.save();
  g.globalAlpha = alpha;
  if (rot) { g.translate(cx, bottom - dh / 2); g.rotate(rot); g.translate(-cx, -(bottom - dh / 2)); }
  g.drawImage(img, x, y, dw, dh);
  for (const k of extras) {
    const p = patches[k];
    if (!p || !imgs[k]) continue;
    g.drawImage(imgs[k], x + p[0] * s, y + p[1] * s, p[2] * s, p[3] * s);
  }
  if (talk && mouth && patches[mouth] && imgs[mouth]) {
    const p = patches[mouth];
    g.drawImage(imgs[mouth], x + p[0] * s, y + p[1] * s, p[2] * s, p[3] * s);
  }
  if (blink && patches.blink && imgs.blink) {
    const p = patches.blink;
    g.drawImage(imgs.blink, x + p[0] * s, y + p[1] * s, p[2] * s, p[3] * s);
  }
  g.restore();
}

const wPatchArr = {};
for (const [k, p] of Object.entries(WMETA.patches)) wPatchArr[k] = [p.x, p.y, p.w, p.h];

// ---- props -----------------------------------------------------------------
// Rising steam: a plume of soft radial puffs that drift up and fade out.
// (Chains of line segments read as dashed strings, not vapour — see SPEC §11.)
function steam(g, x, y, scale = 1, t = 0, alpha = 0.5, count = 3) {
  g.save();
  const height = 175 * scale;
  const PUFFS = 6;
  for (let i = 0; i < count; i++) {
    const ox = (i - (count - 1) / 2) * 30 * scale;
    for (let k = 0; k < PUFFS; k++) {
      const u = ((k / PUFFS) + (t * 0.22 + i * 0.31)) % 1;
      const ph = t * 1.4 + i * 2.1 + k * 0.7;
      const yy = y - u * height;
      const xx = x + ox + Math.sin(ph) * 20 * scale * u;
      const r = (18 + u * 30) * scale;
      const a = alpha * (1 - u) * (0.55 + 0.45 * Math.sin(ph * 1.7));
      if (a <= 0.02) continue;
      const gr = g.createRadialGradient(xx, yy, 0, xx, yy, r);
      gr.addColorStop(0, `rgba(255,255,255,${(a * 0.85).toFixed(3)})`);
      gr.addColorStop(0.55, `rgba(255,255,255,${(a * 0.30).toFixed(3)})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(xx, yy, r * 0.85, r, 0, 0, TAU);
      g.fill();
    }
  }
  g.restore();
}

function flame(g, x, y, s = 1, t = 0) {
  g.save();
  g.translate(x, y);
  const flick = 0.85 + 0.15 * Math.sin(t * 22) + 0.06 * Math.sin(t * 37);
  g.scale(s, s * flick);
  const grad = g.createRadialGradient(0, -10, 2, 0, -10, 46);
  grad.addColorStop(0, 'rgba(255,240,190,0.95)');
  grad.addColorStop(0.45, 'rgba(255,168,58,0.85)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 6);
  g.bezierCurveTo(-30, -6, -18, -44, 0, -62);
  g.bezierCurveTo(18, -44, 30, -6, 0, 6);
  g.fill();
  g.fillStyle = 'rgba(120,190,255,0.75)';
  g.beginPath();
  g.moveTo(0, 2);
  g.bezierCurveTo(-13, -6, -8, -26, 0, -36);
  g.bezierCurveTo(8, -26, 13, -6, 0, 2);
  g.fill();
  g.restore();
}

// gas burner under the kadhai: warm heat glow + a couple of blue flame licks.
// (A free-standing flame sprite reads as a sticker on the oven panel — see SPEC §11.)
function burner(g, x, y, s = 1, t = 0) {
  g.save();
  g.translate(x, y);
  const grad = g.createRadialGradient(0, -6, 4, 0, -6, 62 * s);
  grad.addColorStop(0, 'rgba(255,190,90,0.55)');
  grad.addColorStop(0.5, 'rgba(255,150,60,0.24)');
  grad.addColorStop(1, 'rgba(255,140,50,0)');
  g.fillStyle = grad;
  g.beginPath(); g.ellipse(0, -6, 62 * s, 26 * s, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(120,190,255,0.85)';
  g.lineWidth = 4 * s;
  g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45 + Math.sin(t * 9 + i) * 0.05;
    const r = (26 + Math.sin(t * 13 + i * 2) * 4) * s;
    g.beginPath();
    g.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.35 - 2);
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.6 - 6);
    g.stroke();
  }
  g.restore();
}

function bowl(g, x, y, w, t = 0, { steamOn = true, level = 1 } = {}) {
  if (!(w > 8)) return;                 // pop-in scales from 0; a 0-width ellipse throws
  w = Math.max(8, w);
  const h = w * 0.46;
  g.save();
  g.translate(x, y);
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath(); g.ellipse(0, 6, w * 0.55, h * 0.16, 0, 0, TAU); g.fill();
  // body
  g.beginPath();
  g.moveTo(-w / 2, 0);
  g.quadraticCurveTo(0, h * 1.5, w / 2, 0);
  g.closePath();
  const bg = g.createLinearGradient(-w / 2, 0, w / 2, h);
  bg.addColorStop(0, '#cfd6dd'); bg.addColorStop(0.45, '#eef3f7'); bg.addColorStop(1, '#a9b3bd');
  g.fillStyle = bg; g.fill();
  ink(g, Math.max(3, w * 0.035)); g.stroke();
  // rim
  g.beginPath(); g.ellipse(0, 0, w / 2, h * 0.22, 0, 0, TAU);
  g.fillStyle = '#8d6b3a'; g.fill(); ink(g, Math.max(3, w * 0.03)); g.stroke();
  // noodles / tea surface
  if (level > 0) {
    g.save();
    g.beginPath(); g.ellipse(0, 0, w / 2 - 4, h * 0.20, 0, 0, TAU); g.clip();
    g.fillStyle = '#e8b53f';
    g.beginPath(); g.ellipse(0, 0, w / 2, h * 0.24 * level, 0, 0, TAU); g.fill();
    g.strokeStyle = '#f7d97a'; g.lineWidth = Math.max(2, w * 0.022);
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        const xx = -w / 2 + u * w;
        const yy = -h * 0.05 + i * h * 0.05 + Math.sin(u * 7 + i + t * 1.5) * 3;
        if (k === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
      }
      g.stroke();
    }
    // steam wisps rising off the noodles
    if (steamOn) {
      g.restore();
      steam(g, 0, -h * 0.12, w / 300, t, 0.42, 2);
    } else g.restore();
  }
  g.restore();
}

function packet(g, x, y, w, rot = 0, t = 0) {
  const h = w * 1.28;
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.roundRect(-w / 2 + 5, -h / 2 + 7, w, h, w * 0.09); g.fill();
  const bg = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  bg.addColorStop(0, '#ffd94a'); bg.addColorStop(1, '#f0b423');
  g.fillStyle = bg;
  g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, w * 0.09); g.fill();
  ink(g, Math.max(3, w * 0.035)); g.stroke();
  // red band
  g.fillStyle = '#d8402f';
  g.beginPath(); g.roundRect(-w / 2, -h * 0.14, w, h * 0.3, w * 0.05); g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = `bold ${Math.round(w * 0.19)}px sans-serif`;
  g.fillText('MASALA', 0, -h * 0.02);
  g.font = `bold ${Math.round(w * 0.13)}px sans-serif`;
  g.fillText('NOODLES', 0, h * 0.09);
  g.fillStyle = '#8a4b12';
  g.font = `bold ${Math.round(w * 0.10)}px sans-serif`;
  g.fillText('2 MIN', 0, -h * 0.26);
  // noodle squiggle
  g.strokeStyle = '#8a4b12'; g.lineWidth = Math.max(2, w * 0.03);
  g.beginPath();
  for (let k = 0; k <= 12; k++) {
    const u = k / 12;
    const xx = -w * 0.3 + u * w * 0.6;
    const yy = h * 0.30 + Math.sin(u * 9 + t * 2) * w * 0.03;
    if (k === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
  }
  g.stroke();
  g.restore();
}

function thoughtBubble(g, x, y, w, h, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = 'rgba(255,255,255,0.94)';
  g.strokeStyle = 'rgba(20,17,15,0.55)';
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(x, y, w, h, 0, 0, TAU);
  g.fill(); g.stroke();
  for (const [cx, cy, r] of [[x - w * 0.62, y + h * 1.25, 16], [x - w * 0.86, y + h * 1.7, 10], [x - w * 1.02, y + h * 2.0, 6]]) {
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); g.stroke();
  }
  g.restore();
}

function clock(g, t, x, y, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.font = 'bold 40px ui-monospace, monospace';
  g.textAlign = 'center';
  ink(g, 12);
  g.strokeText('2:03 AM', x, y);
  g.fillStyle = '#8fe3ff'; g.fillText('2:03 AM', x, y);
  g.font = 'bold 20px sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillText('hostel block C', x, y + 30);
  g.restore();
}

// All world drawing must happen inside withCam(): the transform is always restored,
// so nothing leaks into the next frame. (That leak cost an hour once — see SPEC §11.)
function withCam(gg, { zoom = 1, cx = W / 2, cy = H / 2, dx = 0, dy = 0, shake = 0 }, fn) {
  gg.save();
  if (shake) gg.translate(Math.sin(shake * 71) * 6, Math.cos(shake * 53) * 4);
  gg.translate(W / 2 + dx, H / 2 + dy);
  gg.scale(zoom, zoom);
  gg.translate(-cx, -cy);
  fn();
  gg.restore();
}

/* ------------------------------------------------------------------- shots */
// shared walk-clock with a freeze window (the floorboard gag)
const FREEZE = [21.25, 21.95];
function walkClock(t) {
  const start = S.walk[0] + 0.5;
  let c = t - start;
  if (t > FREEZE[0]) c -= Math.min(t, FREEZE[1]) - FREEZE[0];
  return Math.max(0, c);
}

/* ---------------------------------------------------------------- assemble */
const isStills = process.argv.includes('--stills');
const stillsArg = (() => {
  const i = process.argv.indexOf('--stills');
  if (i < 0) return null;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v.split(',').map(Number) : [2, 8, 13, 18, 21.4, 26, 30, 36, 41.5, 44, 46.4, 49, 53, 57];
})();

const { mix, lines } = buildAudio();
const kMouth = mouthTrack(lines, 'kabir');
const wMouth = mouthTrack(lines, 'warden');

const canvas = createCanvas(W, H);
const g = canvas.getContext('2d');

// scratch buffers for shot compositing
const off = createCanvas(W, H);
const og = off.getContext('2d');
const off2 = createCanvas(W, H);
const og2 = off2.getContext('2d');

const blinkOf = (t, phase) => ((t + phase) % 2.9) < 0.10;

function drawKabir(gg, o) {
  bust(gg, {
    img: A.kabir, patches: A.kPatch, imgs: A.kImgs,
    talk: o.talk, mouth: o.mouth, blink: o.blink, extras: o.extras || [],
    rot: o.rot || 0, alpha: o.alpha ?? 1,
    cx: o.cx, bottom: o.bottom, height: o.height,
  });
}
function drawWarden(gg, o) {
  bust(gg, {
    img: A.warden, patches: wPatchArr, imgs: A.wImgs,
    talk: o.talk, mouth: o.mouth, blink: o.blink, extras: o.smile ? ['smile'] : [],
    rot: o.rot || 0, alpha: o.alpha ?? 1,
    cx: o.cx, bottom: o.bottom, height: o.height,
  });
}

function render(t) {
  const f = Math.min(NF - 1, Math.max(0, Math.floor(t * FPS)));
  const kM = kMouth[f], wM = wMouth[f];
  g.clearRect(0, 0, W, H);

  // one flat fill behind everything, then each shot draws its world inside a camera
  g.fillStyle = '#0b1018';
  g.fillRect(0, 0, W, H);

  let screen = () => {};      // per-shot screen-space gags, drawn after the grade

  /* ============================ SHOT 0 · cold open ========================= */
  if (t < S.cold[1]) {
    withCam(g, { zoom: 1.02 + t * 0.008, cy: H * 0.54 }, () => {
      cover(g, A.room, { focusY: 0.5 });
      if (t >= 2.9) {
        const up = smooth(clamp((t - 2.9) / 0.55, 0, 1));
        drawKabir(g, {
          cx: W * 0.5, bottom: H + 240 + (1 - up) * 340, height: 980,
          talk: !!kM, mouth: kM, blink: blinkOf(t, 0.7), alpha: 0.55 + 0.45 * up,
        });
      }
    });
    g.fillStyle = `rgba(10,14,34,${0.62 - smooth(clamp((t - 2.9) / 1.4, 0, 1)) * 0.22})`;
    g.fillRect(0, 0, W, H);

    if (t < 2.9) {
      const a = clamp((t - 0.35) / 0.4, 0, 1) * (1 - clamp((t - 2.55) / 0.35, 0, 1));
      screen = () => {
        g.save();
        g.globalAlpha = a;
        const pop = 0.92 + smooth(clamp((t - 0.35) / 0.5, 0, 1)) * 0.08;
        g.translate(W / 2, H * 0.40); g.scale(pop, pop);
        textPop(g, '2 BAJE', 0, -58, 80, '#ffd94a', -0.04);
        textPop(g, 'KI MAGGI', 0, 32, 80, '#ffffff', 0.03);
        g.font = 'bold 26px sans-serif';
        g.textAlign = 'center';
        g.lineWidth = 9; g.strokeStyle = INK; g.lineJoin = 'round';
        g.strokeText('ek hostel kahani', 0, 104);
        g.fillStyle = '#ffd94a'; g.fillText('ek hostel kahani', 0, 104);
        g.strokeStyle = '#e8695f'; g.lineWidth = 7; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-W * 0.21, 138);
        g.quadraticCurveTo(0, 158, W * 0.21, 138);
        g.stroke();
        g.restore();
      };
    } else {
      const up = smooth(clamp((t - 2.9) / 0.55, 0, 1));
      screen = () => {
        const glow = g.createRadialGradient(W * 0.5, H * 0.86, 10, W * 0.5, H * 0.86, 420);
        glow.addColorStop(0, `rgba(150,205,255,${0.30 * up})`);
        glow.addColorStop(1, 'rgba(150,205,255,0)');
        g.fillStyle = glow; g.fillRect(0, 0, W, H);
        clock(g, t, W / 2, H * 0.16, up * 0.95);
      };
    }
  }

  /* ============================ SHOT 1 · the craving ======================= */
  else if (t < S.room[1]) {
    const s = t - S.room[0];
    const bIn = smooth(clamp((s - 3.0) / 0.45, 0, 1)) * (1 - smooth(clamp((s - 7.2) / 0.4, 0, 1)));
    withCam(g, { zoom: 1.05 + s * 0.012, cy: H * 0.50 }, () => {
      cover(g, A.room, { focusY: 0.52 });
      if (bIn > 0.01) {
        g.save();
        g.globalAlpha = bIn;
        const bob = Math.sin(t * 2.1) * 5;
        thoughtBubble(g, W * 0.46, H * 0.31 + bob, 118, 90, 1);
        packet(g, W * 0.46, H * 0.31 + bob, 94, Math.sin(t * 0.9) * 0.09, t);
        g.restore();
      }
      drawKabir(g, {
        cx: W * 0.5, bottom: H + 240, height: 980,
        talk: !!kM, mouth: kM, blink: blinkOf(t, 0.7),
      });
    });
    g.fillStyle = `rgba(12,16,38,${0.40 - s * 0.012})`;
    g.fillRect(0, 0, W, H);
    screen = () => {
      const glow = g.createRadialGradient(W * 0.5, H * 0.88, 10, W * 0.5, H * 0.88, 430);
      glow.addColorStop(0, 'rgba(150,205,255,0.26)');
      glow.addColorStop(1, 'rgba(150,205,255,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, H);
      // the stomach growl land
      if (s > 6.3 && s < 7.6) {
        const a2 = 1 - (s - 6.3) / 1.3;
        g.save();
        g.globalAlpha = clamp(a2, 0, 1) * 0.85;
        g.strokeStyle = '#ffd94a'; g.lineWidth = 5; g.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.arc(W * 0.74, H * 0.99, 30 + i * 20, -2.3, -0.6);
          g.stroke();
        }
        g.restore();
      }
    };
  }

  /* ============================ SHOT 2 · corridor walk ===================== */
  else if (t < S.walk[1]) {
    const wc = walkClock(t);
    const frozen = t >= FREEZE[0] && t <= FREEZE[1];
    const scroll = wc * 214;
    const plateH = 1150, plateW = A.corridor.width * (plateH / A.corridor.height);
    const plateY = -70;
    const footY = 1055;
    const charH = 560;

    withCam(g, { zoom: 1, shake: frozen ? Math.min(0.4, t - FREEZE[0]) : 0 }, () => {
      // ceiling + floor falloff behind the plate
      const grad = g.createLinearGradient(0, 0, 0, plateY + 60);
      grad.addColorStop(0, '#05070d'); grad.addColorStop(1, '#111a28');
      g.fillStyle = grad; g.fillRect(-W, -H, W * 3, H + plateY + 60);

      const off0 = -((scroll + 380) % plateW);
      for (let k = -1; k <= Math.ceil(W / plateW) + 1; k++) {
        g.drawImage(A.corridor, off0 + k * plateW, plateY, plateW, plateH);
      }
      // foreground floor in shadow so the plate edge never shows
      // the plate ends at plateY+plateH; continue the tiles as floor receding into the dark
      const fg = g.createLinearGradient(0, plateY + plateH - 8, 0, H + 40);
      fg.addColorStop(0, '#4a5a53');
      fg.addColorStop(0.30, '#31403c');
      fg.addColorStop(1, '#12191b');
      g.fillStyle = fg;
      g.fillRect(-W, plateY + plateH - 8, W * 3, H + 200);

      // warm spill from a door he tiptoes past
      const spill = clamp(1 - Math.abs(t - 20.0) / 2.6, 0, 1);
      if (spill > 0.01) {
        const lg = g.createLinearGradient(W * 0.52, 0, W * 0.96, 0);
        lg.addColorStop(0, `rgba(255,190,90,${0.30 * spill})`);
        lg.addColorStop(1, 'rgba(255,190,90,0)');
        g.fillStyle = lg;
        g.fillRect(W * 0.52, plateY, W * 0.48, plateH);
      }

      const cHead = POSES.canvas[1];
      const sc = charH / cHead;
      const poseIdx = Math.floor(wc * 6) % 6;
      const img = A.poses[poseIdx];
      const dw = img.width * sc, dh = img.height * sc;
      const cx0 = W * 0.42;
      g.save();
      g.globalAlpha = 0.38;
      g.fillStyle = '#000';
      g.beginPath(); g.ellipse(cx0, footY, dw * 0.30, 13, 0, 0, TAU); g.fill();
      g.restore();
      g.drawImage(img, cx0 - dw / 2, footY - dh, dw, dh);
    });

    g.fillStyle = 'rgba(8,12,26,0.40)'; g.fillRect(0, 0, W, H);
    if (frozen) {
      screen = () => {
        const a = clamp((t - FREEZE[0]) / 0.1, 0, 1);
        g.save();
        g.globalAlpha = a;
        textPop(g, 'CREAK!', W * 0.63, H * 0.30, 56, '#ff8a5c', -0.08);
        // sweat bead off his hairline
        const dy = (t - FREEZE[0]) * 70;
        g.fillStyle = '#9fdcff';
        g.globalAlpha = a * clamp(1 - dy / 150, 0, 1);
        g.beginPath();
        g.ellipse(W * 0.487, H * 0.415 + dy, 8, 12, 0, 0, TAU);
        g.fill();
        g.restore();
      };
    }
  }

  /* ============================ SHOT 3 · the kitchen ======================= */
  else if (t < S.kitchen[1]) {
    const s = t - S.kitchen[0];
    const zoom = 1.0 + smooth(clamp(s / 9, 0, 1)) * 0.10;
    const bx = W * 0.704, by = H * 0.494;      // the kadhai on the right burner
    withCam(g, { zoom, cy: H * 0.62 }, () => {
      cover(g, A.kitchen, { focusY: 0.5 });
      if (s > 0.6) burner(g, bx, by + 6, 1.0, t);
      if (s > 1.6) steam(g, bx, by - 52, 1.05, t, 0.34 + 0.22 * clamp((s - 1.6) / 3, 0, 1), 4);
      if (s > 3.4 && s < 5.2) {
        const fadeA = clamp((s - 3.4) / 0.2, 0, 1) * clamp((5.2 - s) / 0.4, 0, 1);
        for (let i = 0; i < 26; i++) {
          const ph = (t * 1.5 + i * 0.37) % 1;
          const px = bx - 58 + ((i * 37) % 116) + Math.sin(i) * 6;
          const py = by - 230 + ph * 170;
          g.globalAlpha = fadeA * (1 - ph) * 0.95;
          g.fillStyle = i % 3 ? '#b4551f' : '#7a2f10';
          g.beginPath(); g.arc(px, py, 3.4, 0, TAU); g.fill();
        }
        g.globalAlpha = 1;
      }
      drawKabir(g, {
        cx: W * 0.26, bottom: H + 290, height: 780,
        talk: !!kM, mouth: kM, blink: blinkOf(t, 1.5),
      });
    });
    g.fillStyle = 'rgba(8,10,26,0.18)';
    g.fillRect(0, 0, W, H);
    if (s > 5.2 && s < 6.4) {
      screen = () => {
        const a = clamp((s - 5.2) / 0.25, 0, 1) * clamp((6.4 - s) / 0.3, 0, 1);
        g.save(); g.globalAlpha = a * 0.9;
        textPop(g, 'mmm!', W * 0.30, H * 0.40, 52, '#ffd94a', 0.12);
        g.restore();
      };
    }
  }

  /* ============================ SHOT 4 · the knock ========================= */
  else if (t < S.knock[1]) {
    const s = t - S.knock[0];
    const zoom = 1.04 + smooth(clamp((s - 1.0) / 6, 0, 1)) * 0.12;
    const shakeT = s > 1.0 && s < 1.9 ? Math.sin(s * 62) * (1.9 - s) * 5 : 0;
    const bx = W * 0.704, by = H * 0.494;
    withCam(g, { zoom, cy: H * 0.58, dx: shakeT }, () => {
      cover(g, A.kitchen, { focusY: 0.46 });
      if (s > 0.0) burner(g, bx, by + 6, 0.8, t);
      if (s > 0.0) steam(g, bx, by - 52, 0.9, t, 0.26, 3);
      drawKabir(g, {
        cx: W * 0.52, bottom: H + 300, height: 1000,
        talk: !!kM, mouth: kM, blink: blinkOf(t, 2.2),
      });
      // the bowl he is hiding, peeking out behind his shoulder
      if (s > 7.0) {
        const pop = smooth(clamp((s - 7.0) / 0.35, 0, 1));
        g.save();
        g.translate(W * 0.855, H * 0.82);
        g.rotate(0.16);
        bowl(g, 0, 0, 152 * pop, t, { level: 1 });
        g.restore();
      }
    });
    g.fillStyle = 'rgba(5,7,20,0.60)';
    g.fillRect(0, 0, W, H);
    // the corridor light creeping in from the doorway at frame right
    const lw = clamp((s - 0.9) / 1.2, 0, 1);
    if (lw > 0.01) {
      const lg = g.createLinearGradient(W, 0, W - 230, 0);
      lg.addColorStop(0, `rgba(255,206,124,${0.62 * lw})`);
      lg.addColorStop(0.55, `rgba(255,190,110,${0.20 * lw})`);
      lg.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = lg;
      g.fillRect(W - 240, 0, 240, H);
      // a hard shaft edge so it reads as a door, not a gradient
      g.fillStyle = `rgba(255,225,170,${0.16 * lw})`;
      g.fillRect(W - 118, 0, 6, H);
    }
    screen = () => {
      if (s > 2.0 && s < 2.7) {
        const a = clamp((s - 2.0) / 0.12, 0, 1) * clamp((2.7 - s) / 0.25, 0, 1);
        g.save(); g.globalAlpha = a;
        textPop(g, '!', W * 0.68, H * 0.30, 96, '#ffd94a', 0.08);
        g.restore();
      }
      for (const [at, i] of [[1.0, 0], [1.17, 1], [1.34, 2]]) {
        if (s > at && s < at + 0.55) {
          const a = 1 - (s - at) / 0.55;
          g.save(); g.globalAlpha = a;
          textPop(g, 'THUD!', W * 0.74 - i * 8, H * 0.30 + i * 34, 52 - i * 4, '#ff7a5c', -0.1 + i * 0.06);
          g.restore();
        }
      }
    };
  }

  /* ============================ SHOT 5 · the warden ======================== */
  else if (t < S.warden[1]) {
    const s = t - S.warden[0];
    const push = smooth(clamp((s - 2.4) / 0.8, 0, 1)) * (1 - smooth(clamp((s - 4.1) / 0.9, 0, 1)));
    const zoom = 1.03 + push * 0.52;
    const focusX = lerp(0.5, 0.33, push);
    const focusY = lerp(0.50, 0.62, push);

    withCam(g, { zoom, cx: W * focusX, cy: H * focusY }, () => {
      cover(g, A.kitchen, { focusY: 0.46 });
      // Kabir, small and guilty, on the right
      drawKabir(g, {
        cx: lerp(W * 0.82, W * 0.79, clamp(s / 1.0, 0, 1)), bottom: H + 240, height: 780,
        talk: !!kM, mouth: kM, blink: blinkOf(t, 2.2),
      });
      // the warden walks in
      const slide = smooth(clamp((s - 0.15) / 0.75, 0, 1));
      const sniffing = s > 1.3 && s < 2.3;
      drawWarden(g, {
        cx: lerp(W + 340, W * 0.32, slide), bottom: H + 250, height: 860,
        talk: !!wM, mouth: wM, blink: blinkOf(t, 0.3), smile: s > 4.2,
        rot: sniffing ? Math.sin((s - 1.3) * 5) * 0.02 : 0,
      });
    });

    g.fillStyle = `rgba(6,8,22,${0.54 - clamp((s - 4.4) / 1.2, 0, 1) * 0.24})`;
    g.fillRect(0, 0, W, H);
    screen = () => {
      const warm = clamp((s - 4.4) / 1.4, 0, 1);
      if (warm > 0.01) {
        const rg = g.createRadialGradient(W * 0.32, H * 0.52, 20, W * 0.32, H * 0.52, 520);
        rg.addColorStop(0, `rgba(255,196,110,${0.30 * warm})`);
        rg.addColorStop(1, 'rgba(255,196,110,0)');
        g.fillStyle = rg; g.fillRect(0, 0, W, H);
      }
      // glasses glint before she softens
      if (s > 3.9 && s < 4.5) {
        const a = clamp((s - 3.9) / 0.15, 0, 1) * clamp((4.5 - s) / 0.25, 0, 1);
        g.save();
        g.globalAlpha = a;
        g.translate(W * 0.36, H * 0.44);
        g.rotate(-0.5);
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.beginPath(); g.roundRect(-54, -6, 108, 12, 6); g.fill();
        g.restore();
      }
      if (s > 1.3 && s < 2.3) {
        const a = clamp(1 - Math.abs(s - 1.8) / 0.6, 0, 1);
        g.save();
        g.globalAlpha = a * 0.55;
        g.strokeStyle = '#9fdcff'; g.lineWidth = 4; g.lineCap = 'round';
        for (let i = 0; i < 2; i++) {
          g.beginPath();
          g.arc(W * 0.20, H * 0.72, 24 + i * 15, -0.7, 0.5);
          g.stroke();
        }
        g.restore();
      }
    };
  }

  /* ============================ SHOT 6 · payoff =========================== */
  else {
    const s = t - S.payoff[0];
    const zoom = 1.08 - smooth(clamp(s / 6, 0, 1)) * 0.08;
    withCam(g, { zoom, cy: H * 0.55 }, () => {
      cover(g, A.kitchen, { focusY: 0.5 });
      drawWarden(g, {
        cx: W * 0.30, bottom: H + 120, height: 780,
        talk: !!wM, mouth: wM, blink: blinkOf(t, 0.3), smile: true,
      });
      drawKabir(g, {
        cx: W * 0.73, bottom: H + 150, height: 750,
        talk: !!kM, mouth: kM, blink: blinkOf(t, 0.7),
      });
      // two bowls, in front, still steaming
      bowl(g, W * 0.34, H * 0.955, 190, t, { level: 1 });
      bowl(g, W * 0.70, H * 0.975, 172, t + 0.6, { level: 1 });
    });
    g.fillStyle = 'rgba(6,9,20,0.40)';
    g.fillRect(0, 0, W, H);
    screen = () => {
      const lg = g.createRadialGradient(W * 0.5, H * 0.24, 30, W * 0.5, H * 0.24, 760);
      lg.addColorStop(0, 'rgba(255,196,110,0.30)');
      lg.addColorStop(1, 'rgba(255,196,110,0)');
      g.fillStyle = lg; g.fillRect(0, 0, W, H);
      if (t > 57.3) {
        const a = clamp((t - 57.3) / 0.45, 0, 1);
        g.save();
        g.globalAlpha = a;
        const band = g.createLinearGradient(0, H * 0.30, 0, H * 0.60);
        band.addColorStop(0, 'rgba(8,8,16,0)');
        band.addColorStop(0.18, 'rgba(8,8,16,0.80)');
        band.addColorStop(0.82, 'rgba(8,8,16,0.80)');
        band.addColorStop(1, 'rgba(8,8,16,0)');
        g.fillStyle = band;
        g.fillRect(0, H * 0.30, W, H * 0.30);
        textPop(g, 'HOSTEL RULE #1', W / 2, H * 0.395, 40, '#ffd94a', -0.02);
        g.textAlign = 'center';
        g.font = 'bold 34px sans-serif';
        g.lineWidth = 11; g.lineJoin = 'round'; g.strokeStyle = INK;
        g.strokeText('2 baje ki Maggi', W / 2, H * 0.462);
        g.fillStyle = '#fff'; g.fillText('2 baje ki Maggi', W / 2, H * 0.462);
        g.strokeText('sabki hoti hai', W / 2, H * 0.519);
        g.fillStyle = '#fff'; g.fillText('sabki hoti hai', W / 2, H * 0.519);
        g.restore();
      }
    };
  }

  /* ------------------------------------------------------- global grade */
  screen();

  const v = g.createRadialGradient(W / 2, H * 0.46, H * 0.26, W / 2, H * 0.5, H * 0.82);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(8,6,18,0.50)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);

  // film grain: a few deterministic specks so the layers sit in one image
  g.save();
  g.globalAlpha = 0.030;
  g.fillStyle = '#fff';
  for (let i = 0; i < 70; i++) {
    const px = Math.abs((Math.sin(i * 12.9898 + t * 78.233) * 43758.5453) % 1);
    const py = Math.abs((Math.sin(i * 78.233 + t * 12.9898) * 43758.5453) % 1);
    g.fillRect(px * W, py * H, 1.5, 1.5);
  }
  g.restore();

  /* ------------------------------------------------------------ subtitles */
  for (const c of SUBS) {
    const a = c.a;
    const b = c.b ?? a + (LINES[c.id] ? LINES[c.id].dur : 0.6);
    if (t < a || t >= b) continue;
    const text = subOf(c);
    g.save();
    g.textAlign = 'center';
    g.font = c.whisper || c.text ? 'italic bold 34px sans-serif' : 'bold 34px sans-serif';
    const lines2 = [];
    let cur = '';
    for (const word of text.split(' ')) {
      const test = cur ? `${cur} ${word}` : word;
      if (g.measureText(test).width > W * 0.84) { lines2.push(cur); cur = word; } else cur = test;
    }
    if (cur) lines2.push(cur);
    const y0 = H - 168 - (lines2.length - 1) * 44;
    g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = 'rgba(12,10,8,0.92)';
    const fill = c.who === 'warden' ? '#ffd94a' : c.text ? '#9fdcff' : '#ffffff';
    lines2.forEach((ln, i) => {
      g.strokeText(ln, W / 2, y0 + i * 44);
      g.fillStyle = fill;
      g.fillText(ln, W / 2, y0 + i * 44);
    });
    if (c.off) {
      g.font = 'bold 20px sans-serif';
      g.strokeText('(darwaze ke us paas se)', W / 2, y0 - 40);
      g.fillStyle = '#ffd94a';
      g.fillText('(darwaze ke us paas se)', W / 2, y0 - 40);
    }
    g.restore();
  }

  return canvas;
}

/* ---------------------------------------------------------------- renders */
if (isStills) {
  fs.mkdirSync(P('out/stills'), { recursive: true });
  for (const t of stillsArg) {
    render(t);
    // toBuffer is synchronous — canvas.encode() is async and can hand back the NEXT
    // frame's pixels when the canvas is reused in a loop.
    fs.writeFileSync(P(`out/stills/t${String(t).replace('.', '_')}.png`), canvas.toBuffer('image/png'));
    console.error('still', t);
  }
  process.exit(0);
}

const OUT = P('out/maggi-short.mp4');
const WAV = P('out/maggi-mix.wav');
fs.mkdirSync(P('out'), { recursive: true });

// write the mix
{
  const n = mix.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mix[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(WAV, b);
}

const ff = spawn(ffmpegPath, [
  '-loglevel', 'error', '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-i', WAV,
  '-af', 'alimiter=limit=0.89:attack=4:release=80',
  '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-crf', '20',
  '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT,
], { stdio: ['pipe', 'ignore', 'inherit'] });

process.stderr.write(`rendering ${NF} frames\n`);
for (let f = 0; f < NF; f++) {
  render(f / FPS);
  const px = g.getImageData(0, 0, W, H).data;
  if (!ff.stdin.write(Buffer.from(px.buffer, px.byteOffset, px.byteLength))) {
    await new Promise((r) => ff.stdin.once('drain', r));
  }
  if (f % 60 === 0) process.stderr.write(`\r frame ${f}/${NF}`);
}
ff.stdin.end();
await new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg failed')))));
fs.rmSync(WAV, { force: true });
console.error('\n done ->', OUT);
