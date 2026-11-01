// rigpop-motion v2 · layered vector character rig, drawn in code.
//
// Character-local space: origin on the ground between the feet, +y down, 1 unit = 1 px at
// zoom 1. Arm sides are SCREEN sides: L is the arm on the left of the frame.
//
//   ground ── hip ── torso ── neck ── head (tilt, turn, nod)
//                     ├─ shoulder L ── elbow ── wrist ── hand (grip, prop)   2-bone IK
//                     └─ shoulder R ── ...
//   hip ── thigh ── shin ── foot (L, R)                                    2-bone IK
import { INK, LW, cel, limb, ellipse, stroke, fill } from './ink.mjs';
import { clamp, lerp, ik2, v, TAU } from './util.mjs';

export const RIGS = {
  kabir: {
    id: 'kabir', seed: 3,
    skin: '#dd9a6c', skinShade: '#b26c4a', blush: '#ef7d6a', lip: '#7a2a24',
    hair: '#1e1a26', hairHi: '#3e3852',
    top: '#d7322b', topShade: '#9c1b1f', topText: 'NO SLEEP', topTextCol: '#f3cdbd',
    bottom: '#2c3658', bottomShade: '#1d2440', foot: '#efe8d8', footShade: '#c3b9a3',
    headRx: 96, headRy: 98, neck: 20, neckW: 36,
    torsoH: 180, shoulderW: 158, waistW: 136, shoulderX: 66, shoulderInset: 18,
    upper: 90, fore: 86, armW: 30, hand: 19,
    hipX: 30, thigh: 104, shin: 98, legW: 38,
    eyeX: 37, eyeY: 6, eyeRx: 19, eyeRy: 24, pupil: 9.5, mouthY: 54, mouthW: 26,
    hairStyle: 'messy', accessory: 'shades', dress: false,
  },
  chhoti: {
    id: 'chhoti', seed: 11,
    skin: '#e4a77a', skinShade: '#bb7856', blush: '#f2807a', lip: '#7a2a24',
    hair: '#1b1722', hairHi: '#3a3350', bow: '#c04fd6',
    top: '#b46ad8', topShade: '#7d3fa5', topText: '', topTextCol: '#fff',
    bottom: '#e4a77a', bottomShade: '#bb7856', foot: '#f4d24a', footShade: '#c9a733',
    headRx: 84, headRy: 84, neck: 12, neckW: 26,
    torsoH: 104, shoulderW: 92, waistW: 120, shoulderX: 40, shoulderInset: 14,
    upper: 52, fore: 50, armW: 22, hand: 14,
    hipX: 18, thigh: 60, shin: 58, legW: 24,
    eyeX: 33, eyeY: 10, eyeRx: 19, eyeRy: 24, pupil: 10, mouthY: 46, mouthW: 22,
    hairStyle: 'pigtails', accessory: 'bows', dress: true,
  },
};

export function basePose() {
  return {
    bob: 0, crouch: 0, lean: 0, breath: 0, sx: 1, sy: 1, hipDX: 0,
    turn: 0, headTilt: 0, headDX: 0, headDY: 0, hairFlop: 0, shoulderL: 0, shoulderR: 0,
    face: {
      brow: 0, browTilt: 0, lid: 0.12, lower: 0, pupil: 1, wide: 0, eyes: 'open',
      mouth: 'rest', open: 1, blush: 0.35, lookX: 0, lookY: 0, sweat: 0, shadesUp: 1, blink: 0,
    },
    arms: {
      L: { target: { x: -80, y: -190 }, grip: 'open', handRot: 0, hold: null, front: false, pole: null },
      R: { target: { x: 80, y: -190 }, grip: 'open', handRot: 0, hold: null, front: false, pole: null },
    },
    legs: { mode: 'stand', dir: 1, phase: 0, stride: 60, lift: 30, hidden: false },
  };
}

// Solve every joint of a pose into character-local positions.
export function solve(R, P) {
  const hipH = (R.thigh + R.shin) * 0.965 * (1 - P.crouch * 0.28);
  const hip = { x: P.hipDX, y: -hipH + P.bob };
  const br = 1 + 0.022 * P.breath;
  const T = (x, y) => v.add(hip, v.rot({ x, y: y * br }, P.lean));
  const ts = 1 - 0.16 * Math.abs(P.turn);
  const neckBase = T(P.turn * 7, -R.torsoH);
  const sh = {
    L: T(-R.shoulderX * ts + P.turn * 7, -R.torsoH + R.shoulderInset - P.shoulderL - P.breath * 1.5),
    R: T(R.shoulderX * ts + P.turn * 7, -R.torsoH + R.shoulderInset - P.shoulderR - P.breath * 1.5),
  };
  const headAng = P.lean * 0.7 + P.headTilt;
  const head = v.add(neckBase, v.add(v.rot({ x: 0, y: -R.neck - R.headRy * 0.8 }, P.lean * 0.5 + P.headTilt * 0.35), { x: P.headDX, y: P.headDY }));
  const J = { hip, neckBase, sh, head, headAng, br, hipH, T };
  // arms
  J.arms = {};
  for (const side of ['L', 'R']) {
    const A = P.arms[side];
    const sgn = side === 'L' ? -1 : 1;
    const s = sh[side];
    let tgt = typeof A.target === 'function' ? A.target(J) : A.target;
    const pole = A.pole ? (typeof A.pole === 'function' ? A.pole(J) : A.pole) : { x: s.x + sgn * 110, y: s.y + 150 };
    J.arms[side] = limitShoulder(solveLimb(s, tgt, R.upper, R.fore, pole), tgt, R.upper, R.fore, sgn, P.lean);
    J.arms[side].ang = Math.atan2(J.arms[side].hand.y - J.arms[side].elbow.y, J.arms[side].hand.x - J.arms[side].elbow.x) + (A.handRot || 0);
  }
  // legs
  J.legs = {};
  const Lg = P.legs;
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? -1 : 1;
    const hj = { x: hip.x + sgn * R.hipX, y: hip.y + 6 };
    let foot, pole;
    if (Lg.mode === 'walk' || Lg.mode === 'sneak') {
      const q = ((Lg.phase + (side === 'L' ? 0 : 0.5)) % 1 + 1) % 1;
      const S = Lg.stride;
      let fx, fy;
      if (q < 0.5) { fx = lerp(S / 2, -S / 2, q / 0.5); fy = 0; }
      else { const u = (q - 0.5) / 0.5; fx = lerp(-S / 2, S / 2, u * u * (3 - 2 * u)); fy = -Lg.lift * Math.sin(Math.PI * u); }
      foot = { x: sgn * R.hipX * 0.8 + fx * Lg.dir, y: fy };
      pole = { x: hj.x + Lg.dir * 160, y: hj.y + 60 };
    } else {
      foot = { x: sgn * R.hipX * 1.1, y: 0 };
      pole = { x: hj.x + sgn * 60, y: hj.y + 120 };
    }
    J.legs[side] = solveLimb(hj, foot, R.thigh, R.shin, pole);
  }
  return J;
}

// The sleeve is part of the torso, so the upper arm may only swing inside the range the sleeve
// opening can hide: never above the shoulder line (outward) and not far up across the chest.
// Angles are measured in the torso frame from straight down, + toward the arm's own side.
export const SHOULDER_RANGE = { out: 1.05, in: 0.95 };
export function limitShoulder(L, tgt, a, b, sgn, lean = 0) {
  const d = v.rot(v.sub(L.elbow, L.s), -lean);
  const phi = Math.atan2(sgn * d.x, d.y);
  const lim = clamp(phi, -SHOULDER_RANGE.in, SHOULDER_RANGE.out);
  if (lim === phi) return L;
  const dir = v.rot({ x: sgn * Math.sin(lim), y: Math.cos(lim) }, lean);
  const elbow = { x: L.s.x + dir.x * a, y: L.s.y + dir.y * a };
  const to = v.sub(tgt, elbow), n = v.len(to) || 1;
  const hand = { x: elbow.x + (to.x / n) * b, y: elbow.y + (to.y / n) * b };
  return { ...L, elbow, hand };
}

function solveLimb(s, t, a, b, pole) {
  const A = ik2(s, t, a, b, 1), B = ik2(s, t, a, b, -1);
  const da = Math.hypot(A.elbow.x - pole.x, A.elbow.y - pole.y), db = Math.hypot(B.elbow.x - pole.x, B.elbow.y - pole.y);
  const r = da <= db ? A : B;
  return { s, elbow: r.elbow, hand: r.hand, reach: r.reach };
}

/* ------------------------------------------------------------------ hands */
export function drawHand(g, R, p, ang, grip, side, skin = R.skin, shade = R.skinShade) {
  const r = R.hand, lw = LW * 0.9;
  g.save(); g.translate(p.x, p.y); g.rotate(ang);
  if (side === 'L') g.scale(1, -1);
  if (grip === 'open' || grip === 'droop' || grip === 'spread') {
    const spread = grip === 'spread' ? 0.75 : 0.42;
    const fl = grip === 'droop' ? 0.9 : 1.05;
    for (let i = 0; i < 4; i++) {
      const a = lerp(-spread, spread, i / 3) + (grip === 'droop' ? 0.5 : 0);
      const base = { x: r * 0.9, y: lerp(-r * 0.45, r * 0.5, i / 3) };
      const tip = { x: base.x + Math.cos(a) * r * fl, y: base.y + Math.sin(a) * r * fl };
      limb(g, [base, tip], r * 0.46, skin, null, lw);
    }
    cel(g, (q) => ellipse(q, r * 0.55, 0, r * 0.82, r * 0.78), skin, shade, (q) => ellipse(q, r * 0.75, r * 0.4, r * 0.8, r * 0.5), lw);
    // thumb
    limb(g, [{ x: r * 0.5, y: -r * 0.55 }, { x: r * 1.05, y: -r * 1.05 }], r * 0.42, skin, null, lw);
    g.beginPath(); ellipse(g, r * 0.55, 0, r * 0.62, r * 0.58); g.fillStyle = skin; g.fill();
  } else if (grip === 'point') {
    limb(g, [{ x: r * 1.0, y: -r * 0.25 }, { x: r * 2.2, y: -r * 0.3 }], r * 0.46, skin, null, lw);
    fist(g, r, skin, shade, lw);
  } else if (grip === 'flat') {
    cel(g, (q) => q.roundRect(-r * 0.2, -r * 0.7, r * 2.2, r * 1.4, r * 0.65), skin, shade, (q) => q.rect(-r, r * 0.2, r * 4, r), lw);
    g.beginPath(); for (let i = 1; i < 3; i++) { g.moveTo(r * 1.4, lerp(-r * 0.35, r * 0.35, i / 3)); g.lineTo(r * 1.95, lerp(-r * 0.35, r * 0.35, i / 3)); } stroke(g, lw * 0.6);
  } else {
    fist(g, r, skin, shade, lw, grip === 'pinch');
  }
  g.restore();
}
function fist(g, r, skin, shade, lw, pinch = false) {
  cel(g, (q) => q.roundRect(-r * 0.25, -r * 0.82, r * 1.75, r * 1.64, r * 0.72), skin, shade, (q) => q.rect(-r, r * 0.25, r * 4, r * 2), lw);
  g.beginPath();
  for (let i = 1; i < 3; i++) { const y = lerp(-r * 0.75, r * 0.75, i / 3); g.moveTo(r * 1.15, y); g.lineTo(r * 1.45, y); }
  stroke(g, lw * 0.6);
  // thumb wraps over the top
  cel(g, (q) => ellipse(q, r * 0.75, -r * 0.62, r * 0.62, r * 0.3, -0.15), skin, null, null, lw * 0.8);
  if (pinch) { g.beginPath(); ellipse(g, r * 1.62, -r * 0.55, r * 0.3, r * 0.3); fill(g, skin); stroke(g, lw * 0.7); }
}

/* ------------------------------------------------------------------- face */
function mouth(g, R, shape, open, k = 1) {
  const w = R.mouthW * k;
  const lwM = LW * 0.95;
  const dark = '#4a1218', tongue = '#e05c66', teeth = '#fbf6ee';
  const openShape = (build, depthTop = 0.35) => {
    g.beginPath(); build(g); fill(g, dark);
    g.save(); g.beginPath(); build(g); g.clip();
    g.beginPath(); ellipse(g, 0, w * 0.95, w * 0.75, w * 0.48); fill(g, tongue);
    g.beginPath(); g.rect(-w * 2, -w * 2, w * 4, w * 2 + w * depthTop); fill(g, teeth);
    g.restore();
    g.beginPath(); build(g); stroke(g, lwM);
  };
  switch (shape) {
    case 'smile':
      g.beginPath(); g.moveTo(-w, -5); g.quadraticCurveTo(0, 20, w, -5); stroke(g, lwM);
      g.beginPath(); g.moveTo(-w - 4, -9); g.lineTo(-w + 3, -2); g.moveTo(w + 4, -9); g.lineTo(w - 3, -2); stroke(g, lwM * 0.7);
      break;
    case 'smirk':
      g.beginPath(); g.moveTo(-w * 0.7, 3); g.quadraticCurveTo(w * 0.2, 12, w * 0.9, -9); stroke(g, lwM);
      g.beginPath(); g.moveTo(w * 0.85, -13); g.lineTo(w * 1.0, -4); stroke(g, lwM * 0.7);
      break;
    case 'frown':
      g.beginPath(); g.moveTo(-w * 0.65, 7); g.quadraticCurveTo(0, -7, w * 0.65, 7); stroke(g, lwM);
      break;
    case 'wobble':
      g.beginPath(); g.moveTo(-w * 0.7, 4);
      for (let i = 1; i <= 6; i++) g.lineTo(lerp(-w * 0.7, w * 0.7, i / 6), 4 + (i % 2 ? -4 : 3));
      stroke(g, lwM);
      break;
    case 'mbp':
      g.beginPath(); g.moveTo(-w * 0.55, 2); g.quadraticCurveTo(0, 6, w * 0.55, 2); stroke(g, lwM * 1.2);
      break;
    case 'chew':
      g.beginPath(); ellipse(g, 0, 2, w * 0.35, w * 0.16 * (0.5 + open)); fill(g, dark); stroke(g, lwM);
      break;
    case 'oh': {
      const ry = w * 0.5 * clamp(open, 0.3, 1.3), rx = w * 0.42;
      openShape((q) => ellipse(q, 0, 6, rx, ry), -0.1);
      break;
    }
    case 'shock': {
      openShape((q) => ellipse(q, 0, 10, w * 0.55, w * 0.85 * clamp(open, 0.5, 1.3)), 0.05);
      break;
    }
    case 'ee': {
      const d = w * 0.55 * clamp(open, 0.3, 1.2);
      openShape((q) => { q.moveTo(-w * 1.05, -3); q.quadraticCurveTo(0, 3, w * 1.05, -3); q.quadraticCurveTo(0, d * 1.8, -w * 1.05, -3); }, 0.25);
      break;
    }
    case 'laugh': {
      const d = w * 1.25 * clamp(open, 0.6, 1.3);
      openShape((q) => { q.moveTo(-w * 1.3, -8); q.quadraticCurveTo(0, 2, w * 1.3, -8); q.bezierCurveTo(w * 1.1, d * 1.15, -w * 1.1, d * 1.15, -w * 1.3, -8); }, 0.22);
      break;
    }
    case 'grin': {
      const b = (q) => { q.moveTo(-w * 1.15, -6); q.quadraticCurveTo(0, 2, w * 1.15, -6); q.quadraticCurveTo(0, w * 1.0, -w * 1.15, -6); };
      g.beginPath(); b(g); fill(g, teeth);
      g.beginPath(); g.moveTo(-w * 1.0, 4); g.quadraticCurveTo(0, 10, w * 1.0, 4); stroke(g, lwM * 0.6);
      g.beginPath(); b(g); stroke(g, lwM);
      break;
    }
    case 'ah':
    default: {
      if (shape === 'rest') { g.beginPath(); g.moveTo(-w * 0.6, 0); g.quadraticCurveTo(0, 9, w * 0.6, 0); stroke(g, lwM); break; }
      const d = w * 0.95 * clamp(open, 0.3, 1.3);
      openShape((q) => { q.moveTo(-w * 0.9, -2); q.quadraticCurveTo(0, 4, w * 0.9, -2); q.bezierCurveTo(w * 0.75, d * 1.25, -w * 0.75, d * 1.25, -w * 0.9, -2); }, 0.25);
    }
  }
}

function eyes(g, R, F, tx, turn) {
  for (const i of [-1, 1]) {
    const ex = i * R.eyeX * (1 - 0.2 * i * turn) + tx;
    const ey = R.eyeY;
    const rx = R.eyeRx * (1 - 0.28 * Math.max(0, i * turn)) * (1 + F.wide * 0.15);
    const ry = R.eyeRy * (1 + F.wide * 0.22);
    const lid = clamp(Math.max(F.lid, F.blink), 0, 1);
    if (F.eyes === 'happy') {
      g.beginPath(); g.moveTo(ex - rx, ey + 6); g.quadraticCurveTo(ex, ey - ry * 1.15, ex + rx, ey + 6); stroke(g, LW * 1.25);
      continue;
    }
    if (F.eyes === 'squeeze') {
      g.beginPath(); g.moveTo(ex - i * rx * 0.9, ey - ry * 0.6); g.lineTo(ex + i * rx * 0.7, ey); g.lineTo(ex - i * rx * 0.9, ey + ry * 0.6); stroke(g, LW * 1.25);
      continue;
    }
    if (lid > 0.9) {
      g.beginPath(); g.moveTo(ex - rx * 1.05, ey + 2); g.quadraticCurveTo(ex, ey + ry * 0.45, ex + rx * 1.05, ey + 2); stroke(g, LW * 1.2);
      continue;
    }
    const eb = (q) => ellipse(q, ex, ey, rx, ry);
    g.beginPath(); eb(g); fill(g, '#fffdf8');
    g.save(); g.beginPath(); eb(g); g.clip();
    const px = ex + F.lookX * rx * 0.48, py = ey + F.lookY * ry * 0.38;
    const pr = R.pupil * F.pupil;
    g.beginPath(); ellipse(g, px, py, pr, pr * 1.12); fill(g, '#18121a');
    g.beginPath(); ellipse(g, px - pr * 0.35, py - pr * 0.45, pr * 0.34, pr * 0.34); fill(g, '#ffffff');
    // upper lid
    const ly = ey - ry + 2 * ry * lid;
    if (lid > 0.02) {
      g.beginPath(); g.rect(ex - rx - 4, ey - ry - 6, rx * 2 + 8, ly - (ey - ry - 6)); fill(g, R.skin);
      g.beginPath(); g.moveTo(ex - rx - 2, ly); g.lineTo(ex + rx + 2, ly); stroke(g, LW * 1.1);
    }
    // lower lid (squint / smile)
    if (F.lower > 0.02) {
      const by = ey + ry - 2 * ry * F.lower * 0.6;
      g.beginPath(); g.moveTo(ex - rx - 4, ey + ry + 6); g.lineTo(ex - rx - 4, by + 4); g.quadraticCurveTo(ex, by - 6, ex + rx + 4, by + 4); g.lineTo(ex + rx + 4, ey + ry + 6); fill(g, R.skin);
      g.beginPath(); g.moveTo(ex - rx, by + 3); g.quadraticCurveTo(ex, by - 5, ex + rx, by + 3); stroke(g, LW * 0.6);
    }
    g.restore();
    g.beginPath(); eb(g); stroke(g, LW * 0.95);
    // lash flick
    g.beginPath(); g.moveTo(ex + i * rx * 0.85, ly - ry * 0.05 + (lid > 0.02 ? 0 : 3)); g.lineTo(ex + i * rx * 1.25, ly - ry * 0.25); stroke(g, LW * 0.7);
  }
  // brows
  for (const i of [-1, 1]) {
    const ex = i * R.eyeX * (1 - 0.2 * i * turn) + tx;
    const by = R.eyeY - R.eyeRy * (1 + F.wide * 0.22) - 12 - F.brow * 15;
    const inner = { x: ex - i * R.eyeRx * 0.85, y: by + F.browTilt * 11 };
    const outer = { x: ex + i * R.eyeRx * 1.05, y: by - F.browTilt * 4 + 3 };
    g.beginPath(); g.moveTo(inner.x, inner.y); g.quadraticCurveTo(ex, by - 7, outer.x, outer.y);
    stroke(g, LW * 1.9, R.hair);
  }
}

function hairBack(g, R, H, tx, flop) {
  const rx = R.headRx, ry = R.headRy;
  if (R.hairStyle === 'messy') {
    cel(g, (q) => { ellipse(q, tx * 0.1, -ry * 0.18, rx * 1.1, ry * 0.98); }, R.hair, null, null);
    // curly side locks behind the ears
    for (const i of [-1, 1]) {
      const bx = i * rx * 1.02 + tx * 0.15;
      g.beginPath(); g.moveTo(bx - i * 8, -ry * 0.2);
      g.bezierCurveTo(bx + i * 20, ry * 0.15 + flop * 4, bx - i * 6, ry * 0.4, bx + i * 10, ry * 0.62 + flop * 6);
      stroke(g, LW * 3.2, INK); stroke(g, LW * 1.6, R.hair);
    }
  } else if (R.hairStyle === 'pigtails') {
    cel(g, (q) => ellipse(q, tx * 0.1, -ry * 0.12, rx * 1.06, ry * 0.98), R.hair, null, null);
    for (const i of [-1, 1]) {
      const base = { x: i * rx * 0.92 + tx * 0.1, y: -ry * 0.62 };
      const sw = Math.sin(flop) * 0.6 + i * 0.25;
      const tip = { x: base.x + i * 46 + Math.sin(sw) * 28, y: base.y + 36 + Math.cos(sw) * 8 };
      cel(g, (q) => { q.moveTo(base.x, base.y - 20); q.quadraticCurveTo(tip.x + i * 30, base.y - 30, tip.x, tip.y); q.quadraticCurveTo(base.x + i * 18, base.y + 34, base.x, base.y + 18); q.closePath(); }, R.hair, R.hairHi, (q) => ellipse(q, base.x + i * 22, base.y - 12, 14, 7, -0.3));
      // bow
      g.save(); g.translate(base.x + i * 4, base.y - 6); g.rotate(i * 0.3);
      for (const s of [-1, 1]) cel(g, (q) => { q.moveTo(0, 0); q.lineTo(s * 22, -12); q.quadraticCurveTo(s * 28, 0, s * 22, 12); q.closePath(); }, R.bow, '#8a2fa0', (q) => q.rect(-40, 3, 80, 20), LW * 0.8);
      cel(g, (q) => ellipse(q, 0, 0, 7, 7), R.bow, null, null, LW * 0.8);
      g.restore();
    }
  }
}

function hairFront(g, R, tx, flop) {
  const rx = R.headRx, ry = R.headRy;
  if (R.hairStyle === 'messy') {
    const f = tx * 0.55;
    const cap = (q) => {
      q.moveTo(-rx * 1.04, -ry * 0.02);
      q.bezierCurveTo(-rx * 1.12, -ry * 0.95, -rx * 0.4, -ry * 1.18, f, -ry * 1.12);
      q.bezierCurveTo(rx * 0.55, -ry * 1.16, rx * 1.12, -ry * 0.9, rx * 1.04, -ry * 0.02);
      // fringe: wavy chunks over the forehead
      q.quadraticCurveTo(rx * 0.95, -ry * 0.34, rx * 0.72 + f * 0.3, -ry * 0.42);
      q.quadraticCurveTo(rx * 0.55 + f, -ry * 0.25, rx * 0.38 + f, -ry * 0.48);
      q.quadraticCurveTo(rx * 0.15 + f, -ry * 0.3, -rx * 0.05 + f, -ry * 0.52);
      q.quadraticCurveTo(-rx * 0.3 + f, -ry * 0.32, -rx * 0.48 + f, -ry * 0.5);
      q.quadraticCurveTo(-rx * 0.75 + f * 0.6, -ry * 0.36, -rx * 0.86, -ry * 0.42);
      q.quadraticCurveTo(-rx * 0.98, -ry * 0.3, -rx * 1.04, -ry * 0.02);
      q.closePath();
    };
    cel(g, cap, R.hair, R.hairHi, (q) => { q.moveTo(-rx * 0.6, -ry * 0.95); q.quadraticCurveTo(-rx * 0.1 + f, -ry * 1.15, rx * 0.3 + f, -ry * 1.0); q.quadraticCurveTo(-rx * 0.1 + f, -ry * 1.04, -rx * 0.6, -ry * 0.88); q.closePath(); });
    // a few loose strands on top (secondary motion)
    for (const [x0, len, a] of [[-0.28, 20, -0.9], [0.05, 24, -0.2], [0.34, 18, 0.5]]) {
      const b = { x: rx * x0 + f, y: -ry * 1.08 };
      const ang = -Math.PI / 2 + a + flop * 0.5;
      const tip = { x: b.x + Math.cos(ang) * len, y: b.y + Math.sin(ang) * len };
      g.beginPath(); g.moveTo(b.x - 10, b.y + 8); g.bezierCurveTo(b.x - 14, tip.y + 4, tip.x + 12, tip.y - 8, tip.x + 4, tip.y + 6); g.quadraticCurveTo(b.x + 2, b.y - 2, b.x + 12, b.y + 8); g.closePath();
      fill(g, R.hair); stroke(g, LW * 0.85);
    }
  } else if (R.hairStyle === 'pigtails') {
    const f = tx * 0.55;
    const cap = (q) => {
      q.moveTo(-rx * 1.03, -ry * 0.05);
      q.bezierCurveTo(-rx * 1.1, -ry * 1.0, rx * 1.1, -ry * 1.0, rx * 1.03, -ry * 0.05);
      q.lineTo(rx * 0.86, -ry * 0.3);
      // straight bangs with a centre part
      q.quadraticCurveTo(rx * 0.5 + f, -ry * 0.28, rx * 0.1 + f, -ry * 0.62);
      q.quadraticCurveTo(-rx * 0.4 + f, -ry * 0.3, -rx * 0.86, -ry * 0.3);
      q.closePath();
    };
    cel(g, cap, R.hair, R.hairHi, (q) => ellipse(q, -rx * 0.35 + f, -ry * 0.82, rx * 0.35, ry * 0.08, -0.2));
  }
}

function shades(g, R, tx, up, turn) {
  // round gold-rim sunglasses: up=1 parked on the hair, up=0 over the eyes
  const y = lerp(R.eyeY + 2, -R.headRy * 0.78, up);
  const s = lerp(1.18, 0.82, up);
  const cx = tx * lerp(1, 0.55, up);
  for (const i of [-1, 1]) {
    const ex = cx + i * R.eyeX * s * (1 - 0.18 * i * turn);
    g.beginPath(); ellipse(g, ex, y, 24 * s, 24 * s); fill(g, '#141022');
    g.save(); g.beginPath(); ellipse(g, ex, y, 24 * s, 24 * s); g.clip();
    g.beginPath(); ellipse(g, ex - 9 * s, y - 9 * s, 7 * s, 4 * s, -0.6); fill(g, 'rgba(255,255,255,0.35)');
    g.restore();
    g.beginPath(); ellipse(g, ex, y, 24 * s, 24 * s); stroke(g, LW * 2.4, INK); stroke(g, LW * 1.0, '#e2b23c');
  }
  g.beginPath(); g.moveTo(cx - R.eyeX * s + 22 * s, y - 4 * s); g.quadraticCurveTo(cx, y - 14 * s, cx + R.eyeX * s - 22 * s, y - 4 * s);
  stroke(g, LW * 2, INK); stroke(g, LW * 0.8, '#e2b23c');
  // temples
  for (const i of [-1, 1]) {
    g.beginPath(); g.moveTo(cx + i * (R.eyeX * s + 23 * s), y - 2); g.lineTo(i * R.headRx * 0.98, y + lerp(-6, 10, up));
    stroke(g, LW * 1.6, INK); stroke(g, LW * 0.6, '#e2b23c');
  }
}

export function drawHead(g, R, P, J) {
  const F = P.face, rx = R.headRx, ry = R.headRy;
  const turn = clamp(P.turn, -1, 1);
  const tx = turn * rx * 0.3;
  g.save(); g.translate(J.head.x, J.head.y); g.rotate(J.headAng);
  hairBack(g, R, J.head, tx, P.hairFlop);
  // ears
  for (const i of [-1, 1]) {
    const ex = i * rx * 0.97 + tx * 0.2;
    const vis = 1 - 0.55 * Math.max(0, i * turn);
    cel(g, (q) => ellipse(q, ex, 8, 16 * vis, 20), R.skin, R.skinShade, (q) => ellipse(q, ex + i * 3, 10, 7 * vis, 11));
  }
  const face = (q) => {
    q.moveTo(-rx, 0);
    q.ellipse(0, 0, rx, ry, 0, Math.PI, TAU);
    q.bezierCurveTo(rx, ry * 0.62, rx * 0.5 + tx * 0.3, ry * 1.0, tx * 0.35, ry * 1.0);
    q.bezierCurveTo(-rx * 0.5 + tx * 0.3, ry * 1.0, -rx, ry * 0.62, -rx, 0);
    q.closePath();
  };
  cel(g, face, R.skin, R.skinShade, (q) => {
    // cheek shadow on the side away from the light + a band under the hair
    q.rect(-rx * 2, -ry * 2, rx * 4, ry * 4);
    q.ellipse(-rx * 0.12 + tx * 0.25, -ry * 0.12, rx * 0.98, ry * 1.05, 0, 0, TAU);
    // under-fringe shadow
    q.moveTo(-rx, -ry * 0.42); q.quadraticCurveTo(tx * 0.5, -ry * 0.22, rx, -ry * 0.42); q.lineTo(rx, -ry * 1.2); q.lineTo(-rx, -ry * 1.2); q.closePath();
    return 'evenodd';
  });
  // blush
  if (F.blush > 0.01) {
    g.globalAlpha = clamp(F.blush, 0, 1) * 0.55;
    for (const i of [-1, 1]) { g.beginPath(); ellipse(g, i * R.eyeX * 1.25 + tx, R.eyeY + R.eyeRy + 14, 15, 8); fill(g, R.blush); }
    g.globalAlpha = 1;
  }
  eyes(g, R, F, tx, turn);
  // nose
  g.beginPath(); g.moveTo(tx * 1.15 - 5, 28); g.quadraticCurveTo(tx * 1.15 + 6, 36, tx * 1.15 - 2, 40); stroke(g, LW * 0.8);
  // mouth
  g.save(); g.translate(tx * 1.1, R.mouthY); mouth(g, R, F.mouth, F.open, 1); g.restore();
  hairFront(g, R, tx, P.hairFlop);
  if (R.accessory === 'shades') shades(g, R, tx, F.shadesUp, turn);
  // sweat drop
  if (F.sweat > 0.02) {
    const sx = rx * 0.82 + tx * 0.3, sy = -ry * 0.35 + (1 - F.sweat) * 10;
    g.globalAlpha = clamp(F.sweat, 0, 1);
    cel(g, (q) => { q.moveTo(sx, sy - 22); q.quadraticCurveTo(sx + 14, sy, sx, sy + 8); q.quadraticCurveTo(sx - 14, sy, sx, sy - 22); }, '#bfe6ff', null, null, LW * 0.7);
    g.globalAlpha = 1;
  }
  g.restore();
}

/* ------------------------------------------------------------ body pieces */
function drawTorso(g, R, P, J) {
  const H = R.torsoH, hw = R.shoulderW / 2, ww = R.waistW / 2;
  const tx = P.turn * 12;
  g.save(); g.translate(J.hip.x, J.hip.y); g.rotate(P.lean); g.scale(1, J.br);
  let build;
  if (R.dress) {
    build = (q) => {
      q.moveTo(-hw * 0.5 + tx, -H - 2);
      q.quadraticCurveTo(-hw, -H, -hw - 2, -H + 22);
      q.lineTo(-ww * 1.15, 8); q.quadraticCurveTo(0, 22, ww * 1.15, 8);
      q.lineTo(hw + 2, -H + 22); q.quadraticCurveTo(hw, -H, hw * 0.5 + tx, -H - 2);
      q.quadraticCurveTo(tx, -H + 16, -hw * 0.5 + tx, -H - 2); q.closePath();
    };
  } else {
    build = (q) => {
      q.moveTo(-hw * 0.5 + tx, -H - 2);
      q.quadraticCurveTo(-hw, -H + 2, -hw - 4, -H + 32);
      q.lineTo(-ww - 6, -12); q.quadraticCurveTo(-ww - 4, 8, -ww + 12, 8);
      q.lineTo(ww - 12, 8); q.quadraticCurveTo(ww + 4, 8, ww + 6, -12);
      q.lineTo(hw + 4, -H + 32); q.quadraticCurveTo(hw, -H + 2, hw * 0.5 + tx, -H - 2);
      q.quadraticCurveTo(tx, -H + 20, -hw * 0.5 + tx, -H - 2); q.closePath();
    };
  }
  cel(g, build, R.top, R.topShade, (q) => {
    q.moveTo(ww * 0.42 + tx * 0.6, -H); q.lineTo(hw + 20, -H); q.lineTo(ww * 1.3, 30); q.lineTo(ww * 0.2 + tx * 0.3, 30);
    q.quadraticCurveTo(ww * 0.55, -H * 0.5, ww * 0.42 + tx * 0.6, -H); q.closePath();
    // shadow under the collar
    q.moveTo(-hw * 0.5 + tx, -H); q.quadraticCurveTo(tx, -H + 34, hw * 0.5 + tx, -H); q.closePath();
  });
  // collar band
  g.beginPath(); g.moveTo(-hw * 0.5 + tx, -H - 2); g.quadraticCurveTo(tx, -H + 20, hw * 0.5 + tx, -H - 2); stroke(g, LW * 1.6, INK);
  if (R.topText) {
    g.save(); g.beginPath(); build(g); g.clip();
    g.translate(tx * 1.2 - 4, -H * 0.5); g.rotate(-0.06); g.scale(1 - Math.abs(P.turn) * 0.2, 1);
    g.font = '26px Lucky'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = R.topTextCol; g.globalAlpha = 0.9;
    g.fillText(R.topText.split(' ')[0], 0, -12); g.fillText(R.topText.split(' ').slice(1).join(' '), 6, 16);
    g.restore();
  }
  if (!R.dress) {
    // fold line on the belly, sells the cloth
    g.beginPath(); g.moveTo(-ww * 0.5, -22); g.quadraticCurveTo(-ww * 0.2, -14, 0, -20); stroke(g, LW * 0.6);
  }
  g.restore();
}

function drawNeck(g, R, P, J) {
  const nb = J.neckBase, h = J.head;
  const top = { x: lerp(nb.x, h.x, 0.6), y: lerp(nb.y, h.y, 0.6) };
  limb(g, [{ x: nb.x, y: nb.y + 6 }, top], R.neckW, R.skin, R.skinShade, LW * 0.9);
}

function drawLegs(g, R, P, J) {
  for (const side of ['L', 'R']) {
    const Lg = J.legs[side];
    const pts = [Lg.s, Lg.elbow, Lg.hand];
    if (R.dress) limb(g, pts, R.legW, R.skin, R.skinShade);
    else limb(g, pts, R.legW, R.bottom, R.bottomShade);
    const dir = P.legs.mode === 'stand' ? (side === 'L' ? -1 : 1) * 0.4 : P.legs.dir;
    cel(g, (q) => ellipse(q, Lg.hand.x + dir * 12, Lg.hand.y + 4, R.legW * 0.82, R.legW * 0.42), R.foot, R.footShade, (q) => q.rect(Lg.hand.x - 60, Lg.hand.y + 4, 120, 30), LW);
  }
  if (!R.dress) {
    // pants seat joins both legs under the shirt hem
    cel(g, (q) => q.roundRect(J.hip.x - R.waistW / 2 + 4, J.hip.y - 14, R.waistW - 8, 44, 16), R.bottom, R.bottomShade, (q) => q.rect(J.hip.x + 10, J.hip.y - 20, 200, 80));
  }
}

/* ------------------------------------------------------- sleeves + arms */
// Sleeves are part of the torso drawing: a short tube hung off the shoulder line, in the torso's
// frame (it follows lean, breath and shrugs and swings only a little with the arm). The arm
// starts under it, so the shoulder joint is never on screen. Drawn after the torso, and again
// after its own arm so the arm root always tucks inside.
export function sleeveGeom(R, P, J, side) {
  const sgn = side === 'L' ? -1 : 1, H = R.torsoH, hw = R.shoulderW / 2, tx = P.turn * 12;
  const ts = 1 - 0.16 * Math.abs(P.turn);
  const j0 = { x: sgn * R.shoulderX * ts + P.turn * 7, y: -H + R.shoulderInset - (side === 'L' ? P.shoulderL : P.shoulderR) - P.breath * 1.5 };
  // how far the upper arm is swung, in the torso frame (+ = outward)
  const S = J.arms[side], d = v.rot(v.sub(S.elbow, S.s), -P.lean);
  const phi = Math.atan2(sgn * d.x, d.y);
  const th0 = R.dress ? 0.42 : 0.32;
  const th = th0 + clamp((phi - th0) * 0.3, -0.22, 0.24);
  const u = { x: sgn * Math.sin(th), y: Math.cos(th) }, n = { x: sgn * Math.cos(th), y: -Math.sin(th) };
  const Ls = R.upper * (R.dress ? 0.46 : 0.52);
  const wr = R.armW * (R.dress ? 0.8 : 0.76), wh = R.armW * (R.dress ? 0.92 : 0.8);
  const at = (a, b) => ({ x: j0.x + u.x * a + n.x * b, y: j0.y + u.y * a + n.y * b });
  // shoulder line: a point on the torso's own top curve, so the slope runs on unbroken
  const q = 0.42, A0 = { x: sgn * hw * 0.5 + tx, y: -H - 2 }, C0 = { x: sgn * hw, y: -H + (R.dress ? 0 : 2) }, B0 = { x: sgn * (hw + (R.dress ? 2 : 4)), y: -H + (R.dress ? 22 : 32) };
  const Ti = { x: (1 - q) ** 2 * A0.x + 2 * (1 - q) * q * C0.x + q * q * B0.x, y: (1 - q) ** 2 * A0.y + 2 * (1 - q) * q * C0.y + q * q * B0.y };
  const To = at(-wr * 0.32, wr), Ho = at(Ls, wh), Hi = at(Ls, -wh), Ai = at(wr * 0.35, -wr * 0.95);
  const Tc = { x: lerp(Ti.x, To.x, 0.55), y: lerp(Ti.y, To.y, 0.35) - 1 };
  return { j0, u, n, th, Ls, wr, wh, Ti, To, Ho, Hi, Ai, Tc, at };
}

function sleevePath(q, G) {
  const { Ti, To, Ho, Hi, Ai, Tc, at, Ls, wr, wh } = G;
  q.moveTo(Ti.x, Ti.y);
  q.quadraticCurveTo(Tc.x, Tc.y, To.x, To.y);
  const co = at(Ls * 0.45, wr * 1.06); q.quadraticCurveTo(co.x, co.y, Ho.x, Ho.y);
  const ch = at(Ls + 3, 0); q.quadraticCurveTo(ch.x, ch.y, Hi.x, Hi.y);
  const ci = at(Ls * 0.45, -wh * 1.0); q.quadraticCurveTo(ci.x, ci.y, Ai.x, Ai.y);
  q.quadraticCurveTo(lerp(Ai.x, Ti.x, 0.5), lerp(Ai.y, Ti.y, 0.5) + 6, Ti.x, Ti.y);
  q.closePath();
}

export function drawSleeve(g, R, P, J, side, { avoidHead = false } = {}) {
  const G = sleeveGeom(R, P, J, side), sgn = side === 'L' ? -1 : 1;
  g.save();
  if (avoidHead) { // never paint over the chin when a big head dips toward the shoulders
    g.beginPath(); g.rect(-4000, -4000, 8000, 8000);
    g.ellipse(J.head.x, J.head.y, R.headRx * 1.02, R.headRy * 1.02, J.headAng, 0, TAU);
    g.clip('evenodd');
  }
  g.translate(J.hip.x, J.hip.y); g.rotate(P.lean); g.scale(1, J.br);
  const { at, Ls, wh } = G;
  cel(g, (q) => sleevePath(q, G), R.top, R.topShade, (q) => {
    // underside of the sleeve + a soft band inside the hem
    const a = at(Ls * 0.2, sgn > 0 ? wh * 0.2 : -wh * 0.2), b = at(Ls + 6, sgn > 0 ? wh * 1.3 : -wh * 1.3);
    q.moveTo(a.x, a.y); const c = at(Ls * 0.2, sgn > 0 ? wh * 1.5 : -wh * 1.5); q.lineTo(c.x, c.y); q.lineTo(b.x, b.y);
    const d2 = at(Ls + 6, sgn > 0 ? -wh * 0.3 : wh * 0.3); q.lineTo(d2.x, d2.y); q.closePath();
  }, 0);
  // outline: full weight on the outside, a light seam where the sleeve meets the chest
  g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK;
  const { Ti, To, Ho, Hi, Ai, Tc } = G;
  g.beginPath(); g.moveTo(Ti.x, Ti.y); g.quadraticCurveTo(Tc.x, Tc.y, To.x, To.y);
  let c = at(Ls * 0.45, G.wr * 1.06); g.quadraticCurveTo(c.x, c.y, Ho.x, Ho.y);
  c = at(Ls + 3, 0); g.quadraticCurveTo(c.x, c.y, Hi.x, Hi.y);
  g.lineWidth = LW; g.stroke();
  g.beginPath(); g.moveTo(Hi.x, Hi.y); c = at(Ls * 0.45, -wh); g.quadraticCurveTo(c.x, c.y, Ai.x, Ai.y);
  g.lineWidth = LW * 0.55; g.stroke();
  g.restore();
}

// One continuous tapered arm: thick at the sleeve, thin at the wrist, the elbow a smooth bend
// with no bulge. The root (inside the sleeve) is shaded so it reads as tucked in.
export function taperArm(g, S, E, W, w0, w1, fill, shadeCol, lw = LW, rootShade = 0) {
  const a = Math.hypot(E.x - S.x, E.y - S.y) || 1e-3, b = Math.hypot(W.x - E.x, W.y - E.y) || 1e-3;
  const r = Math.min(a, b) * 0.42;
  const P0 = { x: E.x + (S.x - E.x) * r / a, y: E.y + (S.y - E.y) * r / a }, P2 = { x: E.x + (W.x - E.x) * r / b, y: E.y + (W.y - E.y) * r / b };
  const pts = [];
  const N = 22;
  for (let i = 0; i <= N; i++) { const k = i / N; pts.push({ x: lerp(S.x, P0.x, k), y: lerp(S.y, P0.y, k) }); }
  for (let i = 1; i <= N; i++) { const k = i / N, m = 1 - k; pts.push({ x: m * m * P0.x + 2 * m * k * E.x + k * k * P2.x, y: m * m * P0.y + 2 * m * k * E.y + k * k * P2.y }); }
  for (let i = 1; i <= N; i++) { const k = i / N; pts.push({ x: lerp(P2.x, W.x, k), y: lerp(P2.y, W.y, k) }); }
  let tot = 0; const sAt = [0]; for (let i = 1; i < pts.length; i++) { tot += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); sAt.push(tot); }
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let nx = -(p.y - o.y), ny = p.x - o.x; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    const k = sAt[i] / tot, w = lerp(w0, w1, k * k * 0.35 + k * 0.65) / 2;
    left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w }); right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
  }
  const outline = (q) => {
    q.moveTo(left[0].x, left[0].y); for (const p of left) q.lineTo(p.x, p.y);
    const e = pts[pts.length - 1], lw2 = w1 / 2, ang = Math.atan2(e.y - pts[pts.length - 2].y, e.x - pts[pts.length - 2].x);
    q.arc(e.x, e.y, lw2, ang - Math.PI / 2, ang + Math.PI / 2);
    for (let i = right.length - 1; i >= 0; i--) q.lineTo(right[i].x, right[i].y);
    q.closePath();
  };
  // cel shadow: the half of the arm away from the light (top-left), as a band along one side
  cel(g, outline, fill, shadeCol, (q) => {
    const side = [];
    for (let i = 0; i < pts.length; i++) {
      const L2 = left[i], R2 = right[i], dl = L2.x * 0.6 + L2.y * 0.8, dr = R2.x * 0.6 + R2.y * 0.8;
      const far = dl > dr ? L2 : R2;
      side.push({ x: lerp(pts[i].x, far.x, 0.25), y: lerp(pts[i].y, far.y, 0.25), fx: far.x * 2 - pts[i].x, fy: far.y * 2 - pts[i].y });
    }
    q.moveTo(side[0].x, side[0].y); for (const p of side) q.lineTo(p.x, p.y);
    for (let i = side.length - 1; i >= 0; i--) q.lineTo(side[i].fx, side[i].fy);
    q.closePath();
  }, lw);
  if (rootShade > 0) { // the part just out of the sleeve sits in its shadow
    g.save(); g.beginPath(); outline(g); g.clip();
    let k = 0; while (k < pts.length - 1 && sAt[k] < rootShade) k++;
    const e = pts[k], gr = g.createLinearGradient(S.x, S.y, e.x, e.y);
    gr.addColorStop(0, 'rgba(70,30,20,0.55)'); gr.addColorStop(0.72, 'rgba(70,30,20,0.38)'); gr.addColorStop(1, 'rgba(70,30,20,0)');
    g.fillStyle = gr; g.fillRect(-5000, -5000, 10000, 10000);
    g.restore();
  }
}

function drawArm(g, R, P, J, side, t, drawProp) {
  const A = P.arms[side], S = J.arms[side];
  // start the arm inside the sleeve: no round cap at the shoulder, ever
  const d = v.sub(S.elbow, S.s), L = v.len(d) || 1;
  const s0 = { x: S.s.x + (d.x / L) * R.armW * 0.25, y: S.s.y + (d.y / L) * R.armW * 0.25 };
  const G = sleeveGeom(R, P, J, side);
  taperArm(g, s0, S.elbow, S.hand, R.armW * 1.08, R.armW * 0.8, R.skin, R.skinShade, LW, G.Ls * 1.12 + 8);
  if (A.hold && drawProp) drawProp(g, A.hold, S.hand, S.ang, side, t, A);
  drawHand(g, R, S.hand, S.ang, A.grip, side);
  if (A.hold && A.hold.over && drawProp) drawProp(g, A.hold, S.hand, S.ang, side, t, A, true);
}

// Arm, then its sleeve over the arm root, then the forearm + hand again on top (clipped to a
// capsule around the forearm), so a forearm folded back across the chest is never swallowed
// by its own sleeve. The redraw paints identical pixels, so it leaves no seam.
export function forearmClip(g, E, W, rad, from = 0.3) {
  const a = { x: lerp(E.x, W.x, from), y: lerp(E.y, W.y, from) };
  const ang = Math.atan2(W.y - a.y, W.x - a.x);
  g.beginPath();
  g.arc(W.x, W.y, rad * 1.9, ang - Math.PI / 2, ang + Math.PI / 2);
  g.lineTo(a.x + Math.cos(ang - Math.PI / 2) * rad, a.y + Math.sin(ang - Math.PI / 2) * rad);
  g.lineTo(a.x + Math.cos(ang + Math.PI / 2) * rad, a.y + Math.sin(ang + Math.PI / 2) * rad);
  g.closePath(); g.clip();
}
export function armAndSleeve(g, J, side, rad, drawArmFn, drawSleeveFn) {
  drawArmFn(); drawSleeveFn();
  const S = J.arms[side];
  g.save(); forearmClip(g, S.elbow, S.hand, rad); drawArmFn(); g.restore();
}

// pass: 'body' (everything behind the counter line) or 'front' (arms flagged front).
export function drawCharacter(g, R, P, J, { pass = 'body', t = 0, drawProp = null } = {}) {
  if (pass === 'body') {
    if (!P.legs.hidden) drawLegs(g, R, P, J);
    for (const s of ['L', 'R']) if (P.arms[s].behind) drawArm(g, R, P, J, s, t, drawProp);
    drawNeck(g, R, P, J);
    drawTorso(g, R, P, J);
    for (const s of ['L', 'R']) drawSleeve(g, R, P, J, s);
    drawHead(g, R, P, J);
    for (const s of ['L', 'R']) if (!P.arms[s].front && !P.arms[s].behind) armAndSleeve(g, J, s, R.armW * 0.9, () => drawArm(g, R, P, J, s, t, drawProp), () => drawSleeve(g, R, P, J, s, { avoidHead: true }));
  } else {
    for (const s of ['L', 'R']) if (P.arms[s].front) armAndSleeve(g, J, s, R.armW * 0.9, () => drawArm(g, R, P, J, s, t, drawProp), () => drawSleeve(g, R, P, J, s, { avoidHead: true }));
  }
}

// Back view for over-the-shoulder shots: shoulders + back of the head.
export function drawBack(g, R, P, J) {
  const H = R.torsoH, hw = R.shoulderW / 2, ww = R.waistW / 2;
  g.save(); g.translate(J.hip.x, J.hip.y); g.rotate(P.lean);
  cel(g, (q) => {
    q.moveTo(-hw * 0.5, -H - 4); q.quadraticCurveTo(-hw - 10, -H, -hw - 14, -H + 40); q.lineTo(-ww - 20, 40); q.lineTo(ww + 20, 40);
    q.lineTo(hw + 14, -H + 40); q.quadraticCurveTo(hw + 10, -H, hw * 0.5, -H - 4); q.closePath();
  }, R.top, R.topShade, (q) => q.rect(0, -H - 10, hw * 2, H * 2));
  g.restore();
  limb(g, [J.neckBase, { x: J.head.x, y: J.head.y + R.headRy * 0.6 }], R.neckW, R.skin, R.skinShade);
  g.save(); g.translate(J.head.x, J.head.y); g.rotate(J.headAng);
  for (const i of [-1, 1]) cel(g, (q) => ellipse(q, i * R.headRx * 0.98, 10, 15, 20), R.skin, R.skinShade, (q) => ellipse(q, i * R.headRx, 12, 6, 10));
  cel(g, (q) => { ellipse(q, 0, -R.headRy * 0.08, R.headRx * 1.06, R.headRy * 1.0); }, R.hair, R.hairHi, (q) => ellipse(q, -R.headRx * 0.35, -R.headRy * 0.6, R.headRx * 0.4, R.headRy * 0.16, -0.4));
  if (R.accessory === 'shades') { g.beginPath(); g.moveTo(-R.headRx * 1.0, -2); g.quadraticCurveTo(0, 14, R.headRx * 1.0, -2); stroke(g, LW * 1.6, INK); stroke(g, LW * 0.6, '#e2b23c'); }
  g.restore();
}
