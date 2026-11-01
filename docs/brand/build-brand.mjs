// Builds the repo's brand assets from real artwork + code.
//   node docs/brand/build-brand.mjs
// Outputs: docs/banner.png, docs/logo.png, docs/logo.svg
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const P = (...p) => path.join(ROOT, ...p);

const FONT_PATH = '/home/user/rigpop-agents/fonts/DejaVuSans-Bold.ttf';
GlobalFonts.registerFromPath(FONT_PATH, 'Brand');
const F = 'Brand';

const INK = '#14110f';
const CREAM = '#f6f1e6';
const MUTED = '#a79ec0';
const YEL = '#ffd94a';
const CORAL = '#e8695f';

/* ------------------------------------------------------------------ logo mark */
function logoMark(g, size) {
  const r = size * 0.24;
  g.save();
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#241d2e');
  grad.addColorStop(1, '#14111d');
  g.beginPath(); g.roundRect(0, 0, size, size, r); g.fillStyle = grad; g.fill();
  g.lineWidth = Math.max(2, size * 0.018); g.strokeStyle = '#3a3350'; g.stroke();

  // clapper stripes along the top (clipped to the tile)
  g.save();
  g.beginPath(); g.roundRect(0, 0, size, size, r); g.clip();
  g.fillStyle = YEL;
  for (let i = 0; i < 7; i++) {
    g.save();
    g.translate(size * (0.045 + i * 0.145), size * 0.085);
    g.rotate(-0.30);
    g.beginPath(); g.roundRect(0, -size * 0.019, size * 0.075, size * 0.038, size * 0.012); g.fill();
    g.restore();
  }
  // --- motion trail: three clean arcs radiating from a fixed point on the left
  const ax = size * 0.30, ay = size * 0.585;
  const arcs = [[0.145, YEL], [0.225, CORAL], [0.305, '#5a4f78']];
  g.lineCap = 'round';
  for (const [rad, col] of arcs) {
    g.beginPath();
    g.arc(ax, ay, size * rad, -0.78, 0.78);
    g.lineWidth = size * 0.036;
    g.strokeStyle = col;
    g.stroke();
  }
  // --- play head: a film frame with a triangle, sitting on the arcs' right
  const bw = size * 0.36, bh = size * 0.32;
  const bx = size * 0.50, by = ay - bh / 2;
  g.beginPath(); g.roundRect(bx, by, bw, bh, size * 0.055);
  g.fillStyle = CREAM; g.fill();
  g.lineWidth = size * 0.030; g.strokeStyle = INK; g.stroke();
  g.beginPath();
  g.moveTo(bx + bw * 0.34, by + bh * 0.22);
  g.lineTo(bx + bw * 0.34 + bh * 0.56, ay);
  g.lineTo(bx + bw * 0.34, by + bh * 0.78);
  g.closePath();
  g.fillStyle = INK; g.fill();
  g.restore();
  g.restore();
}

/* ------------------------------------------------------------------- wordmark */
function wordmark(g, x, y, size) {
  g.font = `bold ${size}px ${F}`;
  g.textBaseline = 'alphabetic';
  const a = 'rigpop';
  const b = '-motion';
  g.fillStyle = CREAM;
  g.fillText(a, x, y);
  const wa = g.measureText(a).width;
  const grad = g.createLinearGradient(x + wa, y - size, x + wa + g.measureText(b).width, y);
  grad.addColorStop(0, YEL);
  grad.addColorStop(1, CORAL);
  g.fillStyle = grad;
  g.fillText(b, x + wa, y);
  return wa + g.measureText(b).width;
}

function pill(g, x, y, label, size = 15) {
  g.font = `bold ${size}px ${F}`;
  const padX = 14, h = size + 16;
  const w = g.measureText(label).width + padX * 2;
  g.beginPath(); g.roundRect(x, y, w, h, h / 2);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fill();
  g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,255,255,0.16)'; g.stroke();
  g.fillStyle = MUTED;
  g.fillText(label, x + padX, y + h / 2 + size * 0.35);
  return w;
}

/* -------------------------------------------------------------------- banner */
async function banner() {
  const W = 1600, H = 440;
  const c = createCanvas(W, H);
  const g = c.getContext('2d');

  // backdrop
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#171422');
  bg.addColorStop(0.6, '#1f1a2c');
  bg.addColorStop(1, '#2a1f2f');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);

  // warm glow behind the characters
  const glow = g.createRadialGradient(W * 0.82, H * 0.62, 40, W * 0.82, H * 0.62, W * 0.34);
  glow.addColorStop(0, 'rgba(255,217,74,0.20)');
  glow.addColorStop(0.5, 'rgba(232,105,95,0.08)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);

  // dot grid
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 26; y < H; y += 34) for (let x = 26 + ((y / 34) % 2 ? 17 : 0); x < W; x += 34) {
    g.beginPath(); g.arc(x, y, 1.4, 0, Math.PI * 2); g.fill();
  }

  // logo + wordmark
  const markSize = 96;
  g.save(); g.translate(90, 92); logoMark(g, markSize); g.restore();
  wordmark(g, 90, 92 + markSize + 78, 76);

  g.font = `bold 26px ${F}`;
  g.fillStyle = MUTED;
  g.fillText('Cartoon animation from generated artwork', 90, 92 + markSize + 78 + 46);

  // chips
  let cx = 90;
  const cy = H - 96;
  for (const label of ['pose flip-book', 'cut-out rigs', 'camera moves', 'lip-sync', 'cue-locked sound']) {
    cx += pill(g, cx, cy, label) + 12;
  }

  // micro-copy, top right (kept away from the artwork)
  g.font = `bold 17px ${F}`;
  g.fillStyle = 'rgba(255,255,255,0.40)';
  g.textAlign = 'right';
  g.fillText('Node ≥ 18', W - 90, 74);
  g.fillText('MIT', W - 90, 100);
  g.fillText('zero API keys', W - 90, 126);
  g.textAlign = 'left';

  // ---- characters (real generated art) ----
  const kabir = await loadImage(P('characters/kabir-side/poses/pose_2.png'));
  const cat = await loadImage(P('characters/street-cat/cat_walk_cut.png'));

  // stage ellipse
  g.save();
  g.globalAlpha = 0.5;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.ellipse(W * 0.80, H - 46, 330, 24, 0, 0, Math.PI * 2); g.fill();
  g.restore();

  const kH = 380, kW = kabir.width * (kH / kabir.height);
  g.drawImage(kabir, W * 0.845 - kW / 2, H - 42 - kH, kW, kH);

  const cH = 178, cW = cat.width * (cH / cat.height);
  g.drawImage(cat, W * 0.715 - cW / 2, H - 52 - cH, cW, cH);

  // thin accent underline
  const acc = g.createLinearGradient(0, 0, 260, 0);
  acc.addColorStop(0, YEL); acc.addColorStop(1, CORAL);
  g.fillStyle = acc;
  g.beginPath(); g.roundRect(90, H - 62, 190, 5, 3); g.fill();

  fs.writeFileSync(P('docs/banner.png'), await c.encode('png'));
  console.log('docs/banner.png');
}

/* ---------------------------------------------------------------------- logo */
async function logo() {
  const S = 512;
  const c = createCanvas(S, S);
  const g = c.getContext('2d');
  logoMark(g, S);
  fs.writeFileSync(P('docs/logo.png'), await c.encode('png'));
  console.log('docs/logo.png');
}

/* ------------------------------------------------------------------ logo.svg */
function logoSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="rigpop-motion">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#241d2e"/><stop offset="1" stop-color="#14111d"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="123" fill="url(#tile)" stroke="#3a3350" stroke-width="10"/>
  <g fill="none" stroke-linecap="round">
    <path d="M232 190 A 96 96 0 0 1 232 322" stroke="#ffd94a" stroke-width="18"/>
    <path d="M210 152 A 138 138 0 0 1 210 360" stroke="#e8695f" stroke-width="18"/>
    <path d="M188 114 A 180 180 0 0 1 188 398" stroke="#5a4f78" stroke-width="18"/>
  </g>
  <rect x="225" y="205" width="174" height="154" rx="26" fill="#f6f1e6" stroke="#14110f" stroke-width="14"/>
  <path d="M285 240 L345 282 L285 324 Z" fill="#14110f"/>
  <g fill="#ffd94a" transform="rotate(-20 0 0)">
    <rect x="60" y="30" width="38" height="22"/><rect x="142" y="30" width="38" height="22"/>
    <rect x="224" y="30" width="38" height="22"/><rect x="306" y="30" width="38" height="22"/>
    <rect x="388" y="30" width="38" height="22"/>
  </g>
</svg>
`;
  fs.writeFileSync(P('docs/logo.svg'), svg);
  console.log('docs/logo.svg');
}

await logo();
await logoSvg();
await banner();
