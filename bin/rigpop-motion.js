#!/usr/bin/env node
// rigpop-motion: cartoon animation from generated artwork.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const TASKS = {
  poses: 'extract-poses.mjs',   // clean + normalise generated poses into aligned frames
  walk: 'flipbook-walk.mjs',    // pose flip-book walk on a scrolling street
  cutout: 'cutout-walk.mjs',    // cut-out puppet walk (one drawing, pivoted pieces)
  assets: 'chai-assets.mjs',    // voice lines + music bed + SFX for the short
  short: 'chai-short.mjs',      // the full 30 s short
  maggi: 'maggi-short.mjs',     // the 60 s hostel comedy short
  mprep: 'prep-maggi.mjs',      // cut the maggi cast + derive mouth patches
  massets: 'maggi-assets.mjs',  // voice lines + score + foley for the 60 s short
};
const HELP = `rigpop-motion

  v3 — hybrid image rigs (AI-painted parts on the v2 skeleton), painted sets, pose packs:
  rigpop-motion rig kabir                       # auto-rig characters/kabir from its part sheets
  rigpop-motion rig kabir --prompts             # the image-model prompts for those sheets
  rigpop-motion poses kabir jump                # cut + normalise a pose pack
  rigpop-motion set                             # split the painted kitchen into parallax plates
  rigpop-motion render scripts/midnight-maggi-v3.md -o out/midnight-maggi-v3.mp4
  rigpop-motion strip  scripts/midnight-maggi-v3.md -t 26.3 -n 8 -o out/strip.jpg

  v2 — vector rigs driven by a stage-direction script:
  rigpop-motion render scripts/midnight-maggi.md -o out/midnight-maggi.mp4
  rigpop-motion still  scripts/midnight-maggi.md -t 4.5,20 -o out/stills
  rigpop-motion still  scripts/midnight-maggi.md --sheet 2 -o out/sheet.jpg
  rigpop-motion gif    out/midnight-maggi.mp4 -s 17 -d 6 -o docs/clip.gif

  v1 — motion comic from generated artwork:

  rigpop-motion assets    # synthesize dialogue, music bed and SFX
  rigpop-motion poses     # cut/normalise generated poses -> characters/<id>/poses
  rigpop-motion walk      # render the flip-book walk demo
  rigpop-motion cutout    # render the cut-out puppet demo
  rigpop-motion short     # render the 30s short -> out/chai-short.mp4
  rigpop-motion mprep     # cut the "2 Baje Ki Maggi" cast, derive mouth patches
  rigpop-motion massets   # synthesize dialogue, score and foley for that short
  rigpop-motion maggi     # render the 60s short -> out/maggi-short.mp4
`;

const V2 = new Set(['gif']); // v2 CLI
const V3 = new Set(['render', 'still', 'strip', 'rig', 'set']); // v3 CLI (also renders v2 scripts unchanged)
const cmd = process.argv[2];
// "poses" with a character and an action is the v3 pose-pack cutter; bare "poses" is v1
if (cmd === 'poses' && process.argv.length > 4) V3.add('poses');
if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
  console.log(HELP);
  process.exit(0);
}
if (V3.has(cmd)) {
  const p = spawn(process.execPath, [path.join(SRC, 'v3', 'cli.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
  p.on('close', (c) => process.exit(c ?? 0));
} else if (V2.has(cmd)) {
  const p = spawn(process.execPath, [path.join(SRC, 'v2', 'cli.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
  p.on('close', (c) => process.exit(c ?? 0));
} else {
const file = TASKS[cmd];
if (!file) {
  console.error(`unknown task "${cmd}"\n\n${HELP}`);
  process.exit(2);
}
const p = spawn(process.execPath, [path.join(SRC, file)], { stdio: 'inherit' });
p.on('close', (c) => process.exit(c ?? 0));
}
