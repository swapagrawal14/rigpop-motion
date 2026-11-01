// rigpop-motion v3 · sleeves painted into the torso.
//
// The arm is ONE continuous tapered skin strip that starts under the sleeve opening. The sleeve
// itself belongs to the torso image (sloped shoulder line, short tube, hem), never to the arm,
// so a swinging arm can't make a puffy shoulder cap pop off the body. Two images come out:
//
//   parts/torso.png     body + both sleeves (what the rig draws as the torso)
//   parts/torso.body.png  the body alone (the rig draws body, then each sleeve with its shrug)
//   parts/sleeves.png   the sleeves alone, same frame: drawn on the body and again over each
//                       arm root so it tucks in
//
// The joint each arm hangs from is chosen here and written to rig.json (torso.sleeves), so the
// loader, the sleeve art and the arm all agree. Run after the auto-rig, or on its own:
//   node src/v3/sleeves.mjs characters/kabir
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readRGBA, writePNG, toCanvas, alphaBox, rowSpan, cleanAndInk, dominantColour } from './imgops.mjs';
import { RIGS } from '../v2/rig.mjs';
import { LW, INK } from '../v2/ink.mjs';

const PAD = 40;
const hex = (c) => '#' + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');

// Trim sleeve flaps the image model painted on (body column only above the armpit), re-ink.
function trimFlaps(im) {
  const bb = alphaBox(im);
  let maxW = 0, maxY = bb.y0; for (let y = bb.y0; y <= bb.y1; y++) { const s = rowSpan(im, y); if (s && s.w > maxW) { maxW = s.w; maxY = y; } }
  let pit = -1; for (let y = maxY; y < bb.y0 + bb.h * 0.7; y++) { const s = rowSpan(im, y); if (s && s.w < maxW * 0.9) { pit = y; break; } }
  if (pit < 0) return { im, trimmed: false };
  const body = rowSpan(im, pit + 6);
  const px = new Uint8ClampedArray(im.px);
  for (let y = 0; y < pit + 6; y++) for (let x = 0; x < im.w; x++) if (x < body.a + 1 || x > body.b - 1) px[(y * im.w + x) * 4 + 3] = 0;
  return { im: cleanAndInk({ ...im, px }, { erode: 0, ink: 0.9, inkWidth: 2 }), trimmed: true };
}

export async function sleeveTorso(dir, { log = console.error } = {}) {
  const rigFile = path.join(dir, 'rig.json');
  const rig = JSON.parse(fs.readFileSync(rigFile, 'utf8'));
  const base = RIGS[rig.base];
  const partsDir = path.join(dir, 'parts');
  const baseFile = path.join(partsDir, 'torso.base.png');
  // always rebuild from the cut torso (with its own measurements), never from a sleeved one
  if (!fs.existsSync(baseFile)) { fs.copyFileSync(path.join(partsDir, 'torso.png'), baseFile); rig.parts.torso.base = { ...rig.parts.torso, file: 'parts/torso.base.png' }; }
  const T0 = rig.parts.torso.base || rig.parts.torso;
  let im = await readRGBA(baseFile);
  const tr = trimFlaps(im); im = tr.im;
  // pad so sleeves can reach past the old frame
  const W = im.w + PAD * 2, H = im.h + PAD * 2;
  const sh = (p) => ({ x: p.x + PAD, y: p.y + PAD });
  const T = { ...T0, w: W, h: H, neckTop: sh(T0.neckTop), hip: sh(T0.hip), shirtTop: T0.shirtTop + PAD, hem: T0.hem + PAD, shoulderL: sh(T0.shoulderL), shoulderR: sh(T0.shoulderR) };
  const kT = (base.torsoH + 10) / (T.hem - T.shirtTop); // rig units per px (as the loader)
  const px = (u) => u / kT;
  // colours of the shirt / dress: the most common non-ink colour, and its shade
  const main = dominantColour(im, { exclude: (r, g, b) => r + g + b < 140 });
  const shade = dominantColour(im, { exclude: (r, g, b) => r + g + b < 90 || Math.hypot(r - main[0], g - main[1], b - main[2]) < 28 || r + g + b > main[0] + main[1] + main[2] - 20 });
  // arm width (rig units, ink included): v2 width, but never chunky against a narrow painted body
  const shY0 = T.shirtTop + Math.round(px(base.shoulderInset));
  const span = rowSpan({ ...im, w: im.w, h: im.h }, shY0 - PAD) || { a: T0.shoulderL.x, b: T0.shoulderR.x, w: T0.shoulderR.x - T0.shoulderL.x };
  const spanU = span.w * kT;
  const armRoot = Math.min(base.armW + 2 * LW, spanU * 0.36);
  const dress = !!base.dress;
  // joints: just inside the body edge at shoulder height
  const jx = (edge, sgn) => edge + PAD - sgn * px(armRoot) * 0.32;
  const joint = { L: { x: jx(span.a, -1), y: shY0 }, R: { x: jx(span.b, 1), y: shY0 } };
  // sleeve geometry, same shape language as the v2 vector sleeve
  const Ls = px(base.upper * (dress ? 0.46 : 0.5));
  const wr = px(armRoot) * (dress ? 0.64 : 0.6), wh = px(armRoot) * (dress ? 0.74 : 0.62);
  const th = dress ? 0.42 : 0.32;
  const ink = Math.max(3, px(LW) * 0.62);
  const geom = {};
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? -1 : 1, j0 = joint[side];
    const u = { x: sgn * Math.sin(th), y: Math.cos(th) }, n = { x: sgn * Math.cos(th), y: -Math.sin(th) };
    const at = (a, b) => ({ x: j0.x + u.x * a + n.x * b, y: j0.y + u.y * a + n.y * b });
    // the shoulder line starts on the body's own top edge, between neck and shoulder
    const nx = lerp(T.neckTop.x + sgn * T0.neckW * 0.5, j0.x, 0.3);
    let ty = T.shirtTop; const cx = Math.round(nx - PAD);
    for (let y = 0; y < im.h; y++) if (im.px[(y * im.w + cx) * 4 + 3] > 128) { ty = y + PAD; break; }
    const Ti = { x: nx, y: ty + ink * 0.5 };
    const To = at(-wr * 0.34, wr), Ho = at(Ls, wh), Hi = at(Ls, -wh), Ai = at(wr * 0.4, -wr * 0.95);
    geom[side] = { sgn, j0, u, n, at, Ti, To, Ho, Hi, Ai, Tc: { x: lerp(Ti.x, To.x, 0.55), y: lerp(Ti.y, To.y, 0.3) - 2 } };
  }
  const sleevePath = (q, G) => {
    const { Ti, To, Ho, Hi, Ai, Tc, at } = G;
    q.moveTo(Ti.x, Ti.y); q.quadraticCurveTo(Tc.x, Tc.y, To.x, To.y);
    let c = at(Ls * 0.45, wr * 1.06); q.quadraticCurveTo(c.x, c.y, Ho.x, Ho.y);
    c = at(Ls + 4, 0); q.quadraticCurveTo(c.x, c.y, Hi.x, Hi.y);
    c = at(Ls * 0.45, -wh); q.quadraticCurveTo(c.x, c.y, Ai.x, Ai.y);
    q.quadraticCurveTo(lerp(Ai.x, Ti.x, 0.5), lerp(Ai.y, Ti.y, 0.5) + 6, Ti.x, Ti.y); q.closePath();
  };
  const drawSleeves = (g) => {
    for (const side of ['L', 'R']) {
      const G = geom[side], { at, sgn } = G;
      g.beginPath(); sleevePath(g, G); g.fillStyle = hex(main); g.fill();
      g.save(); g.beginPath(); sleevePath(g, G); g.clip();
      // painted-looking shading: soft light from top-left, a cel band on the underside, hem shadow
      const a = at(0, sgn * -wr), b = at(Ls * 0.6, sgn * wr);
      const gr = g.createLinearGradient(a.x, a.y, b.x, b.y);
      gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.beginPath();
      const p1 = at(Ls * 0.15, sgn > 0 ? wh * 0.25 : -wh * 0.25), p2 = at(Ls * 0.1, sgn > 0 ? wh * 1.6 : -wh * 1.6), p3 = at(Ls + 8, sgn > 0 ? wh * 1.6 : -wh * 1.6), p4 = at(Ls + 8, sgn > 0 ? -wh * 0.2 : wh * 0.2);
      g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.lineTo(p4.x, p4.y); g.closePath();
      g.fillStyle = hex(shade); g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
      const h1 = at(Ls - px(4), -wh * 1.4), h2 = at(Ls - px(4), wh * 1.4), h3 = at(Ls + 6, wh * 1.4), h4 = at(Ls + 6, -wh * 1.4);
      g.beginPath(); g.moveTo(h1.x, h1.y); g.lineTo(h2.x, h2.y); g.lineTo(h3.x, h3.y); g.lineTo(h4.x, h4.y); g.closePath();
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fill();
      g.restore();
      // ink: full weight outside, a light seam over the chest
      g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK;
      const { Ti, To, Ho, Hi, Ai, Tc } = G;
      g.beginPath(); g.moveTo(Ti.x, Ti.y); g.quadraticCurveTo(Tc.x, Tc.y, To.x, To.y);
      let c = at(Ls * 0.45, wr * 1.06); g.quadraticCurveTo(c.x, c.y, Ho.x, Ho.y);
      c = at(Ls + 4, 0); g.quadraticCurveTo(c.x, c.y, Hi.x, Hi.y);
      g.lineWidth = ink; g.stroke();
      g.beginPath(); g.moveTo(Hi.x, Hi.y); c = at(Ls * 0.45, -wh); g.quadraticCurveTo(c.x, c.y, Ai.x, Ai.y);
      g.lineWidth = ink * 0.5; g.stroke();
    }
  };
  // torso = body + sleeves; sleeves.png = sleeves alone
  const tc = createCanvas(W, H), tg = tc.getContext('2d');
  tg.drawImage(toCanvas(im), PAD, PAD); drawSleeves(tg);
  fs.writeFileSync(path.join(partsDir, 'torso.png'), tc.toBuffer('image/png'));
  const bc = createCanvas(W, H); bc.getContext('2d').drawImage(toCanvas(im), PAD, PAD);
  fs.writeFileSync(path.join(partsDir, 'torso.body.png'), bc.toBuffer('image/png'));
  const sc = createCanvas(W, H), sg = sc.getContext('2d'); drawSleeves(sg);
  fs.writeFileSync(path.join(partsDir, 'sleeves.png'), sc.toBuffer('image/png'));
  rig.parts.torso = {
    ...T, file: 'parts/torso.png', base: { ...T0, file: 'parts/torso.base.png' },
    shoulderL: joint.L, shoulderR: joint.R,
    sleeves: { file: 'parts/sleeves.png', body: 'parts/torso.body.png', L: { joint: joint.L }, R: { joint: joint.R }, lengthPx: Ls, armRoot, theta: th, flapsTrimmed: tr.trimmed },
  };
  // the arm is one tapered skin strip now: the sleeve-carrying upper-arm part is retired
  if (rig.parts.upperArm) { delete rig.parts.upperArm; const f = path.join(partsDir, 'upperArm.png'); if (fs.existsSync(f)) fs.unlinkSync(f); }
  fs.writeFileSync(rigFile, JSON.stringify(rig, null, 1));
  log(`  sleeves: painted into the torso (${tr.trimmed ? 'old flaps trimmed, ' : ''}arm root ${armRoot.toFixed(1)} u, joints x ${joint.L.x.toFixed(0)} / ${joint.R.x.toFixed(0)} px)`);
  return rig;
}

function lerp(a, b, k) { return a + (b - a) * k; }

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const d of process.argv.slice(2)) await sleeveTorso(path.resolve(d));
}
