// Minimal audio helpers: decode anything -> mono float32 PCM at SR using bundled ffmpeg.
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

export const SR = 48000;
export const FFMPEG = process.env.RIGPOP_FFMPEG || ffmpegPath || 'ffmpeg';

export function decode(file) {
  const r = spawnSync(FFMPEG, ['-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${r.stderr}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4).slice();
}

// Edge neural TTS is used by the asset builder; install msedge-tts to enable it.
export async function speak(text, { voice = 'hi-IN-MadhurNeural', pitchHz = 0, ratePct = 0, cacheDir = '.cache/tts' } = {}) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const crypto = await import('node:crypto');
  fs.mkdirSync(cacheDir, { recursive: true });
  const key = crypto.createHash('sha1').update([voice, pitchHz, ratePct, text].join('|')).digest('hex').slice(0, 16);
  const out = path.join(cacheDir, `${key}.mp3`);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const tmp = fs.mkdtempSync(path.join(cacheDir, 'tts-'));
  const sign = (n, u) => `${n >= 0 ? '+' : ''}${Math.round(n)}${u}`;
  const { audioFilePath } = await tts.toFile(tmp, text, { pitch: sign(pitchHz, 'Hz'), rate: sign(ratePct, '%') });
  fs.renameSync(audioFilePath, out);
  fs.rmSync(tmp, { recursive: true, force: true });
  tts.close?.();
  return out;
}

// Trim leading/trailing silence and normalise a voice take, so cues can be placed
// on the exact beat they belong to.
export function tighten(pcm, { keepPad = 0.02, peakTo = 0.92 } = {}) {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
  const thr = Math.max(0.004, peak * 0.02);
  let a = 0, b = pcm.length - 1;
  while (a < pcm.length && Math.abs(pcm[a]) < thr) a++;
  while (b > a && Math.abs(pcm[b]) < thr) b--;
  const pad = Math.floor(keepPad * SR);
  const from = Math.max(0, a - pad), to = Math.min(pcm.length, b + pad);
  const out = pcm.slice(from, to);
  let p2 = 0;
  for (let i = 0; i < out.length; i++) { const v = Math.abs(out[i]); if (v > p2) p2 = v; }
  if (p2 > 0) { const k = peakTo / p2; for (let i = 0; i < out.length; i++) out[i] *= k; }
  // 4 ms edge fades so nothing clicks
  const f = Math.min(Math.floor(0.004 * SR), Math.floor(out.length / 2));
  for (let i = 0; i < f; i++) { out[i] *= i / f; out[out.length - 1 - i] *= i / f; }
  return out;
}
