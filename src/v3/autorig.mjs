// rigpop-motion v3 · auto-rig: AI part sheets -> cut parts + pivots -> rig.json.
//
//   characters/<name>/rig-src.json    style bible, prompts, sheet files and a label manifest
//   characters/<name>/sheets/*.png    part sheets on a flat chroma background (image model)
//   -> characters/<name>/parts/*.png  one transparent PNG per part, limbs turned upright
//   -> characters/<name>/rig.json     pivots, face anchors, colours, mapped onto a v2 skeleton
//
// The cut is automatic: key the screen, connected components, drop specks/labels, group
// strays, read the sheet in rows. The manifest only says what the model drew, in reading
// order ("eyes.open*2" = the next two items are one part).
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import {
  readRGBA, writePNG, toCanvas, chromaKey, components, groupComponents, boxOf, readingOrder, extract, cleanAndInk,
  keyColour, principalAxis, rotateUpright, alphaBox, crop, rowSpan, dominantColour,
} from './imgops.mjs';
import { P as RP } from '../paths.mjs';

GlobalFonts.registerFromPath(RP('assets/fonts/LuckiestGuy-Regular.ttf'), 'Lucky');

const LIMBS = new Set(['upperArm', 'forearm', 'thigh', 'shin']);

function parseLayout(layout) {
  // "name*2" = two items form one part; "name>0.5" = keep only the part below 50% of its height
  return layout.map((row) => row.map((cell) => { const m = cell.match(/^([^*>]+)(?:\*(\d+))?(?:>([\d.]+))?$/); return { name: m[1], n: Number(m[2] || 1), below: m[3] ? Number(m[3]) : 0 }; }));
}

async function cutSheet(file, spec, log) {
  const raw = await readRGBA(file);
  const keyed = chromaKey(raw);
  const { comps, lab } = components(keyed);
  const big = comps.filter((c) => c.area >= (spec.minArea ?? 400));
  const items = groupComponents(big, spec.gap ?? 6);
  const rows = readingOrder(items);
  const want = parseLayout(spec.layout);
  const got = rows.map((r) => r.length);
  const need = want.map((r) => r.reduce((a, c) => a + c.n, 0));
  log(`  ${path.basename(file)}: ${comps.length} components, ${big.length} kept, ${items.length} items, rows ${JSON.stringify(got)} (manifest ${JSON.stringify(need)})`);
  if (JSON.stringify(got) !== JSON.stringify(need)) throw new Error(`${file}: sheet rows ${JSON.stringify(got)} do not match the manifest ${JSON.stringify(need)}; adjust minArea/gap or the layout`);
  const out = {};
  want.forEach((row, ri) => {
    let k = 0;
    for (const cell of row) {
      const its = rows[ri].slice(k, k + cell.n); k += cell.n;
      if (cell.name.startsWith('skip')) continue;
      const item = boxOf(its.map((i) => ({ ...i, id: undefined, ids: i.ids })));
      if (cell.below) item.y0 = Math.round(item.y0 + (item.y1 - item.y0) * cell.below);
      const im = extract(keyed, lab, item, 10);
      // face patches are inked after their skin is lifted (see autoRig)
      out[cell.name] = /^(eyes|mouth)\./.test(cell.name) ? im : cleanAndInk(im, { erode: 1, ink: spec.ink ?? 0.6 });
    }
  });
  return out;
}

const hex = (c) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');

export async function autoRig(dir, { log = console.error } = {}) {
  const src = JSON.parse(fs.readFileSync(path.join(dir, 'rig-src.json'), 'utf8'));
  const partsDir = path.join(dir, 'parts'); fs.mkdirSync(partsDir, { recursive: true });
  const raw = {};
  for (const [k, spec] of Object.entries(src.sheets)) Object.assign(raw, await cutSheet(path.join(dir, spec.file), spec, log));
  // a part the model drew badly can borrow another one ("thigh": "forearm")
  for (const [to, from] of Object.entries(src.alias || {})) raw[to] = raw[from];

  const rig = { name: src.name, base: src.base, brows: src.brows || 'vector', generated: new Date().toISOString().slice(0, 10), parts: {} };
  const save = (name, im, meta) => {
    const f = `parts/${name}.png`; writePNG(path.join(dir, f), im);
    rig.parts[name] = { file: f, w: im.w, h: im.h, ...meta };
  };

  /* head: blank face; the skin blob gives the face ellipse */
  const head = raw['head.front'];
  const skin = dominantColour(head, { exclude: (r, g, b) => r + g + b < 200 || Math.abs(r - g) < 25 });
  const skinShade = dominantColour(head, { exclude: (r, g, b) => r + g + b < 120 || Math.hypot(r - skin[0], g - skin[1], b - skin[2]) < 30 || r < g + 20 });
  rig.skin = hex(skin); rig.skinShade = hex(skinShade);
  const hair = dominantColour(head, { exclude: (r, g, b) => r + g + b > 200 || r + g + b < 25 });
  rig.hair = hex(hair);
  for (const hname of ['head.front', 'head.34']) {
    const im = raw[hname]; if (!im) continue;
    const face = faceBlob(im, skin);
    save(hname, im, { face });
  }

  /* torso */
  {
    let im = raw.torso;
    im = trimSleeves(im, log);
    if (src.torsoText) im = bakeText(im, src.torsoText);
    const bb = alphaBox(im);
    let maxW = 0; for (let y = bb.y0; y <= bb.y1; y++) { const s = rowSpan(im, y); if (s && s.w > maxW) maxW = s.w; }
    let top = bb.y0; for (let y = bb.y0; y <= bb.y1; y++) { const s = rowSpan(im, y); if (s && s.w > maxW * 0.55) { top = y; break; } }
    const neckSpan = rowSpan(im, bb.y0 + 2) || { a: bb.x0, b: bb.x1, w: bb.w };
    const shY = top + Math.round((bb.y1 - top) * 0.1);
    const sh = rowSpan(im, shY);
    const inset = sh.w * 0.13;
    save('torso', im, {
      neckTop: { x: (neckSpan.a + neckSpan.b) / 2, y: bb.y0 }, neckW: neckSpan.w,
      shirtTop: top, hem: bb.y1, hip: { x: (bb.x0 + bb.x1) / 2, y: bb.y1 - (bb.y1 - top) * 0.07 },
      shoulderL: { x: sh.a + inset, y: shY }, shoulderR: { x: sh.b - inset, y: shY }, width: maxW,
    });
  }

  /* limbs: turned upright along the principal axis; pivots sit one end-radius inside each end
     so the rounded caps overlap the neighbouring part and hide the joint */
  for (const name of LIMBS) {
    const im0 = raw[name]; if (!im0) continue;
    const pa = principalAxis(im0);
    const rot = Math.atan2(pa.ax.y, pa.ax.x) - Math.PI / 2; // axis -> straight down
    const up = rotateUpright(im0, rot);
    const bb = alphaBox(up);
    const im = crop(up, bb.x0 - 6, bb.y0 - 6, bb.w + 12, bb.h + 12);
    const b2 = alphaBox(im), p2 = principalAxis(im);
    const rTop = p2.wTop / 2, rBot = p2.wBot / 2;
    const cxTop = centreAt(im, b2.y0 + rTop), cxBot = centreAt(im, b2.y1 - rBot);
    save(name, im, {
      top: { x: cxTop, y: b2.y0 + rTop * 0.85 }, bottom: { x: cxBot, y: b2.y1 - rBot * 0.85 },
      wTop: p2.wTop, wBot: p2.wBot, wMid: p2.wMid, tilt: +(rot * 180 / Math.PI).toFixed(1),
    });
  }

  /* hands: wrist at the top, fingers down */
  for (const name of ['hand.open', 'hand.fist', 'hand.point']) {
    const im0 = raw[name]; if (!im0) continue;
    const bb = alphaBox(im0);
    const im = crop(im0, bb.x0 - 6, bb.y0 - 6, bb.w + 12, bb.h + 12);
    const b2 = alphaBox(im);
    const wy = b2.y0 + b2.h * 0.12;
    save(name, im, { wrist: { x: centreAt(im, wy), y: wy }, len: b2.h, width: b2.w });
  }

  /* foot: ankle is the middle of the top fifth, toe points +x */
  {
    const im0 = raw.foot; const bb = alphaBox(im0);
    const im = crop(im0, bb.x0 - 6, bb.y0 - 6, bb.w + 12, bb.h + 12); const b2 = alphaBox(im);
    let sx = 0, n = 0; for (let y = b2.y0; y < b2.y0 + b2.h * 0.3; y++) { const s = rowSpan(im, y); if (s) { sx += (s.a + s.b) / 2; n++; } }
    save('foot', im, { ankle: { x: sx / n, y: b2.y0 + b2.h * 0.22 }, sole: b2.y1, len: b2.w });
  }

  /* accessories */
  if (raw.shades) { const im = raw.shades; const b = alphaBox(im); save('shades', im, { c: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, width: b.w }); }

  /* face kit: lift the skin out so the head's own skin shows through (no patch edges) */
  for (const [name, im0] of Object.entries(raw)) {
    if (!name.startsWith('eyes.') && !name.startsWith('mouth.')) continue;
    let im = keyColour(im0, skin, 30, 26); im = keyColour(im, skinShade, 22, 18);
    im = cleanAndInk(im, { erode: 1, ink: 0 });
    const b = alphaBox(im, 60);
    im = crop(im, b.x0 - 4, b.y0 - 4, b.w + 8, b.h + 8);
    const b2 = alphaBox(im, 60);
    save(name, im, { c: { x: (b2.x0 + b2.x1) / 2, y: (b2.y0 + b2.y1) / 2 }, width: b2.w, height: b2.h });
  }

  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1));
  log(`  rig.json: ${Object.keys(rig.parts).length} parts (${Object.keys(rig.parts).join(', ')})`);
  // sleeves go into the torso; the arm becomes one bare tapered strip tucked under them
  fs.rmSync(path.join(partsDir, 'torso.base.png'), { force: true });
  const { sleeveTorso } = await import('./sleeves.mjs');
  return sleeveTorso(dir, { log });
}

// The model often paints sleeve flaps onto the torso; cut the torso back to its body below the
// armpits and re-ink (src/v3/sleeves.mjs then paints proper sleeves into the torso).
function trimSleeves(im, log) {
  const bb = alphaBox(im);
  let maxW = 0, maxY = bb.y0; for (let y = bb.y0; y <= bb.y1; y++) { const s = rowSpan(im, y); if (s && s.w > maxW) { maxW = s.w; maxY = y; } }
  let pit = -1; for (let y = maxY; y < bb.y1; y++) { const s = rowSpan(im, y); if (s && s.w < maxW * 0.8) { pit = y; break; } }
  if (pit < 0 || pit > bb.y0 + bb.h * 0.6) return im;
  const body = rowSpan(im, pit + 8); if (!body) return im;
  const px = new Uint8ClampedArray(im.px);
  for (let y = 0; y < pit + 8; y++) for (let x = 0; x < im.w; x++) if (x < body.a + 2 || x > body.b - 2) px[(y * im.w + x) * 4 + 3] = 0;
  log(`  torso: sleeves trimmed above y=${pit} (body ${body.a}..${body.b} of ${maxW} px)`);
  return cleanAndInk({ ...im, px }, { erode: 0, ink: 0.85, inkWidth: 2 });
}

function centreAt(im, y) { const s = rowSpan(im, Math.round(y)); return s ? (s.a + s.b) / 2 : im.w / 2; }

function faceBlob(im, skin) {
  // pixels within reach of the skin tone, largest blob
  const m = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
  for (let i = 0; i < im.w * im.h; i++) {
    const d = Math.hypot(im.px[i * 4] - skin[0], im.px[i * 4 + 1] - skin[1], im.px[i * 4 + 2] - skin[2]);
    m.px[i * 4 + 3] = im.px[i * 4 + 3] > 128 && d < 60 ? 255 : 0;
  }
  const { comps } = components(m);
  const c = comps.sort((a, b) => b.area - a.area)[0];
  return { cx: c.cx, cy: (c.y0 + c.y1) / 2 + (c.y1 - c.y0) * 0.04, rx: (c.x1 - c.x0) / 2, ry: (c.y1 - c.y0) / 2, top: c.y0, bottom: c.y1 };
}

function bakeText(im, T) {
  const c = toCanvas(im), g = c.getContext('2d');
  const bb = alphaBox(im);
  let maxW = 0, top = bb.y0; for (let y = bb.y0; y <= bb.y1; y++) { const s = rowSpan(im, y); if (s && s.w > maxW) maxW = s.w; }
  for (let y = bb.y0; y <= bb.y1; y++) { const s = rowSpan(im, y); if (s && s.w > maxW * 0.55) { top = y; break; } }
  const cx = (bb.x0 + bb.x1) / 2, cy = top + (bb.y1 - top) * (T.y ?? 0.46);
  const size = Math.round(maxW * (T.size ?? 0.17));
  g.save(); g.globalCompositeOperation = 'source-atop';
  g.translate(cx, cy); g.rotate(T.rot ?? -0.06);
  g.font = `${size}px Lucky`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = T.color || '#f3cdbd'; g.globalAlpha = T.alpha ?? 0.92;
  const words = T.text.split(' ');
  g.fillText(words[0], 0, -size * 0.55); if (words.length > 1) g.fillText(words.slice(1).join(' '), size * 0.25, size * 0.55);
  g.restore();
  const d = g.getImageData(0, 0, im.w, im.h);
  return { ...im, px: new Uint8ClampedArray(d.data) };
}

// Debug sheet: every part on a grey card with its pivots marked.
export async function rigPreview(dir, out) {
  const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json'), 'utf8'));
  const names = Object.keys(rig.parts);
  const cell = 220, cols = 6, rows = Math.ceil(names.length / cols);
  const c = createCanvas(cols * cell, rows * (cell + 20)), g = c.getContext('2d');
  g.fillStyle = '#5a5a66'; g.fillRect(0, 0, c.width, c.height);
  const { loadImage } = await import('@napi-rs/canvas');
  for (let i = 0; i < names.length; i++) {
    const p = rig.parts[names[i]]; const img = await loadImage(fs.readFileSync(path.join(dir, p.file)));
    const s = Math.min((cell - 20) / p.w, (cell - 20) / p.h);
    const ox = (i % cols) * cell + (cell - p.w * s) / 2, oy = Math.floor(i / cols) * (cell + 20) + (cell - p.h * s) / 2;
    g.drawImage(img, ox, oy, p.w * s, p.h * s);
    const dot = (q, col) => { if (!q) return; g.beginPath(); g.arc(ox + q.x * s, oy + q.y * s, 4, 0, 7); g.fillStyle = col; g.fill(); };
    dot(p.top, '#ff3'); dot(p.bottom, '#3ff'); dot(p.wrist, '#ff3'); dot(p.ankle, '#ff3'); dot(p.neckTop, '#ff3'); dot(p.hip, '#3ff'); dot(p.shoulderL, '#f3f'); dot(p.shoulderR, '#f3f'); dot(p.c, '#3f3');
    if (p.face) { g.strokeStyle = '#3f3'; g.lineWidth = 2; g.beginPath(); g.ellipse(ox + p.face.cx * s, oy + p.face.cy * s, p.face.rx * s, p.face.ry * s, 0, 0, 7); g.stroke(); }
    g.fillStyle = '#fff'; g.font = '14px sans-serif'; g.fillText(names[i], (i % cols) * cell + 6, Math.floor(i / cols) * (cell + 20) + cell + 14);
  }
  fs.writeFileSync(out, c.toBuffer('image/jpeg', 88));
}
