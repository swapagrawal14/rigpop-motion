// rigpop-motion v2 · motion: everything is alive by default.
//
// Layers, bottom to top:
//   locomotion  (place / walk / sneak between marks; legs, bob, arm swing)
//   rest        (hands on the counter or hanging, plus whatever they hold)
//   clips       (stir, shake-packet, sprinkle, taste, laugh, jump, ...) weighted by
//                an envelope with back-eased in/out, so moves anticipate and overshoot
//   idle        (breathing, sway, head drift, blinks, saccades) — always on
//   speech      (visemes from the voice, head bob and brow lift on stress)
import { basePose } from './rig.mjs';
import { SET, MARKS, depthScale, groundY } from './scene.mjs';
import { panHandleEnd } from './props.mjs';
import { clamp, lerp, ease, envelope, noise, fbm, hash, schedule, TAU, v } from './util.mjs';

export const EXPR = {
  neutral: { brow: 0, browTilt: 0, lid: 0.12, lower: 0, pupil: 1, wide: 0, eyes: 'open', mouth: 'rest', blush: 0.35, sweat: 0 },
  happy: { brow: 0.35, browTilt: -0.1, lid: 0.08, lower: 0.3, pupil: 1.05, wide: 0, eyes: 'open', mouth: 'smile', blush: 0.6, sweat: 0 },
  sneaky: { brow: -0.15, browTilt: 0.45, lid: 0.42, lower: 0.15, pupil: 0.95, wide: 0, eyes: 'open', mouth: 'smirk', blush: 0.3, sweat: 0 },
  smug: { brow: 0.1, browTilt: 0.25, lid: 0.38, lower: 0.2, pupil: 1, wide: 0, eyes: 'open', mouth: 'smirk', blush: 0.4, sweat: 0 },
  hungry: { brow: 0.45, browTilt: -0.45, lid: 0.15, lower: 0, pupil: 1.15, wide: 0.2, eyes: 'open', mouth: 'oh', blush: 0.3, sweat: 0 },
  excited: { brow: 0.7, browTilt: -0.15, lid: 0, lower: 0.2, pupil: 1.15, wide: 0.4, eyes: 'open', mouth: 'grin', blush: 0.7, sweat: 0 },
  bliss: { brow: 0.55, browTilt: -0.3, lid: 1, lower: 0, pupil: 1, wide: 0, eyes: 'happy', mouth: 'smile', blush: 1, sweat: 0 },
  laugh: { brow: 0.6, browTilt: -0.2, lid: 0, lower: 0, pupil: 1, wide: 0, eyes: 'happy', mouth: 'laugh', blush: 0.9, sweat: 0 },
  shock: { brow: 1.1, browTilt: -0.35, lid: -0.1, lower: 0, pupil: 0.5, wide: 1, eyes: 'open', mouth: 'shock', blush: 0.1, sweat: 0.6 },
  scared: { brow: 0.8, browTilt: -0.6, lid: 0, lower: 0, pupil: 0.55, wide: 0.6, eyes: 'open', mouth: 'wobble', blush: 0.1, sweat: 1 },
  sad: { brow: 0.25, browTilt: -0.7, lid: 0.38, lower: 0, pupil: 1.1, wide: 0, eyes: 'open', mouth: 'frown', blush: 0.2, sweat: 0 },
  naughty: { brow: 0.05, browTilt: 0.35, lid: 0.3, lower: 0.3, pupil: 1, wide: 0, eyes: 'open', mouth: 'smirk', blush: 0.6, sweat: 0 },
  angry: { brow: -0.2, browTilt: 0.8, lid: 0.25, lower: 0.1, pupil: 0.9, wide: 0, eyes: 'open', mouth: 'frown', blush: 0.2, sweat: 0 },
};
const NUM_FACE = ['brow', 'browTilt', 'lid', 'lower', 'pupil', 'wide', 'blush', 'sweat'];

/* ------------------------------------------------------------- locomotion */
export function actorLoc(A, t) {
  let cur = A.moves[0].to, out = null;
  for (const m of A.moves) {
    if (t >= m.t1) { cur = m.to; continue; }
    if (t >= m.t0 && m.t1 > m.t0) {
      const k = (t - m.t0) / (m.t1 - m.t0);
      const kk = ease.inOut(k) * 0.25 + k * 0.75;
      const dist = Math.hypot(m.to.x - m.from.x, (m.to.z - m.from.z) * 300);
      const cadence = m.style === 'sneak' ? 0.75 : 1.0; // cycles per second
      const cycles = Math.max(1, Math.round((m.t1 - m.t0) * cadence));
      const dir = Math.sign(m.to.x - m.from.x) || 1;
      const s = depthScale(lerp(m.from.z, m.to.z, kk));
      out = {
        x: lerp(m.from.x, m.to.x, kk), z: lerp(m.from.z, m.to.z, kk), walking: true, style: m.style, dir,
        phase: k * cycles, stride: clamp(dist / cycles / s, 34, 130), k,
      };
    }
    break;
  }
  return out || { x: cur.x, z: cur.z, walking: false, style: 'stand', dir: 1, phase: 0, stride: 0, k: 1 };
}

const lastAt = (list, t, def) => { let r = def; for (const e of list) { if (e.t <= t) r = e; else break; } return r; };

/* ------------------------------------------------------------------ clips */
// Each clip: (c) => output. c = { u, d, k, args, R, s, toLocal, scene, t, A }
// Output: { body:{...deltas}, face:{...}, L:{...}, R:{...}, look:{x,y}|target, rin, rout }
const tip2hand = (tip, ang, len) => ({ x: tip.x - Math.cos(ang) * len, y: tip.y - Math.sin(ang) * len });
const mouthOf = (R) => (J) => ({ x: J.head.x + Math.sin(J.headAng) * -R.mouthY, y: J.head.y + Math.cos(J.headAng) * R.mouthY });
const counterRest = (c, side) => c.toLocal({ x: c.loc.x + (side === 'L' ? -96 : 96) * c.s, y: SET.counterTop + 4 });
// Hands resting at the counter tuck just below its front edge (the counter is drawn over the
// body pass), so idle hands never read as lumps sitting on the worktop.
const counterTuck = (c, side) => c.toLocal({ x: c.loc.x + (side === 'L' ? -92 : 92) * c.s, y: SET.counterTop + 16 * c.s });

export const CLIPS = {
  stir: {
    dur: 3, rin: 0.25, rout: 0.25,
    f(c) {
      const th = TAU * c.u / 0.78;
      const p = c.toLocal(c.scene.pan);
      const tip = { x: p.x + Math.cos(th) * 52, y: p.y + Math.sin(th) * 11 + 3 };
      const ang = 2.05 + 0.22 * Math.sin(th);
      const h = c.toLocal(panHandleEnd(c.scene.pan.x, c.scene.pan.y, c.scene.pan.jiggle || 0, -0.06, 0.42));
      return {
        body: { lean: -0.05 + 0.035 * Math.sin(th), turn: -0.3, headTilt: 0.06 * Math.sin(th), bob: 3 * Math.sin(2 * th), headDY: 4 * Math.abs(Math.sin(th)), shoulderL: 5 * Math.sin(th) },
        L: { target: tip2hand(tip, ang, 74), grip: 'fist', hold: { type: 'spatula', rot: ang }, front: true },
        R: { target: h, grip: 'fist', front: true, handRot: -0.4, pole: (J) => ({ x: J.sh.R.x + 40, y: J.sh.R.y + 200 }) },
        look: { at: 'pan' },
      };
    },
    state: (u) => ({ stir: 1, jiggle: 3 * Math.sin(TAU * u / 0.78) }),
    sfx: (t0, t1) => { const o = [{ t: t0 + 0.1, name: 'boil', gain: 0.5 }]; for (let t = t0 + 0.7; t < t1; t += 1.56) o.push({ t, name: 'clink', gain: 0.22 }); return o; },
  },

  'shake-packet': {
    dur: 1.6, rin: 0.28, rout: 0.25,
    f(c) {
      const sh = c.u > 0.18 ? 1 : 0;
      const ph = TAU * c.u * 5.2;
      return {
        body: { turn: 0.22, headTilt: 0.1 + 0.04 * Math.sin(ph), shoulderR: 6 + 4 * Math.sin(ph) * sh, bob: 3 * Math.sin(ph) * sh, lean: 0.03 },
        R: { target: (J) => ({ x: J.sh.R.x + 62, y: J.sh.R.y - 64 + Math.sin(ph) * 24 * sh }), grip: 'fist', hold: { type: 'packet', rot: -0.15 + 0.2 * Math.sin(ph + 0.7) * sh, ax: -30, ay: -46 } },
        face: { brow: 0.6, mouth: 'grin', lower: 0.35 },
        look: { x: 0.8, y: -0.5 },
      };
    },
    sfx: (t0, t1) => { const o = []; for (let t = t0 + 0.2; t < t1; t += 1 / 5.2) o.push({ t, name: 'crinkle', gain: 0.32 }); return o; },
  },

  'hold-packet': {
    dur: 2, rin: 0.3, rout: 0.25,
    f(c) {
      const b = Math.sin(TAU * c.u * 1.1) * 5;
      return {
        body: { turn: 0.05, headTilt: -0.05 },
        R: { target: (J) => ({ x: J.sh.R.x - 8, y: J.sh.R.y + 92 + b }), grip: 'fist', hold: { type: 'packet', rot: 0.05, ax: -46, ay: -52 } },
        L: { target: (J) => ({ x: J.sh.L.x + 22, y: J.sh.L.y + 92 + b }), grip: 'fist', handRot: 0.3 },
        face: { mouth: 'smirk' },
        look: { at: 'cam' },
      };
    },
    sfx: (t0) => [{ t: t0 + 0.1, name: 'crinkle', gain: 0.4 }],
  },

  'drop-noodles': {
    dur: 1.4, rin: 0.3, rout: 0.3,
    f(c) {
      const p = c.toLocal(c.scene.pan);
      const tilt = ease.inOutBack(clamp((c.k - 0.15) / 0.3, 0, 1));
      return {
        body: { turn: -0.3, lean: -0.06 },
        R: { target: { x: p.x + 70, y: p.y - 175 + Math.sin(c.u * 30) * 3 * (c.k > 0.15 && c.k < 0.45 ? 1 : 0) }, grip: 'fist', hold: { type: 'packet', rot: lerp(-0.1, 2.7, tilt), ax: -30, ay: -46, torn: 1, empty: c.k > 0.45 ? 1 : 0 }, front: true },
        face: { brow: 0.5, mouth: c.k > 0.5 ? 'grin' : 'oh', wide: 0.2 },
        look: { at: 'pan' },
      };
    },
    state: (u, d) => (u / d > 0.62 ? { content: 'noodles' } : {}),
    holds: (t0, t1) => [{ t: t1, side: 'R', type: null }],
    fx: (t0, t1, a, ctx) => {
      const d = t1 - t0; const p = ctx.panAt(t0);
      return [
        { kind: 'block', t: t0 + d * 0.42, t1: t0 + d * 0.62, x0: p.x + 45, y0: p.y - 150, x1: p.x, y1: p.y - 4 },
        { kind: 'burst', t: t0 + d * 0.62, x: p.x, y: p.y - 6, floor: p.y + 40, n: 16, seed: Math.floor(t0 * 10), col: '#e9f6ff' },
      ];
    },
    sfx: (t0, t1) => [{ t: t0 + 0.15, name: 'crinkle', gain: 0.5 }, { t: t0 + (t1 - t0) * 0.62, name: 'pour', gain: 0.55 }],
  },

  sprinkle: {
    dur: 1.6, rin: 0.25, rout: 0.25,
    f(c) {
      const p = c.toLocal(c.scene.pan);
      const per = 0.3, f = (c.u % per) / per;
      const jerk = f < 0.18 ? lerp(0, -22, f / 0.18) : -22 * (1 - ease.spring((f - 0.18) / 0.82));
      return {
        body: { turn: -0.3, lean: -0.04, headDY: jerk * -0.1, shoulderL: -jerk * 0.2 },
        L: { target: { x: p.x + 4, y: p.y - 160 + jerk }, grip: 'fist', hold: { type: 'sachet', rot: 2.5 }, front: true },
        face: { brow: 0.45, mouth: 'smile', lower: 0.3 },
        look: { at: 'pan' },
      };
    },
    fx: (t0, t1, a, ctx) => {
      const o = []; const p = ctx.panAt(t0); let k = 0;
      for (let t = t0 + 0.06 + 0.25; t < t1 - 0.1; t += 0.3) o.push({ kind: 'fall', t, x: p.x - 18, y: p.y - 110, floor: p.y + 2, n: 12, seed: ++k + Math.floor(t0 * 7) });
      return o;
    },
    sfx: (t0) => [{ t: t0 + 0.25, name: 'sprinkle', gain: 0.6 }],
  },

  taste: {
    dur: 2.4, rin: 0.25, rout: 0.3,
    f(c) {
      const p = c.toLocal(c.scene.pan), k = c.k, R = c.R;
      const dipTip = { x: p.x + 22, y: p.y + 2 };
      const dipAng = 2.2;
      const mouth = mouthOf(R);
      const upAng = -1.05;
      const lift = ease.inOutBack(clamp((k - 0.22) / 0.25, 0, 1), 1.2);
      const target = (J) => {
        const m = mouth(J);
        const tipUp = { x: m.x - 4, y: m.y + 2 };
        const a = lerp(dipAng, upAng, lift);
        const tip = v.lerp(dipTip, tipUp, lift);
        return tip2hand(tip, a, 72);
      };
      const at = k > 0.45 && k < 0.85;
      const chew = at ? Math.sin(TAU * (c.u) * 3.2) : 0;
      return {
        body: { turn: lerp(-0.3, 0.1, lift), headTilt: at ? -0.1 : 0, lean: at ? -0.04 : -0.04, shoulderL: k > 0.6 && k < 0.8 ? 7 * Math.sin(TAU * c.u * 8) : 0, shoulderR: k > 0.6 && k < 0.8 ? 7 * Math.sin(TAU * c.u * 8) : 0, headDY: at ? chew * 2 : 0 },
        L: { target, grip: 'fist', hold: { type: 'spoon', rot: lerp(dipAng, upAng, lift), bite: k > 0.18 && k < 0.55 ? 1 : 0 }, front: lift < 0.5, pole: (J) => ({ x: J.sh.L.x - 30, y: J.sh.L.y + 220 }) },
        face: at ? { eyes: 'open', lid: 1, brow: 0.6, browTilt: -0.3, blush: 1, mouth: k < 0.55 ? 'oh' : chew > 0 ? 'chew' : 'mbp' } : { brow: 0.4, mouth: 'oh', wide: 0.15 },
        look: lift < 0.4 ? { at: 'pan' } : { at: 'cam' },
      };
    },
    sfx: (t0, t1) => { const d = t1 - t0; return [{ t: t0 + d * 0.2, name: 'clink', gain: 0.4 }, { t: t0 + d * 0.48, name: 'slurp', gain: 0.6 }, { t: t0 + d * 0.78, name: 'gulp', gain: 0.6 }]; },
  },

  laugh: {
    dur: 2, rin: 0.15, rout: 0.3,
    f(c) {
      const ph = TAU * c.u * 3.1, b = Math.abs(Math.sin(ph));
      return {
        body: { headTilt: -0.16 + 0.05 * Math.sin(ph), headDY: -6 - b * 5, lean: -0.04, bob: -b * 9, shoulderL: b * 9, shoulderR: b * 9, sy: 1 + 0.025 * Math.sin(ph * 2) },
        R: { target: (J) => ({ x: J.hip.x + 34, y: J.hip.y - 40 }), grip: 'open', handRot: 1.2 },
        // laughing: the fist thumps the worktop (knuckles down), a clear shape instead of a flat lump
        L: { target: (J) => { const r = counterRest(c, 'L'); return { x: r.x + 18, y: r.y - 14 - 36 * Math.abs(Math.sin(ph / 2)) }; }, grip: 'fist', handRot: -0.5, front: true },
        face: { eyes: Math.sin(ph / 2) > 0.6 ? 'squeeze' : 'happy', mouth: 'laugh', open: 1 + 0.25 * Math.sin(ph * 2), brow: 0.6, blush: 1 },
        look: { at: 'cam' },
      };
    },
  },

  jump: {
    dur: 1.0, rin: 0.04, rout: 0.25, linear: true,
    f(c) {
      const k = c.k;
      let bob = 0, sy = 1, crouch = 0, up = 0;
      if (k < 0.14) { const q = k / 0.14; crouch = 0.45 * ease.out(q); sy = 1 - 0.14 * q; }
      else if (k < 0.5) { const q = (k - 0.14) / 0.36; bob = -95 * Math.sin(Math.PI * q); sy = lerp(1.25, 0.98, q); up = 1; }
      else if (k < 0.62) { const q = (k - 0.5) / 0.12; sy = lerp(0.98, 0.8, Math.sin(Math.PI * q * 0.5)); crouch = 0.3 * q; up = 1 - q; }
      else { const q = (k - 0.62) / 0.38; sy = lerp(0.8, 1, ease.spring(q)); crouch = 0.3 * (1 - ease.out(q)); }
      const spread = Math.max(up, k < 0.14 ? 0 : 0.5);
      return {
        body: { bob, crouch, sy, sx: 1 / Math.sqrt(sy), hairFlop: up * 1.4, headDY: -up * 8 },
        L: { target: (J) => v.lerp({ x: J.sh.L.x - 30, y: J.sh.L.y + 120 }, { x: J.sh.L.x - 80, y: J.sh.L.y - 140 }, spread), grip: 'spread' },
        R: { target: (J) => v.lerp({ x: J.sh.R.x + 30, y: J.sh.R.y + 120 }, { x: J.sh.R.x + 80, y: J.sh.R.y - 140 }, spread), grip: 'spread' },
        face: { brow: 1.1, browTilt: -0.35, lid: -0.1, wide: 1, pupil: 0.45, mouth: 'shock', sweat: 1 },
        look: { at: 'cam' },
      };
    },
    fx: (t0, t1, a, ctx) => [{ kind: 'exclaim', t: t0 + 0.12, t1: t0 + 0.9, actor: ctx.actorId }],
    sfx: (t0) => [{ t: t0 + 0.1, name: 'whoosh', gain: 0.6 }, { t: t0 + 0.12, name: 'sting', gain: 0.35 }],
  },

  peek: {
    dur: 2, rin: 0.4, rout: 0.35,
    f(c) {
      const dart = Math.floor(c.u / 0.45) % 2 ? 1 : -1;
      return {
        body: { lean: -0.42 + 0.06 * Math.sin(TAU * c.u * 0.7), turn: -0.35, headTilt: -0.22, headDY: Math.sin(TAU * c.u * 0.8) * 4, hipDX: -24, crouch: 0.15 },
        L: { target: (J) => c.toLocal({ x: SET.arch.cx + SET.arch.hw - 4, y: groundY(c.loc.z) - 250 * c.s }), grip: 'fist', front: true, handRot: 1.6 },
        face: { brow: -0.1, browTilt: 0.45, lid: 0.35, mouth: 'smirk' },
        look: { x: dart, y: 0.1 },
      };
    },
  },

  'open-fridge': {
    dur: 1.2, rin: 0.3, rout: 0.3,
    f(c) {
      const F = SET.fridge;
      const o = c.scene.fridgeOpen;
      const dw = F.w * Math.cos(o * Math.PI * 0.62);
      const handle = { x: F.x + F.w - dw + 25, y: F.split + 100 };
      const pull = c.k < 0.65;
      return {
        body: { turn: 0.45, lean: pull ? 0.06 - 0.08 * ease.inOut(clamp((c.k - 0.3) / 0.3, 0, 1)) : -0.02 },
        R: { target: pull ? c.toLocal(handle) : (J) => ({ x: J.sh.R.x + 60, y: J.sh.R.y + 80 }), grip: pull ? 'fist' : 'open', front: true },
        face: { brow: 0.5, mouth: 'grin', wide: 0.2 },
        look: { x: 1, y: 0.1 },
      };
    },
    state: (u, d) => ({ fridgeOpen: ease.outBack(clamp((u / d - 0.3) / 0.35, 0, 1), 1.3) }),
    sfx: (t0) => [{ t: t0 + 0.4, name: 'door', gain: 0.45 }, { t: t0 + 0.7, name: 'buzz', gain: 0.35 }],
  },
  'close-fridge': {
    dur: 0.8, rin: 0.2, rout: 0.25,
    f(c) {
      return {
        body: { turn: 0.3 },
        R: { target: (J) => ({ x: J.sh.R.x + 95, y: J.sh.R.y + 40 }), grip: 'flat', front: true },
        look: { x: 0.8, y: 0 },
      };
    },
    state: (u, d) => ({ fridgeOpen: 1 - ease.in(clamp(u / d / 0.6, 0, 1)) }),
    sfx: (t0) => [{ t: t0 + 0.45, name: 'door', gain: 0.4 }],
  },

  grab: {
    dur: 1.2, rin: 0.25, rout: 0.35,
    f(c) {
      const F = SET.fridge;
      const target = { x: F.x + 10 + (F.w - 20) * 0.6, y: F.split + 10 + (F.h - (F.split - F.y) - 20) * 0.8 };
      const reach = c.k < 0.5;
      return {
        body: { turn: 0.5, lean: reach ? 0.12 : 0.02, crouch: reach ? 0.25 : 0 },
        R: { target: reach ? c.toLocal(target) : (J) => ({ x: J.sh.R.x + 20, y: J.sh.R.y + 70 }), grip: reach ? 'open' : 'fist', front: true, hold: reach ? null : { type: 'packet', rot: 0.1, ax: -30, ay: -46 } },
        face: reach ? { brow: 0.3, mouth: 'oh' } : { brow: 0.6, mouth: 'grin', lower: 0.3, blush: 0.8 },
        look: reach ? { x: 1, y: 0.4 } : { at: 'cam' },
      };
    },
    holds: (t0, t1) => [{ t: t0 + (t1 - t0) * 0.5, side: 'R', type: 'packet' }],
    state: (u, d) => (u / d >= 0.5 ? { stashTaken: true } : {}),
    sfx: (t0, t1) => [{ t: t0 + (t1 - t0) * 0.5, name: 'crinkle', gain: 0.5 }],
  },

  'push-shades': {
    dur: 0.8, rin: 0.2, rout: 0.25,
    f(c) {
      const up = c.args.includes('down') ? 0 : 1;
      const m = ease.inOutBack(clamp((c.k - 0.25) / 0.45, 0, 1));
      return {
        body: { headTilt: up ? -0.06 : 0.04 },
        R: { target: (J) => ({ x: J.head.x + c.R.eyeX + 20, y: J.head.y + lerp(c.R.eyeY, -c.R.headRy * 0.75, up ? m : 1 - m) }), grip: 'pinch', handRot: -1.2 },
        face: { shadesUp: up ? m : 1 - m },
      };
    },
    shades: (t0, t1, args) => [{ t: t0 + (t1 - t0) * 0.7, up: args.includes('down') ? 0 : 1 }],
  },

  point: {
    dur: 1.2, rin: 0.2, rout: 0.25,
    f(c) {
      const tgt = c.targetWorld ? c.toLocal(c.targetWorld) : { x: 400, y: -500 };
      const side = tgt.x < 0 ? 'L' : 'R';
      const jab = Math.max(0, Math.sin(TAU * c.u * 2.2)) * 0.06;
      const o = {
        body: { turn: Math.sign(tgt.x) * 0.3, lean: Math.sign(tgt.x) * 0.04, headTilt: 0.08 },
        face: { mouth: 'grin' },
      };
      o[side] = { target: (J) => { const d = v.sub(tgt, J.sh[side]), L = v.len(d) || 1; return v.add(J.sh[side], v.mul(d, (c.R.upper + c.R.fore) * (0.88 + jab) / L)); }, grip: 'point', front: true };
      return o;
    },
  },

  'cover-mouth': {
    dur: 1.2, rin: 0.18, rout: 0.25,
    f(c) {
      return {
        body: { shoulderL: 10, shoulderR: 10, headDY: 4 },
        L: { target: (J) => ({ x: J.head.x - 20, y: J.head.y + c.R.mouthY + 26 }), grip: 'open', handRot: -0.2 },
        R: { target: (J) => ({ x: J.head.x + 20, y: J.head.y + c.R.mouthY + 30 }), grip: 'open', handRot: 0.2 },
        face: { brow: 0.9, browTilt: -0.4, wide: 0.6, pupil: 0.6, sweat: 1 },
      };
    },
  },

  'hands-hips': {
    dur: 2, rin: 0.25, rout: 0.25,
    f(c) {
      const sway = Math.sin(TAU * c.u * 0.9);
      return {
        body: { headTilt: 0.14 + 0.04 * sway, hipDX: 4 * sway, lean: 0.03 * sway, turn: -0.15 },
        L: { target: (J) => ({ x: J.hip.x - c.R.waistW * 0.55, y: J.hip.y - 26 }), grip: 'fist', pole: (J) => ({ x: J.sh.L.x - 200, y: J.sh.L.y }) },
        R: { target: (J) => ({ x: J.hip.x + c.R.waistW * 0.55, y: J.hip.y - 26 }), grip: 'fist', pole: (J) => ({ x: J.sh.R.x + 200, y: J.sh.R.y }) },
        face: { lid: 0.3 },
      };
    },
  },

  eat: {
    dur: 3, rin: 0.25, rout: 0.3,
    f(c) {
      const p = c.toLocal(c.scene.pan);
      const per = 1.25, f = (c.u % per) / per;
      const lift = f < 0.3 ? 0 : f < 0.5 ? ease.inOutBack((f - 0.3) / 0.2, 1.2) : f < 0.8 ? 1 : 1 - ease.inOut((f - 0.8) / 0.2);
      const mouth = mouthOf(c.R);
      const dipAng = 1.9, upAng = -1.3;
      return {
        body: { turn: -0.15, headTilt: lift > 0.9 ? -0.08 : 0.04, headDY: lift > 0.9 ? Math.sin(TAU * c.u * 4) * 2 : 0 },
        R: { target: (J) => { const m = mouth(J); const tip = v.lerp({ x: p.x - 10, y: p.y }, { x: m.x, y: m.y + 30 }, lift); return tip2hand(tip, lerp(dipAng, upAng, lift), 66); }, grip: 'fist', hold: { type: 'fork', rot: lerp(dipAng, upAng, lift), strands: f > 0.32 && f < 0.85 ? 1 : 0 }, front: lift < 0.4 },
        face: lift > 0.9 ? { mouth: f < 0.62 ? 'oh' : (Math.sin(TAU * c.u * 6) > 0 ? 'chew' : 'mbp'), eyes: 'happy', blush: 1 } : { mouth: 'grin', eyes: 'happy', blush: 0.8 },
        look: { at: 'pan' },
      };
    },
    sfx: (t0, t1) => { const o = []; for (let t = t0 + 0.55; t < t1 - 0.3; t += 1.25) o.push({ t, name: 'slurp', gain: 0.55 }); return o; },
  },

  'sad-shake': {
    dur: 2.2, rin: 0.3, rout: 0.3,
    f(c) {
      const ph = TAU * c.u * 1.6;
      return {
        body: { headTilt: 0.12, lean: 0.03, headDY: 6, shoulderL: -4, shoulderR: -4 },
        R: { target: (J) => ({ x: J.sh.R.x + 30, y: J.sh.R.y - 40 + Math.sin(ph) * 10 }), grip: 'fist', hold: { type: 'packet', rot: Math.PI + 0.15 * Math.sin(ph), ax: -30, ay: -46, empty: 1, torn: 1 } },
        L: { target: (J) => ({ x: J.sh.R.x - 10, y: J.sh.R.y + 90 }), grip: 'open', handRot: -1.4 },
        face: { brow: 0.3, browTilt: -0.7, lid: 0.35, mouth: 'wobble', sweat: 0 },
        look: { x: 0.6, y: -0.8 },
      };
    },
  },

  'no-no': {
    dur: 1.2, rin: 0.12, rout: 0.2,
    f(c) {
      const ph = TAU * c.u * 3.2;
      return {
        body: { turn: 0.45 * Math.sin(ph), headTilt: 0.05 * Math.sin(ph) },
        L: { target: (J) => ({ x: J.sh.L.x + 10 + 30 * Math.sin(ph + 1), y: J.sh.L.y - 20 }), grip: 'spread' },
        R: { target: (J) => ({ x: J.sh.R.x - 10 + 30 * Math.sin(ph + 1), y: J.sh.R.y - 20 }), grip: 'spread' },
        face: { brow: 0.8, browTilt: -0.5, sweat: 1 },
      };
    },
  },

  nod: {
    dur: 0.8, rin: 0.1, rout: 0.15,
    f(c) { return { body: { headDY: 7 * Math.abs(Math.sin(TAU * c.u * 2.2)), headTilt: 0.06 * Math.sin(TAU * c.u * 2.2) } }; },
  },
};

/* ------------------------------------------------------------- evaluation */
// A: compiled actor. W: { scene(t) -> state, actors: Map, headWorld(id, t) }
export function evalActor(A, t, W) {
  const R = A.R, P = basePose();
  const L = actorLoc(A, t);
  const s = depthScale(L.z), gy = groundY(L.z);
  const toLocal = (p) => ({ x: (p.x - L.x) / s, y: (p.y - gy) / s });
  const scene = W.scene(t);
  const seed = R.seed;
  const atCounter = L.z < 0.22;

  // locomotion
  if (L.walking) {
    const sneak = L.style === 'sneak';
    Object.assign(P.legs, { mode: sneak ? 'sneak' : 'walk', dir: L.dir, phase: L.phase, stride: L.stride, lift: sneak ? 58 : 30 });
    const step = Math.abs(Math.sin(TAU * L.phase));
    P.bob = (sneak ? -12 : -7) * step;
    P.crouch = sneak ? 0.38 : 0.05;
    P.turn = 0.55 * L.dir;
    P.lean = (sneak ? 0.1 : 0.05) * L.dir;
    P.hairFlop = Math.sin(TAU * L.phase * 2) * 0.4;
  }
  P.legs.hidden = L.z < 0.3;

  // rest arms (+ persistent holds)
  const holdOf = (side) => { const e = lastAt(A.holds.filter((h) => h.side === side), t, null); return e && e.type ? { type: e.type, rot: 0.1, ax: side === 'R' ? -30 : 30, ay: -46, ...(e.opts || {}) } : null; };
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? -1 : 1;
    const arm = P.arms[side];
    const hold = holdOf(side);
    if (L.walking && L.style === 'sneak') {
      const bob = Math.sin(TAU * L.phase + (side === 'L' ? 0 : 1.2)) * 10;
      arm.target = (J) => ({ x: J.sh[side].x + sg * 8 + L.dir * 34, y: J.sh[side].y + 52 + bob });
      arm.grip = 'droop'; arm.handRot = L.dir * 0.9 * -sg;
    } else if (L.walking) {
      const sw = Math.sin(TAU * L.phase + (side === 'L' ? 0 : Math.PI)) * 34;
      arm.target = (J) => ({ x: J.sh[side].x + sg * 18 + sw, y: J.hip.y + 4 });
    } else if (atCounter) {
      const r = counterTuck({ loc: L, s, toLocal }, side);
      arm.target = r; arm.grip = 'open'; arm.front = false; arm.handRot = 0;
    } else {
      arm.target = (J) => ({ x: J.sh[side].x + sg * 16, y: J.hip.y + 6 });
    }
    if (hold) {
      arm.hold = hold; arm.grip = 'fist'; arm.handRot = 0; arm.front = false;
      if (!L.walking || L.style !== 'sneak') arm.target = (J) => ({ x: J.sh[side].x - sg * 6, y: J.sh[side].y + 100 });
    }
  }

  // expression (blend between face events) — line expression wins while speaking
  const speech = A.speech.find((sp) => t >= sp.t0 - 0.12 && t <= sp.t1 + 0.25) || null;
  const evs = A.faces;
  let cur = EXPR.neutral, prev = EXPR.neutral, since = 99;
  for (const e of evs) { if (e.t <= t) { prev = cur; cur = EXPR[e.expr] || EXPR.neutral; since = t - e.t; } else break; }
  if (speech && speech.expr && EXPR[speech.expr]) { const st = t - (speech.t0 - 0.12); if (st >= 0) { prev = cur; cur = EXPR[speech.expr]; since = st; } }
  const kf = ease.outBack(clamp(since / 0.16, 0, 1), 1.4);
  for (const f of NUM_FACE) P.face[f] = lerp(prev[f], cur[f], kf);
  P.face.eyes = kf > 0.5 ? cur.eyes : prev.eyes; P.face.mouth = kf > 0.5 ? cur.mouth : prev.mouth;

  // look target
  const lookE = lastAt(A.looks, t, { target: 'cam' });
  let look = { at: lookE.target };

  // clips
  const ctxBase = { R, s, toLocal, scene, t, A, loc: L };
  for (const C of A.clips) {
    const spec = CLIPS[C.name];
    if (!spec) continue;
    const rin = spec.rin ?? 0.2, rout = spec.rout ?? 0.25;
    if (t < C.t0 || t > C.t1 + rout) continue;
    const w = spec.linear ? envelope(t, C.t0, C.t1, rin, rout, ease.out, ease.inOut) : envelope(t, C.t0, C.t1, rin, rout);
    if (w <= 0) continue;
    const u = clamp(t - C.t0, 0, C.t1 - C.t0), d = C.t1 - C.t0;
    const o = spec.f({ ...ctxBase, u, d, k: d > 0 ? u / d : 1, args: C.args, targetWorld: C.targetWorld ? C.targetWorld(t) : null });
    const wb = Math.min(w, 1.0) + Math.max(0, w - 1) * 0.6;
    if (o.body) for (const [key, val] of Object.entries(o.body)) {
      if (key === 'sx' || key === 'sy') P[key] = lerp(P[key], val, Math.min(1, w));
      else P[key] = (P[key] || 0) + val * wb;
    }
    for (const side of ['L', 'R']) {
      const a = o[side]; if (!a) continue;
      const arm = P.arms[side];
      const from = arm.target, to = a.target;
      const res = (x, J) => (typeof x === 'function' ? x(J) : x);
      arm.target = (J) => v.lerp(res(from, J), res(to, J), w);
      if (w > 0.5) {
        if (a.grip) arm.grip = a.grip;
        arm.hold = a.hold === undefined ? arm.hold : a.hold;
        arm.front = !!a.front; arm.pole = a.pole || null;
      }
      arm.handRot = lerp(arm.handRot || 0, a.handRot || 0, clamp(w, 0, 1));
    }
    if (o.face) {
      const wf = clamp(w, 0, 1);
      for (const [key, val] of Object.entries(o.face)) {
        if (typeof val === 'number' && typeof P.face[key] === 'number') P.face[key] = lerp(P.face[key], val, wf);
        else if (wf > 0.5) P.face[key] = val;
      }
    }
    if (o.look && w > 0.5) look = o.look;
    if (o.pack && w > 0) P.pack = { ...o.pack, w }; // v3 pose packs take over the drawing
  }

  // idle — always on
  const br = Math.sin(TAU * t / 3.3 + seed);
  P.breath += br;
  P.hipDX += 3 * noise(t * 0.45, seed);
  P.lean += 0.014 * fbm(t * 0.5, seed + 1);
  P.headTilt += 0.045 * fbm(t * 0.55, seed + 2);
  P.headDX += 3 * noise(t * 0.7, seed + 3);
  P.headDY += 2.2 * noise(t * 0.9, seed + 4) - br * 1.2;
  P.shoulderL += br * 1.5; P.shoulderR += br * 1.5;

  // look → head turn + eyes
  const hw = W.headWorld(A.id, t);
  let lx = 0, ly = 0, turnAdd = 0;
  if (look.at === 'cam' || (!look.at && look.x === undefined)) { lx = 0; ly = 0; }
  else if (look.x !== undefined) { lx = look.x; ly = look.y || 0; turnAdd = look.x * 0.18; }
  else {
    let tw = null;
    if (look.at === 'pan') tw = { x: scene.pan.x, y: scene.pan.y };
    else if (W.actors.has(look.at)) tw = W.headWorld(look.at, t);
    else if (MARKS[look.at]) tw = { x: MARKS[look.at].x, y: groundY(MARKS[look.at].z) - 300 };
    else if (look.at === 'left') tw = { x: hw.x - 600, y: hw.y };
    else if (look.at === 'right') tw = { x: hw.x + 600, y: hw.y };
    if (tw) { const dx = tw.x - hw.x, dy = tw.y - hw.y; lx = clamp(dx / 240, -1, 1); ly = clamp(dy / 260, -1, 1); turnAdd = clamp(dx / 700, -0.45, 0.45); }
  }
  P.turn += turnAdd;
  // saccades: quick darts around the look target
  let sx = 0, sy = 0;
  for (const st of A.saccades) { if (st > t) break; sx = (hash(st * 13.1 + seed) - 0.5) * 0.7; sy = (hash(st * 7.7 + seed) - 0.5) * 0.35; }
  P.face.lookX = clamp(lx + sx, -1.1, 1.1);
  P.face.lookY = clamp(ly + sy, -1, 1);

  // blinks
  for (const b of A.blinks) {
    if (b > t) break;
    const d = t - b;
    if (d < 0.16) P.face.blink = d < 0.06 ? d / 0.06 : 1 - (d - 0.06) / 0.1;
  }

  // speech: visemes from the voice + head/brow emphasis + a beat gesture
  if (speech) {
    const i = Math.floor((t - speech.t0) * 100);
    const amp = i >= 0 && i < speech.env.length ? speech.env[i] : 0;
    const zc = i >= 0 && i < speech.zcr.length ? speech.zcr[i] : 0;
    if (t >= speech.t0 && t <= speech.t1) {
      const laughy = P.face.mouth === 'laugh';
      const glum = P.face.mouth === 'frown';
      if (amp < 0.1) P.face.mouth = laughy ? 'laugh' : (P.face.mouth === 'smile' || P.face.mouth === 'smirk' || P.face.mouth === 'grin' ? 'mbp' : 'mbp');
      else if (laughy) { P.face.mouth = 'laugh'; P.face.open = 0.6 + amp * 0.7; }
      else if (glum) { P.face.mouth = amp > 0.45 ? 'oh' : 'wobble'; P.face.open = 0.4 + amp * 0.6; }
      else if (zc > 0.42) { P.face.mouth = 'ee'; P.face.open = 0.5 + amp * 0.7; }
      else if (amp > 0.55) { P.face.mouth = 'ah'; P.face.open = 0.6 + amp * 0.7; }
      else { P.face.mouth = 'oh'; P.face.open = 0.5 + amp * 0.8; }
      P.headDY += -amp * 6; P.headTilt += amp * 0.05 * Math.sin(t * 5.3);
      P.face.brow += amp * 0.25;
      // beat gesture on the free hand
      for (const side of ['R', 'L']) {
        const arm = P.arms[side];
        if (arm.hold || arm.front) continue;
        const prevT = arm.target;
        const lift = amp * 46;
        arm.target = (J) => { const p = typeof prevT === 'function' ? prevT(J) : prevT; return { x: p.x + (side === 'R' ? 10 : -10) * amp, y: p.y - lift }; };
        if (arm.grip === 'open' && amp > 0.2) arm.grip = 'open';
        break;
      }
    }
  }
  P.face.lid = clamp(P.face.lid, -0.2, 1);
  P.face.shadesUp = lastAt(A.shades, t, { up: 1 }).up;
  // clip overrides on shades still apply (push-shades animates it)
  for (const C of A.clips) if (C.name === 'push-shades' && t >= C.t0 && t <= C.t1) {
    const o = CLIPS['push-shades'].f({ ...ctxBase, u: t - C.t0, d: C.t1 - C.t0, k: (t - C.t0) / (C.t1 - C.t0), args: C.args });
    P.face.shadesUp = o.face.shadesUp;
  }
  return { P, L, s, gy, scene };
}

export function blinkSchedule(seed, dur) { return schedule(seed * 3.3, dur, 2.0, 4.6); }
export function saccadeSchedule(seed, dur) { return schedule(seed * 5.9 + 1, dur, 0.45, 1.6); }
