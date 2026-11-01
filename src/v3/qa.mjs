// QA gate for pose packs and the scripts that use them.
//
//   rigpop-motion qa [character|script.md ...] [--json]
//
// The failure this exists to catch is silent: a pose pack replaces the whole drawing, so if a key
// comes out without its blink/mouth patches the character animates perfectly and simply never
// blinks or speaks. Nothing renders wrong, nothing errors — it just looks dead. So a pack with a
// faceless key is a FAIL here, not a warning, and the command exits non-zero for CI.
import fs from 'node:fs';
import path from 'node:path';
import { readRGBA } from './imgops.mjs';
import { faceBox } from './facepatch.mjs';

const OK = 'ok', WARN = 'warn', FAIL = 'fail';
const rgbOf = (hex) => [(parseInt(hex.slice(1, 3), 16)), (parseInt(hex.slice(3, 5), 16)), (parseInt(hex.slice(5, 7), 16))];
const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];

function coverage(im) {
  let n = 0;
  for (let i = 3; i < im.px.length; i += 4) if (im.px[i] > 8) n++;
  return n / (im.w * im.h);
}

// one pack: is every key drawable, faceable, and in the same character's colours and scale?
export async function checkPack(charDir, action, { rig, log = () => {} } = {}) {
  const rows = [];
  const dir = path.join(charDir, 'poses', action);
  const packFile = path.join(dir, 'pack.json');
  if (!fs.existsSync(packFile)) return [{ level: FAIL, where: `${action}`, msg: 'no pack.json (run `rigpop-motion poses`)' }];
  const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
  if (!pack.keys || !pack.keys.length) rows.push({ level: FAIL, where: action, msg: 'pack has no keys' });

  const faces = [], skins = [];
  for (const K of pack.keys) {
    const where = `${action}/${K.file}`;
    const keyFile = path.join(dir, K.file);
    if (!fs.existsSync(keyFile)) { rows.push({ level: FAIL, where, msg: 'key image missing' }); continue; }
    const im = await readRGBA(keyFile);
    const cov = coverage(im);
    if (cov < 0.03) rows.push({ level: FAIL, where, msg: `key is nearly empty (${(cov * 100).toFixed(1)}% opaque)` });

    if (K.face && K.face.occluded) {
      rows.push({ level: WARN, where, msg: 'face declared occluded: this key stays as drawn (no blink, no lip-sync)' });
    } else if (!K.face || (!K.face.blink && !K.face.mouth)) {
      rows.push({ level: FAIL, where, msg: 'no face patch: this key can never blink or lip-sync (the character goes dead here)' });
    } else {
      if (!K.face.blink) rows.push({ level: WARN, where, msg: 'no blink patch: eyes stay open through this key' });
      const b = K.face.blink;
      if (b && (b.x < 0 || b.y < 0 || b.x + b.w > im.w || b.y + b.h > im.h)) rows.push({ level: FAIL, where, msg: 'blink rect falls outside the key image' });
      const m = K.face.mouth;
      if (m) {
        if (m.x < 0 || m.y < 0 || m.x + m.w > im.w || m.y + m.h > im.h) rows.push({ level: FAIL, where, msg: 'mouth rect falls outside the key image' });
        if (!m.files || !Object.keys(m.files).length) rows.push({ level: FAIL, where, msg: 'mouth rect has no patch files' });
        else for (const f of Object.values(m.files)) if (!fs.existsSync(path.join(dir, f))) rows.push({ level: FAIL, where, msg: `mouth patch ${f} missing` });
      } else rows.push({ level: WARN, where, msg: 'no mouth patch: this key keeps the drawn mouth through the line' });
    }
    if (K.neckY == null) rows.push({ level: WARN, where, msg: 'no neck line: the head cannot tip on this key (re-run `rigpop-motion faces`)' });
    else if (K.neckY < K.h * 0.08 || K.neckY > K.h * 0.75) rows.push({ level: WARN, where, msg: `neck line looks wrong (${K.neckY} of ${K.h} px)` });

    const fb = K.faceBox || faceBox(im);
    if (fb) {
      faces.push({ where, w: fb.w, h: fb.h });
      if (K.face && K.face.mouth) {
        const ratio = (K.face.mouth.w * 0.9) / fb.w;
        if (ratio < 0.18 || ratio > 0.85) rows.push({ level: WARN, where, msg: `mouth is ${(ratio * 100).toFixed(0)}% of the face width — check it sits right` });
      }
      let rs = 0, gs = 0, bs = 0, n = 0;
      for (let y = fb.y; y < fb.y + fb.h; y += 2) for (let x = fb.x; x < fb.x + fb.w; x += 2) {
        const i = (y * im.w + x) * 4;
        if (im.px[i + 3] > 200 && im.px[i] > im.px[i + 2] + 40) { rs += im.px[i]; gs += im.px[i + 1]; bs += im.px[i + 2]; n++; }
      }
      if (n) skins.push({ where, c: [rs / n, gs / n, bs / n] });
    } else rows.push({ level: WARN, where, msg: 'no face found in this key' });
  }

  // the keys must be the same character: face size and skin tone may not drift across the pack
  if (faces.length > 1) {
    const mw = med(faces.map((f) => f.w));
    for (const f of faces) if (Math.abs(f.w - mw) / mw > 0.12) rows.push({ level: WARN, where: f.where, msg: `face is ${(100 * (f.w / mw - 1)).toFixed(0)}% off the pack's median — scale drift` });
  }
  if (skins.length > 1) {
    const base = [med(skins.map((s) => s.c[0])), med(skins.map((s) => s.c[1])), med(skins.map((s) => s.c[2]))];
    for (const s of skins) {
      const d = Math.max(...s.c.map((v, i) => Math.abs(v - base[i])));
      if (d > 22) rows.push({ level: WARN, where: s.where, msg: `skin tone drifts ${d.toFixed(0)} levels from the pack — colour consistency` });
    }
  }
  if (pack.standPx == null && pack.mode !== 'bust') rows.push({ level: WARN, where: action, msg: 'no standPx: the pack will be scaled by head width only' });
  return rows;
}

export async function checkCharacter(charDir) {
  const name = path.basename(charDir);
  const rows = [];
  if (!fs.existsSync(path.join(charDir, 'rig.json'))) return [{ level: FAIL, where: name, msg: 'no rig.json' }];
  const rig = JSON.parse(fs.readFileSync(path.join(charDir, 'rig.json'), 'utf8'));
  const poses = path.join(charDir, 'poses');
  const packs = fs.existsSync(poses) ? fs.readdirSync(poses).filter((a) => !a.startsWith('_') && fs.existsSync(path.join(poses, a, 'pack.json'))) : [];
  if (!packs.length) rows.push({ level: WARN, where: name, msg: 'no pose packs: this character can only act through the puppet rig' });
  for (const a of packs) rows.push(...await checkPack(charDir, a, { rig }));
  // the mouth kit the patches paste from has to exist, or every patch silently falls back to rest
  for (const p of ['mouth.M', 'mouth.A', 'mouth.O', 'mouth.E']) if (!fs.existsSync(path.join(charDir, 'parts', p + '.png'))) rows.push({ level: WARN, where: name, msg: `parts/${p}.png missing: no lip-sync shape for it` });
  return rows;
}

// a script is only as alive as the packs it names: every `[<actor> pose-pack <name>]` has to exist on
// that actor's rig, and every key of that pack has to carry a face
export async function checkScript(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rows = [];
  const { parseFrontMatter } = await import('../v2/script.mjs');
  const { meta } = parseFrontMatter(src);
  const rigOf = new Map();
  for (const [id, c] of Object.entries(meta.cast || {})) {
    const r = String(c.rig || '');
    if (r.startsWith('image:')) rigOf.set(id, path.resolve(r.slice(6)));
  }
  if (!rigOf.size) { rows.push({ level: WARN, where: path.basename(file), msg: 'no image: rigs in the cast — nothing to check' }); return rows; }
  const used = new Map();  // actor -> pack names
  for (const m of src.matchAll(/^\s*\[([\w]+)\s+pose-pack\s+([\w-]+)/gm)) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(m[2]);
  }
  for (const [actor, packs] of used) {
    const dir = rigOf.get(actor);
    if (!dir) { rows.push({ level: WARN, where: actor, msg: 'actor has no image rig, its pose packs are not checked' }); continue; }
    for (const u of packs) {
      if (!fs.existsSync(path.join(dir, 'poses', u, 'pack.json'))) { rows.push({ level: FAIL, where: `${actor}`, msg: `script uses pose pack "${u}" but ${path.basename(dir)} has none` }); continue; }
      rows.push(...(await checkPack(dir, u, {})).map((r) => ({ ...r, where: `${actor}/${r.where}` })));
    }
  }
  return rows;
}

export function report(rows, { log = console.log, name = '' } = {}) {
  const fails = rows.filter((r) => r.level === FAIL), warns = rows.filter((r) => r.level === WARN);
  for (const r of rows) log(`  ${r.level === FAIL ? 'FAIL' : 'warn'}  ${r.where.padEnd(28)} ${r.msg}`);
  log(`  ${name ? name + ': ' : ''}${rows.length - fails.length - warns.length >= 0 ? '' : ''}${fails.length} fail, ${warns.length} warn`);
  return fails.length ? 1 : 0;
}
