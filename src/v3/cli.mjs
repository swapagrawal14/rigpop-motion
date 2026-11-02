// rigpop-motion v3 CLI · hybrid image rigs, painted sets, pose packs.
//
//   set                                build the painted night-kitchen plates + props
//   rig <character> [--prompts]        auto-rig characters/<character> from its part sheets
//   poses <character> <action> [--prompt]  cut + normalise a pose pack (jump, ...), then patch its faces
//   faces <character> [pose]           re-cut blink + mouth patches for existing pose packs
//   qa <character|script.md ...>       gate: does every pose key have a live face, no pops? (exit 1 on fail)
//   render <script.md> [-o out.mp4] [--from s] [--to s] [--crf n]
//   still  <script.md> [-t 1,2] [-o dir] | --sheet 2 [-o sheet.jpg]
//   strip  <script.md> -t 30.1 [-n 6] [--step 0.0667] [-o strip.jpg]   consecutive frames
//
// Cast entries choose their rig in the front matter:
//   K: { rig: image:characters/kabir, ... }   painted parts on the v2 skeleton
//   K: { rig: vector:kabir, ... }             the v2 rig (also plain "rig: kabir")
// "scene: painted-night-kitchen" swaps the v2 vector set for the painted plates.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { P as RP } from '../paths.mjs';

const [cmd, ...argv] = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.findIndex((a) => a === n); return i >= 0 ? argv[i + 1] : d; };
const BOOL = new Set(['--prompts', '--prompt']);
const pos = argv.filter((a, i) => !a.startsWith('-') && !(i > 0 && argv[i - 1].startsWith('-') && !BOOL.has(argv[i - 1])));
const log = (m) => process.stderr.write(m + '\n');

async function load(file) {
  const { parseFrontMatter, compile } = await import('../v2/script.mjs');
  const { createEngine } = await import('../v2/engine.mjs');
  const { RIGS } = await import('../v2/rig.mjs');
  const { loadImageRig, drawImageCharacter, drawBackImg } = await import('./imagerig.mjs');
  await import('./posepack.mjs'); // registers the pose-pack verb
  const src = fs.readFileSync(file, 'utf8');
  const { meta } = parseFrontMatter(src);
  const rigs = new Map();
  for (const c of Object.values(meta.cast || {})) {
    const r = String(c.rig || '');
    if (r.startsWith('image:') && !rigs.has(r)) {
      const R = await loadImageRig(RP(r.slice(6)));
      R.draw = drawImageCharacter; R.drawBack = drawBackImg;
      rigs.set(r, R);
      log(`  image rig ${r}: ${Object.keys(R.image.rig.parts).length} parts, packs [${Object.keys(R.image.packs).join(', ')}]`);
    }
  }
  const resolveRig = (c) => {
    const r = String(c.rig || '');
    if (rigs.has(r)) return rigs.get(r);
    if (r.startsWith('vector:')) return RIGS[r.slice(7)];
    if (r === 'vector') return RIGS[c.base || String(c.name || '').toLowerCase()];
    return null;
  };
  {
    // project-local gesture clips (registered into CLIPS on import)
    const { pathToFileURL } = await import('node:url');
    const dir = path.resolve('tools/clips');
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort() : []) {
      await import(pathToFileURL(path.join(dir, f)).href);
    }
  }
  const t0 = Date.now();
  const S = await compile(src, { baseDir: path.dirname(path.resolve(file)), log: (m) => log(`  ${m}`), resolveRig });
  let hooks = {};
  if (String(meta.scene || '').startsWith('painted')) { const { loadSet } = await import('./plates.mjs'); hooks = await loadSet(); }
  if (String(meta.scene || '').startsWith('painted')) { const { loadSet } = await import('./plates.mjs'); hooks = await loadSet(); }
  else if (meta.scene) {
    // a project-local set: tools/scenes/<scene>.mjs exporting scene hooks (and drawHeld)
    const { pathToFileURL } = await import('node:url');
    const f = path.resolve('tools/scenes', String(meta.scene) + '.mjs');
    if (fs.existsSync(f)) { const m = await import(pathToFileURL(f).href); hooks = { scene: m.scene, drawHeld: m.drawHeld }; log(`  set: ${meta.scene}`); }
  }
  const E = createEngine(S, hooks);
  log(`compiled ${path.basename(file)}: ${S.DUR.toFixed(2)} s, ${S.lines.length} lines, ${S.shots.length} shots, ${[...S.actors.values()].reduce((a, A) => a + A.clips.length, 0)} actions (${Date.now() - t0} ms)`);
  return { S, E };
}

if (cmd === 'set') {
  const { buildSet } = await import('./plates.mjs');
  await buildSet({ log });
} else if (cmd === 'rig') {
  const name = pos[0]; if (!name) { log('usage: rigpop-motion rig <character>'); process.exit(2); }
  const dir = RP('characters', name);
  if (argv.includes('--prompts')) {
    const src = JSON.parse(fs.readFileSync(path.join(dir, 'rig-src.json'), 'utf8'));
    for (const [k, p] of Object.entries(src.prompts || {})) console.log(`## ${k}\n${p}\n`);
  } else {
    const { autoRig, rigPreview } = await import('./autorig.mjs');
    await autoRig(dir, { log });
    await rigPreview(dir, path.join(dir, 'rig-preview.jpg'));
    log(`  preview -> characters/${name}/rig-preview.jpg`);
  }
} else if (cmd === 'poses') {
  const [name, action] = pos; if (!name || !action) { log('usage: rigpop-motion poses <character> <action>'); process.exit(2); }
  const { cutPack, posePrompt } = await import('./posepack.mjs');
  const dir = RP('characters', name);
  if (argv.includes('--prompt')) {
    const src = JSON.parse(fs.readFileSync(path.join(dir, 'rig-src.json'), 'utf8'));
    console.log(posePrompt(src.about, action));
  } else await cutPack(dir, action, { log });
} else if (cmd === 'faces') {
  const name = pos[0]; if (!name) { log('usage: rigpop-motion faces <character> [pose]'); process.exit(2); }
  const { patchPoses, auditSheet } = await import('./facepatch.mjs');
  const n = await patchPoses(RP('characters', name), { only: pos[1] || null, log });
  log(`  ${n} key(s) with a live face`);
  if (argv.includes('--audit')) await auditSheet(RP('characters', name), { log });
} else if (cmd === 'qa') {
  const { checkCharacter, checkScript, report } = await import('./qa.mjs');
  const targets = pos.length ? pos : fs.readdirSync(RP('characters')).filter((n) => fs.existsSync(RP('characters', n, 'rig.json'))).map((n) => n);
  let bad = 0;
  for (const t of targets) {
    const full = fs.existsSync(t) ? t : RP('characters', t);
    const rows = String(t).endsWith('.md') ? await checkScript(full) : await checkCharacter(full);
    bad += report(rows, { log, name: path.basename(t) });
  }
  if (bad) { log(`${bad} target(s) with failures`); process.exit(1); }
} else if (cmd === 'render' && (flag('--part') || flag('--mux'))) {
  // long renders in parts: --part 1/3 ... --part 3/3, then --mux 3 (concat + the audio mix)
  const file = pos[0];
  const out = flag('-o', path.join('out', path.basename(file).replace(/\.md$/, '.mp4')));
  const partFile = (i) => out.replace(/\.mp4$/, `.part${i}.mp4`);
  const { E } = await load(file);
  const NF = Math.round(E.DUR * E.FPS);
  if (flag('--part')) {
    const [i, n] = flag('--part').split('/').map(Number);
    const f0 = Math.floor(((i - 1) * NF) / n), f1 = Math.floor((i * NF) / n);
    const t0 = Date.now();
    const r = await E.renderVideo(partFile(i), { from: f0 / E.FPS, to: f1 / E.FPS, crf: Number(flag('--crf', 21)), videoOnly: true, progress: (f, m) => process.stderr.write(`\r  frame ${f}/${m}`) });
    log(`\rpart ${i}/${n}: ${r.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } else {
    const n = Number(flag('--mux'));
    const { FFMPEG, SR } = await import('../audio.mjs');
    const { spawnSync } = await import('node:child_process');
    const wav = out.replace(/\.mp4$/, '.mix.wav'), list = out.replace(/\.mp4$/, '.parts.txt');
    E.writeWav(wav, E.mixAudio(E.DUR));
    fs.writeFileSync(list, Array.from({ length: n }, (_, k) => `file '${path.resolve(partFile(k + 1))}'`).join('\n'));
    const r = spawnSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', wav, '-af', 'alimiter=limit=0.9:attack=4:release=80',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(1);
    for (let k = 1; k <= n; k++) fs.rmSync(partFile(k), { force: true });
    fs.rmSync(wav, { force: true }); fs.rmSync(list, { force: true });
    log(`muxed ${n} parts + audio -> ${out} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
  }
} else if (cmd === 'render') {
  const file = pos[0]; if (!file) { log('usage: rigpop-motion render <script.md> -o out.mp4'); process.exit(2); }
  const out = flag('-o', path.join('out', path.basename(file).replace(/\.md$/, '.mp4')));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { E } = await load(file);
  const t0 = Date.now();
  const from = Number(flag('--from', 0)), to = Number(flag('--to', E.DUR));
  const r = await E.renderVideo(out, { from, to, crf: Number(flag('--crf', 21)), progress: (f, n) => process.stderr.write(`\r  frame ${f}/${n}`) });
  const secs = (Date.now() - t0) / 1000;
  log(`\rrendered ${r.frames} frames in ${secs.toFixed(1)} s (${(r.frames / secs).toFixed(1)} fps) -> ${out} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
} else if (cmd === 'still') {
  const file = pos[0];
  const { E } = await load(file);
  const every = flag('--sheet');
  if (every) {
    const step = Number(every) || 2, times = [];
    for (let t = 0.5; t < E.DUR; t += step) times.push(t);
    const out = flag('-o', path.join('out', path.basename(file).replace(/\.md$/, '-sheet.jpg')));
    fs.writeFileSync(out, E.sheet(times, { cols: Number(flag('--cols', 6)), scale: Number(flag('--scale', 0.25)) }));
    log(`sheet -> ${out}`);
  } else {
    const times = String(flag('-t', '1')).split(',').map(Number);
    const out = flag('-o', 'out/stills');
    for (const t of times) {
      const f = path.join(out, `t${t.toFixed(2).replace('.', '_')}.png`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, E.still(t));
      log(`still ${t}s -> ${f}`);
    }
  }
} else if (cmd === 'strip') {
  const file = pos[0];
  const { E } = await load(file);
  const t0 = Number(flag('-t', 1)), n = Number(flag('-n', 6)), step = Number(flag('--step', 2 / 30)), sc = Number(flag('--scale', 0.4));
  const w = Math.round(E.W * sc), h = Math.round(E.H * sc);
  const c = createCanvas(w * n, h + 24), g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < n; i++) { const t = t0 + i * step; E.render(t); g.drawImage(E.canvas, i * w, 0, w, h); g.fillStyle = '#fff'; g.font = '16px sans-serif'; g.fillText(`${t.toFixed(2)}s`, i * w + 6, h + 18); }
  const out = flag('-o', 'out/strip.jpg'); fs.writeFileSync(out, c.toBuffer('image/jpeg', 86)); log(`strip -> ${out}`);
} else {
  log('commands: set | rig | poses | faces | qa | render | still | strip');
  process.exit(2);
}
