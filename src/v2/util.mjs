// rigpop-motion v2 · math, easing, deterministic noise.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const unlerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
export const lerpAng = (a, b, k) => a + (((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI) * k;

// Easing curves. Back curves give anticipation (in) and overshoot (out); spring settles.
export const ease = {
  linear: (x) => x,
  in: (x) => x * x * x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inBack: (x, s = 1.9) => (s + 1) * x * x * x - s * x * x,
  outBack: (x, s = 1.9) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  inOutBack: (x, s = 1.7) => {
    const c = s * 1.525;
    return x < 0.5
      ? (Math.pow(2 * x, 2) * ((c + 1) * 2 * x - c)) / 2
      : (Math.pow(2 * x - 2, 2) * ((c + 1) * (x * 2 - 2) + c) + 2) / 2;
  },
  // damped spring 0 → 1 (overshoots ~12%, settles by x≈1)
  spring: (x, damp = 5.5, freq = 1.6) => (x <= 0 ? 0 : x >= 1.4 ? 1 : 1 - Math.exp(-damp * x) * Math.cos(TAU * freq * x)),
};

// 0..1 envelope for a clip that lives in [t0, t1] with soft in/out ramps.
export function envelope(t, t0, t1, rin = 0.18, rout = 0.22, curveIn = ease.outBack, curveOut = ease.inOut) {
  if (t < t0 || t > t1 + rout) return 0;
  if (t < t0 + rin) return clamp(curveIn(clamp((t - t0) / rin, 0, 1)), -0.2, 1.25);
  if (t <= t1) return 1;
  return 1 - curveOut(clamp((t - t1) / rout, 0, 1));
}

export function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); }
// smooth value noise in [-1, 1]
export function noise(t, seed = 0) {
  const i = Math.floor(t), f = t - i;
  return lerp(hash(i + seed * 101.3), hash(i + 1 + seed * 101.3), smooth(f)) * 2 - 1;
}
export const fbm = (t, seed = 0) => noise(t, seed) * 0.65 + noise(t * 2.13, seed + 7) * 0.35;

// deterministic event schedule: times in [0, dur] spaced by [min,max] seconds
export function schedule(seed, dur, min, max) {
  const out = []; let t = hash(seed) * max; let k = 0;
  while (t < dur) { out.push(t); t += lerp(min, max, hash(seed * 13.7 + ++k)); }
  return out;
}

export const v = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a, k) => ({ x: a.x * k, y: a.y * k }),
  len: (a) => Math.hypot(a.x, a.y),
  lerp: (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }),
  rot: (a, r) => ({ x: a.x * Math.cos(r) - a.y * Math.sin(r), y: a.x * Math.sin(r) + a.y * Math.cos(r) }),
};

// Two-bone IK. Shoulder s, target t, bone lengths a, b. bend = +1 / -1 picks the elbow side.
// Returns { elbow, hand, reach } where hand is the target clamped to what the arm can reach,
// so a hand can never detach from its forearm.
export function ik2(s, t, a, b, bend = 1) {
  const dx = t.x - s.x, dy = t.y - s.y;
  const d0 = Math.hypot(dx, dy) || 1e-6;
  const d = clamp(d0, Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const base = Math.atan2(dy, dx);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const ang = base - bend * Math.acos(cosA);
  const elbow = { x: s.x + Math.cos(ang) * a, y: s.y + Math.sin(ang) * a };
  const hand = { x: s.x + Math.cos(base) * d, y: s.y + Math.sin(base) * d };
  return { elbow, hand, reach: d0 / (a + b) };
}

export function colour(hex, k = 0) {
  // k < 0 darkens toward ink, k > 0 lightens toward white
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k * 0.85; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
