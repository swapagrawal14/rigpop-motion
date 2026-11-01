// Prepares the cast + plates for "2 Baje Ki Maggi" from the raw generated art.
//   node src/prep-maggi.mjs
//
//  · cuts the warden out of her white-background render (white key + 1 px erosion)
//  · derives her mouth / blink / smile patches by diffing the expression variants
//    against the base render, then crops the changed region
//  · normalises the three background plates to the shot sizes the short uses
import fs from 'node:fs';
import { P } from './paths.mjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const SRC = P('assets/maggi/src');
const OUT = P('characters/warden');
const PLATES = P('assets/maggi');
fs.mkdirSync(OUT, { recursive: true });

const read = async (file) => {
  const img = await loadImage(file);
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  return { img, c, g, w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
};
const save = async (c, file, quality) => {
  const buf = file.endsWith('.png') ? await c.encode('png') : await c.encode('jpeg', quality);
  fs.writeFileSync(file, buf);
};

/* ---------------------------------------------------------- 1. cut the warden */
const base = await read(`${SRC}/warden_base.png`);
const W = base.w, H = base.h;

let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  if (base.d[i] < 244 || base.d[i + 1] < 244 || base.d[i + 2] < 244) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
}
const PAD = 6;
const cx = Math.max(0, x0 - PAD), cy = Math.max(0, y0 - PAD);
const cw = Math.min(W, x1 + PAD) - cx, chh = Math.min(H, y1 + PAD) - cy;
console.error(`warden bbox ${x0},${y0} ${x1},${y1} -> crop ${cw}x${chh} @ ${cx},${cy}`);

const cut = createCanvas(cw, chh);
const cg = cut.getContext('2d');
cg.drawImage(base.img, cx, cy, cw, chh, 0, 0, cw, chh);
{
  const im = cg.getImageData(0, 0, cw, chh);
  const d = im.data;
  // Background key = FLOOD FILL from the border over near-white pixels.
  // Keying every white pixel also deletes eye-whites and teeth, which are enclosed
  // by ink — those must survive. (Rule 6 in docs/SPEC.md.)
  const near = new Uint8Array(cw * chh);
  for (let p = 0; p < cw * chh; p++) {
    const i = p * 4;
    near[p] = d[i] > 236 && d[i + 1] > 236 && d[i + 2] > 236 ? 1 : 0;
  }
  const bg = new Uint8Array(cw * chh);
  const stack = [];
  const push = (x, y) => {
    const p = y * cw + x;
    if (near[p] && !bg[p]) { bg[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < cw; x++) { push(x, 0); push(x, chh - 1); }
  for (let y = 0; y < chh; y++) { push(0, y); push(cw - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % cw, y = (p - x) / cw;
    if (x > 0) push(x - 1, y);
    if (x < cw - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < chh - 1) push(x, y + 1);
  }
  const key = new Uint8Array(cw * chh);
  for (let p = 0; p < cw * chh; p++) key[p] = bg[p] ? 0 : 1;
  // 1 px erosion so no white fringe survives
  const er = new Uint8Array(cw * chh);
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
    const p = y * cw + x;
    if (!key[p]) continue;
    const up = y > 0 ? key[p - cw] : 0, dn = y < chh - 1 ? key[p + cw] : 0;
    const lf = x > 0 ? key[p - 1] : 0, rt = x < cw - 1 ? key[p + 1] : 0;
    er[p] = up && dn && lf && rt ? 1 : 0;
  }
  for (let p = 0; p < cw * chh; p++) d[p * 4 + 3] = er[p] ? 255 : 0;
  cg.putImageData(im, 0, 0);
}
await save(cut, `${OUT}/warden_cut.png`);
console.error(`warden_cut.png ${cw}x${chh}`);

/* ------------------------------------------- 2. mouth / blink / smile patches */
// Regions of the base image that the expression variants actually change.
// Found with an alignment + diff pass (see docs/BUILD-MAGGI.md); the variants come
// back from the model already pixel-registered with the base, so the boxes hold.
const BOXES = {
  mouth: { A: [584, 328, 240, 166], E: [584, 328, 240, 166], O: [584, 328, 240, 166] },
  blink: { blink: [605, 269, 198, 46] },
  smile: { smile: [584, 218, 240, 240] },
};

const patches = {};
const FEATHER = 10;
for (const [group, map] of Object.entries(BOXES)) {
  for (const [name, [bx, by, bw, bh]] of Object.entries(map)) {
    const variant = await read(`${SRC}/warden_${name}.${name === 'blink' || name === 'smile' ? 'jpg' : 'jpg'}`);
    const c = createCanvas(bw, bh);
    const g = c.getContext('2d');
    g.drawImage(variant.img, bx, by, bw, bh, 0, 0, bw, bh);
    // feather the edges so the patch melts into the base sprite
    const im = g.getImageData(0, 0, bw, bh);
    const d = im.data;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const edge = Math.min(x, y, bw - 1 - x, bh - 1 - y);
      const a = Math.min(1, edge / FEATHER);
      d[(y * bw + x) * 4 + 3] = Math.round(a * 255);
    }
    g.putImageData(im, 0, 0);
    const file = `${OUT}/patch_${name}.png`;
    await save(c, file, 92);
    patches[name] = { file: `patch_${name}.png`, x: bx - cx, y: by - cy, w: bw, h: bh };
    console.error(`patch ${name} ${bw}x${bh} @ ${bx - cx},${by - cy}`);
  }
}

fs.writeFileSync(`${OUT}/warden.json`, JSON.stringify({
  sprite: 'warden_cut.png',
  size: [cw, chh],
  patches,
}, null, 2));

/* ------------------------------------------------- 3. background plate sizes */
const ROOM = [720, 1280];
for (const [name, target] of [['room', ROOM], ['kitchen', ROOM]]) {
  const img = await loadImage(`${SRC}/bg-${name}.jpg`);
  const s = Math.max(target[0] / img.width, target[1] / img.height);
  const dw = Math.round(img.width * s), dh = Math.round(img.height * s);
  const c = createCanvas(target[0], target[1]);
  const g = c.getContext('2d');
  g.drawImage(img, Math.round((target[0] - dw) / 2), Math.round((target[1] - dh) / 2), dw, dh);
  await save(c, `${PLATES}/${name}.jpg`, 90);
  console.error(`${name}.jpg ${target.join('x')} (from ${img.width}x${img.height} @${s.toFixed(3)})`);
}

// corridor stays panoramic: it is a scrolling side-scroller plate
{
  const img = await loadImage(`${SRC}/bg-corridor.jpg`);
  const h = 900, w = Math.round(img.width * (h / img.height));
  const c = createCanvas(w, h);
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  await save(c, `${PLATES}/corridor.jpg`, 90);
  console.error(`corridor.jpg ${w}x${h}`);
}

console.error('done');

/* ---------------------------------------- 4. Kabir's cooking pose pack (v2) */
// Five generated action drawings — the cooking equivalent of the walk cycle.
// Each is cut the same way as the warden, plus one extra rule: enclosed white
// regions that are too big to be an eye or a tooth (a stray counter the model
// drew, a stray panel) get keyed out as well.
const COOK = ['packet', 'break', 'stir', 'masala', 'taste'];
const COOK_DIR = P('characters/kabir-cook');
fs.mkdirSync(COOK_DIR, { recursive: true });

function cutWhite(src, { enclosedMaxArea = 0.012 } = {}) {
  const { img, d, w, h } = src;
  const near = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    near[p] = d[i] > 236 && d[i + 1] > 236 && d[i + 2] > 236 ? 1 : 0;
  }
  const kill = new Uint8Array(w * h);      // every pixel that becomes transparent
  const seen = new Uint8Array(w * h);
  const limit = enclosedMaxArea * w * h;
  for (let start = 0; start < w * h; start++) {
    if (!near[start] || seen[start]) continue;
    // flood one near-white component
    const comp = [];
    let border = false;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      comp.push(p);
      const x = p % w, y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      const push = (q) => { if (near[q] && !seen[q]) { seen[q] = 1; stack.push(q); } };
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
    if (border || comp.length > limit) for (const p of comp) kill[p] = 1;
  }
  // 1 px erosion of the kept silhouette so no white fringe survives
  const keep = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) keep[p] = kill[p] ? 0 : 1;
  const er = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (!keep[p]) continue;
    const up = y > 0 ? keep[p - w] : 0, dn = y < h - 1 ? keep[p + w] : 0;
    const lf = x > 0 ? keep[p - 1] : 0, rt = x < w - 1 ? keep[p + 1] : 0;
    er[p] = up && dn && lf && rt ? 1 : 0;
  }
  // bbox of what is left
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!er[y * w + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pad = 4;
  const cx2 = Math.max(0, x0 - pad), cy2 = Math.max(0, y0 - pad);
  const cw2 = Math.min(w, x1 + pad) - cx2, ch2 = Math.min(h, y1 + pad) - cy2;
  const out = createCanvas(cw2, ch2);
  const og2 = out.getContext('2d');
  og2.drawImage(img, cx2, cy2, cw2, ch2, 0, 0, cw2, ch2);
  const im = og2.getImageData(0, 0, cw2, ch2);
  const od = im.data;
  for (let y = 0; y < ch2; y++) for (let x = 0; x < cw2; x++) {
    const a = er[(y + cy2) * w + (x + cx2)];
    od[(y * cw2 + x) * 4 + 3] = a ? 255 : 0;
  }
  og2.putImageData(im, 0, 0);
  return { canvas: out, w: cw2, h: ch2 };
}

const cookMeta = [];
for (const name of COOK) {
  const raw = await read(`${SRC}/cook_${name}.jpg`);
  const cutRes = cutWhite(raw);
  await save(cutRes.canvas, `${COOK_DIR}/${name}.png`);

  // normalise on the HEAD: measure the opaque span of the top 12% of rows, so the
  // player can line every pose up on one head axis at one head size.
  const cg2 = cutRes.canvas.getContext('2d');
  const dd = cg2.getImageData(0, 0, cutRes.w, cutRes.h).data;
  const band = Math.max(6, Math.round(cutRes.h * 0.12));
  let hx0 = cutRes.w, hx1 = 0;
  for (let y = 0; y < band; y++) for (let x = 0; x < cutRes.w; x++) {
    if (dd[(y * cutRes.w + x) * 4 + 3] > 128) { if (x < hx0) hx0 = x; if (x > hx1) hx1 = x; }
  }
  const headW = Math.max(1, hx1 - hx0);
  const headCX = (hx0 + hx1) / 2;
  cookMeta.push({ name, w: cutRes.w, h: cutRes.h, headW, headCX });
  console.error(`cook pose ${name} ${cutRes.w}x${cutRes.h} head ${headW}px @${headCX}`);
}
fs.writeFileSync(`${COOK_DIR}/poses.json`, JSON.stringify({ poses: cookMeta }, null, 2));
console.error('cook pack done');
