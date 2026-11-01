// rigpop-motion · cut-out walk demo
// Uses the AI-generated side-view drawing of Kabir as a paper-puppet:
// pieces are cropped from the art, pivoted at hip/knee/neck, and driven by an
// analytic walk cycle. Nothing here is "drawn" — every frame is the real artwork.
import fs from 'node:fs';
import { P } from './paths.mjs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import ffmpegPath from 'ffmpeg-static';

const W = 720, H = 1280, FPS = 30, DURATION = 8.0;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- rig definition (image-space pixels of the source artwork) -------- */
const RIG = {
  src: P('characters/kabir-side/base_cut.png'),
  // crops: [x, y, w, h]  — measured off the artwork, pivots are in source pixels
  head:  { crop: [300,  20, 330, 260], pivot: [470, 264] },
  torso: { crop: [262, 240, 350, 560], pivot: [466, 772] }, // jacket + backpack + arms
  legs:  { crop: [340, 690, 280, 480], pivot: [462, 772] }, // trousers + both shoes
  footBottom: 1160,
  height: 1122,                    // hair-top to shoe-sole
};

async function buildPieces() {
  const img = await loadImage(RIG.src);
  const pieces = {};
  for (const key of ['head', 'torso', 'legs']) {
    const [x, y, w, h] = RIG[key].crop;
    const c = createCanvas(w, h);
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
    const [px, py] = RIG[key].pivot;
    pieces[key] = { img: c, w, h, px: px - x, py: py - y };
  }
  // darkened variant for the far-side leg (depth cue)
  for (const key of ['legs']) {
    const p = pieces[key];
    const c = createCanvas(p.w, p.h);
    const g = c.getContext('2d');
    g.drawImage(p.img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(10, 16, 40, 0.42)';
    g.fillRect(0, 0, p.w, p.h);
    pieces[key + 'Far'] = { img: c, w: p.w, h: p.h, px: p.px, py: p.py };
  }
  return pieces;
}

/* ---------- walk cycle ---------- */
function legAngle(phase, swing = 0.30) {
  // one leg fore, the other aft; 0 phase = legs together
  return -swing * Math.sin(phase * TAU);
}

function drawLeg(g, P, angle, far) {
  const piece = far ? P.legsFar : P.legs;
  g.save();
  g.translate(far ? -7 : 0, far ? 2 : 0);
  g.rotate(angle);
  g.drawImage(piece.img, -piece.px, -piece.py);
  g.restore();
}

/* ---------- scene ---------- */
async function main() {
  const P = await buildPieces();
  const bg = await loadImage(P('assets/sidewalk-scroll.png'));

  const S = 660 / RIG.height;                       // character height on stage
  const GROUND = 1000;                              // where the soles touch
  const HIP_Y = GROUND - (RIG.footBottom - RIG.torso.pivot[1]) * S;
  const HIP_X = 398;

  // background layer sized so its sidewalk line sits on GROUND
  const bgH = 1500;
  const bgW = bgH * (bg.width / bg.height);
  const bgTop = GROUND - bgH * 0.86;

  const canvas = createCanvas(W, H);
  const g = canvas.getContext('2d');
  const nf = Math.ceil(DURATION * FPS);
  const OUT = P('out/cutout-kabir.mp4');

  const ff = spawn(ffmpegPath, [
    '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-i', P('assets/kabir-walk.m4a'),
    '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT,
  ], { stdio: ['pipe', 'ignore', 'inherit'] });

  const strideHz = 1.55;       // strides per second
  const scrollSpeed = 300;     // px/s of world

  for (let f = 0; f < nf; f++) {
    const t = f / FPS;
    const phase = (t * strideHz) % 1;

    /* ---- sky + scrolling street (mirror-tiled so it never ends) ---- */
    g.fillStyle = '#f0b98c'; g.fillRect(0, 0, W, H);
    const scroll = (t * scrollSpeed) % bgW;
    for (let k = -1; k <= Math.ceil(W / bgW) + 1; k++) {
      g.drawImage(bg, -scroll + k * bgW, bgTop, bgW, bgH);
    }
    // road shading so the character pops
    const shade = g.createLinearGradient(0, GROUND - 120, 0, H);
    shade.addColorStop(0, 'rgba(20,16,40,0)');
    shade.addColorStop(1, 'rgba(20,16,40,0.35)');
    g.fillStyle = shade; g.fillRect(0, GROUND - 120, W, H - GROUND + 120);

    /* ---- contact shadow ---- */
    const aA = legAngle(phase), bA = legAngle((phase + 0.5) % 1);
    g.save();
    g.globalAlpha = 0.22;
    g.fillStyle = '#141018';
    g.beginPath(); g.ellipse(HIP_X + 6, GROUND + 4, 96, 15, 0, 0, TAU); g.fill();
    g.restore();

    /* ---- the puppet ---- */
    const bob = -Math.abs(Math.cos(phase * TAU)) * 5.0;
    const lean = -0.02 - 0.022 * Math.sin(phase * TAU * 2);

    g.save();
    g.translate(HIP_X, HIP_Y + bob);
    g.scale(S, S);

    // far leg behind everything
    drawLeg(g, P, bA - 0.03, true);

    // torso (jacket + backpack + arms) rotates about the hip
    g.save();
    g.rotate(lean);
    g.drawImage(P.torso.img, -P.torso.px, -P.torso.py);
    g.restore();

    // head sits on the neck, which rides the torso rotation
    const neckLocal = [RIG.head.pivot[0] - RIG.torso.pivot[0], RIG.head.pivot[1] - RIG.torso.pivot[1]];
    const cosL = Math.cos(lean), sinL = Math.sin(lean);
    const nx = neckLocal[0] * cosL - neckLocal[1] * sinL;
    const ny = neckLocal[0] * sinL + neckLocal[1] * cosL;
    g.save();
    g.translate(nx, ny);
    g.rotate(lean + 0.05 * Math.sin(phase * TAU + 1.1));
    g.drawImage(P.head.img, -P.head.px, -P.head.py);
    g.restore();

    // near leg in front of the torso
    drawLeg(g, P, aA, false);
    g.restore();

    /* ---- grade: warm dusk + vignette ---- */
    g.save();
    g.globalCompositeOperation = 'overlay';
    g.fillStyle = 'rgba(255, 190, 130, 0.10)';
    g.fillRect(0, 0, W, H);
    g.restore();
    const v = g.createRadialGradient(W / 2, H * 0.52, H * 0.28, W / 2, H * 0.52, H * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(18,10,36,0.46)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);

    /* ---- titles ---- */
    const ta = clamp(1 - Math.abs(t - 1.5) / 1.0, 0, 1);
    if (ta > 0.01) {
      g.save(); g.globalAlpha = ta; g.textAlign = 'center';
      g.fillStyle = 'rgba(18,14,26,0.80)';
      g.beginPath(); g.roundRect(W / 2 - 250, 100, 500, 118, 26); g.fill();
      g.fillStyle = '#ffd94a'; g.font = 'bold 40px sans-serif';
      g.fillText('Kabir is walking', W / 2, 152);
      g.fillStyle = '#f5f0e6'; g.font = 'bold 24px sans-serif';
      g.fillText('AI artwork · cut-out rig · walk cycle', W / 2, 190);
      g.restore();
    }

    const px = g.getImageData(0, 0, W, H).data;
    if (!ff.stdin.write(Buffer.from(px.buffer, px.byteOffset, px.byteLength))) {
      await new Promise((r) => ff.stdin.once('drain', r));
    }
    if (f % 30 === 0) process.stderr.write(`\r frame ${f}/${nf}`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg failed')))));
  console.error('\n done ->', OUT);
}

main();
