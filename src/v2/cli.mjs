// rigpop-motion v2 CLI
//   render <script.md> [-o out.mp4] [--from s] [--to s] [--crf n]
//   still  <script.md> [-t 1.5,4,9] [-o out/stills]          one PNG per time
//   still  <script.md> --sheet 2 [-o out/sheet.jpg]           contact sheet, 1 frame / 2 s
//   gif    <in.mp4> [-s 10] [-d 6] [-w 360] [--fps 15] -o docs/clip.gif
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FFMPEG } from '../audio.mjs';

const [cmd, ...argv] = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.findIndex((a) => a === n); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith('-') && !(i > 0 && argv[i - 1].startsWith('-')));

async function load(file) {
  const { compile } = await import('./script.mjs');
  const { createEngine } = await import('./engine.mjs');
  const src = fs.readFileSync(file, 'utf8');
  const t0 = Date.now();
  const S = await compile(src, { baseDir: path.dirname(path.resolve(file)), log: (m) => process.stderr.write(`  ${m}\n`) });
  const E = createEngine(S);
  process.stderr.write(`compiled ${path.basename(file)}: ${S.DUR.toFixed(2)} s, ${S.lines.length} lines, ${S.shots.length} shots, ${[...S.actors.values()].reduce((a, A) => a + A.clips.length, 0)} actions, ${S.sfx.length} sfx cues (${Date.now() - t0} ms)\n`);
  return { S, E };
}

if (cmd === 'render') {
  const file = pos[0]; if (!file) { console.error('usage: rigpop-motion render <script.md> -o out.mp4'); process.exit(2); }
  const out = flag('-o', path.join('out', path.basename(file).replace(/\.md$/, '.mp4')));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { E } = await load(file);
  const t0 = Date.now();
  const from = Number(flag('--from', 0)), to = Number(flag('--to', E.DUR));
  const r = await E.renderVideo(out, { from, to, crf: Number(flag('--crf', 21)), progress: (f, n) => process.stderr.write(`\r  frame ${f}/${n}`) });
  const secs = (Date.now() - t0) / 1000;
  process.stderr.write(`\rrendered ${r.frames} frames in ${secs.toFixed(1)} s (${(r.frames / secs).toFixed(1)} fps) -> ${out} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)\n`);
} else if (cmd === 'still') {
  const file = pos[0]; if (!file) { console.error('usage: rigpop-motion still <script.md> -t 1,2,3 | --sheet 2'); process.exit(2); }
  const { E } = await load(file);
  const every = flag('--sheet');
  if (every) {
    const step = Number(every) || 2, times = [];
    for (let t = 0.5; t < E.DUR; t += step) times.push(t);
    const out = flag('-o', path.join('out', path.basename(file).replace(/\.md$/, '-sheet.jpg')));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, E.sheet(times, { cols: Number(flag('--cols', 6)), scale: Number(flag('--scale', 0.25)) }));
    console.error(`sheet -> ${out}`);
  } else {
    const times = String(flag('-t', '1')).split(',').map(Number);
    const out = flag('-o', 'out/stills');
    for (const t of times) {
      const f = out.endsWith('.png') && times.length === 1 ? out : path.join(out, `t${t.toFixed(2).replace('.', '_')}.png`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, E.still(t));
      console.error(`still ${t}s -> ${f}`);
    }
  }
} else if (cmd === 'gif') {
  const inp = pos[0], out = flag('-o', 'out/clip.gif');
  const ss = flag('-s', '0'), d = flag('-d', '6'), w = flag('-w', '360'), fps = flag('--fps', '15');
  const vf = `fps=${fps},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  const r = spawnSync(FFMPEG, ['-loglevel', 'error', '-y', '-ss', ss, '-t', d, '-i', inp, '-vf', vf, '-loop', '0', out], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
  console.error(`gif -> ${out} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
} else {
  console.error('commands: render | still | gif');
  process.exit(2);
}
