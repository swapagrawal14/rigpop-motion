// rigpop-motion · "Cutting Chai" — a 30 s cartoon short
// Shots: walk-in (pose flip-book) → counter (lip-synced bust) → the theft (side view) → payoff.
// Every background and character is real generated artwork; motion is ours.
import fs from 'node:fs';
import { P } from './paths.mjs';
import { spawn } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import ffmpegPath from 'ffmpeg-static';
import { decode, SR } from './audio.mjs';

const W = 720, H = 1280, FPS = 30, DUR = 30.0;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => x * x * (3 - 2 * x);

/* ---------------- timeline ---------------- */
const CHAI = P('assets/chai');
const LINES = JSON.parse(fs.readFileSync(`${CHAI}/lines.json`, 'utf8'));
const T = {
  title: [0.0, 1.7],
  shotA: [1.7, 8.7],
  whoosh1: [8.55, 9.1],
  shotB: [9.1, 16.0],
  whoosh2: [15.95, 16.5],
  shotC: [16.5, 23.6],
  shotD: [23.6, 30.0],
};
const CUES = [
  { id: 'l1', at: 9.9 },
  { id: 'l2', at: 13.5 },
  { id: 'l3', at: 24.0 },
  { id: 'meow', at: 26.15 },
  { id: 'l4', at: 26.9 },
];
const SUBTITLES = [
  { a: 9.9, b: 9.9 + LINES.l1.dur, text: 'Bhaiya! Ek cutting chai dena — kadak!' },
  { a: 13.5, b: 13.5 + LINES.l2.dur, text: 'Aur haan... cheeni kam.' },
  { a: 18.6, b: 21.4, text: '...' },
  { a: 24.0, b: 24.0 + LINES.l3.dur, text: 'Arre! Meri chai kahan gayi?!' },
  { a: 26.15, b: 26.9, text: 'Meow.' },
  { a: 26.9, b: 26.9 + LINES.l4.dur, text: 'Haan theek hai… bhaiya, do cutting chai!' },
];

/* ---------------- assets ---------------- */
const A = {};
A.bgWalk = await loadImage(P('assets/sidewalk-scroll.png'));
A.bgTapri = await loadImage(P('assets/chai-tapri-scroll.png'));
A.kabir = await loadImage(P('characters/kabir-side/kabir_base.png'));
for (const k of ['A', 'E', 'O', 'blink']) {
  A[`patch${k}`] = await loadImage(P(`characters/kabir-side/kabir_${k}.png`));
}
A.catWalk = await loadImage(P('characters/street-cat/cat_walk_cut.png'));
A.catDrink = await loadImage(P('characters/street-cat/cat_drink_cut.png'));
A.catLick = await loadImage(P('characters/street-cat/cat_lick_cut.png'));
A.poses = [];
for (let i = 0; i < 6; i++) A.poses.push(await loadImage(P(`characters/kabir-side/poses/pose_${i}.png`)));
const POSE_META = JSON.parse(fs.readFileSync(P('characters/kabir-side/poses/poses.json'), 'utf8'));

/* ---------------- audio build ---------------- */
function buildAudio() {
  const N = Math.ceil(DUR * SR);
  const mix = new Float32Array(N);
  const add = (buf, at, gain = 1) => {
    const s = Math.max(0, Math.floor(at * SR));
    for (let i = 0; i < buf.length && s + i < N; i++) mix[s + i] += buf[i] * gain;
  };
  // music bed, trimmed to 30 s with fades
  const bed = decode(`${CHAI}/bed.m4a`);
  for (let i = 0; i < N; i++) {
    const fade = Math.min(1, i / (SR * 0.9), (N - i) / (SR * 1.4));
    mix[i] += (bed[i] || 0) * 0.40 * fade;
  }
  // dialogue
  for (const c of CUES) {
    if (c.id === 'meow') { add(decode(`${CHAI}/meow.wav`), c.at, 0.85); continue; }
    add(decode(LINES[c.id].file), c.at, 1.0);
  }
  // footsteps through shot A (6 drawings/s -> 2 steps per cycle -> ~3.1 steps/s)
  const step = decode(`${CHAI}/step.wav`);
  for (let k = 0; ; k++) {
    const at = T.shotA[0] + 0.55 + k * 0.335;
    if (at > T.shotA[1] - 0.2) break;
    add(step, at, 0.55);
  }
  // transitions
  add(decode(`${CHAI}/whoosh.wav`), T.whoosh1[0], 0.5);
  add(decode(`${CHAI}/whoosh.wav`), T.whoosh2[0], 0.4);
  // steam + slurp in shot C
  add(decode(`${CHAI}/steam.wav`), T.shotC[0] + 0.4, 0.5);
  const slurp = decode(`${CHAI}/slurp.wav`);
  const gulp = decode(`${CHAI}/gulp.wav`);
  // four laps, each matched to a visible tongue flick in shot C
  const lapStart = T.shotC[0] + 1.40;
  for (let i = 0; i < 4; i++) {
    add(slurp, lapStart + i * 0.62, i % 2 ? 0.62 : 0.86);
    if (i === 1 || i === 3) add(gulp, lapStart + i * 0.62 + 0.42, 0.55);
  }
  // music dip under dialogue
  return mix;
}

/* ---------------- ink helpers ---------------- */
const ink = (g, lw = 6) => { g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = lw; g.strokeStyle = '#14110f'; };
function textPop(g, s, x, y, size, colour = '#ffd94a') {
  g.save();
  g.translate(x, y);
  g.rotate(-0.06);
  g.font = `bold ${size}px sans-serif`;
  g.textAlign = 'center';
  g.lineJoin = 'round'; g.lineWidth = size * 0.28; g.strokeStyle = '#14110f';
  g.strokeText(s, 0, 0);
  g.fillStyle = colour; g.fillText(s, 0, 0);
  g.restore();
}

/* ---------------- props: cutting-chai glass ---------------- */
function drawGlass(g, x, y, h, level, t, steam) {
  const w = h * 0.62;
  g.save();
  g.translate(x, y);
  // tea inside (level 0..1)
  if (level > 0.01) {
    const ih = h * 0.74 * level;
    g.fillStyle = '#b5703a';
    g.beginPath();
    g.moveTo(-w * 0.40, -h * 0.06);
    g.lineTo(-w * 0.34, -h * 0.06 - ih);
    g.lineTo(w * 0.34, -h * 0.06 - ih);
    g.lineTo(w * 0.40, -h * 0.06);
    g.closePath(); g.fill();
    g.fillStyle = '#e8c79a';
    g.beginPath(); g.ellipse(0, -h * 0.06 - ih, w * 0.34, 4, 0, 0, TAU); g.fill();
  }
  // glass body
  g.beginPath();
  g.moveTo(-w * 0.42, -h * 0.02);
  g.lineTo(-w * 0.34, -h * 0.92);
  g.lineTo(w * 0.34, -h * 0.92);
  g.lineTo(w * 0.42, -h * 0.02);
  g.closePath();
  g.fillStyle = 'rgba(226,240,246,0.45)'; g.fill();
  ink(g, 5); g.stroke();
  // rim + base
  g.beginPath(); g.ellipse(0, -h * 0.92, w * 0.34, 4.5, 0, 0, TAU); ink(g, 4); g.stroke();
  g.beginPath(); g.ellipse(0, -h * 0.02, w * 0.42, 4.5, 0, 0, TAU); g.fillStyle = 'rgba(226,240,246,0.5)'; g.fill(); ink(g, 4); g.stroke();
  // steam
  if (steam) {
    g.strokeStyle = 'rgba(255,255,255,0.72)'; g.lineWidth = 3.4; g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const ph = t * 1.6 + k * 1.1;
      g.beginPath();
      for (let i = 0; i <= 22; i++) {
        const p = i / 22;
        const yy = -h * 0.95 - p * h * 0.9;
        const xx = Math.sin(p * 5 + ph) * (7 + k * 2) * (0.3 + p);
        if (i === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
      }
      g.globalAlpha = 0.55 - k * 0.12;
      g.stroke();
    }
  }
  g.restore();
}

/* ---------------- the cat: real generated poses ----------------
   drawCatPose places a pose by its ground contact point (bottom-centre of its bbox).
   opts: { h, flip, bob }  */
const CAT_BOX = {
  walk: [71, 149, 890, 742],
  drink: [41, 194, 948, 764],
  lick: [196, 41, 614, 969],
};
function drawCatPose(g, kind, x, y, h, opts = {}) {
  const img = kind === 'walk' ? A.catWalk : kind === 'drink' ? A.catDrink : A.catLick;
  const [bx, by, bw, bh] = CAT_BOX[kind];
  const sc = (opts.h ?? h) / bh;
  const dw = bw * sc, dh = bh * sc;
  const bob = opts.bob ?? 0;
  g.save();
  g.translate(x, y + bob);
  if (opts.flip) g.scale(-1, 1);
  g.drawImage(img, bx, by, bw, bh, -dw / 2, -dh, dw, dh);
  g.restore();
  return { w: dw, h: dh };
}

/* where the tongue tip sits inside the drink pose (ratio of its bbox) */
const DRINK_TONGUE = [0.955, 0.62];

/* ---------------- shot backgrounds ---------------- */
function drawScrollingStreet(g, t, scrollSpeed) {
  const GROUND = 1000;
  const bgH = 1500, bgW = bgH * (A.bgWalk.width / A.bgWalk.height), bgTop = GROUND - bgH * 0.86;
  g.fillStyle = '#f0b98c'; g.fillRect(0, 0, W, H);
  const scroll = (t * scrollSpeed) % bgW;
  for (let k = -1; k <= Math.ceil(W / bgW) + 1; k++) g.drawImage(A.bgWalk, -scroll + k * bgW, bgTop, bgW, bgH);
  const shade = g.createLinearGradient(0, GROUND - 120, 0, H);
  shade.addColorStop(0, 'rgba(20,16,40,0)'); shade.addColorStop(1, 'rgba(20,16,40,0.35)');
  g.fillStyle = shade; g.fillRect(0, GROUND - 120, W, H - GROUND + 120);
  return GROUND;
}

function drawTapriPlate(g, t, pan = 0, zoom = 1) {
  // the tapri plate is wider than tall; fill the frame and let a slow pan give it life
  const base = Math.max(W / A.bgTapri.width, H / A.bgTapri.height) * 1.07;
  const s = base * zoom;
  const dw = A.bgTapri.width * s, dh = A.bgTapri.height * s;
  const dx = (W - dw) / 2 - pan * (dw - W) * 0.5;
  const dy = (H - dh) * 0.5;
  g.fillStyle = '#f7c86a'; g.fillRect(0, 0, W, H);
  g.drawImage(A.bgTapri, dx, dy, dw, dh);
}

/* ---------------- speaking bust ---------------- */
const MOUTH_SERIES = {};
function drawKabirBust(g, t, talking, mouth, blink) {
  const s = 640 / A.kabir.width;
  const dw = A.kabir.width * s, dh = A.kabir.height * s;
  const bob = talking ? Math.sin(t * 9) * 2 : Math.sin(t * 2.2) * 3;
  const x = W / 2 - dw / 2, y = H - dh + 40 + bob;
  g.drawImage(A.kabir, x, y, dw, dh);
  const P = { A: [250, 260, 88, 44], O: [250, 260, 88, 44], E: [250, 260, 88, 44] };
  if (talking && mouth && A[`patch${mouth}`]) {
    const [px, py, pw, ph] = P[mouth];
    const pimg = A[`patch${mouth}`];
    g.drawImage(pimg, x + px * s, y + py * s, pw * s, ph * s);
  }
  if (blink && A.patchblink) {
    const [bx, by, bw, bh] = [222, 182, 144, 42];
    g.drawImage(A.patchblink, x + bx * s, y + by * s, bw * s, bh * s);
  }
}

/* ---------------- mouth driver from the real audio ---------------- */
function buildMouthTrack(pcm) {
  const nf = Math.ceil(DUR * FPS);
  const out = new Array(nf).fill(null);
  const N = 1024;
  let peak = 0.05;
  for (let f = 0; f < nf; f++) {
    const st = Math.max(0, Math.floor((f / FPS) * SR) - N);
    let s2 = 0;
    for (let i = 0; i < N; i++) { const x = pcm[st + i] || 0; s2 += x * x; }
    const rms = Math.sqrt(s2 / N);
    peak = Math.max(rms, peak * 0.995, 0.02);
    const lv = clamp((rms / peak) * 1.05, 0, 1);
    out[f] = lv < 0.14 ? null : lv > 0.62 ? 'A' : lv > 0.34 ? 'E' : 'O';
  }
  return out;
}

/* ---------------- main ---------------- */
const mix = buildAudio();
// per-line PCM for the mouth track (concatenated into a full-length buffer)
const voiceTrack = new Float32Array(Math.ceil(DUR * SR));
for (const c of CUES) {
  if (c.id === 'meow') continue;
  const pcm = decode(LINES[c.id].file);
  const s = Math.floor(c.at * SR);
  for (let i = 0; i < pcm.length && s + i < voiceTrack.length; i++) voiceTrack[s + i] += pcm[i];
}
const mouthTrack = buildMouthTrack(voiceTrack);

// wav for ffmpeg
{
  let peak = 0;
for (let i = 0; i < mix.length; i++) peak = Math.max(peak, Math.abs(mix[i]));
const trim = peak > 0.80 ? 0.80 / peak : 1;
for (let i = 0; i < mix.length; i++) mix[i] *= trim;
const b = Buffer.alloc(44 + mix.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + mix.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(mix.length * 2, 40);
  for (let i = 0; i < mix.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mix[i] * 32767))), 44 + i * 2);
  fs.writeFileSync('/tmp/chai-mix.wav', b);
}

const canvas = createCanvas(W, H);
const g = canvas.getContext('2d');
const nf = Math.ceil(DUR * FPS);
const OUT = P('out/chai-short.mp4');
const ff = spawn(ffmpegPath, [
  '-loglevel', 'error', '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-i', '/tmp/chai-mix.wav',
  '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-crf', '21',
  '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT,
], { stdio: ['pipe', 'ignore', 'inherit'] });

for (let f = 0; f < nf; f++) {
  const t = f / FPS;
  const mouth = mouthTrack[f];
  const blink = (t % 3.4) < 0.1;

  if (t < T.shotA[0]) {
    /* ---------- TITLE CARD ---------- */
    drawTapriPlate(g, t, 0, 1.02);
    g.fillStyle = 'rgba(12,10,20,0.35)'; g.fillRect(0, 0, W, H);
    const a = clamp((t - 0.15) / 0.5, 0, 1) * clamp((T.title[1] - t) / 0.35, 0, 1);
    g.save(); g.globalAlpha = a; g.textAlign = 'center';
    textPop(g, 'CUTTING CHAI', W / 2, H * 0.36, 74);
    g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif';
    g.fillText('ek chhoti si kahani', W / 2, H * 0.36 + 56);
    g.restore();
  } else if (t < T.shotA[1]) {
    /* ---------- SHOT A · walk-in ---------- */
    const ground = drawScrollingStreet(g, t, 644);
    const poseIdx = Math.floor((t - T.shotA[0]) * 6) % 6;
    const ch = POSE_META.canvas[1], cw = POSE_META.canvas[0];
    const scale = 700 / ch;
    const dw = cw * scale, dh = ch * scale;
    const walkIn = smooth(clamp((t - T.shotA[0]) / 0.9, 0, 1));
    const x = -dw * 0.35 + walkIn * (W * 0.5 - dw * 0.1);
    g.save(); g.globalAlpha = 0.22; g.fillStyle = '#141018';
    g.beginPath(); g.ellipse(x + dw / 2, ground + 4, 92, 14, 0, 0, TAU); g.fill(); g.restore();
    g.drawImage(A.poses[poseIdx], x, ground - dh + 6, dw, dh);
    // signpost gag: the tapri comes into view
    if (t > 6.4) {
      const a2 = clamp((t - 6.4) / 0.4, 0, 1);
      g.save(); g.globalAlpha = a2 * 0.95;
      textPop(g, 'tapri?', W * 0.72, H * 0.44, 44, '#fff');
      g.restore();
    }
  } else if (t < T.shotB[0]) {
    /* ---------- WHOOSH ---------- */
    const k = (t - T.whoosh1[0]) / (T.whoosh1[1] - T.whoosh1[0]);
    g.fillStyle = '#14110f'; g.fillRect(0, 0, W, H);
    g.save();
    g.globalAlpha = 0.6;
    for (let i = 0; i < 9; i++) {
      const yy = H * (0.2 + i * 0.075);
      const off = Math.sin(k * Math.PI + i) * 90;
      g.strokeStyle = i % 2 ? '#ffd94a' : '#e8695f'; g.lineWidth = 8;
      g.beginPath(); g.moveTo(-100 + off, yy); g.lineTo(W + 100 + off, yy); g.stroke();
    }
    g.restore();
  } else if (t < T.shotB[1]) {
    /* ---------- SHOT B · counter ---------- */
    drawTapriPlate(g, t, clamp((t - T.shotB[0]) / 7, 0, 1) * 0.5, 1.06);
    drawKabirBust(g, t, !!mouth, mouth, blink);
    if (t > 11.4 && t < 12.6) {
      const a3 = clamp((t - 11.4) / 0.25, 0, 1) * clamp((12.6 - t) / 0.25, 0, 1);
      g.save(); g.globalAlpha = a3; textPop(g, 'kadak!', W * 0.3, H * 0.5, 46); g.restore();
    }
  } else if (t < T.shotC[0]) {
    /* ---------- WHOOSH 2 ---------- */
    const k = (t - T.whoosh2[0]) / (T.whoosh2[1] - T.whoosh2[0]);
    g.fillStyle = '#14110f'; g.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = 0.55;
    for (let i = 0; i < 9; i++) {
      const yy = H * (0.2 + i * 0.075);
      const off = Math.sin(k * Math.PI + i * 1.6) * 90;
      g.strokeStyle = i % 2 ? '#8fd6a8' : '#ffd94a'; g.lineWidth = 8;
      g.beginPath(); g.moveTo(-100 + off, yy); g.lineTo(W + 100 + off, yy); g.stroke();
    }
    g.restore();
  } else if (t < T.shotC[1]) {
    /* ---------- SHOT C · the theft (side view) ---------- */
    drawTapriPlate(g, t, 0.55 + (t - T.shotC[0]) / 22, 1.22);
    const BENCH_Y = H * 0.79;               // plank top
    const FLOOR_Y = H * 0.90;               // where a walking cat's paws land
    const glassX = W * 0.56, glassH = 150;
    const GLASS_BASE = BENCH_Y + 3;
    const rimY = GLASS_BASE - glassH * 0.92;

    /* ---- the bench (plank + two legs, foreground dressing) ---- */
    const bezel = '#8a5a34';
    g.fillStyle = '#6d452a';
    for (const lx of [0.215, 0.545]) {
      g.beginPath(); g.roundRect(W * lx, BENCH_Y + 18, 22, FLOOR_Y - BENCH_Y - 4, 5); g.fill(); ink(g, 5); g.stroke();
    }
    g.fillStyle = bezel;
    g.beginPath(); g.roundRect(W * 0.16, BENCH_Y, W * 0.70, 26, 8); g.fill(); ink(g, 5); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.beginPath(); g.roundRect(W * 0.16, BENCH_Y + 2, W * 0.70, 7, 4); g.fill();

    /* ---- beat clock (seconds into the shot) ---- */
    const sc = t - T.shotC[0];              // 0 .. 7.1
    const walkEnd = 1.15;
    const lapStart = walkEnd + 0.25;
    const lapEvery = 0.62;
    const laps = 4;
    const drinkEnd = lapStart + laps * lapEvery;
    const lickStart = drinkEnd + 0.15;

    // tea level drops ONLY on each visible lap
    let level = 1;
    for (let i = 0; i < laps; i++) {
      const l0 = lapStart + i * lapEvery, l1 = l0 + lapEvery * 0.55;
      level -= (1 / laps) * smooth(clamp((sc - l0) / (l1 - l0), 0, 1));
    }
    level = clamp(level, 0, 1);

    const catH = 205;
    let catKind = 'walk', catX = W * 0.06, catY = FLOOR_Y, catBob = 0;

    if (sc < walkEnd) {
      const k = smooth(clamp(sc / walkEnd, 0, 1));
      catX = W * 0.06 + (glassX - 150 - W * 0.06) * k;
      catY = FLOOR_Y;
      catBob = Math.sin(t * 16) * 2.2;
    } else if (sc < lickStart) {
      catKind = 'drink';
      catY = GLASS_BASE;
      catBob = Math.sin((sc - walkEnd) * 18) * 1.4;
    } else {
      catKind = 'lick';
      catX = glassX - 215;
      catY = GLASS_BASE;
      catBob = Math.sin(t * 6) * 1.5;
    }

    if (catKind === 'drink') {
      // pin the tongue tip on the rim
      const [bx, by, bw, bh] = CAT_BOX.drink;
      const sca = catH / bh;
      const tipX = (bx + DRINK_TONGUE[0] * bw - (bx + bw / 2)) * sca;
      const tipY = (by + DRINK_TONGUE[1] * bh - (by + bh)) * sca;
      drawCatPose(g, 'drink', glassX - 14 - tipX, rimY - tipY, catH, { bob: catBob });
      drawGlass(g, glassX, GLASS_BASE, glassH, level, t, level > 0.25);
    } else {
      drawGlass(g, glassX, GLASS_BASE, glassH, level, t, level > 0.25);
      drawCatPose(g, catKind, catX, catY, catH, { bob: catBob });
    }

    // one caption per tongue-flick, so the drink reads as the cause
    for (let i = 0; i < laps; i++) {
      const l0 = lapStart + i * lapEvery;
      if (sc > l0 && sc < l0 + 0.34) {
        const a4 = clamp((sc - l0) / 0.06, 0, 1) * clamp((l0 + 0.34 - sc) / 0.12, 0, 1);
        g.save(); g.globalAlpha = a4;
        textPop(g, i < 2 ? 'lap lap' : 'slurrrp', glassX + (i % 2 ? 104 : -104), rimY - 54, 30, '#fff');
        g.restore();
      }
    }
    // paw print on the bench
    if (sc > lickStart + 0.2) {
      const a5b = clamp((sc - lickStart - 0.2) / 0.25, 0, 1);
      g.save(); g.globalAlpha = a5b * 0.85;
      g.fillStyle = '#3a2a1c';
      g.beginPath(); g.ellipse(W * 0.42, BENCH_Y + 14, 13, 11, 0, 0, TAU); g.fill();
      for (const [dx, dy] of [[-13, -12], [-4, -17], [6, -17], [14, -11]]) {
        g.beginPath(); g.ellipse(W * 0.42 + dx, BENCH_Y + 14 + dy, 4.6, 5.6, 0, 0, TAU); g.fill();
      }
      g.restore();
    }
    if (sc > 5.0) {
      const a5 = clamp((sc - 5.0) / 0.3, 0, 1);
      g.save(); g.globalAlpha = a5; textPop(g, '...khaali.', W * 0.5, H * 0.50, 52, '#ffffff'); g.restore();
    }
  } else {
    /* ---------- SHOT D · payoff ---------- */
    const shake = t > 23.9 && t < 24.9 ? Math.sin(t * 70) * 5 * (1 - (t - 23.9)) : 0;
    g.save(); g.translate(shake, shake * 0.4);
    drawTapriPlate(g, t, 1 - clamp((t - T.shotD[0]) / 6, 0, 1) * 0.4, 1.04 + (t - T.shotD[0]) * 0.004);
    const angry = t > 23.9 && t < 26.0;
    drawKabirBust(g, t, !!mouth, mouth, blink);
    if (angry) {
      // comic anger mark
      g.save();
      const a6 = clamp((t - 23.9) / 0.2, 0, 1);
      g.globalAlpha = a6;
      g.strokeStyle = '#e8484f'; g.lineWidth = 9; g.lineCap = 'round';
      const cx = W * 0.72, cy = H * 0.30;
      for (let i = 0; i < 4; i++) {
        const ang = -0.7 + i * 0.42;
        g.beginPath();
        g.moveTo(cx + Math.cos(ang) * 18, cy + Math.sin(ang) * 18);
        g.lineTo(cx + Math.cos(ang) * 44, cy + Math.sin(ang) * 44);
        g.stroke();
      }
      g.restore();
    }
    // cat pops up for the last beat
    if (t > 26.0) {
      const pop = smooth(clamp((t - 26.0) / 0.35, 0, 1));
      drawCatPose(g, 'lick', W * 0.80, H * 0.995 + (1 - pop) * 170, 230, { bob: Math.sin(t * 7) * 2 });
    }
    g.restore();
    if (t > 28.6) {
      const a7 = clamp((t - 28.6) / 0.4, 0, 1);
      g.save(); g.globalAlpha = a7;
      g.fillStyle = 'rgba(12,10,20,0.55)'; g.fillRect(0, H - 210, W, 210);
      g.textAlign = 'center';
      textPop(g, 'cutting chai:', W / 2, H - 132, 36, '#ffd94a');
      g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif';
      g.fillText('sharing allowed 🐾', W / 2, H - 84);
      g.restore();
    }
  }

  /* ---------- grade + vignette ---------- */
  const v = g.createRadialGradient(W / 2, H * 0.5, H * 0.30, W / 2, H * 0.5, H * 0.80);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(16,10,26,0.40)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);

  /* ---------- subtitles ---------- */
  const sub = SUBTITLES.find((s) => t >= s.a && t < s.b);
  if (sub) {
    g.save();
    g.textAlign = 'center';
    g.font = 'bold 34px sans-serif';
    const lines = [];
    let cur = '';
    for (const word of sub.text.split(' ')) {
      const test = cur ? `${cur} ${word}` : word;
      if (g.measureText(test).width > W * 0.86) { lines.push(cur); cur = word; } else cur = test;
    }
    if (cur) lines.push(cur);
    const y0 = H - 150 - (lines.length - 1) * 44;
    g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = '#14110f';
    lines.forEach((ln, i) => {
      g.strokeText(ln, W / 2, y0 + i * 44);
      g.fillStyle = '#fff'; g.fillText(ln, W / 2, y0 + i * 44);
    });
    g.restore();
  }

  const px = g.getImageData(0, 0, W, H).data;
  if (!ff.stdin.write(Buffer.from(px.buffer, px.byteOffset, px.byteLength))) {
    await new Promise((r) => ff.stdin.once('drain', r));
  }
  if (f % 60 === 0) process.stderr.write(`\r frame ${f}/${nf}`);
}
ff.stdin.end();
await new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg failed')))));
console.error('\n done ->', OUT);

function timeLevel(t) {
  if (t < 15.2) return 1;
  return clamp(1 - (t - 15.2) / 0.8, 0, 1);
}
