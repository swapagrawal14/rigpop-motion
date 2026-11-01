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
  const y1 = Math.round(im.h * 0.55);
  for (let y = 0; y < y1; y++) for (let x = 0; x < im.w; x++) {
    const i = (y * im.w + x) * 4;
    if (im.px[i + 3] > 128 && isSkinPx(im.px[i], im.px[i + 1], im.px[i + 2])) m.px[i + 3] = 255;
  }
  const { comps } = components(m);
  const c = comps.sort((p, q) => q.area - p.area)[0];
  if (!c || c.area < 300) return null;
  const rs = [], gs = [], bs = [];
  for (let y = c.y0; y <= c.y1; y += 2) for (let x = c.x0; x <= c.x1; x += 2) {
    const i = (y * im.w + x) * 4;
    if (im.px[i + 3] > 200 && isSkinPx(im.px[i], im.px[i + 1], im.px[i + 2])) { rs.push(im.px[i]); gs.push(im.px[i + 1]); bs.push(im.px[i + 2]); }
  }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1] || 0;
  return { x: c.x0, y: c.y0, w: c.x1 - c.x0, h: c.y1 - c.y0, skin: [med(rs), med(gs), med(bs)] };
}

function eyeBoxes(im, face) {
  const m = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
  const yTop = Math.max(0, Math.round(face.y - face.h * 0.55)), yBot = face.y + face.h * 0.55;
  for (let y = yTop; y < yBot; y++) for (let x = Math.max(0, face.x - 6); x < face.x + face.w + 6; x++) {
    const i = (y * im.w + x) * 4;
    const r = im.px[i], g = im.px[i + 1], b = im.px[i + 2];
    if (im.px[i + 3] < 128) continue;
    const lo = Math.min(r, g, b), hi = Math.max(r, g, b);
    if (lo > 175 && hi - lo < 55) m.px[i + 3] = 255; // sclera: bright and near-neutral
  }
  const { comps } = components(m);
  return comps.filter((c) => c.area > 25).sort((a, b) => b.area - a.area).slice(0, 2)
    .map((c) => ({ x: c.x0, y: c.y0, w: c.x1 - c.x0, h: c.y1 - c.y0 }))
    .sort((a, b) => a.x - b.x);
}

// the drawn mouth: a short cobalt-ink stroke sitting *inside* the face, i.e. with skin on both
// sides of it. The collar and the jaw outline are ink too, but they are long arcs that touch the
// hair or the neck, so they fail the skin-on-both-sides test.
function mouthBox(im, face, eyes) {
  const eyeBottom = eyes.length ? Math.max(...eyes.map((e) => e.y + e.h)) : face.y + face.h * 0.45;
  const yTop = Math.round(eyeBottom - face.h * 0.1), yBot = Math.round(face.y + face.h * 0.95);

  // 1 · a moustache is the easiest anchor there is: the biggest near-black blob under the eyes,
  //     wide and flat. The mouth sits centred, just below its bottom edge.
  const bm = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
  for (let y = yTop; y < yBot; y++) for (let x = Math.max(0, Math.round(face.x - 6)); x < face.x + face.w + 6; x++) {
    if (x >= im.w) continue;
    const i = (y * im.w + x) * 4;
    if (im.px[i + 3] < 128) continue;
    if (im.px[i] < 95 && im.px[i + 1] < 95 && im.px[i + 2] < 110) bm.px[i + 3] = 255;
  }
  const bc = components(bm).comps.filter((c) => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    return c.area > 200 && w / h > 1.4 && w > face.w * 0.22;
  }).sort((a, b) => b.area - a.area)[0];
  if (bc) {
    const w = Math.max(20, (bc.x1 - bc.x0) * 0.40), h = Math.max(10, w * 0.46);
    return { x: Math.round(bc.cx - w / 2), y: Math.round(bc.y1 - h * 0.15), w: Math.round(w), h: Math.round(h * 2.0), via: 'moustache' };
  }

  // 2 · no moustache: the drawn mouth is a short ink stroke with chin (skin) under it
  const m = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
  for (let y = yTop; y < yBot; y++) for (let x = Math.max(0, Math.round(face.x - 4)); x < face.x + face.w + 4 && x < im.w; x++) {
    const i = (y * im.w + x) * 4;
    if (im.px[i + 3] < 128) continue;
    const r = im.px[i], g = im.px[i + 1], b = im.px[i + 2];
    if ((b > 90 && b > r + 40 && b > g + 15) || (r < 95 && g < 95 && b < 110)) m.px[i + 3] = 255;
  }
  const skinAt = (x, y) => {
    if (x < 0 || y < 0 || x >= im.w || y >= im.h) return false;
    const i = (y * im.w + x) * 4;
    return im.px[i + 3] > 128 && isSkinPx(im.px[i], im.px[i + 1], im.px[i + 2]);
  };
  const ok = components(m).comps.filter((c) => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    if (c.area < 12 || c.area > 900 || w / h < 1.15) return false;
    let below = 0;
    for (let dy = 4; dy <= 16; dy++) for (let dx = -8; dx <= 8; dx++) if (skinAt(Math.round(c.cx) + dx, Math.round(c.y1) + dy)) below++;
    return below >= 6;
  }).filter((c) => c.cy > eyeBottom + face.h * 0.1).sort((a, b) => b.cy - a.cy)[0];
  if (!ok) return null;
  const w = Math.max(22, ok.x1 - ok.x0), h = Math.max(10, ok.y1 - ok.y0);
  return { x: Math.round(ok.cx - w), y: Math.round(ok.cy - h * 1.4), w: Math.round(w * 2), h: Math.round(h * 3.4), mw: w, mcy: Math.round(ok.cy - ok.y0) + Math.round(ok.cy - h * 1.4), via: 'stroke' };
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
// repaint the drawn mouth with the face's own skin, without leaving a rectangle: every row of the
// patch is filled by interpolating between the real skin colours just outside the patch on the left
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

/* ---------------------------------------------------------------------- api */

export async function patchPoses(charDir, { only = null, log = () => {} } = {}) {
  let total = 0;
  {
  const ch = path.basename(charDir), dir = charDir;
  if (!fs.existsSync(path.join(dir, 'poses'))) return 0;
  const poses = path.join(dir, 'poses');

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
      const face = faceBox(im);
      if (!face) { log(`  ! ${ch}/${name}/${K.file}: no face`); continue; }
      const skin = face.skin;
      const eyes = eyeBoxes(im, face);
      const mouth = mouthBox(im, face, eyes);
      K.face = {};
      const i = K.pose;

      if (eyes.length === 2) {
        const box = unionBox(eyes, 4);
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
      }

      if (mouth) {
        K.face.mouth = { x: mouth.x, y: mouth.y, w: mouth.w, h: mouth.h, files: {} };
        for (const [tag, part, s] of MOUTHS) {
          const src = path.join(dir, 'parts', part + '.png');
          if (!fs.existsSync(src)) continue;
          const c = cloneRect(im, mouth);
          const g = c.getContext('2d');
          eraseRect(g, im, mouth);
          const img = await loadImage(fs.readFileSync(src));
          const w = (mouth.mw ? Math.min(mouth.w * 0.9, mouth.mw * 2.4) : mouth.w * 0.9) * s, h = w * (img.height / img.width);
          // sit the lips just under the moustache instead of on top of it
          const lipTop = mouth.mcy
            ? Math.max(0, Math.min(mouth.h - h - 1, mouth.mcy - h / 2))
            : Math.min(mouth.h - h - 1, Math.max(mouth.h * 0.1, inkBottom(im, mouth) + 1));
          g.drawImage(img, mouth.w / 2 - w / 2, lipTop, w, h);
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
