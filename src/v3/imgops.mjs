// rigpop-motion v3 · raster helpers for the auto-rig: chroma key, connected components,
// 1 px cleanup + re-inked edge, principal axis, rotate/crop. Pure JS on RGBA buffers.
import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

export const INK_RGB = [26, 19, 22];

export async function readRGBA(file) {
  const img = await loadImage(fs.readFileSync(file));
  const c = createCanvas(img.width, img.height), g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height);
  return { w: img.width, h: img.height, px: new Uint8ClampedArray(d.data) };
}

export function toCanvas(im) {
  const c = createCanvas(im.w, im.h), g = c.getContext('2d');
  const d = g.createImageData(im.w, im.h); d.data.set(im.px); g.putImageData(d, 0, 0);
  return c;
}
export function writePNG(file, im) { fs.writeFileSync(file, toCanvas(im).toBuffer('image/png')); }

// Background colour = median of the border pixels.
export function borderColour(im) {
  const rs = [], gs = [], bs = [];
  const take = (x, y) => { const i = (y * im.w + x) * 4; rs.push(im.px[i]); gs.push(im.px[i + 1]); bs.push(im.px[i + 2]); };
  for (let x = 0; x < im.w; x += 3) { take(x, 0); take(x, 1); take(x, im.h - 1); take(x, im.h - 2); }
  for (let y = 0; y < im.h; y += 3) { take(0, y); take(1, y); take(im.w - 1, y); take(im.w - 2, y); }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

// Key a flat background out. Uses "greenness" for chroma backgrounds (robust to the model's
// slightly uneven green and to its soft ground shadows) and colour distance otherwise.
export function chromaKey(im, { bg = borderColour(im), t0 = 0.10, t1 = 0.22 } = {}) {
  const [br, bgc, bb] = bg;
  const chroma = bgc > br + 40 && bgc > bb + 40; // a green screen
  const out = new Uint8ClampedArray(im.px);
  for (let i = 0; i < im.w * im.h; i++) {
    const r = im.px[i * 4], g = im.px[i * 4 + 1], b = im.px[i * 4 + 2];
    let a;
    if (chroma) {
      // how green-dominant the pixel is, relative to the screen's own dominance
      const gd = (g - Math.max(r, b)) / Math.max(1, bgc - Math.max(br, bb));
      a = 1 - smooth01((gd - 0.28) / 0.34); // gd ~1 => screen, <=0 => art
      // despill: pull residual green back to the max of r/b on edge pixels
      if (g > Math.max(r, b)) out[i * 4 + 1] = Math.max(r, b) + (g - Math.max(r, b)) * 0.15;
    } else {
      const d = Math.hypot(r - br, g - bgc, b - bb) / 441;
      a = smooth01((d - t0) / (t1 - t0));
    }
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return { w: im.w, h: im.h, px: out };
}
function smooth01(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

// 8-connected components on alpha > thr. Returns [{ id, area, x0, y0, x1, y1, cx, cy }] and a label map.
export function components(im, thr = 128) {
  const { w, h, px } = im;
  const lab = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (lab[s] !== -1 || px[s * 4 + 3] < thr) continue;
    const id = comps.length; let sp = 0; stack[sp++] = s; lab[s] = id;
    let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, sx = 0, sy = 0;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0;
      area++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx; if (lab[q] !== -1 || px[q * 4 + 3] < thr) continue;
        lab[q] = id; stack[sp++] = q;
      }
    }
    comps.push({ id, area, x0, y0, x1, y1, cx: sx / area, cy: sy / area });
  }
  return { comps, lab };
}

// Group components whose boxes come within `gap` px (stray hair strands, lash flicks, a lid
// line that the model drew apart from its eye) into items.
export function groupComponents(comps, gap) {
  const parent = comps.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < comps.length; i++) for (let j = i + 1; j < comps.length; j++) {
    const a = comps[i], b = comps[j];
    const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
    const dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
    if (Math.hypot(dx, dy) <= gap) parent[find(i)] = find(j);
  }
  const groups = new Map();
  comps.forEach((c, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });
  return [...groups.values()].map((cs) => boxOf(cs));
}
export function boxOf(cs) {
  const x0 = Math.min(...cs.map((c) => c.x0)), y0 = Math.min(...cs.map((c) => c.y0));
  const x1 = Math.max(...cs.map((c) => c.x1)), y1 = Math.max(...cs.map((c) => c.y1));
  const area = cs.reduce((a, c) => a + c.area, 0);
  return { ids: cs.flatMap((c) => c.ids || [c.id]), x0, y0, x1, y1, area, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// Reading order: cluster items into rows by vertical overlap, then left to right.
export function readingOrder(items) {
  const sorted = [...items].sort((a, b) => a.cy - b.cy);
  const rows = [];
  for (const it of sorted) {
    const row = rows.find((r) => {
      const ov = Math.min(r.y1, it.y1) - Math.max(r.y0, it.y0);
      return ov > 0.35 * Math.min(r.y1 - r.y0, it.y1 - it.y0);
    });
    if (row) { row.items.push(it); row.y0 = Math.min(row.y0, it.y0); row.y1 = Math.max(row.y1, it.y1); }
    else rows.push({ y0: it.y0, y1: it.y1, items: [it] });
  }
  rows.sort((a, b) => a.y0 - b.y0);
  return rows.map((r) => r.items.sort((a, b) => a.cx - b.cx));
}

// Extract one item (a set of component ids) into its own padded RGBA image.
export function extract(im, lab, item, pad = 6) {
  const ids = new Set(item.ids);
  const x0 = Math.max(0, item.x0 - pad), y0 = Math.max(0, item.y0 - pad);
  const x1 = Math.min(im.w - 1, item.x1 + pad), y1 = Math.min(im.h - 1, item.y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y + y0) * im.w + (x + x0), di = y * w + x;
    // keep soft edge pixels next to the item too (label is only set above the threshold)
    let keep = ids.has(lab[si]);
    if (!keep && im.px[si * 4 + 3] > 0) {
      for (let dy = -1; dy <= 1 && !keep; dy++) for (let dx = -1; dx <= 1 && !keep; dx++) {
        const nx = x + x0 + dx, ny = y + y0 + dy; if (nx < 0 || ny < 0 || nx >= im.w || ny >= im.h) continue;
        if (ids.has(lab[ny * im.w + nx])) keep = true;
      }
    }
    if (!keep) continue;
    for (let k = 0; k < 4; k++) px[di * 4 + k] = im.px[si * 4 + k];
  }
  return { w, h, px, ox: x0, oy: y0 };
}

// 1 px cleanup (erode the soft fringe once) and a re-inked edge: boundary pixels are pulled
// toward ink so a keyed edge reads like the drawn outline instead of a green-tinted halo.
export function cleanAndInk(im, { erode = 1, ink = 0.75, inkWidth = 1 } = {}) {
  const { w, h } = im; let px = new Uint8ClampedArray(im.px);
  for (let e = 0; e < erode; e++) {
    const a = new Uint8ClampedArray(w * h); for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + 3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!a[i]) continue;
      let m = a[i];
      if (x > 0) m = Math.min(m, a[i - 1]); if (x < w - 1) m = Math.min(m, a[i + 1]);
      if (y > 0) m = Math.min(m, a[i - w]); if (y < h - 1) m = Math.min(m, a[i + w]);
      px[i * 4 + 3] = m;
    }
  }
  // drop specks
  for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] < 40) px[i * 4 + 3] = 0;
  const a = new Uint8ClampedArray(w * h); for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + 3];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (a[i] < 128) continue;
    let edge = false;
    for (let dy = -inkWidth; dy <= inkWidth && !edge; dy++) for (let dx = -inkWidth; dx <= inkWidth && !edge; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || a[ny * w + nx] < 128) edge = true;
    }
    if (!edge) continue;
    for (let k = 0; k < 3; k++) px[i * 4 + k] = px[i * 4 + k] * (1 - ink) + INK_RGB[k] * ink;
  }
  return { ...im, px };
}

// Make pixels close to a given colour transparent (used to lift skin out of face patches so
// the head's own skin shows through and no square patch edge can ever appear).
export function keyColour(im, rgb, tol = 34, soft = 22) {
  const px = new Uint8ClampedArray(im.px);
  for (let i = 0; i < im.w * im.h; i++) {
    const d = Math.hypot(px[i * 4] - rgb[0], px[i * 4 + 1] - rgb[1], px[i * 4 + 2] - rgb[2]);
    if (d < tol + soft) px[i * 4 + 3] = Math.round(px[i * 4 + 3] * smooth01((d - tol) / soft));
  }
  return { ...im, px };
}

// Principal axis of the alpha mask: centroid, unit axis, extents and widths near each end.
export function principalAxis(im, thr = 128) {
  const { w, h, px } = im; let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] >= thr) { n++; sx += x; sy += y; }
  const cx = sx / n, cy = sy / n; let xx = 0, yy = 0, xy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] >= thr) { const dx = x - cx, dy = y - cy; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  const ang = 0.5 * Math.atan2(2 * xy, xx - yy);
  let ax = { x: Math.cos(ang), y: Math.sin(ang) };
  if (ax.y < 0) ax = { x: -ax.x, y: -ax.y }; // point down the image
  let tmin = 1e9, tmax = -1e9;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] >= thr) { const t = (x - cx) * ax.x + (y - cy) * ax.y; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
  const widthAt = (t0, t1) => { let lo = 1e9, hi = -1e9; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (px[(y * w + x) * 4 + 3] < thr) continue; const t = (x - cx) * ax.x + (y - cy) * ax.y; if (t < t0 || t > t1) continue; const s = -(x - cx) * ax.y + (y - cy) * ax.x; if (s < lo) lo = s; if (s > hi) hi = s; } return hi - lo; };
  const L = tmax - tmin;
  return { cx, cy, ax, ang, tmin, tmax, L, wTop: widthAt(tmin + L * 0.08, tmin + L * 0.2), wBot: widthAt(tmax - L * 0.2, tmax - L * 0.08), wMid: widthAt(tmin + L * 0.4, tmin + L * 0.6) };
}

// Rotate an RGBA image by -rot around (cx,cy) so its principal axis becomes vertical.
export function rotateUpright(im, rot, pad = 8) {
  const src = toCanvas(im);
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  const W = Math.ceil(im.w * c + im.h * s) + pad * 2, H = Math.ceil(im.w * s + im.h * c) + pad * 2;
  const cv = createCanvas(W, H), g = cv.getContext('2d');
  g.translate(W / 2, H / 2); g.rotate(-rot); g.drawImage(src, -im.w / 2, -im.h / 2);
  const d = g.getImageData(0, 0, W, H);
  return { w: W, h: H, px: new Uint8ClampedArray(d.data), map: (x, y) => { const dx = x - im.w / 2, dy = y - im.h / 2; return { x: W / 2 + dx * Math.cos(-rot) - dy * Math.sin(-rot), y: H / 2 + dx * Math.sin(-rot) + dy * Math.cos(-rot) }; } };
}

export function alphaBox(im, thr = 128) {
  let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.px[(y * im.w + x) * 4 + 3] >= thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
export function crop(im, x0, y0, w, h) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x + x0, sy = y + y0; if (sx < 0 || sy < 0 || sx >= im.w || sy >= im.h) continue;
    const si = (sy * im.w + sx) * 4, di = (y * w + x) * 4; for (let k = 0; k < 4; k++) px[di + k] = im.px[si + k];
  }
  return { w, h, px };
}
// Opaque extent of one row / column (for torso shoulders, hand wrists, foot ankles).
export function rowSpan(im, y, thr = 128) { let a = -1, b = -1; for (let x = 0; x < im.w; x++) if (im.px[(y * im.w + x) * 4 + 3] >= thr) { if (a < 0) a = x; b = x; } return a < 0 ? null : { a, b, w: b - a + 1 }; }

// Dominant colour of the opaque pixels that are not ink (for skin sampling).
export function dominantColour(im, { thr = 200, quant = 12, exclude = (r, g, b) => r + g + b < 150 } = {}) {
  const hist = new Map();
  for (let i = 0; i < im.w * im.h; i++) {
    if (im.px[i * 4 + 3] < thr) continue;
    const r = im.px[i * 4], g = im.px[i * 4 + 1], b = im.px[i * 4 + 2]; if (exclude(r, g, b)) continue;
    const k = `${Math.round(r / quant)},${Math.round(g / quant)},${Math.round(b / quant)}`;
    const e = hist.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; hist.set(k, e);
  }
  let best = null; for (const e of hist.values()) if (!best || e.n > best.n) best = e;
  return best ? [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)] : [200, 150, 110];
}
