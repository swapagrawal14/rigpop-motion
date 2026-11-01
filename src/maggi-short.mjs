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
  room: [5.0, 13.0],
  walk: [13.0, 22.5],
  kitchen: [22.5, 34.5],     // he actually cooks: packet → break → stir → masala → taste
  knock: [34.5, 42.0],
  warden: [42.0, 52.0],
  payoff: [52.0, 60.0],
};
const CUES = [
  { id: 'k1', at: 6.2, who: 'kabir' },
  { id: 'k2', at: 9.6, who: 'kabir' },
  { id: 'k3', at: 16.4, who: 'kabir' },
  { id: 'k4', at: 30.8, who: 'kabir' },
  { id: 'w1', at: 35.6, who: 'warden' },
  { id: 'k5', at: 39.6, who: 'kabir' },
  { id: 'w2', at: 45.4, who: 'warden' },
  { id: 'w3', at: 47.6, who: 'warden' },
  { id: 'k6', at: 49.4, who: 'kabir' },
  { id: 'w4', at: 53.0, who: 'warden' },
  { id: 'k7', at: 55.2, who: 'kabir' },
];
const SUBS = [
  { id: 'k1', a: 6.2, who: 'kabir' },
  { id: 'k2', a: 9.6, who: 'kabir' },
  { id: 'k3', a: 16.4, who: 'kabir', whisper: true },
  { id: 'k4', a: 30.8, who: 'kabir' },
  { id: 'w1', a: 35.6, who: 'warden', off: true },
  { id: 'k5', a: 39.6, who: 'kabir' },
  { id: 'w2', a: 45.4, who: 'warden' },
  { id: 'w3', a: 47.6, who: 'warden' },
  { id: 'k6', a: 49.4, who: 'kabir' },
  { id: 'w4', a: 53.0, who: 'warden' },
  { id: 'k7', a: 55.2, who: 'kabir' },
  { id: 'x1', a: 11.6, b: 12.2, text: '(pet se: gurrrrr)' },
  { id: 'x3', a: 41.2, b: 42.0, text: '...' },
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

// the cooking pose pack: five drawings of him actually making the Maggi
const COOK = {};
{
  const meta = JSON.parse(fs.readFileSync(P('characters/kabir-cook/poses.json'), 'utf8'));
  for (const p of meta.poses) {
    COOK[p.name] = { img: await loadImage(P(`characters/kabir-cook/${p.name}.png`)), ...p };
  }
}

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

  // ---- foley, cue-locked to the new timeline ----
  add(sfx('buzz.wav'), 3.2, 0.5);
  add(sfx('growl.wav'), 4.3, 0.75);
  add(sfx('growl.wav'), 11.0, 0.55);
  add(decode(P('assets/chai/whoosh.wav')), 13.0, 0.35);
  // footsteps: one per stride across the walk, minus the freeze
  const step = decode(P('assets/chai/step.wav'));
  for (let k = 0; ; k++) {
    const at = 13.5 + k * 0.333;
    if (at > 21.8) break;
    if (at > FREEZE[0] && at < FREEZE[1] + 0.2) continue;
    add(step, at, k % 2 ? 0.30 : 0.40);
  }
  add(sfx('creak.wav'), FREEZE[0], 0.85);
  add(decode(P('assets/chai/whoosh.wav')), 22.5, 0.3);
  // he cooks: match → water → boil → crinkle → sprinkle
  add(sfx('match.wav'), 23.0, 0.65);
  add(sfx('pour.wav'), 23.7, 0.5);
  add(sfx('boil.wav'), 24.5, 0.45);
  add(sfx('sprinkle.wav'), 25.5, 0.55);     // noodles snapping
  add(sfx('pour.wav'), 26.0, 0.30);
  add(sfx('boil.wav'), 27.6, 0.40);
  add(sfx('clink.wav'), 29.0, 0.3);         // ladle on the rim
  add(sfx('sprinkle.wav'), 30.2, 0.5);      // masala
  add(sfx('boil.wav'), 32.0, 0.32);
  add(sfx('clink.wav'), 33.2, 0.28);
  // the knock
  add(sfx('knock.wav'), 35.6, 0.95);
  add(sfx('knock.wav'), 36.4, 0.70);
  add(sfx('clink.wav'), 41.0, 0.3);
  // she arrives: door, two heavy steps, the hinge
  add(sfx('door.wav'), 42.1, 0.55);
  add(step, 42.55, 0.5);
  add(step, 43.05, 0.42);
  add(sfx('sniff.wav'), 45.0, 0.7);
  add(sfx('sniff.wav'), 45.9, 0.45);
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
function bust(g, { img, patches, imgs, cx, bottom, height, talk, mouth, blink, extras = [], rot = 0, alpha = 1, t = 0, idle = 0, phase = 0 }) {
  const s = height / img.height;
  const dw = img.width * s, dh = img.height * s;
  // breathing: a couple of pixels of sway and a hair of scale, so a held pose is never dead
  const breath = idle ? Math.sin(t * 1.9 + phase) * 3.2 * idle : 0;
  const breathX = idle ? Math.sin(t * 1.1 + phase) * 2.0 * idle : 0;
  const x = cx - dw / 2 + breathX, y = bottom - dh + breath;
  g.save();
  g.globalAlpha = alpha;
  const totalRot = rot + (idle ? Math.sin(t * 0.9 + phase) * 0.004 * idle : 0);
  if (totalRot) { g.translate(cx, bottom - dh / 2); g.rotate(totalRot); g.translate(-cx, -(bottom - dh / 2)); }
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
function applyCam(gg, cam) {
  const { zoom = 1, cx = W / 2, cy = H / 2, dx = 0, dy = 0, shake = 0 } = cam || {};
  if (shake) gg.translate(Math.sin(shake * 71) * 6, Math.cos(shake * 53) * 4);
  gg.translate(W / 2 + dx, H / 2 + dy);
  gg.scale(zoom, zoom);
  gg.translate(-cx, -cy);
}
function withCam(gg, cam, fn) {
  gg.save();
  applyCam(gg, cam);
  fn();
  gg.restore();
}

/* ---------------------------------------------------------------- cast layer */
// Characters are drawn on their own transparent layer, then a scene-coloured light
// is stamped *only onto them* with source-atop before they are composited down.
// That single step is what stops a bust from looking pasted onto a photograph of a room.
const castLayer = createCanvas(W, H);
const castCtx = castLayer.getContext('2d');
function drawCast(drawFn, { cam, light } = {}) {
  castCtx.setTransform(1, 0, 0, 1, 0, 0);
  castCtx.clearRect(0, 0, W, H);
  withCam(castCtx, cam, drawFn);
  if (light) {
    castCtx.save();
    castCtx.setTransform(1, 0, 0, 1, 0, 0);
    castCtx.globalCompositeOperation = 'source-atop';
    if (light.shade) {
      const lg = castCtx.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, light.shade[0]);
      lg.addColorStop(1, light.shade[1]);
      castCtx.fillStyle = lg;
      castCtx.fillRect(0, 0, W, H);
    }
    if (light.key) {
      const rg = castCtx.createRadialGradient(light.key.x, light.key.y, 10, light.key.x, light.key.y, light.key.r);
      rg.addColorStop(0, light.key.color);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      castCtx.fillStyle = rg;
      castCtx.fillRect(0, 0, W, H);
    }
    castCtx.restore();
  }
  g.drawImage(castLayer, 0, 0);
}
const LIGHT = {
  room:   { shade: ['rgba(40,70,140,0.30)', 'rgba(10,18,45,0.45)'], key: { x: W * 0.5, y: H * 0.86, r: 430, color: 'rgba(150,205,255,0.30)' } },
  kitchen:{ shade: ['rgba(255,178,90,0.16)', 'rgba(40,28,20,0.30)'], key: { x: W * 0.34, y: H * 0.16, r: 620, color: 'rgba(255,205,120,0.34)' } },
  fright: { shade: ['rgba(20,40,90,0.42)', 'rgba(6,10,28,0.55)'], key: { x: W - 40, y: H * 0.5, r: 420, color: 'rgba(255,205,120,0.26)' } },
  warm:   { shade: ['rgba(255,190,110,0.18)', 'rgba(60,34,20,0.28)'], key: { x: W * 0.5, y: H * 0.22, r: 700, color: 'rgba(255,205,120,0.30)' } },
};


/* ------------------------------------------------- cooking props & staging */
// Our kadhai is drawn, not photographed: noodles actually appear, cook and get stirred.
function kadhai(g, x, y, w, { noodles = 0, t = 0, steamOn = true, flame = true } = {}) {
  const h = w * 0.52;
  g.save();
  g.translate(x, y);
  if (flame) {
    const fg2 = g.createRadialGradient(0, 10, 4, 0, 10, w * 0.55);
    fg2.addColorStop(0, 'rgba(255,170,70,0.55)');
    fg2.addColorStop(1, 'rgba(255,140,50,0)');
    g.fillStyle = fg2;
    g.beginPath(); g.ellipse(0, 12, w * 0.55, h * 0.30, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(120,190,255,0.8)';
    g.lineWidth = 4; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = -1.0 + i * 0.4 + Math.sin(t * 10 + i) * 0.06;
      g.beginPath();
      g.moveTo(Math.cos(a) * w * 0.20, Math.sin(a) * h * 0.10 + 6);
      g.lineTo(Math.cos(a) * w * 0.30, Math.sin(a) * h * 0.16 + 2);
      g.stroke();
    }
  }
  // body
  g.beginPath();
  g.moveTo(-w / 2, 0);
  g.quadraticCurveTo(-w * 0.42, h * 0.95, 0, h);
  g.quadraticCurveTo(w * 0.42, h * 0.95, w / 2, 0);
  g.closePath();
  const bg2 = g.createLinearGradient(-w / 2, 0, w / 2, h);
  bg2.addColorStop(0, '#4a4f57');
  bg2.addColorStop(0.45, '#2e333a');
  bg2.addColorStop(1, '#1b1e23');
  g.fillStyle = bg2; g.fill();
  ink(g, Math.max(4, w * 0.028)); g.stroke();
  // noodles inside
  g.beginPath();
  g.ellipse(0, -h * 0.02, w * 0.47, h * 0.20, 0, 0, TAU);
  g.fillStyle = '#2a2018'; g.fill(); ink(g, Math.max(3, w * 0.02)); g.stroke();
  if (noodles > 0.01) {
    g.save();
    g.beginPath(); g.ellipse(0, -h * 0.02, w * 0.44, h * 0.17, 0, 0, TAU); g.clip();
    g.fillStyle = '#e8b53f';
    g.beginPath(); g.ellipse(0, -h * 0.02, w * 0.46, h * 0.20 * noodles, 0, 0, TAU); g.fill();
    g.strokeStyle = '#c9902a'; g.lineWidth = Math.max(3, w * 0.022);
    const strands = 9;
    for (let i = 0; i < strands; i++) {
      g.beginPath();
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        const xx = -w * 0.44 + u * w * 0.88;
        const yy = -h * 0.16 + i * h * 0.032 + Math.sin(u * 8 + i * 1.7 + t * (1 + (i % 3) * 0.6)) * 4;
        if (k === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
      }
      g.stroke();
    }
    // a few red masala flecks
    g.fillStyle = '#b7331f';
    for (let i = 0; i < 14; i++) {
      const a2 = i * 2.399;
      g.beginPath();
      g.arc(Math.cos(a2) * w * 0.30, -h * 0.05 + Math.sin(a2) * h * 0.09, 2.4, 0, TAU);
      g.fill();
    }
    g.restore();
  }
  // rim + handles
  g.beginPath(); g.ellipse(0, 0, w / 2, h * 0.18, 0, 0, TAU);
  g.strokeStyle = INK; g.lineWidth = Math.max(5, w * 0.035); g.stroke();
  g.strokeStyle = '#6b7178'; g.lineWidth = Math.max(2, w * 0.014); g.stroke();
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(sx * w * 0.52, -h * 0.02, w * 0.075, sx > 0 ? -1.4 : 1.75, sx > 0 ? 1.4 : 4.5);
    g.strokeStyle = INK; g.lineWidth = Math.max(5, w * 0.03); g.stroke();
    g.strokeStyle = '#5e646b'; g.lineWidth = Math.max(2, w * 0.012); g.stroke();
  }
  // steam
  if (steamOn && noodles > 0.01) steam(g, -w * 0.10, -h * 0.22, w / 260, t, 0.34, 3);
  g.restore();
}

// the counter between the camera and the actor: the same plate, pushed 5% closer,
// clipped below the counter line. Depth for free, and it hides the actor's cut-off.
function foregroundCounter(gg, cam, lineY, k = 1.06, plate = null) {
  const img = plate || A.kitchen;
  gg.save();
  withCam(gg, cam, () => {
    gg.beginPath();
    gg.rect(-W, lineY, W * 3, H * 3);
    gg.clip();
    gg.save();
    gg.translate(W * 0.5, lineY);
    gg.scale(k, k);
    gg.translate(-W * 0.5, -lineY);
    cover(gg, img, { focusY: 0.5 });
    gg.restore();
    const sh = gg.createLinearGradient(0, lineY, 0, lineY + 110);
    sh.addColorStop(0, 'rgba(8,6,12,0.62)');
    sh.addColorStop(1, 'rgba(8,6,12,0)');
    gg.fillStyle = sh;
    gg.fillRect(-W, lineY, W * 3, 110);
  });
  gg.restore();
}

// draw a cooking pose normalised on the head axis, with a little life in it
function cookPose(gg, name, { cx, headW = 168, top = H * 0.15, t = 0, breathe = 1, lean = 0 }) {
  const p = COOK[name];
  if (!p) return;
  const sc = headW / p.headW;
  const dw = p.w * sc, dh = p.h * sc;
  const bob = Math.sin(t * 2.1) * 2.2 * breathe;
  gg.save();
  gg.translate(cx - p.headCX * sc, top + bob);
  if (lean) { gg.translate(dw * 0.5, dh); gg.rotate(lean); gg.translate(-dw * 0.5, -dh); }
  gg.drawImage(p.img, 0, 0, dw, dh);
  gg.restore();
}

/* ------------------------------------------------------------------- shots */
// shared walk-clock with a freeze window (the floorboard gag)
const FREEZE = [19.9, 20.6];
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
    t: o.t || 0, idle: o.idle || 0, phase: o.phase || 0,
  });
}
function drawWarden(gg, o) {
  bust(gg, {
    img: A.warden, patches: wPatchArr, imgs: A.wImgs,
    talk: o.talk, mouth: o.mouth, blink: o.blink, extras: o.smile ? ['smile'] : [],
    rot: o.rot || 0, alpha: o.alpha ?? 1,
    cx: o.cx, bottom: o.bottom, height: o.height,
    t: o.t || 0, idle: o.idle || 0, phase: o.phase || 0,
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
        drawCast(() => drawKabir(g, {
          cx: W * 0.5, bottom: H + 240 + (1 - up) * 340, height: 980,
          talk: !!kM, mouth: kM, blink: blinkOf(t, 0.7), alpha: 0.55 + 0.45 * up,
          t, idle: 1, phase: 0.4,
        }), { cam: { zoom: 1.02 + t * 0.008, cy: H * 0.54 }, light: LIGHT.room });
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
      drawCast(() => drawKabir(g, {
        cx: W * 0.5, bottom: H + 240, height: 980,
        talk: !!kM, mouth: kM, blink: blinkOf(t, 0.7), t, idle: 1, phase: 0.4,
      }), { cam: { zoom: 1.05 + s * 0.012, cy: H * 0.50 }, light: LIGHT.room });
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
      fg.addColorStop(1, '#1b2528');
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
      // contact shadow first, so his feet sit on the corridor floor
      g.save();
      g.globalAlpha = 0.42;
      g.fillStyle = '#000';
      g.beginPath(); g.ellipse(cx0, footY, dw * 0.30, 13, 0, 0, TAU); g.fill();
      g.restore();
      g.drawImage(img, cx0 - dw / 2, footY - dh, dw, dh);
    }, { cam: { zoom: 1, shake: frozen ? Math.min(0.4, t - FREEZE[0]) : 0 },
         light: { shade: ['rgba(30,60,120,0.16)', 'rgba(6,10,22,0.34)'],
                  key: { x: W * 0.5, y: H * 0.12, r: 520, color: 'rgba(180,255,220,0.16)' } } });

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

  /* ============================ SHOT 3 · he actually cooks ================= */
  else if (t < S.kitchen[1]) {
    const s = t - S.kitchen[0];
    // beat sheet: he opens the packet, breaks the noodles in, stirs, adds masala, tastes
    const BEATS = [
      ['packet', 0.0, 2.4],
      ['break', 2.4, 5.0],
      ['stir', 5.0, 7.0],
      ['masala', 7.0, 8.4],
      ['taste', 8.4, 99],
    ];
    const beat = BEATS.find((b) => s >= b[1] && s < b[2]);
    const pose = beat ? beat[0] : 'taste';
    const cam = { zoom: 1.0 + smooth(clamp(s / 11, 0, 1)) * 0.09, cy: H * 0.60 };
    const POT = { x: W * 0.665, y: H * 0.522, w: 176 };
    const noodles = smooth(clamp((s - 3.1) / 2.0, 0, 1));

    // world: background + the heat under the pot
    withCam(g, cam, () => {
      cover(g, A.kitchen, { focusY: 0.5 });
      if (s > 0.4) {
        const hg = g.createRadialGradient(POT.x, POT.y - 10, 10, POT.x, POT.y - 10, 250);
        hg.addColorStop(0, 'rgba(255,180,90,0.30)');
        hg.addColorStop(1, 'rgba(255,180,90,0)');
        g.fillStyle = hg;
        g.fillRect(POT.x - 260, POT.y - 260, 520, 520);
      }
    });

    // the cast, lit by that bulb above him
    const slideIn = smooth(clamp(s / 0.55, 0, 1));
    drawCast(() => {
      cookPose(g, pose, {
        cx: lerp(-120, W * 0.615, slideIn),
        headW: 158,
        top: H * 0.165,
        t,
        breathe: pose === 'stir' ? 1.4 : 1,
        lean: pose === 'stir' ? Math.sin(t * 6.2) * 0.018 : pose === 'break' ? Math.sin(t * 9) * 0.02 : 0,
      });
    }, { cam, light: LIGHT.kitchen });

    // the pot goes in front of him: he is behind the counter, the kadhai is not
    withCam(g, cam, () => {
      g.save();
      g.globalAlpha = 0.34;
      g.fillStyle = '#120c08';
      g.beginPath();
      g.ellipse(POT.x, POT.y + POT.w * 0.50, POT.w * 0.52, POT.w * 0.09, 0, 0, TAU);
      g.fill();
      g.restore();
      kadhai(g, POT.x, POT.y, POT.w, { noodles, t });
      // dry noodles falling in when he snaps them
      if (s > 2.5 && s < 4.4) {
        const a = clamp((s - 2.5) / 0.2, 0, 1) * clamp((4.4 - s) / 0.5, 0, 1);
        g.save();
        g.globalAlpha = a;
        g.strokeStyle = '#f0cf6a'; g.lineWidth = 5; g.lineCap = 'round';
        for (let i = 0; i < 7; i++) {
          const ph = (s * 1.6 + i * 0.29) % 1;
          const px = POT.x - 46 + i * 15 + Math.sin(ph * 6 + i) * 8;
          const py = POT.y - 200 + ph * 190;
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const yy = py + k * 7;
            const xx = px + Math.sin(k * 1.1 + i) * 5 + ph * 14;
            if (k === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
          }
          g.stroke();
        }
        g.restore();
      }
    });

    // the counter edge, closer to camera
    foregroundCounter(g, cam, H * 0.615);
    // the plate's floor sits in near-black; a whisper of warm bounce lifts it
    g.save();
    g.globalCompositeOperation = 'lighter';
    const lift = g.createLinearGradient(0, H * 0.82, 0, H);
    lift.addColorStop(0, 'rgba(0,0,0,0)');
    lift.addColorStop(1, 'rgba(70,52,34,0.32)');
    g.fillStyle = lift;
    g.fillRect(0, H * 0.82, W, H * 0.18);
    g.restore();

    g.fillStyle = 'rgba(8,10,26,0.14)';
    g.fillRect(0, 0, W, H);

    screen = () => {
      if (s > 8.6 && s < 9.9) {
        const a = clamp((s - 8.6) / 0.25, 0, 1) * clamp((9.9 - s) / 0.3, 0, 1);
        g.save(); g.globalAlpha = a * 0.92;
        textPop(g, 'mmm!', W * 0.40, H * 0.34, 54, '#ffd94a', 0.1);
        g.restore();
      }
    };
  }

  /* ============================ SHOT 4 · the knock ========================= */
  else if (t < S.knock[1]) {
    const s = t - S.knock[0];
    const zoom = 1.06 + smooth(clamp((s - 0.8) / 5, 0, 1)) * 0.10;
    const shakeT = s > 1.0 && s < 1.9 ? Math.sin(s * 62) * (1.9 - s) * 5 : 0;
    const cam = { zoom, cy: H * 0.58, dx: shakeT };

    withCam(g, cam, () => {
      cover(g, A.kitchen, { focusY: 0.46 });
      const POT = { x: W * 0.665, y: H * 0.522, w: 172 };
      kadhai(g, POT.x, POT.y, POT.w, { noodles: 1, t, flame: true });
    });

    // he freezes mid-stir with the ladle still in his hand
    drawCast(() => {
      cookPose(g, 'stir', { cx: W * 0.54, headW: 172, top: H * 0.14, t, breathe: 0.4, lean: 0 });
    }, { cam, light: LIGHT.fright });

    withCam(g, cam, () => {
      // the bowl he is hiding, peeking from behind his shoulder
      if (s > 6.2) {
        const pop = smooth(clamp((s - 6.2) / 0.35, 0, 1));
        g.save();
        g.translate(W * 0.80, H * 0.70);
        g.rotate(0.16);
        bowl(g, 0, 0, 148 * pop, t, { level: 1 });
        g.restore();
      }
    });

    g.fillStyle = 'rgba(5,7,20,0.58)';
    g.fillRect(0, 0, W, H);

    // the corridor light creeping under/around the door at frame right
    const lw = clamp((s - 0.5) / 1.0, 0, 1);
    if (lw > 0.01) {
      const lg = g.createLinearGradient(W, 0, W - 240, 0);
      lg.addColorStop(0, `rgba(255,206,124,${0.62 * lw})`);
      lg.addColorStop(0.55, `rgba(255,190,110,${0.20 * lw})`);
      lg.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = lg;
      g.fillRect(W - 250, 0, 250, H);
    }

    screen = () => {
      if (s > 0.9 && s < 1.5) {
        const a = clamp((s - 0.9) / 0.12, 0, 1) * clamp((1.5 - s) / 0.25, 0, 1);
        g.save(); g.globalAlpha = a;
        textPop(g, '!', W * 0.70, H * 0.22, 92, '#ffd94a', 0.08);
        g.restore();
      }
      for (const [at, i] of [[1.1, 0], [1.28, 1], [1.46, 2]]) {
        if (s > at && s < at + 0.5) {
          const a = 1 - (s - at) / 0.5;
          g.save(); g.globalAlpha = a;
          textPop(g, 'THUD!', W * 0.78 - i * 8, H * 0.26 + i * 32, 50 - i * 4, '#ff7a5c', -0.1 + i * 0.06);
          g.restore();
        }
      }
    };
  }

  /* ============================ SHOT 5 · the warden arrives ================ */
  else if (t < S.warden[1]) {
    const s = t - S.warden[0];

    // beats: light under the door → her shape resolves out of it → she crosses the room
    // → a hard cut to his face → sniff → the push-in → the smile
    const reaction = s > 2.05 && s < 2.85;
    const push = smooth(clamp((s - 4.4) / 0.8, 0, 1)) * (1 - smooth(clamp((s - 5.7) / 0.9, 0, 1)));
    const cam = reaction
      ? { zoom: 1.34, cx: W * 0.5, cy: H * 0.46 }
      : { zoom: 1.03 + push * 0.46, cx: W * lerp(0.5, 0.72, push), cy: H * lerp(0.52, 0.64, push) };

    const walkIn = smooth(clamp((s - 0.35) / 1.15, 0, 1));
    const wardenX = reaction ? W + 420 : lerp(W * 1.02, W * 0.72, walkIn);
    const stepBob = (s > 0.35 && s < 1.7) ? -Math.abs(Math.sin((s - 0.35) * Math.PI * 3.0)) * 7 : 0;
    // she resolves out of the doorway light: 0 = pure silhouette, 1 = fully lit
    const sil = clamp((s - 0.4) / 1.1, 0, 1);

    withCam(g, cam, () => {
      cover(g, A.kitchen, { focusY: 0.46 });
      // the doorway throws her shadow up the wall before she is readable
      if (s > 0.2 && s < 2.0) {
        const a = clamp((s - 0.2) / 0.45, 0, 1) * clamp((2.0 - s) / 0.6, 0, 1);
        g.save();
        g.globalAlpha = a * 0.42;
        g.fillStyle = '#08080f';
        g.beginPath();
        const sx = lerp(W * 1.02, W * 0.68, walkIn);
        g.ellipse(sx + 74, H * 0.42, 62, 175, 0.22, 0, TAU);
        g.fill();
        g.restore();
      }
    });

    // cast layer: her, then him
    drawCast(() => {
      if (!reaction) {
        const shadeA = lerp(0.94, 0.28, sil);
        bust(g, {
          img: A.warden, patches: wPatchArr, imgs: A.wImgs,
          cx: wardenX, bottom: H + 250 + stepBob, height: 860,
          talk: !!wM, mouth: wM, blink: blinkOf(t, 0.3), extras: s > 5.3 ? ['smile'] : [],
          rot: (s > 3.0 && s < 4.0) ? Math.sin((s - 3.0) * 4.6) * 0.022 : 0,
          t, idle: 1, phase: 1.1,
        });
        // hard shade for the silhouette phase, burned in on top of her only
        if (sil < 0.98) {
          const cw2 = castLayer.width, ch2 = castLayer.height;
          castCtx.save();
          castCtx.globalCompositeOperation = 'source-atop';
          castCtx.fillStyle = `rgba(6,8,18,${shadeA})`;
          castCtx.fillRect(0, 0, cw2, ch2);
          castCtx.restore();
        }
      }
      bust(g, {
        img: A.kabir, patches: A.kPatch, imgs: A.kImgs,
        cx: reaction ? W * 0.5 : W * 0.26,
        bottom: reaction ? H + 260 : H + 210,
        height: reaction ? 1020 : 720,
        talk: !!kM, mouth: kM, blink: blinkOf(t, 2.2),
        rot: (s > 3.2 && s < 4.0) ? Math.sin((s - 3.2) * 9) * 0.012 : 0,
        t, idle: 1, phase: 0.2,
      });
    }, { cam, light: s > 5.4 ? LIGHT.warm : LIGHT.kitchen });

    g.fillStyle = `rgba(6,8,22,${(reaction ? 0.42 : 0.52) - clamp((s - 5.7) / 1.2, 0, 1) * 0.26})`;
    g.fillRect(0, 0, W, H);

    screen = () => {
      const warm = clamp((s - 5.7) / 1.4, 0, 1);
      if (warm > 0.01) {
        const rg = g.createRadialGradient(W * 0.32, H * 0.52, 20, W * 0.32, H * 0.52, 540);
        rg.addColorStop(0, `rgba(255,196,110,${0.28 * warm})`);
        rg.addColorStop(1, 'rgba(255,196,110,0)');
        g.fillStyle = rg; g.fillRect(0, 0, W, H);
      }
      if (reaction) {
        g.save();
        g.strokeStyle = 'rgba(159,220,255,0.55)';
        g.lineWidth = 5; g.lineCap = 'round';
        for (let i = 0; i < 7; i++) {
          const a2 = -2.4 + i * 0.42;
          g.beginPath();
          g.moveTo(W * 0.5 + Math.cos(a2) * 196, H * 0.40 + Math.sin(a2) * 196);
          g.lineTo(W * 0.5 + Math.cos(a2) * 238, H * 0.40 + Math.sin(a2) * 238);
          g.stroke();
        }
        g.restore();
      }
      // the glasses glint: drawn in world space so the push-in carries it with her
      if (s > 4.1 && s < 4.7) {
        const a = clamp((s - 4.1) / 0.12, 0, 1) * clamp((4.7 - s) / 0.2, 0, 1);
        g.save();
        g.globalAlpha = a * (0.5 + 0.5 * warm);
        withCam(g, cam, () => {
          g.translate(wardenX - 34, H * 0.726);
          g.rotate(-0.5);
          g.fillStyle = 'rgba(255,255,255,0.92)';
          g.beginPath(); g.roundRect(-52, -6, 104, 12, 6); g.fill();
        });
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
      drawCast(() => {
        drawWarden(g, {
          cx: W * 0.30, bottom: H + 120, height: 780,
          talk: !!wM, mouth: wM, blink: blinkOf(t, 0.3), smile: true,
          t, idle: 1, phase: 1.1,
        });
        drawKabir(g, {
          cx: W * 0.73, bottom: H + 150, height: 750,
          talk: !!kM, mouth: kM, blink: blinkOf(t, 0.7), t, idle: 1, phase: 0.2,
        });
      }, { cam: { zoom: 1.08 - smooth(clamp(s / 6, 0, 1)) * 0.08, cy: H * 0.55 }, light: LIGHT.warm });
      // two bowls, in front, still steaming
      bowl(g, W * 0.33, H * 0.905, 178, t, { level: 1 });
      bowl(g, W * 0.70, H * 0.925, 162, t + 0.6, { level: 1 });
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

  const v = g.createRadialGradient(W / 2, H * 0.46, H * 0.30, W / 2, H * 0.5, H * 0.86);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(8,6,18,0.38)');
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
