// rigpop-motion v3 · render the v2 night-kitchen layout (no cast, no pan) as a layout guide.
// The guide is handed to the image model as a reference so the painted plates keep every
// landmark (arch, window, fridge, counter line, stove) where the engine expects it.
//   node src/v3/set-guide.mjs <out.png> [--fridge open]
import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { SET, archPath, drawSky, drawHallway, drawWall, drawCounter, drawLights } from '../v2/scene.mjs';

export const PLATE_BOX = { x: -80, y: 80, w: 1060, h: 1590 }; // world rect a plate covers

export function renderGuide({ fridgeOpen = 0, lights = true } = {}) {
  const B = PLATE_BOX, c = createCanvas(B.w, B.h), g = c.getContext('2d');
  g.translate(-B.x, -B.y);
  g.fillStyle = '#120e18'; g.fillRect(B.x, B.y, B.w, B.h);
  const st = { stoveOn: 0, fridgeOpen, stashTaken: false, pan: { x: -9999, y: -9999, content: 'empty' } };
  g.save(); g.beginPath(); g.rect(SET.window.x, SET.window.y, SET.window.w, SET.window.h); g.clip(); drawSky(g, 0); g.restore();
  drawWall(g, 0, st);
  g.save(); g.beginPath(); archPath(g); g.clip(); drawHallway(g, 0); g.restore();
  drawCounter(g, 0, st);
  if (lights) drawLights(g, 0, st);
  return c;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || 'out/set-guide.png';
  const open = process.argv.includes('open');
  fs.writeFileSync(out, renderGuide({ fridgeOpen: open ? 1 : 0 }).toBuffer('image/png'));
  console.error(`guide -> ${out}`);
}
