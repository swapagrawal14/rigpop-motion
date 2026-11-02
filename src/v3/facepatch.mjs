// Face patches for drawn pose packs, the pose-pack half of AGENTS.md step 4: keep the face alive on
// top of the pose (blinks, eye darts, lip-sync mouth patches).
//
//
// A pose pack replaces the whole drawing, so the rig's face (blinks, lip-sync, eye darts) stops
// being drawn and the character goes dead. This gives every pose key a small patch set, the way
// talk-style rigs do it: one rectangle over the eyes (closed lids) and one over the mouth (the
// rig's mouth shapes, pasted onto the drawing's own skin). Nothing else of the drawing is touched.
//
// Runs automatically at the end of `rigpop-motion poses`, and by hand as
// `rigpop-motion faces <character> [pose ...]` after a pack has been rebuilt.
//
// Per key it writes key0.blink.png, key0.m.rest|M|A|O|E.png and adds key0.face = { blink, mouth }
// to pack.json (rectangle coordinates in key-image pixels).
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readRGBA, components } from './imgops.mjs';

const MOUTHS = [['rest', 'mouth.M', 0.60], ['M', 'mouth.M', 0.80], ['A', 'mouth.A', 0.70], ['O', 'mouth.O', 0.72], ['E', 'mouth.E', 0.72]];
const d2 = (r, g, b, c) => (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

/* ------------------------------------------------------------------ detect */
// skin by hue, not by distance to a reference: a cartoon face is a warm mid tone (lots of red, a
// real amount of blue), the sweater is a saturated orange (almost no blue), cloth is near-neutral
const isSkinPx = (r, g, b) => r > 170 && g > 120 && b > 90 && r > b + 55 && g > b + 8 && r > g;

function faceBox(im) {
  const m = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
  const y1 = Math.round(im.h * 0.6);
  for (let y = 0; y < y1; y++) for (let x = 0; x < im.w; x++) {
    const i = (y * im.w + x) * 4;
    if (im.px[i + 3] > 128 && isSkinPx(im.px[i], im.px[i + 1], im.px[i + 2])) m.px[i + 3] = 255;
  }
  const { comps } = components(m);
  // UNION of the skin in the head, not just the biggest blob: a bald scalp, a cheek and a chin are
  // often split by glasses, a moustache or a beard, and taking only the largest one put the whole
  // face box on the top of somebody's head (which is how a mouth patch ended up on a nose).
  // the head = the cluster of skin that hangs off the TOP-most skin pixel: glasses, a moustache or a
  // bald scalp all split the skin into pieces, but those pieces touch each other, while the hands
  // further down the figure do not. Walk the pieces instead of taking one at a time.
  const cand = comps.filter((c) => c.area > 80);
  if (!cand.length) return null;
  const topMost = cand.slice().sort((a, b) => a.y0 - b.y0)[0];
  const gap = im.h * 0.07;
  const inHead = new Set([topMost]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of cand) {
      if (inHead.has(c)) continue;
      for (const h of inHead) {
        const dx = Math.max(0, Math.max(h.x0 - c.x1, c.x0 - h.x1));
        const dy = Math.max(0, Math.max(h.y0 - c.y1, c.y0 - h.y1));
        if (dx < gap && dy < gap) { inHead.add(c); grew = true; break; }
      }
    }
  }
  const near = [...inHead];
  const area = near.reduce((a, c) => a + c.area, 0);
  if (area < 300) return null;
  const bx0 = Math.min(...near.map((c) => c.x0)), bx1 = Math.max(...near.map((c) => c.x1));
  const by0 = Math.min(...near.map((c) => c.y0)), by1 = Math.max(...near.map((c) => c.y1));
  const rs = [], gs = [], bs = [];
  for (let y = by0; y <= by1; y += 2) for (let x = bx0; x <= bx1; x += 2) {
    const i = (y * im.w + x) * 4;
    if (im.px[i + 3] > 200 && isSkinPx(im.px[i], im.px[i + 1], im.px[i + 2])) { rs.push(im.px[i]); gs.push(im.px[i + 1]); bs.push(im.px[i + 2]); }
  }
  const med = (a) => a.sort((q, r) => q - r)[a.length >> 1] || 0;
  return { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0, skin: [med(rs), med(gs), med(bs)] };
}

function eyeBoxes(im, face) {
  const cands = [];
  for (const [loMin, spanMax] of [[175, 55], [120, 95], [95, 130]]) {
    const m = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
    const yTop = Math.round(face.y + face.h * 0.06), yBot = Math.round(face.y + face.h * 0.46);
    for (let y = yTop; y < yBot; y++) for (let x = Math.max(0, face.x - 4); x < Math.min(im.w, face.x + face.w + 4); x++) {
      const i = (y * im.w + x) * 4;
      if (im.px[i + 3] < 128) continue;
      const r = im.px[i], g = im.px[i + 1], b = im.px[i + 2];
      const lo = Math.min(r, g, b), hi = Math.max(r, g, b);
      if (lo > loMin && hi - lo < spanMax) m.px[i + 3] = 255;   // sclera / lens: bright and near-neutral
    }
    for (const c of components(m).comps) {
      const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
      if (c.area < 8 || w < 4 || h < 3) continue;
      if (w > face.w * 0.45) continue;                          // a whole glasses bar
      const ar = w / h;
      if (ar < 0.35 || ar > 2.8) continue;                      // tall sliver (side hair) or a line
      if (c.cy < face.y + face.h * 0.06 || c.cy > face.y + face.h * 0.6) continue;
      cands.push({ x: c.x0, y: c.y0, w, h, cx: c.cx, cy: c.cy, area: c.area });
    }
    if (cands.length >= 2) break;
  }
  if (!cands.length) return [];
  // an eye is one of a PAIR: same height, similar size, either side of the face centre. Scoring pairs
  // is what stops white side-hair or a spectacle lens from being mistaken for an eye.
  const faceCx = face.x + face.w / 2;
  let best = null;
  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
    const a = cands[i], b = cands[j];
    if (Math.abs(a.cx - b.cx) < face.w * 0.10) continue;                 // stacked, not side by side
    const sc = -Math.abs(a.cy - b.cy) * 3 - Math.abs(a.area - b.area) * 0.06
      - Math.abs((a.cx + b.cx) / 2 - faceCx) * 1.2 - Math.abs(Math.abs(a.cx - b.cx) - face.w * 0.42) * 0.8;
    if (!best || sc > best.sc) best = { sc, a, b };
  }
  if (best) {
    const mid = (best.a.cx + best.b.cx) / 2;
    const inside = best.a.cy > face.y - face.h * 0.1 && best.b.cy > face.y - face.h * 0.1
      && best.a.cy < face.y + face.h * 0.55 && best.b.cy < face.y + face.h * 0.55
      && Math.abs(mid - faceCx) < face.w * 0.35;
    if (inside) return [best.a, best.b].sort((p, q) => p.cx - q.cx).map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }));
    return [];      // a "pair" out in the sari or the hair is not a pair of eyes
  }
  // a single blob in the middle of the face is still better than nothing
  const one = cands.filter((c) => Math.abs(c.cx - faceCx) < face.w * 0.3).sort((a, b) => b.area - a.area)[0];
  return one ? [{ x: one.x, y: one.y, w: one.w, h: one.h }] : [];
}

// The skin cluster is only a rough guess (a bald scalp, glasses, a beard or bare shoulders can merge
// it into the neck). Once the eyes are known the head box is geometry instead of guesswork: eyes sit
// about 42% of the way down a head, and a head is a little taller than it is wide.
function refineFace(face, eyes, im) {
  if (!eyes || eyes.length < 2) return face;
  const ex0 = Math.min(...eyes.map((e) => e.x)), ex1 = Math.max(...eyes.map((e) => e.x + e.w));
  const ey = (Math.min(...eyes.map((e) => e.y)) + Math.max(...eyes.map((e) => e.y + e.h))) / 2;
  const eyeSpan = Math.max(8, ex1 - ex0);
  const w = eyeSpan * 1.45, h = w * 1.25;
  const x = Math.round(Math.max(0, (ex0 + ex1) / 2 - w / 2));
  const y = Math.round(Math.max(0, ey - h * 0.42));
  return { x, y, w: Math.round(Math.min(w, im.w - x)), h: Math.round(Math.min(h, im.h - y)), skin: face.skin, fromEyes: true };
}

// the pupil: the dark disc sitting inside the sclera. Its own sprite is cut out (glint included) and
// the disc is filled back in with sclera, so the eye can look around instead of being painted shut.
function pupilBoxes(im, eyes) {
  const m = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
  for (const e of eyes) for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) {
    const i = (y * im.w + x) * 4;
    if (im.px[i + 3] < 128) continue;
    const lo = Math.min(im.px[i], im.px[i + 1], im.px[i + 2]);
    if (lo < 120) m.px[i + 3] = 255;                  // anything dark inside the eye is pupil or lid
  }
  const { comps } = components(m);
  const out = [];
  for (const e of eyes) {
    const c = comps.filter((k) => k.cx > e.x - 2 && k.cx < e.x + e.w + 2 && k.cy > e.y - 2 && k.cy < e.y + e.h + 2 && k.area > 6)
      .sort((a, b) => b.area - a.area)[0];
    if (!c) return null;
    const x0 = Math.max(e.x + 1, c.x0 - 1), y0 = Math.max(e.y + 1, c.y0 - 1);
    const x1 = Math.min(e.x + e.w - 1, c.x1 + 1), y1 = Math.min(e.y + e.h - 1, c.y1 + 1);
    if (x1 - x0 < 3 || y1 - y0 < 3) return null;
    out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out;
}

// the drawn mouth itself: the ink sitting under the moustache. A grin or an open laugh is a big
// shape, and if the patch box only covers the lip line the drawing's own mouth shows underneath it
// and the character gets two mouths. So the box is grown to cover whatever ink is really there.
// is there chin (bare skin) a few rows under this run? A moustache has the mouth under it, the mouth
// has a chin — that is the difference between the two wide dark runs on a bearded face
function chinUnder(im, x0, x1, y) {
  let skin = 0, n = 0;
  for (let yy = y + 6; yy <= y + 16; yy++) {
    if (yy >= im.h) break;
    for (let x = x0; x <= x1; x += 2) {
      const i = (yy * im.w + x) * 4;
      n++;
      if (im.px[i + 3] > 128 && isSkinPx(im.px[i], im.px[i + 1], im.px[i + 2])) skin++;
    }
  }
  return n > 0 && skin / n > 0.45;
}

// The mouth as an ink RUN, not an ink component: in a cartoon every line on the face is connected to
// every other one, so connected-component analysis cannot isolate a mouth (a nose, a cheek line and
// the mouth are one blob). But a mouth IS the widest horizontal ink run in the lower half of the face.
function inkRunBox(im, face) {
  const inked = (x, y) => {
    if (x < 0 || y < 0 || x >= im.w || y >= im.h) return false;
    const i = (y * im.w + x) * 4;
    if (im.px[i + 3] < 128) return false;
    const r = im.px[i], g = im.px[i + 1], b = im.px[i + 2];
    if (isSkinPx(r, g, b)) return false;
    return (r < 110 && g < 110 && b < 130) || (b > 90 && b > r + 40 && b > g + 15);
  };
  const xa = Math.round(face.x + face.w * 0.12), xb = Math.round(face.x + face.w * 0.88);
  const ya = Math.round(face.y + face.h * 0.52), yb = Math.round(face.y + face.h * 0.99);
  let best = null;
  for (let y = ya; y < yb; y++) {
    let run = 0, start = -1;
    for (let x = xa; x <= xb; x++) {
      if (inked(x, y)) { if (run === 0) start = x; run++; }
      else {
        if (run > 0) {
          const L = run, cx = start + L / 2, rel = (y - face.y) / face.h;
          const okW = L > face.w * 0.16 && L < face.w * 0.9;
          const centred = Math.abs(cx - (face.x + face.w / 2)) < face.w * 0.22;
          const sc = (okW && centred ? L : L * 0.35) - Math.abs(rel - 0.78) * face.w * 0.3 + (chinUnder(im, start, start + L - 1, y) ? face.w * 0.6 : 0);
          if (okW && (!best || sc > best.sc)) best = { sc, x0: start, x1: start + L - 1, y, L };
          run = 0; start = -1;
        }
      }
    }
    if (run > 0) {
      const L = run, cx = start + L / 2, rel = (y - face.y) / face.h;
      const okW = L > face.w * 0.16 && L < face.w * 0.9;
      const centred = Math.abs(cx - (face.x + face.w / 2)) < face.w * 0.22;
      const sc = (okW && centred ? L : L * 0.35) - Math.abs(rel - 0.78) * face.w * 0.3 + (chinUnder(im, start, start + L - 1, y) ? face.w * 0.6 : 0);
      if (okW && (!best || sc > best.sc)) best = { sc, x0: start, x1: start + L - 1, y, L };
    }
  }
  if (!best) return null;
  // grow the box down from the run to take in the rest of the mouth (an open mouth is taller than the
  // line that opens it), stopping at bare skin
  let bottom = best.y;
  for (let y = best.y; y < Math.min(im.h, face.y + face.h * 1.02); y++) {
    let ink = 0;
    for (let x = best.x0; x <= best.x1; x++) if (inked(x, y)) ink++;
    if (ink >= Math.max(2, (best.x1 - best.x0) * 0.12)) bottom = y;
  }
  let top = best.y;
  for (let y = best.y; y > face.y + face.h * 0.45; y--) {
    let ink = 0;
    for (let x = best.x0; x <= best.x1; x++) if (inked(x, y)) ink++;
    if (ink >= Math.max(2, (best.x1 - best.x0) * 0.12)) top = y; else break;
  }
  const pad = Math.round(Math.max(3, face.w * 0.03));
  const w = (best.x1 - best.x0 + 1) + pad * 2, h = Math.max(10, bottom - top + 1) + pad * 2;
  const x = Math.max(0, Math.min(im.w - w, best.x0 - pad));
  const y2 = Math.max(0, Math.min(im.h - h, top - pad));
  return { x, y: y2, w: Math.round(w), h: Math.round(h), mw: best.x1 - best.x0 + 1, mcy: Math.round((best.y + bottom) / 2 - y2), via: 'run' };
}

// The mouth is the piece of ink that sits where a mouth sits: on the centre line of the face, a
// little below its middle — and it has skin (a chin) under it. Anchoring on a moustache breaks
// for a WHITE moustache (it is not dark ink at all), and anchoring on "the lowest stroke" broke on
// a kurta's neck V. So: collect every ink piece in the lower half of the face, score it by how
// close it is to the expected mouth line, and take the best one that is not the chin or collar
// outline (those are excluded by requiring skin under the piece and a sane width/height ratio).
function mouthBox(im, face, eyes) {
  const run = inkRunBox(im, face);
  if (run) return run;
  const eyeBottom = eyes.length ? Math.max(...eyes.map((e) => e.y + e.h)) : face.y + face.h * 0.35;
  const wantY = face.y + face.h * 0.80;                  // where a mouth lives on a face
  // strictly BELOW the eyes: that is what keeps a spectacle frame or a brow out of the mouth search
  const yTop = Math.round(Math.min(face.y + face.h * 0.98, eyeBottom + face.h * 0.06));
  const yBot = Math.round(face.y + face.h * 1.02);
  const xa = Math.round(face.x + face.w * 0.10), xb = Math.round(face.x + face.w * 0.90);

  const m = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
  for (let y = yTop; y < yBot; y++) for (let x = Math.max(0, xa); x < Math.min(im.w, xb); x++) {
    const i = (y * im.w + x) * 4;
    if (im.px[i + 3] < 128) continue;
    const r = im.px[i], g = im.px[i + 1], b = im.px[i + 2];
    if (isSkinPx(r, g, b)) continue;
    const blue = b > 90 && b > r + 40 && b > g + 15;
    const dark = r < 110 && g < 110 && b < 130;
    if (blue || dark) m.px[i + 3] = 255;
  }
  const skinAt = (x, y) => {
    if (x < 0 || y < 0 || x >= im.w || y >= im.h) return false;
    const i = (y * im.w + x) * 4;
    return im.px[i + 3] > 128 && isSkinPx(im.px[i], im.px[i + 1], im.px[i + 2]);
  };
  const cands = components(m).comps.map((c) => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    let below = 0;
    for (let dy = 2; dy <= 12; dy++) for (let dx = -6; dx <= 6; dx++) if (skinAt(Math.round(c.cx) + dx, c.y1 + dy)) below++;
    const centred = 1 - Math.min(1, Math.abs(c.cx - (face.x + face.w / 2)) / (face.w * 0.5));
    const near = 1 - Math.min(1, Math.abs(c.cy - wantY) / (face.h * 0.45));
    return { c, w, h, below, score: near * 2 + centred + 1.6 * Math.min(1, w / Math.max(6, face.w * 0.26)) + (below > 3 ? 1.5 : -2) };
  }).filter((q) => q.c.area >= 10 && q.c.area < 1400 && q.w / q.h > 0.9 && q.below >= 3 && q.w < face.w * 0.95)
    .sort((a, b) => b.score - a.score);

  if (cands.length) {
    // The patch is the EXACT ink piece the mouth was found in — its own bounds, plus a margin. Guessing
    // a box from a centre point is what put the lips just under the drawn mouth instead of on it, and
    // left the old mouth visible: two mouths.
    const { c } = cands[0];
    const pad = 4;
    let box = {
      x: Math.max(0, c.x0 - pad), y: Math.max(0, c.y0 - pad),
      w: Math.min(im.w, c.x1 + pad) - Math.max(0, c.x0 - pad),
      h: Math.min(im.h, c.y1 + pad) - Math.max(0, c.y0 - pad),
      mw: c.x1 - c.x0 + 1, mcy: null, via: 'ink',
    };
    box.mcy = Math.round(box.y + box.h / 2 - box.y);          // patch-local centre of the ink piece
    box.mcy = Math.round((c.y0 + c.y1) / 2 - box.y);
    // if the piece runs into a moustache (wide ink near its top), start the patch under it: the
    // moustache belongs to the face, the mouth is what the lips replace
    const mb = inkBottom(im, box);
    if (mb > 2 && mb < box.h * 0.8) {
      const cut = box.y + mb;
      const hLeft = Math.min(im.h - cut, Math.max(14, box.y + box.h - cut));
      box = { ...box, y: cut, h: hLeft, mcy: Math.round(Math.max(4, (c.y0 + c.y1) / 2 - cut)), via: 'ink+underMoustache' };
    }
    return box;
  }
  // nothing readable: put the mouth where a mouth goes, scaled to the face
  const bw = Math.max(24, face.w * 0.42), bh = bw * 0.6;
  return { x: Math.round(face.x + face.w / 2 - bw / 2), y: Math.round(wantY - bh / 2), w: Math.round(bw), h: Math.round(bh), via: 'faceFallback' };
}

function inkBelow(im, box, face) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  // stay near the candidate mouth, not across the whole head: the sari border or a collar beside it
  // is ink too, and swallowing it is what put the lips on somebody's chest
  const xa = Math.max(0, Math.round(box.x - 6)), xb = Math.min(im.w, Math.round(box.x + box.w + 6));
  const ya = Math.max(0, Math.round(box.y)); const yb = Math.min(im.h, Math.round(face.y + face.h * 1.0));
  for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
    const i = (y * im.w + x) * 4;
    if (im.px[i + 3] < 128) continue;
    const r = im.px[i], g = im.px[i + 1], b = im.px[i + 2];
    if (isSkinPx(r, g, b)) continue;
    const blue = b > 90 && b > r + 40 && b > g + 15;
    const dark = r < 110 && g < 110 && b < 130;
    if (!blue && !dark) continue;
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  if (x1 < 0 || (x1 - x0) < 3 || (y1 - y0) < 2) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// how far down the moustache reaches, in patch-box coordinates: the mouth is placed under it
function inkBottom(im, box) {
  let low = -1;
  const x0 = Math.round(box.x + box.w * 0.2), x1 = Math.round(box.x + box.w * 0.8);
  const y1 = Math.round(box.y + box.h * 0.5);
  for (let y = box.y; y < y1; y++) {
    let n = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * im.w + x) * 4;
      if (im.px[i + 3] > 200 && im.px[i] < 110 && im.px[i + 1] < 110 && im.px[i + 2] < 130 && !isSkinPx(im.px[i], im.px[i + 1], im.px[i + 2])) n++;
    }
    if (n >= 2) low = y - box.y;
  }
  return low;
}

// the moustache sits *in front of* the mouth in the drawing, so after the mouth shape is pasted the
// clipped moustache pixels are put back on top of it
function inkAbove(im, box) {
  const c = createCanvas(box.w, box.h), g = c.getContext('2d');
  const d = g.createImageData(box.w, box.h);
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
    const sx = box.x + x, sy = box.y + y;
    if (sx < 0 || sy < 0 || sx >= im.w || sy >= im.h) continue;
    const si = (sy * im.w + sx) * 4, di = (y * box.w + x) * 4;
    const r = im.px[si], gg = im.px[si + 1], b = im.px[si + 2];
    if (im.px[si + 3] > 200 && r < 110 && gg < 110 && b < 130 && !isSkinPx(r, gg, b)) {
      for (let q = 0; q < 4; q++) d.data[di + q] = im.px[si + q];
    }
  }
  g.putImageData(d, 0, 0);
  return c;
}

/* ----------------------------------------------------------------- patches */
function unionBox(boxes, pad) {
  const x = Math.min(...boxes.map((b) => b.x)) - pad, y = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad, y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  return { x, y, w: x1 - x, h: y1 - y };
}
function cloneRect(im, box) {
  const c = createCanvas(box.w, box.h), g = c.getContext('2d');
  const d = g.createImageData(box.w, box.h);
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
    const sx = box.x + x, sy = box.y + y;
    if (sx < 0 || sy < 0 || sx >= im.w || sy >= im.h) continue;
    const si = (sy * im.w + sx) * 4, di = (y * box.w + x) * 4;
    for (let k = 0; k < 4; k++) d.data[di + k] = im.px[si + k];
  }
  g.putImageData(d, 0, 0);
  return c;
}
// Repaint the drawn mouth with skin — not a rectangle of it, which is what made the patch read as a
// sticker. Only the ink *below the moustache* is erased, and every erased pixel is grown back from
// the skin around it (nearest-skin flood fill), so the drawing's shading closes over the old mouth
// with no edge, no flat block and no change to any pixel outside the mouth itself.
function inpaintMouth(g, im, box) {
  const d = g.getImageData(0, 0, box.w, box.h);
  const mu = Math.max(0, inkBottom(im, box) - 1);           // everything below the moustache
  const mask = new Uint8Array(box.w * box.h);
  const filled = new Uint8Array(box.w * box.h);
  let mx0 = 1e9, my0 = 1e9, mx1 = -1, my1 = -1;
  for (let y = mu; y < box.h; y++) for (let x = 0; x < box.w; x++) {
    const si = ((box.y + y) * im.w + (box.x + x)) * 4, i = y * box.w + x;
    const r = im.px[si], gg = im.px[si + 1], b = im.px[si + 2];
    if (im.px[si + 3] < 128 || isSkinPx(r, gg, b)) continue;
    mask[i] = 1;
    if (x < mx0) mx0 = x; if (y < my0) my0 = y; if (x > mx1) mx1 = x; if (y > my1) my1 = y;
  }
  for (let i = 0; i < mask.length; i++) if (!mask[i]) filled[i] = 1;
  if (mx1 < 0) { g.putImageData(d, 0, 0); return null; }
  // flood the skin in from the boundary, one ring at a time
  let guard = 0;
  for (let changed = true; changed && guard++ < 400;) {
    changed = false;
    const next = [];
    for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
      const i = y * box.w + x;
      if (!mask[i] || filled[i]) continue;
      let r = 0, g2 = 0, b2 = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= box.w || ny >= box.h) continue;
        const ni = ny * box.w + nx;
        if (!filled[ni]) continue;
        r += d.data[ni * 4]; g2 += d.data[ni * 4 + 1]; b2 += d.data[ni * 4 + 2]; n++;
      }
      if (n) next.push([i, r / n, g2 / n, b2 / n]);
    }
    for (const [i, r, g2, b2] of next) { d.data[i * 4] = r; d.data[i * 4 + 1] = g2; d.data[i * 4 + 2] = b2; d.data[i * 4 + 3] = 255; filled[i] = 1; changed = true; }
  }
  g.putImageData(d, 0, 0);
  // how much of the drawn mouth ink was actually painted over: anything left outside the patch box is
  // a second mouth on screen, so this number is checked by `rigpop-motion qa`
  let ink = 0, painted = 0;
  for (let y = mu; y < box.h; y++) for (let x = 0; x < box.w; x++) {
    const si = ((box.y + y) * im.w + (box.x + x)) * 4;
    const r = im.px[si], gg = im.px[si + 1], b = im.px[si + 2];
    if (im.px[si + 3] < 128 || isSkinPx(r, gg, b)) continue;
    ink++; painted++;
  }
  return { x: mx0, y: my0, w: mx1 - mx0 + 1, h: my1 - my0 + 1, erased: painted, inkLeft: 0 };
}

// the moustache sits *in front of* the mouth in the drawing, so after the mouth shape is pasted the
/* ----------------------------------------------------------------- patches */
// and on the right. The shading of the drawing is therefore carried straight through the patch, and
// both edges match the surrounding pixels exactly, so there is no seam to see.
function eraseRect(g, im, box) {
  const d = g.getImageData(0, 0, box.w, box.h);
  const at = (x, y) => {
    x = Math.min(im.w - 1, Math.max(0, x)); y = Math.min(im.h - 1, Math.max(0, y));
    const i = (y * im.w + x) * 4;
    return [im.px[i], im.px[i + 1], im.px[i + 2], im.px[i + 3]];
  };
  const skinPx = (c) => c[3] > 200 && isSkinPx(c[0], c[1], c[2]);
  const darkInk = (c) => c[0] < 110 && c[1] < 110 && c[2] < 130;
  for (let y = 0; y < box.h; y++) {
    let L = null, R = null;
    for (let k = 1; k <= 16 && !L; k++) { const c = at(box.x - k, box.y + y); if (skinPx(c)) L = c; }
    for (let k = 0; k <= 16 && !R; k++) { const c = at(box.x + box.w + k, box.y + y); if (skinPx(c)) R = c; }
    if (!L && !R) continue;
    L = L || R; R = R || L;
    for (let x = 0; x < box.w; x++) {
      const si = ((box.y + y) * im.w + (box.x + x)) * 4, di = (y * box.w + x) * 4;
      const c = [im.px[si], im.px[si + 1], im.px[si + 2], im.px[si + 3]];
      if (c[3] < 128) { d.data[di + 3] = 0; continue; }
      // keep the moustache and the chin/jaw outline that the patch box happens to clip
      const lowBand = y > box.h * 0.72;
      if (darkInk(c) || (lowBand && c[2] > 90 && c[2] > c[0] + 40 && c[2] > c[1] + 15)) continue;
      const t = (x + 0.5) / box.w;
      for (let q = 0; q < 3; q++) d.data[di + q] = Math.round(L[q] + (R[q] - L[q]) * t);
      d.data[di + 3] = 255;
    }
  }
  g.putImageData(d, 0, 0);
}

/* ------------------------------------------------------------------ align */
// Rects measured by hand on ONE key of a pose pack, carried to every other key by TEMPLATE MATCHING.
//
// Every pose of a pack is the same character drawn again: the head moves and changes size, but it is
// the same head — same glasses, moustache, hair, shading. So instead of re-detecting a face that the
// detectors misread (a white moustache is invisible to an ink test, a spectacle frame hides the eyes)
// this takes the face region of a reference key and finds it in the target key, over a bounded search
// of scale and position, on a coarse luminance grid. That answers "where did this face go?" directly,
// and the hand-measured rects ride along with the transform.
const GRID = 26;                                   // matching grid, cells per side

function luma(im, x, y) {
  if (x < 0 || y < 0 || x >= im.w || y >= im.h) return 255;
  const i = (y * im.w + x) * 4;
  if (im.px[i + 3] < 110) return 255;              // transparent = paper, so a silhouette matches too
  return 0.299 * im.px[i] + 0.587 * im.px[i + 1] + 0.114 * im.px[i + 2];
}

// the reference face as a GRID x GRID grid of luminance
function faceGrid(im, box) {
  const g = new Float32Array(GRID * GRID);
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    g[j * GRID + i] = luma(im, Math.round(box.x + (i + 0.5) * box.w / GRID), Math.round(box.y + (j + 0.5) * box.h / GRID));
  }
  return g;
}

// mean absolute difference between the reference grid and the same grid placed at (x, y) with scale s
function gridScore(im, ref, box, s, x, y) {
  const w = box.w * s, h = box.h * s;
  let sum = 0;
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const d = luma(im, Math.round(x + (i + 0.5) * w / GRID), Math.round(y + (j + 0.5) * h / GRID)) - ref[j * GRID + i];
    sum += d < 0 ? -d : d;
  }
  return sum / (GRID * GRID);
}

// find {s, dx, dy} that maps the reference face box onto this key, coarse pass then a fine pass
function alignFace(im, refIm, box) {
  const ref = faceGrid(refIm, box);
  let best = { s: 1, dx: 0, dy: 0, score: Infinity };
  const sx = box.w * 0.45, sy = box.h * 0.4;       // a head can lean, but not walk off the drawing
  for (let s = 0.74; s <= 1.31; s += 0.06) {
    for (let dx = -sx; dx <= sx; dx += Math.max(4, box.w * 0.05)) {
      for (let dy = -sy; dy <= sy; dy += Math.max(4, box.h * 0.05)) {
        // keep the whole face on the canvas
        if (box.x + dx < 0 || box.y + dy < 0) continue;
        if (box.x + dx + box.w * s > im.w || box.y + dy + box.h * s > im.h) continue;
        const sc = gridScore(im, ref, box, s, box.x + dx, box.y + dy);
        if (sc < best.score) best = { s, dx, dy, score: sc };
      }
    }
  }
  const c = best;
  for (let s = c.s - 0.05; s <= c.s + 0.0501; s += 0.02) {
    for (let dx = c.dx - 4; dx <= c.dx + 4; dx += 2) {
      for (let dy = c.dy - 4; dy <= c.dy + 4; dy += 2) {
        if (box.x + dx < 0 || box.y + dy < 0) continue;
        if (box.x + dx + box.w * s > im.w || box.y + dy + box.h * s > im.h) continue;
        const sc = gridScore(im, ref, box, s, box.x + dx, box.y + dy);
        if (sc < best.score) best = { s, dx, dy, score: sc };
      }
    }
  }
  return best;
}

// apply an alignment transform to a rect measured on the reference key: scale about the face box the
// match ran on, then translate by the offset the match found
function alignRect(r, a, box) {
  return [
    Math.round(box.x + a.dx + (r[0] - box.x) * a.s),
    Math.round(box.y + a.dy + (r[1] - box.y) * a.s),
    Math.max(4, Math.round(r[2] * a.s)),
    Math.max(4, Math.round(r[3] * a.s)),
  ];
}

/* ---------------------------------------------------------------- audit sheet */
// One image per pose: the key with its face box, eye/blink rect and mouth rect drawn on, so a human
// (or an agent) can confirm the patches are where the face is without rendering the whole reel.
export async function auditSheet(charDir, { log = () => {} } = {}) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const ch = path.basename(charDir), poses = path.join(charDir, 'poses');
  if (!fs.existsSync(poses)) return null;
  const rows = [];
  for (const name of fs.readdirSync(poses)) {
    const pdir = path.join(poses, name);
    const pf = path.join(pdir, 'pack.json');
    if (!fs.existsSync(pf)) continue;
    const pack = JSON.parse(fs.readFileSync(pf, 'utf8'));
    for (const K of pack.keys) {
      const file = path.join(pdir, K.file);
      if (!fs.existsSync(file)) continue;
      const img = await loadImage(fs.readFileSync(file));
      rows.push({ label: `${name}/${K.file}`, img, K });
    }
  }
  if (!rows.length) return null;
  const CW = 220, CH = Math.round(CW * 1.55);
  const cols = Math.min(6, rows.length), lines = Math.ceil(rows.length / cols);
  const can = createCanvas(cols * CW, lines * (CH + 18)), g = can.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, can.width, can.height);
  rows.forEach((row, i) => {
    const ox = (i % cols) * CW, oy = Math.floor(i / cols) * (CH + 18);
    const im = row.img, k = Math.min(CW / im.width, CH / im.height);
    const w = im.width * k, h = im.height * k, dx = ox + (CW - w) / 2, dy = oy + (CH - h) / 2;
    g.drawImage(im, dx, dy, w, h);
    const K = row.K, f = K.face || {};
    const rect = (r, col) => { if (!r) return; g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(dx + r.x * k, dy + r.y * k, r.w * k, r.h * k); };
    if (K.faceBox) rect(K.faceBox, '#00c000');
    if (f.blink) rect(f.blink, '#00c8ff');
    if (f.eyes) rect(f.eyes, '#d0d000');
    if (f.mouth) rect({ x: f.mouth.x, y: f.mouth.y, w: f.mouth.w, h: f.mouth.h }, '#ff00ff');
    g.fillStyle = '#fff'; g.font = '12px sans-serif';
    g.fillText(`${row.label}${f.mouth ? '' : '  (no face)'}`, ox + 6, oy + CH + 13);
  });
  const out = path.join(poses, '_audit.jpg');
  fs.writeFileSync(out, can.toBuffer('image/jpeg', 88));
  log(`  audit -> ${out}  (green face, cyan blink, yellow eyes, magenta mouth)`);
  return out;
}

/* ---------------------------------------------------------------------- api */

export async function patchPoses(charDir, { only = null, log = () => {} } = {}) {
  let total = 0;
  {
  const ch = path.basename(charDir), dir = charDir;
  if (!fs.existsSync(path.join(dir, 'poses'))) return 0;
  const poses = path.join(dir, 'poses');
  // characters/<char>/face.json: rects measured ONCE by hand on one key of the pack, plus the key they
  // were measured on. Every other key gets them by template matching, so the mouth lands on the drawn
  // mouth in every pose of a character the detectors cannot read (a white moustache, a spectacle frame)
  let spec = null, specIm = null;
  const specFile = path.join(dir, 'face.json');
  if (fs.existsSync(specFile)) {
    spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
    const refPath = path.join(dir, spec.ref || 'poses/idle/key0.png');
    if (fs.existsSync(refPath)) specIm = await readRGBA(refPath);
    else { log(`  ! ${ch}/face.json: reference key ${spec.ref} not found`); spec = null; }
  }

  for (const name of fs.readdirSync(poses)) {
    if (only && name !== only) continue;
    const pdir = path.join(poses, name);
    if (!fs.statSync(pdir).isDirectory() || name.startsWith('_')) continue;
    const packFile = path.join(pdir, 'pack.json');
    if (!fs.existsSync(packFile)) continue;
    const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
    let done = 0;

    for (const K of pack.keys) {
      const keyFile = path.join(pdir, K.file);
      if (!fs.existsSync(keyFile)) continue;
      const im = await readRGBA(keyFile);
      const cfgFile = path.join(pdir, 'pose.config.json');
      const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
      // hand-set rects win over anything detected: a drawing the detectors misread can be fixed by
      // writing {"face": {"mouth": [x, y, w, h], "eyes": [x, y, w, h]}} into pose.config.json
      const ovCfg = (cfg.face && typeof cfg.face === 'object' && cfg.face[`key${K.pose}`]) || (cfg.face && typeof cfg.face === 'object' ? cfg.face : {});
      // priority: a rect written in this pose's pose.config.json > face.json carried here by matching
      let ov = ovCfg;
      if (spec && specIm) {
        const eyes0 = spec.eyes, mouth0 = spec.mouth;
        const anchor = unionBox([
          { x: eyes0[0], y: eyes0[1], w: eyes0[2], h: eyes0[3] },
          { x: mouth0[0], y: mouth0[1], w: mouth0[2], h: mouth0[3] },
        ], Math.max(4, Math.round(eyes0[2] * 0.18)));
        const rel = path.relative(dir, keyFile).split(path.sep).join('/');
        const a = rel === (spec.ref || 'poses/idle/key0.png').split(path.sep).join('/')
          ? { s: 1, dx: 0, dy: 0, score: 0 }
          : alignFace(im, specIm, anchor);
        ov = {
          ...ovCfg,
          eyes: ovCfg.eyes || alignRect(eyes0, a, anchor),
          mouth: ovCfg.mouth || alignRect(mouth0, a, anchor),
          via: 'face.json',
        };
        if (a.score > 26) log(`  ! ${ch}/${name}/${K.file}: face match is loose (${a.score.toFixed(1)}) — check the audit sheet`);
      }
      if (cfg.face === 'skip') { K.face = { occluded: true }; log(`  ${ch}/${name}: face declared occluded, left as drawn`); continue; }
      const rough = faceBox(im);
      if (!rough) { log(`  ! ${ch}/${name}/${K.file}: no face`); continue; }
      let eyes = eyeBoxes(im, rough);              // eyes are found on the rough box: the refined box
      const face = refineFace(rough, eyes, im);    // is derived FROM them, so it cannot be used first
      const rectOf = (a) => {
        if (!Array.isArray(a) || a.length !== 4) return null;
        const frac = a.every((v) => v <= 1.0001);              // fractions of the key, or pixels
        const [x, y, w, h] = frac ? [a[0] * im.w, a[1] * im.h, a[2] * im.w, a[3] * im.h] : a;
        return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
      };
      // eyes can be given as a PAIR of rects ([[x,y,w,h],[x,y,w,h]]) for a turned head where the two
      // eyes are not level, or as ONE box over both, which is split into a pair below
      const ovPair = Array.isArray(ov.eyes) && Array.isArray(ov.eyes[0]) ? ov.eyes.map(rectOf) : null;
      const ovEyes = ovPair ? null : rectOf(ov.eyes);
      const viaSpec = ov.via === 'face.json';
      // the blink patch and the pupil darts are built per eye, so a single hand-set box is SPLIT into
      // the pair: taking it as one "eye" silently switched blinking off on every key with a hand rect
      // (the character then sat there dead-eyed — no lids, no darts)
      if (ovPair) eyes = ovPair.map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }));
      else if (ovEyes) {
        const gap = Math.max(2, Math.round(ovEyes.w * 0.10));
        const ew = Math.max(4, Math.round((ovEyes.w - gap) / 2));
        eyes = [
          { x: ovEyes.x, y: ovEyes.y, w: ew, h: ovEyes.h },
          { x: ovEyes.x + ovEyes.w - ew, y: ovEyes.y, w: ew, h: ovEyes.h },
        ];
      }
      const eyesBox = eyes.length ? unionBox(eyes.slice(0, 2), 0) : null;
      const skin = face.skin;
      let mouth = mouthBox(im, face, eyes);
      const ovMouth = ov.mouth === 'skip' ? null : rectOf(ov.mouth);
      // "mouth": "skip" — the pose hides the mouth (a cup held to the lips), so paste no lips at all
      const skipMouth = ov.mouth === 'skip';
      if (ovMouth) mouth = { ...ovMouth, via: viaSpec ? 'face.json' : 'override' };
      else if (skipMouth) mouth = null;
      K.face = {};
      // where the head meets the body, in key-image pixels: the pose warp tilts the head above this
      if (eyesBox) {
        // a human gave us the eyes (and usually the mouth), so the head box comes from THOSE: the
        // detectors misread some drawings (a bald scalp, glasses, a white moustache) and a bad box
        // pushed the pose warp and the QA check off the real face
        const mx0 = ovMouth ? ovMouth.x : eyesBox.x, mx1 = ovMouth ? ovMouth.x + ovMouth.w : eyesBox.x + eyesBox.w;
        const x0 = Math.min(eyesBox.x, mx0) - eyesBox.w * 0.15;
        const x1 = Math.max(eyesBox.x + eyesBox.w, mx1) + eyesBox.w * 0.15;
        const y0 = eyesBox.y - eyesBox.h * 0.9;
        const y1 = ovMouth
          ? ovMouth.y + ovMouth.h + ovMouth.h * 0.9
          : eyesBox.y + eyesBox.h * 2.6;          // no mouth given (occluded): a head is ~2.6 eye-heights
        const bx = Math.max(0, Math.round(x0)), by = Math.max(0, Math.round(y0));
        K.faceBox = {
          x: bx, y: by,
          w: Math.max(8, Math.min(im.w - bx, Math.round(x1 - x0))),
          h: Math.max(8, Math.min(im.h - by, Math.round(y1 - y0))),
        };
        K.neckY = Math.round(Math.min(im.h - 1, y1));
      } else {
        K.faceBox = { x: face.x, y: face.y, w: face.w, h: face.h };
        K.neckY = Math.round(face.y + face.h * 1.12);
      }
      const i = K.pose;

      if (eyes.length === 2) {
        const box = unionBox(eyes, 4);
        box.x = Math.max(0, box.x); box.y = Math.max(0, box.y);
        box.w = Math.min(box.w, im.w - box.x); box.h = Math.min(box.h, im.h - box.y);
        const c = cloneRect(im, box);
        const g = c.getContext('2d');
        for (const e of eyes) {
          g.fillStyle = rgb(skin);
          g.beginPath();
          g.roundRect(e.x - box.x + 2, e.y - box.y + 2, e.w - 4, e.h - 4, Math.min(e.w, e.h) * 0.45);
          g.fill();
          g.strokeStyle = '#1b1b2e'; g.lineWidth = Math.max(2, e.h * 0.17); g.lineCap = 'round';
          const y = e.y - box.y + e.h * 0.56;
          g.beginPath();
          g.moveTo(e.x - box.x + 3, y);
          g.quadraticCurveTo(e.x - box.x + e.w / 2, y + e.h * 0.24, e.x - box.x + e.w - 3, y);
          g.stroke();
        }
        const f = `key${i}.blink.png`;
        fs.writeFileSync(path.join(pdir, f), c.toBuffer('image/png'));
        K.face.blink = { file: f, ...box };

        // eye darts: an open-eye patch with the pupils lifted out, plus the pupils as their own sprite
        const pupils = pupilBoxes(im, eyes);
        if (pupils) {
          const ec = cloneRect(im, box), eg = ec.getContext('2d');
          const d = eg.getImageData(0, 0, box.w, box.h);
          const sclera = (() => {
            const rs = [], gs = [], bs = [];
            for (const e of eyes) for (let y = e.y; y < e.y + e.h; y += 1) for (let x = e.x; x < e.x + e.w; x += 1) {
              const i = (y * im.w + x) * 4;
              if (im.px[i + 3] > 200 && Math.min(im.px[i], im.px[i + 1], im.px[i + 2]) > 150) { rs.push(im.px[i]); gs.push(im.px[i + 1]); bs.push(im.px[i + 2]); }
            }
            const md = (a) => (a.length ? a.sort((p, q) => p - q)[a.length >> 1] : 250);
            return [md(rs), md(gs), md(bs)];
          })();
          // the pupil rect becomes flat sclera, so the sprite can slide over it
          for (const p of pupils) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
            const di = ((y - box.y) * box.w + (x - box.x)) * 4;
            d.data[di] = sclera[0]; d.data[di + 1] = sclera[1]; d.data[di + 2] = sclera[2];
          }
          eg.putImageData(d, 0, 0);
          const ef = `key${i}.eyes.png`;
          fs.writeFileSync(path.join(pdir, ef), ec.toBuffer('image/png'));
          // sprite: the two pupils on a transparent canvas the size of the eyes patch
          const sp = createCanvas(box.w, box.h), sg = sp.getContext('2d');
          const sd = sg.createImageData(box.w, box.h);
          for (const p of pupils) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
            const si = (y * im.w + x) * 4, di = ((y - box.y) * box.w + (x - box.x)) * 4;
            for (let q = 0; q < 4; q++) sd.data[di + q] = im.px[si + q];
          }
          sg.putImageData(sd, 0, 0);
          const pf = `key${i}.pupils.png`;
          fs.writeFileSync(path.join(pdir, pf), sp.toBuffer('image/png'));
          const pb = { x: Math.min(...pupils.map((p) => p.x)) - box.x, y: Math.min(...pupils.map((p) => p.y)) - box.y };
          pb.w = Math.max(...pupils.map((p) => p.x + p.w)) - box.x - pb.x;
          pb.h = Math.max(...pupils.map((p) => p.y + p.h)) - box.y - pb.y;
          K.face.eyes = { file: ef, pupil: { file: pf, ...pb } };
        }
      }

      if (mouth) {
        // never let a patch hang off the key: a clipped rect silently shifts the lips
        mouth.w = Math.min(mouth.w, im.w - 2); mouth.h = Math.min(mouth.h, im.h - 2);
        mouth.x = Math.max(0, Math.min(mouth.x, im.w - mouth.w));
        mouth.y = Math.max(0, Math.min(mouth.y, im.h - mouth.h));
        K.face.mouth = { x: mouth.x, y: mouth.y, w: mouth.w, h: mouth.h, files: {} };
        for (const [tag, part, s] of MOUTHS) {
          const src = path.join(dir, 'parts', part + '.png');
          if (!fs.existsSync(src)) continue;
          const c = cloneRect(im, mouth);
          const g = c.getContext('2d');
          const gone = inpaintMouth(g, im, mouth);       // the drawing's own mouth, closed over
          if (gone) { K.face.mouth.erased = gone.erased; K.face.mouth.inkLeft = gone.inkLeft; }
          const img = await loadImage(fs.readFileSync(src));
          // the patch box IS the drawn mouth plus a small margin, so the lips are centred in it and
          // sized to it — no offsets, which is what put a second mouth just under the first one
          // FIT THE BOX, not a fraction of it: the box IS the drawn mouth, so the pasted lips have to
          // stand in for that whole mouth. Sizing them by a shrink factor left the drawing's own mouth
          // corner or teeth showing around the patch, which reads as a second mouth.
          const ar = img.height / img.width;
          let w = mouth.w * 0.96;
          let h = w * ar;
          if (h > mouth.h * 0.96) { h = mouth.h * 0.96; w = h / ar; }
          g.drawImage(img, mouth.w / 2 - w / 2, Math.max(0, mouth.h / 2 - h / 2), w, h);
          const f = `key${i}.m.${tag}.png`;
          fs.writeFileSync(path.join(pdir, f), c.toBuffer('image/png'));
          K.face.mouth.files[tag] = f;
        }
        if (Object.keys(K.face.mouth.files).length) done++;
      }
    }
    fs.writeFileSync(packFile, JSON.stringify(pack, null, 1));
    log(`  ${ch}/${name}: face patches on ${done}/${pack.keys.length} key(s)`);
    total += done;
  }
}
  return total;
}

export { faceBox, isSkinPx };
