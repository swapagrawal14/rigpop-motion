// Cut a pose SHEET into individual pose images, one PNG per pose.
// The sheet is only a delivery format for the drawings; from here on every pose is its own image,
// and the engine plays them as drawn poses (pose packs), never as a re-assembled puppet.
//   node tools/cut-sheet.mjs characters/bunty/poses/_sheet.png idle present sip folded point laugh
import fs from 'node:fs';
import path from 'node:path';
import { readRGBA, writePNG, chromaKey, components, cleanAndInk, alphaBox, crop } from '../src/v3/imgops.mjs';

const [file, ...names] = process.argv.slice(2);
const dir = path.dirname(file);
const keyed = chromaKey(await readRGBA(file), { bg: [0, 255, 0] });
const { comps, lab } = components(keyed);

// figures in reading order: group by row, then left to right
const big = comps.filter((c) => c.area > 8000);
const rows = [];
for (const c of big.sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)) {
  const cy = (c.y0 + c.y1) / 2;
  let row = rows.find((r) => Math.abs(r.cy - cy) < 220);
  if (!row) { row = { cy, items: [] }; rows.push(row); }
  row.items.push(c);
}
rows.sort((a, b) => a.cy - b.cy);
const ordered = rows.flatMap((r) => r.items.sort((a, b) => a.x0 - b.x0));
console.log(`${big.length} figures in ${rows.length} rows`);

// a figure that shares its component with a stray below it (a squashed extra) is cut to the top row
const pitch = rows.length > 1 ? Math.abs(rows[1].cy - rows[0].cy) : 0;
ordered.forEach((c, i) => {
  const name = names[i];
  if (!name) return;
  const cutTop = rows.length > 1 && i < rows[0].items.length && (c.y1 - c.y0) > pitch * 1.25;
  const box = { ...c, ids: [c.id], y1: cutTop ? Math.round(c.y0 + pitch * 0.95) : c.y1 };
  let im = cleanAndInk(extract(keyed, lab, box, 8), { erode: 1, ink: 0.55 });
  const b = alphaBox(im);
  im = crop(im, b.x0 - 4, b.y0 - 4, b.w + 8, b.h + 8);
  const out = path.join(dir, name + '.png');
  writePNG(out, im);
  console.log(`  ${name}.png  ${im.w}x${im.h}${cutTop ? '  (top row only)' : ''}`);
});

function extract(keyed, lab, item, pad) {
  const ids = new Set(item.ids);
  const x0 = Math.max(0, item.x0 - pad), y0 = Math.max(0, item.y0 - pad);
  const x1 = Math.min(keyed.w - 1, item.x1 + pad), y1 = Math.min(keyed.h - 1, item.y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y + y0) * keyed.w + (x + x0), di = y * w + x;
    if (y + y0 > item.y1) continue;
    if (ids.has(lab[si]) && keyed.px[si * 4 + 3] > 8) for (let k = 0; k < 4; k++) px[di * 4 + k] = keyed.px[si * 4 + k];
  }
  return { w, h, px };
}
