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
