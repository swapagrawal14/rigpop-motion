// print the compiled line timings of a script: node tools/lines.mjs scripts/x.md
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontMatter, compile } from '../src/v2/script.mjs';
import { RIGS } from '../src/v2/rig.mjs';
import { loadImageRig } from '../src/v3/imagerig.mjs';
await import('../src/v3/posepack.mjs');
{ // project-local gesture clips
  const dir = path.resolve('tools/clips');
  const { pathToFileURL } = await import('node:url');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) await import(pathToFileURL(path.join(dir, f)).href);
}
const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const { meta } = parseFrontMatter(src);
const rigs = new Map();
for (const c of Object.values(meta.cast || {})) {
  const r = String(c.rig || '');
  if (r.startsWith('image:') && !rigs.has(r)) rigs.set(r, await loadImageRig(path.resolve(r.slice(6))));
}
const resolveRig = (c) => {
  const r = String(c.rig || '');
  if (rigs.has(r)) return rigs.get(r);
  if (r.startsWith('vector:')) return RIGS[r.slice(7)];
  return RIGS[c.base || String(c.name || '').toLowerCase()];
};
const S = await compile(src, { baseDir: path.dirname(path.resolve(file)), log: () => {}, resolveRig });
for (const L of S.lines) console.log(`${L.t0.toFixed(2)}  ${(L.t1 - L.t0).toFixed(2)}s  ${L.actor || ''}: ${L.text}`);
console.log(`total ${S.DUR.toFixed(2)} s, ${S.lines.length} lines`);
