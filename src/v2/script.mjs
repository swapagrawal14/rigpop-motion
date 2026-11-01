// rigpop-motion v2 · stage-direction scripts.
//
//   ---                                  front matter: title, scene, music, cast + voices
//   [shot wide]                          hard cut (wide | medium K | close K | ecu K |
//                                        insert K R | insert pan | ots K C | two K C | fridge)
//   [camera push 1.3x 0.6s]              camera moves never advance the clock
//   [camera shake 0.4s] [camera whip left 0.3s]
//   [K place counter] [K sneak fridge 3s] [K walk counter 1.5s]
//   [K stir 3s &]                        an action; "&" = runs under what follows
//   [K face sneaky] [K look C] [K hold R packet] [K drop R] [K shades down]
//   [stove on] [pan noodles] [pan move right] [sfx growl 0.8 +0.2s] [wait 0.5s]
//   K (happy): Arre wah!                 a line: TTS, lip-sync, captions; clock waits for it
//
// Idle (breath, sway, blinks, saccades) and lip-sync always run under everything.
import fs from 'node:fs';
import path from 'node:path';
import { CLIPS, EXPR, blinkSchedule, saccadeSchedule } from './motion.mjs';
import { RIGS } from './rig.mjs';
import { MARKS, SET } from './scene.mjs';
import { speak, decode, tighten, SR } from '../audio.mjs';
import { P as RP } from '../paths.mjs';

/* --------------------------------------------------------------- parsing */
function scalar(s) {
  s = s.trim();
  if (/^".*"$|^'.*'$/.test(s)) return s.slice(1, -1);
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true') return true; if (s === 'false') return false;
  return s;
}
function flowMap(s) {
  const out = {}; s = s.trim().replace(/^\{|\}$/g, '');
  for (const part of s.split(',')) { const i = part.indexOf(':'); if (i < 0) continue; out[part.slice(0, i).trim()] = scalar(part.slice(i + 1)); }
  return out;
}
export function parseFrontMatter(src) {
  const m = src.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { meta: {}, body: src, offset: 0 };
  const meta = {}; let block = null;
  for (const raw of m[1].split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const ind = line.match(/^\s*/)[0].length;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim(), val = line.slice(i + 1).trim();
    if (ind === 0) {
      if (val === '') { meta[k] = {}; block = k; } else { meta[k] = val.startsWith('{') ? flowMap(val) : scalar(val); block = null; }
    } else if (block) {
      meta[block][k] = val.startsWith('{') ? flowMap(val) : scalar(val);
    }
  }
  return { meta, body: src.slice(m[0].length), offset: m[0].split('\n').length - 1 };
}

export const dur = (s, def = null) => {
  if (s == null) return def;
  const m = String(s).match(/^([\d.]+)\s*(ms|s)?$/);
  if (!m) return def;
  return m[2] === 'ms' ? Number(m[1]) / 1000 : Number(m[1]);
};

export function parseScript(src) {
  const { meta, body, offset } = parseFrontMatter(src);
  const items = [];
  body.split('\n').forEach((raw, n) => {
    let line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('>') || line.startsWith('<!--')) return;
    const lineNo = n + 1 + offset;
    // one or more [directives] on a line
    if (line.startsWith('[')) {
      let rest = line;
      while (rest.startsWith('[')) {
        const j = rest.indexOf(']'); if (j < 0) break;
        let inner = rest.slice(1, j).trim(); rest = rest.slice(j + 1).trim();
        let bg = false;
        if (inner.endsWith('&')) { bg = true; inner = inner.slice(0, -1).trim(); }
        if (rest.startsWith('&')) { bg = true; rest = rest.slice(1).trim(); }
        items.push({ type: 'dir', tokens: inner.split(/\s+/), bg, lineNo, raw: inner });
      }
      if (rest) throw new Error(`line ${lineNo}: unexpected text after directive: "${rest}"`);
      return;
    }
    const m = line.match(/^([A-Za-z][\w-]*)\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/);
    if (!m) throw new Error(`line ${lineNo}: cannot read "${line}"`);
    let text = m[3].trim(), bg = false;
    if (text.endsWith('&')) { bg = true; text = text.slice(0, -1).trim(); }
    // inline directives at the start of a line run alongside it: K: [shake-packet] Arre!
    const inline = [];
    while (text.startsWith('[')) { const j = text.indexOf(']'); inline.push(text.slice(1, j).trim()); text = text.slice(j + 1).trim(); }
    for (const d of inline) items.push({ type: 'dir', tokens: [m[1], ...d.split(/\s+/)], bg: true, lineNo, raw: d });
    items.push({ type: 'line', who: m[1], expr: (m[2] || '').trim() || null, text, bg, lineNo });
  });
  return { meta, items };
}

/* ------------------------------------------------------------- compiling */
async function tts(text, cast) {
  const saved = {};
  for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']) { saved[k] = process.env[k]; delete process.env[k]; }
  try {
    const hz = typeof cast.pitch === 'string' ? parseFloat(cast.pitch) : cast.pitch || 0;
    const rate = typeof cast.rate === 'string' ? parseFloat(cast.rate) : cast.rate || 0;
    return await speak(text, { voice: cast.voice || 'hi-IN-MadhurNeural', pitchHz: hz, ratePct: rate, cacheDir: RP('.cache/tts') });
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  }
}

function analyse(pcm) {
  const hop = SR / 100, n = Math.ceil(pcm.length / hop);
  const env = new Float32Array(n), zcr = new Float32Array(n);
  let peak = 1e-6;
  for (let i = 0; i < n; i++) {
    let s2 = 0, zc = 0, cnt = 0;
    for (let j = 0; j < hop * 2; j++) { const k = i * hop + j - hop / 2; if (k < 1 || k >= pcm.length) continue; s2 += pcm[k] * pcm[k]; if ((pcm[k] >= 0) !== (pcm[k - 1] >= 0)) zc++; cnt++; }
    env[i] = Math.sqrt(s2 / Math.max(1, cnt)); zcr[i] = zc / Math.max(1, cnt);
    if (env[i] > peak) peak = env[i];
  }
  for (let i = 0; i < n; i++) { env[i] = Math.min(1, env[i] / (peak * 0.8)); zcr[i] = Math.min(1, zcr[i] / 0.25); }
  // 3-tap smooth on the envelope so jaws don't chatter
  const sm = env.slice(); for (let i = 1; i < n - 1; i++) sm[i] = (env[i - 1] + env[i] * 2 + env[i + 1]) / 4;
  return { env: sm, zcr };
}

// word timings: spread words over the voiced span, weighted by vowel groups
function wordTimes(text, env, t0) {
  const words = text.split(/\s+/).filter(Boolean);
  let a = 0, b = env.length - 1;
  while (a < b && env[a] < 0.08) a++;
  while (b > a && env[b] < 0.08) b--;
  const w = words.map((x) => Math.max(1, (x.match(/[aeiouAEIOU]+/g) || []).length) + x.length * 0.08 + (/[.,!?…]$/.test(x) ? 0.8 : 0));
  const tot = w.reduce((p, c) => p + c, 0);
  let acc = 0;
  return words.map((word, i) => { const s = t0 + (a + ((b - a) * acc) / tot) / 100; acc += w[i]; const e = t0 + (a + ((b - a) * acc) / tot) / 100; return { word, t0: s, t1: e }; });
}

export async function compile(src, { baseDir = process.cwd(), log = () => {} } = {}) {
  const { meta, items } = parseScript(src);
  const castMeta = meta.cast || {};
  const actors = new Map();
  for (const [id, c] of Object.entries(castMeta)) {
    const R = RIGS[c.rig];
    if (!R) throw new Error(`cast ${id}: unknown rig "${c.rig}" (have: ${Object.keys(RIGS).join(', ')})`);
    actors.set(id, { id, R, cast: c, name: c.name || id, moves: [], clips: [], faces: [], looks: [], holds: [], shades: [], speech: [], blinks: [], saccades: [], pos: { ...(MARKS['off-left']) } });
  }
  const shots = [], cam = [], sfx = [], fx = [], sceneEv = [], lines = [];
  let t = Number(meta.lead || 0.3);

  const panAt = (tt) => {
    let p = { ...SET.pans.home };
    for (const e of sceneEv) if (e.key === 'panMove' && e.t <= tt) p = { ...e.val };
    return p;
  };
  const mark = (name, lineNo) => {
    if (MARKS[name]) return MARKS[name];
    throw new Error(`line ${lineNo}: unknown mark "${name}" (have: ${Object.keys(MARKS).join(', ')})`);
  };

  for (const it of items) {
    if (it.type === 'line') {
      const A = actors.get(it.who);
      if (!A) throw new Error(`line ${it.lineNo}: "${it.who}" is not in the cast`);
      if (it.expr && !EXPR[it.expr]) throw new Error(`line ${it.lineNo}: unknown expression "${it.expr}" (have: ${Object.keys(EXPR).join(', ')})`);
      log(`tts ${it.who}: ${it.text}`);
      const file = await tts(it.text, A.cast);
      const pcm = tighten(decode(file));
      const d = pcm.length / SR;
      const an = analyse(pcm);
      A.speech.push({ t0: t, t1: t + d, env: an.env, zcr: an.zcr, expr: it.expr });
      lines.push({ who: it.who, name: A.name, text: it.text, t0: t, t1: t + d, pcm, words: wordTimes(it.text, an.env, t) });
      if (!it.bg) t += d + Number(meta.gap ?? 0.14);
      continue;
    }
    const [head, ...rest] = it.tokens;
    const A = actors.get(head);
    if (A) {
      const verb = rest[0], args = rest.slice(1);
      const at = t;
      if (verb === 'place') { A.moves.push({ t0: at, t1: at, from: mark(args[0], it.lineNo), to: mark(args[0], it.lineNo), style: 'place' }); A.pos = mark(args[0], it.lineNo); continue; }
      if (verb === 'walk' || verb === 'sneak') {
        const to = mark(args[0], it.lineNo), d = dur(args[1], verb === 'sneak' ? 2.5 : 1.5);
        A.moves.push({ t0: at, t1: at + d, from: { ...A.pos }, to, style: verb });
        // cue-locked footsteps: a plant every half cycle
        const cycles = Math.max(1, Math.round(d * (verb === 'sneak' ? 0.75 : 1)));
        for (let j = 1; j <= cycles * 2; j++) sfx.push({ t: at + (j * d) / (cycles * 2) - 0.02, name: 'step', gain: verb === 'sneak' ? 0.16 : 0.3 });
        A.pos = to; if (!it.bg) t += d; continue;
      }
      if (verb === 'face') { if (!EXPR[args[0]]) throw new Error(`line ${it.lineNo}: unknown expression "${args[0]}"`); A.faces.push({ t: at, expr: args[0] }); continue; }
      if (verb === 'look') { A.looks.push({ t: at, target: args[0] }); continue; }
      if (verb === 'hold') { A.holds.push({ t: at, side: args[0], type: args[1] }); continue; }
      if (verb === 'drop') { A.holds.push({ t: at, side: args[0], type: null }); continue; }
      if (verb === 'shades') {
        const d = dur(args[1], 0.8);
        if (d === 0) { A.shades.push({ t: at, up: args[0] === 'down' ? 0 : 1 }); continue; }
        A.clips.push({ name: 'push-shades', t0: at, t1: at + d, args: [args[0] || 'up'] });
        A.shades.push({ t: at + d * 0.7, up: args[0] === 'down' ? 0 : 1 });
        if (!it.bg) t += d; continue;
      }
      const spec = CLIPS[verb];
      if (!spec) throw new Error(`line ${it.lineNo}: unknown action "${verb}" for ${head} (have: ${Object.keys(CLIPS).join(', ')}, place, walk, sneak, face, look, hold, drop, shades)`);
      const dArg = args.find((a) => /^[\d.]+(ms|s)$/.test(a));
      const d = dur(dArg, spec.dur);
      const other = args.filter((a) => a !== dArg);
      const clip = { name: verb, t0: at, t1: at + d, args: other };
      if (verb === 'point' && other[0]) {
        const tg = other[0];
        clip.targetWorld = () => (actors.has(tg) ? { x: actors.get(tg).pos.x, y: 900 } : MARKS[tg] ? { x: MARKS[tg].x, y: 900 } : null);
      }
      A.clips.push(clip);
      if (spec.sfx) for (const e of spec.sfx(at, at + d, other)) sfx.push(e);
      if (spec.fx) for (const e of spec.fx(at, at + d, other, { panAt, actorId: head })) fx.push(e);
      if (spec.holds) for (const e of spec.holds(at, at + d, other)) A.holds.push(e);
      if (spec.shades) for (const e of spec.shades(at, at + d, other)) A.shades.push(e);
      if (!it.bg) t += d;
      continue;
    }
    switch (head) {
      case 'shot': shots.push({ t, kind: rest[0], a: rest[1], b: rest[2], args: rest.slice(1) }); break;
      case 'camera': {
        const kind = rest[0];
        if (kind === 'push' || kind === 'pull') cam.push({ kind: 'push', t0: t, t1: t + dur(rest[2], 0.8), amt: parseFloat(rest[1]) || (kind === 'push' ? 1.25 : 0.8) });
        else if (kind === 'shake') cam.push({ kind: 'shake', t0: t, t1: t + dur(rest[1], 0.4), amp: Number(rest[2] || 14) });
        else if (kind === 'whip') { cam.push({ kind: 'whip', t, dir: rest[1] === 'left' ? -1 : 1, d: dur(rest[2], 0.32) }); sfx.push({ t: t - 0.12, name: 'whoosh', gain: 0.5 }); }
        else throw new Error(`line ${it.lineNo}: unknown camera move "${kind}"`);
        break;
      }
      case 'wait': t += dur(rest[0], 0.5); break;
      case 'sfx': {
        const off = rest.find((a) => a.startsWith('+'));
        sfx.push({ t: t + (off ? dur(off.slice(1), 0) : 0), name: rest[0], gain: Number(rest.find((a) => /^[\d.]+$/.test(a)) || 0.6) });
        break;
      }
      case 'stove': sceneEv.push({ t, key: 'stove', val: rest[0] === 'on' ? 1 : 0 }); if (rest[0] === 'on') sfx.push({ t, name: 'match', gain: 0.6 }); break;
      case 'pan':
        if (rest[0] === 'move') sceneEv.push({ t, key: 'panMove', val: SET.pans[rest[1]] || SET.pans.home });
        else sceneEv.push({ t, key: 'panContent', val: rest[0] });
        break;
      case 'fridge': sceneEv.push({ t, key: 'fridge', val: rest[0] === 'open' ? 1 : 0 }); break;
      default: throw new Error(`line ${it.lineNo}: unknown directive "[${it.raw}]"`);
    }
  }
  const DUR = meta.duration ? Number(meta.duration) : t + Number(meta.tail ?? 1.2);
  for (const A of actors.values()) {
    if (!A.moves.length) A.moves.push({ t0: 0, t1: 0, from: MARKS['off-left'], to: MARKS['off-left'], style: 'place' });
    A.moves.sort((a, b) => a.t0 - b.t0);
    // a placement before anything else holds from t=0
    A.moves[0] = { ...A.moves[0], t0: Math.min(0, A.moves[0].t0) };
    A.blinks = blinkSchedule(A.R.seed, DUR + 1);
    A.saccades = saccadeSchedule(A.R.seed, DUR + 1);
    for (const k of ['faces', 'looks', 'holds', 'shades', 'clips']) A[k].sort((a, b) => (a.t ?? a.t0) - (b.t ?? b.t0));
  }
  shots.sort((a, b) => a.t - b.t); sfx.sort((a, b) => a.t - b.t);
  return { meta, actors, shots, cam, sfx, fx, sceneEv, lines, DUR, panAt, baseDir };
}
