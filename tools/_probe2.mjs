import path from 'node:path';
import { readRGBA } from '../src/v3/imgops.mjs';
const [char, pose, x, y, w, h] = process.argv.slice(2);
const dir = path.join('characters', char, 'poses', pose);
const im = await readRGBA(path.join(dir, 'key0.png'));
const counts = new Map();
for (let yy = +y; yy < +y + +h; yy++) for (let xx = +x; xx < +x + +w; xx++) {
  const i = (yy * im.w + xx) * 4;
  const key = `${Math.round(im.px[i] / 16) * 16},${Math.round(im.px[i + 1] / 16) * 16},${Math.round(im.px[i + 2] / 16) * 16}`;
  counts.set(key, (counts.get(key) || 0) + 1);
}
console.log(char, pose, [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`).join('  '));
