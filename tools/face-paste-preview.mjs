import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs';
const [char, pose, tag, out] = process.argv.slice(2);
const dir = `/home/user/rigpop-motion/characters/${char}/poses/${pose}`;
const pack = JSON.parse(fs.readFileSync(`${dir}/pack.json`, 'utf8'));
const rows = [];
for (const K of pack.keys) {
  const base = await loadImage(`${dir}/${K.file}`);
  const c = createCanvas(base.width, base.height); const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  const m = K.face.mouth;
  const patch = await loadImage(`${dir}/${m.files[tag]}`);
  g.drawImage(patch, m.x, m.y);
  g.strokeStyle = 'rgba(255,0,255,0.85)'; g.lineWidth = 1;
  g.strokeRect(m.x + 0.5, m.y + 0.5, m.w - 1, m.h - 1);
  rows.push({ c, fb: K.faceBox, m, b: K.face.blink });
}
// crop each face at 7x, stack
const S = 7;
const crops = rows.map(({ c, fb, m, b }) => {
  const x = Math.max(0, Math.min(fb.x, m.x) - 20), y = Math.max(0, Math.min(fb.y, m.y) - 20);
  const w = Math.min(c.width - x, Math.max(fb.x + fb.w, m.x + m.w) - x + 20);
  const h = Math.min(c.height - y, Math.max(fb.y + fb.h, m.y + m.h) - y + 20);
  const cc = createCanvas(w * S, h * S); const gg = cc.getContext('2d');
  gg.imageSmoothingEnabled = false;
  gg.fillStyle = '#fff'; gg.fillRect(0, 0, cc.width, cc.height);
  gg.drawImage(c, x, y, w, h, 0, 0, w * S, h * S);
  return cc;
});
const W = Math.max(...crops.map((c) => c.width)), H = crops.reduce((a, c) => a + c.height, 0);
const can = createCanvas(W, H); const g = can.getContext('2d');
let y = 0;
for (const c of crops) { g.drawImage(c, 0, y); y += c.height; }
fs.writeFileSync(out, can.toBuffer('image/png'));
console.log('->', out, W + 'x' + H);
