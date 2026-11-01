// Chotu: Bunty's little neighbour. Same drawing style and the same body parts (recoloured),
// with his own head sheet (pink beanie, freckles) on the v2 'chhoti' skeleton (big head, short body).
import fs from 'node:fs';
import path from 'node:path';
import {
  readRGBA, writePNG, chromaKey, components, extract, cleanAndInk, alphaBox, dominantColour,
} from '../src/v3/imgops.mjs';

const B = 'characters/bunty', C = 'characters/chotu';
fs.mkdirSync(path.join(C, 'parts'), { recursive: true });

const PINK = [255, 61, 139], BLUE = [26, 63, 245];

function recolour(im, rules) {
  const px = new Uint8ClampedArray(im.px);
  for (let i = 0; i < im.w * im.h; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3];
    if (a < 8) continue;
    for (const [test, to] of rules) if (test(r, g, b)) { px[i * 4] = to[0]; px[i * 4 + 1] = to[1]; px[i * 4 + 2] = to[2]; break; }
  }
  return { w: im.w, h: im.h, px };
}
const isOrange = (r, g, b) => r > 185 && g > 40 && g < 140 && b < 90;
const isCream = (r, g, b) => r > 215 && g > 210 && b > 185 && r - b < 45;

// 1 · head sheet -> head.front, head.34, head.small (blank faces, freckles and beanie painted in)
const keyed = chromaKey(await readRGBA(path.join(C, 'sheets/head.png')));
const { comps, lab } = components(keyed);
const big = comps.filter((c) => c.area > 8000).sort((a, b) => a.x0 - b.x0);
console.log('head items:', big.length, big.map((c) => Math.round(c.area)));
const names = ['head.front', 'head.34', 'head.small'];
const rigB = JSON.parse(fs.readFileSync(path.join(B, 'rig.json'), 'utf8'));
const skin = hexToRgb(rigB.skin);
function faceBlob(im, skin) {
  const m = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
  for (let i = 0; i < im.w * im.h; i++) {
    const d = Math.hypot(im.px[i * 4] - skin[0], im.px[i * 4 + 1] - skin[1], im.px[i * 4 + 2] - skin[2]);
    m.px[i * 4 + 3] = im.px[i * 4 + 3] > 128 && d < 60 ? 255 : 0;
  }
  const { comps } = components(m);
  const c = comps.sort((a, b) => b.area - a.area)[0];
  return { cx: c.cx, cy: (c.y0 + c.y1) / 2 + (c.y1 - c.y0) * 0.04, rx: (c.x1 - c.x0) / 2, ry: (c.y1 - c.y0) / 2, top: c.y0, bottom: c.y1 };
}
const parts = {};
big.slice(0, 3).forEach((c, i) => {
  const im = cleanAndInk(extract(keyed, lab, { ...c, ids: [c.id] }, 10), { erode: 1, ink: 0.6 });
  const face = faceBlob(im, skin);
  parts[names[i]] = { file: `parts/${names[i]}.png`, w: im.w, h: im.h, face };
  writePNG(path.join(C, parts[names[i]].file), im);
  console.log(names[i], im.w, im.h, 'face rx', Math.round(face.rx), 'cy', Math.round(face.cy));
});

// 2 · body parts: Bunty's, recoloured (orange sweater -> hot pink, cream trousers -> cobalt)
const copy = {
  torso: [isOrange], forearm: [isOrange], thigh: [isCream], shin: [isCream],
  'hand.open': [], 'hand.fist': [], 'hand.point': [], foot: [], shades: [], sleeves: [],
};
for (const dir of ['eyes', 'mouth']) for (const f of fs.readdirSync(path.join(B, 'parts'))) {
  if (f.startsWith(dir + '.') && f.endsWith('.png')) copy[f.replace('.png', '')] = [];
}
for (const [name, rules] of Object.entries(copy)) {
  const src = path.join(B, 'parts', name + '.png');
  if (!fs.existsSync(src)) continue;
  const im = await readRGBA(src);
  const out = rules.length ? recolour(im, [[(r, g, b) => rules.includes(isOrange) ? isOrange(r, g, b) : false, PINK], [(r, g, b) => rules.includes(isCream) ? isCream(r, g, b) : false, BLUE]]) : im;
  // sleeves overlay must stay empty (the sweater has its sleeves painted in) -> keep content only if it has any
  writePNG(path.join(C, 'parts', name + '.png'), out);
  parts[name] = { ...rigB.parts[name], file: `parts/${name}.png` };
}

// 3 · rig.json: Bunty's measurements on the 'chhoti' skeleton
const rig = JSON.parse(JSON.stringify(rigB));
rig.name = 'chotu'; rig.base = 'chhoti';
rig.parts = parts;
rig.parts['head.small2'] = undefined; delete rig.parts['head.small2'];
rig.hair = '#0a0e30';
rig.armShadow = false;
fs.writeFileSync(path.join(C, 'rig.json'), JSON.stringify(rig, null, 1));
console.log('rig.json parts:', Object.keys(rig.parts).join(', '));

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
