// rigpop-motion · flip-book walk demo
// Takes a generated 6-pose walk sheet, cuts each pose out cleanly (no puppet overlap,
// no stray props — every frame is complete artwork), aligns them on the feet baseline
// and the head axis, then plays them as a real animation on 5s (6 poses -> 1.0 s cycle).
import fs from 'node:fs';
import { P } from './paths.mjs';
import { spawn } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import ffmpegPath from 'ffmpeg-static';

const W = 720, H = 1280, FPS = 30, DURATION = 8.0;
const SHEET = P('characters/kabir-side/walk-sheet.png');
const OUTDIR = P('characters/kabir-side/poses');

/* frames come from extract-poses.mjs (6 individually generated + normalised drawings) */
async function loadFrames() {
  const meta = JSON.parse(fs.readFileSync(`${OUTDIR}/poses.json`, 'utf8'));
  const frames = [];
  for (let i = 0; i < meta.poses.length; i++) {
    frames.push({ img: await loadImage(`${OUTDIR}/pose_${i}.png`) });
  }
  return { frames, cw: meta.canvas[0], ch: meta.canvas[1] };
}

/* ---------------- 4. render ---------------- */
async function main() {
  const { frames, cw, ch } = await loadFrames();
  console.error(`loaded ${frames.length} poses`);

  const bg = await loadImage(P('assets/sidewalk-scroll.png'));
  const canvas = createCanvas(W, H);
  const g = canvas.getContext('2d');
  const nf = Math.ceil(DURATION * FPS);
  const OUT = P('out/flipbook-kabir.mp4');

  const ff = spawn(ffmpegPath, [
    '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-i', P('assets/kabir-walk.m4a'),
    '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT,
  ], { stdio: ['pipe', 'ignore', 'inherit'] });

  // 6 drawings, held 5 frames each @30fps  ->  6 drawings/sec  ->  1.0 s per cycle (2 steps/s)
  const HOLD = 5;
  const GROUND = 1000;
  const scale = 700 / ch;                     // stage height of the figure
  const drawW = cw * scale, drawH = ch * scale;
  const drawX = (W - drawW) / 2;
  const drawY = GROUND - drawH;
  const stepPx = drawH * 0.23;                // stride length, tuned to the drawings
  const stepsPerSec = (FPS / HOLD) / 3;       // 6 poses = 1 cycle = 2 steps
  const scrollSpeed = stepPx * stepsPerSec * 2;

  const bgH = 1500, bgW = bgH * (bg.width / bg.height), bgTop = GROUND - bgH * 0.86;

  for (let f = 0; f < nf; f++) {
    const t = f / FPS;
    const poseIdx = Math.floor(f / HOLD) % frames.length;

    g.fillStyle = '#f0b98c'; g.fillRect(0, 0, W, H);
    const scroll = (t * scrollSpeed) % bgW;
    for (let k = -1; k <= Math.ceil(W / bgW) + 1; k++) g.drawImage(bg, -scroll + k * bgW, bgTop, bgW, bgH);

    const shade = g.createLinearGradient(0, GROUND - 120, 0, H);
    shade.addColorStop(0, 'rgba(20,16,40,0)');
    shade.addColorStop(1, 'rgba(20,16,40,0.35)');
    g.fillStyle = shade; g.fillRect(0, GROUND - 120, W, H - GROUND + 120);

    g.save();
    g.globalAlpha = 0.22; g.fillStyle = '#141018';
    g.beginPath(); g.ellipse(W / 2 + 4, GROUND + 4, 92, 14, 0, 0, Math.PI * 2); g.fill();
    g.restore();

    g.drawImage(frames[poseIdx].img, drawX, drawY, drawW, drawH);

    // grade
    g.save();
    g.globalCompositeOperation = 'overlay';
    g.fillStyle = 'rgba(255,190,130,0.10)'; g.fillRect(0, 0, W, H);
    g.restore();
    const v = g.createRadialGradient(W / 2, H * 0.52, H * 0.28, W / 2, H * 0.52, H * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(18,10,36,0.46)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);

    // titles
    const ta = Math.max(0, Math.min(1, 1 - Math.abs(t - 1.5) / 1.0));
    if (ta > 0.01) {
      g.save(); g.globalAlpha = ta; g.textAlign = 'center';
      g.fillStyle = 'rgba(18,14,26,0.80)';
      g.beginPath(); g.roundRect(W / 2 - 262, 100, 524, 118, 26); g.fill();
      g.fillStyle = '#ffd94a'; g.font = 'bold 40px sans-serif';
      g.fillText('6 drawings, one walk', W / 2, 152);
      g.fillStyle = '#f5f0e6'; g.font = 'bold 24px sans-serif';
      g.fillText('AI pose sheet · flip-book · no overlaps', W / 2, 190);
      g.restore();
    }
    const ea = Math.max(0, Math.min(1, (t - 6.3) / 0.7));
    if (ea > 0.01) {
      g.save(); g.globalAlpha = ea; g.textAlign = 'center';
      g.fillStyle = 'rgba(12,9,20,0.55)'; g.fillRect(0, H - 190, W, 190);
      g.fillStyle = '#ffd94a'; g.font = 'bold 30px sans-serif';
      g.fillText('every frame is complete art', W / 2, H - 116);
      g.fillStyle = '#f5f0e6'; g.font = 'bold 24px sans-serif';
      g.fillText('no cut limbs · no stray props', W / 2, H - 78);
      g.restore();
    }

    const px = g.getImageData(0, 0, W, H).data;
    if (!ff.stdin.write(Buffer.from(px.buffer, px.byteOffset, px.byteLength))) {
      await new Promise((r) => ff.stdin.once('drain', r));
    }
    if (f % 30 === 0) process.stderr.write(`\r frame ${f}/${nf}`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg failed')))));
  console.error('\n done ->', OUT);
  console.error(`scroll speed ${scrollSpeed.toFixed(0)} px/s`);
}

main();
