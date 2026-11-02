// rigpop-motion v3 · hybrid image rig: AI-painted parts driven by the v2 skeleton.
//
// The v2 solver (IK arms and legs, lean, breath, head tilt/turn, visemes, blinks) is untouched.
// This module only replaces how a solved pose is *drawn*:
//
//   torso, head (front / 3-4), hands, feet ........ rigid sprites placed on the joints
//   upper arm + forearm, thigh + shin ............. one straight strip per limb, built from the
//                                                   two parts (parent trimmed at the joint, child's
//                                                   cap tucked under it), then *bent* along the IK
//                                                   chain slice by slice, so an image elbow or knee
//                                                   bends smoothly with no seam and nothing detaches
//   eyes, mouth ................................... painted patches pasted on a blank-faced head
//   brows, nose, blush, sweat, neck ............... thin vector ink, same as v2
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { INK, LW, limb, ellipse, stroke, fill, cel } from '../v2/ink.mjs';
import { clamp, lerp, v } from '../v2/util.mjs';
import { RIGS, armAndSleeve } from '../v2/rig.mjs';

const RES = 2.4; // strip pixels per rig unit (ECU shots run at ~3x zoom)
// which patch a v2 mouth shape asks for (\`open\` scales it at draw time)
const MOUTH_TAG = {
  oh: 'A', shock: 'A', laugh: 'A', chew: 'M', mbp: 'M', ee: 'E', grin: 'E',
  rest: 'rest', smile: 'rest', smirk: 'rest', frown: 'rest', wobble: 'rest',
};

// a character whose rig borrows another character's part files has no art of its own: the puppet
// assembled from those files would draw SOMEBODY ELSE on screen. Such a rig is pose-only — it may
// only ever be drawn from its pose packs, and drawImageCharacter falls back to its default pack.
function borrowsParts(rig) {
  const own = Object.values(rig.parts).map((p) => String(p.file || ''));
  return rig.poseOnly === true || own.some((f) => f.startsWith('..'));
}

export async function loadImageRig(dir) {
  const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json'), 'utf8'));
  const img = {};
  for (const [k, p] of Object.entries(rig.parts)) img[k] = await loadImage(fs.readFileSync(path.join(dir, p.file)));
  const base = RIGS[rig.base];
  if (!base) throw new Error(`${dir}: rig.json base "${rig.base}" is not a v2 rig`);
  const IR = { dir, rig, img, packs: {} };
  // Map the measured proportions onto a copy of the v2 skeleton: bones keep their v2 lengths
  // (every v2 action was tuned on them), shoulders move to where the painted torso has them.
  const T = rig.parts.torso;
  const kT = (base.torsoH + 10) / (T.hem - T.shirtTop);
  const shX = ((T.shoulderR.x - T.shoulderL.x) / 2) * kT;
  const SL = T.sleeves; // sleeves painted into the torso (src/v3/sleeves.mjs) pick the joints
  const R = {
    ...base, image: IR,
    skin: rig.skin, skinShade: rig.skinShade,
    shoulderX: SL ? shX : clamp(shX, base.shoulderX * 0.75, base.shoulderX * 1.25),
    shoulderInset: SL ? (T.shoulderL.y - T.shirtTop) * kT : clamp((T.shoulderL.y - T.shirtTop) * kT, 8, 40),
  };
  if (SL) { IR.sleeves = await loadImage(fs.readFileSync(path.join(dir, SL.file))); IR.body = await loadImage(fs.readFileSync(path.join(dir, SL.body))); IR.sleeveLen = SL.lengthPx * kT; }
  IR.kT = kT; IR.R = R;
  { // standing height of the puppet (ground to top of hair), so pose packs come in at the same size
    const { basePose, solve } = await import('../v2/rig.mjs');
    const J = solve(R, basePose()), f = rig.parts['head.front'].face, k = R.headRx / f.rx;
    IR.standH = -(J.head.y - f.cy * k);
  }
  // painted limbs come out at their own thickness: fit each segment's width to the v2
  // silhouette (sleeves a bit fuller than the bare forearm), lengths to the v2 bones
  const armW = R.armW + 2 * LW, legW = (R.legW + 2 * LW) * 1.15;
  // one continuous skin strip from the sleeve to the wrist (no upper-arm sleeve part, no bulge)
  IR.arm = SL ? buildArmStrip(IR, 'forearm', R.upper, R.fore, SL.armRoot, IR.sleeveLen)
    : buildStrip(IR, 'upperArm', 'forearm', R.upper, R.fore, armW * 1.4, armW);
  IR.leg = buildStrip(IR, 'thigh', 'shin', R.thigh, R.shin, legW, legW);
  // back view (over-the-shoulder shots): the painted silhouettes, flat-filled and re-inked
  IR.backHead = silhouette(img['head.front'], rig.hair);
  IR.backTorso = silhouette(img.torso, base.top);
  // pose packs
  const pd = path.join(dir, 'poses');
  if (fs.existsSync(pd)) for (const a of fs.readdirSync(pd)) {
    const f = path.join(pd, a, 'pack.json'); if (!fs.existsSync(f)) continue;
    const pack = JSON.parse(fs.readFileSync(f, 'utf8'));
    pack.img = []; for (const k of pack.keys) pack.img.push(await loadImage(fs.readFileSync(path.join(pd, a, k.file))));
    // face patches (tools/face-patches.mjs): blinks and lip-sync for a drawn pose
    pack.face = []; for (const k of pack.keys) {
      const f = { blink: null, mouth: null };
      if (k.face && k.face.blink) f.blink = await loadImage(fs.readFileSync(path.join(pd, a, k.face.blink.file)));
      if (k.face && k.face.eyes) {
        f.eyes = { rect: k.face.eyes, img: await loadImage(fs.readFileSync(path.join(pd, a, k.face.eyes.file))) };
        f.eyes.pupils = await loadImage(fs.readFileSync(path.join(pd, a, k.face.eyes.pupil.file)));
      }
      if (k.face && k.face.mouth) {
        f.mouth = { rect: k.face.mouth, map: {}, rest: null };
        for (const [tag, file] of Object.entries(k.face.mouth.files)) f.mouth.map[tag] = await loadImage(fs.readFileSync(path.join(pd, a, file)));
        f.mouth.rest = f.mouth.map.rest || f.mouth.map.M || Object.values(f.mouth.map)[0];
      }
      pack.face.push(f.blink || f.mouth ? f : null);
    }
    IR.packs[a] = pack;
  }
  // the pose a pose-only character holds when no pack clip is running — 'idle' if it exists
  IR.poseOnly = borrowsParts(rig);
  if (rig.poseOnly !== false && IR.poseOnly) IR.fallbackPose = rig.defaultPose || (IR.packs.idle ? 'idle' : Object.keys(IR.packs)[0] || null);
  return R;
}

/* ------------------------------------------------------------ limb strips */
// Compose parent + child into one straight vertical strip, in rig units * RES.
function buildStrip(IR, upperName, lowerName, a, b, wantU, wantL) {
  const U = IR.rig.parts[upperName], L = IR.rig.parts[lowerName];
  const kU = a / (U.bottom.y - U.top.y), kL = b / (L.bottom.y - L.top.y);
  const xU = clamp(wantU / (U.wMid * kU), 0.7, 1.7), xL = clamp(wantL / (L.wMid * kL), 0.7, 1.7);
  const capTop = U.top.y * kU, capBot = (L.h - L.bottom.y) * kL;
  // half-width around the joint axis (the pivot need not sit mid-image)
  const half = Math.max(Math.max(U.top.x, U.w - U.top.x, U.bottom.x, U.w - U.bottom.x) * kU * xU, Math.max(L.top.x, L.w - L.top.x) * kL * xL);
  const W = Math.ceil(2 * half * RES) + 8, H = Math.ceil((capTop + a + b + capBot) * RES) + 8;
  const c = createCanvas(W, H), g = c.getContext('2d');
  const cx = W / 2, yS = 4 + capTop * RES, yE = yS + a * RES, yW = yE + b * RES;
  // child first (its top cap tucks under the parent)
  g.save(); g.translate(cx, yE); g.scale(kL * RES * xL, kL * RES); g.drawImage(IR.img[lowerName], -L.top.x, -L.top.y); g.restore();
  // parent, trimmed just past the joint so its own bottom cap never shows as a seam line
  g.save(); g.beginPath(); g.rect(0, 0, W, yE + 1.5 * RES); g.clip();
  g.translate(cx, yS); g.scale(kU * RES * xU, kU * RES); g.drawImage(IR.img[upperName], -U.top.x, -U.top.y); g.restore();
  return { canvas: c, W, H, cx, yS, yE, yW, a, b, width: Math.max(U.wMid * kU * xU, L.wMid * kL * xL) };
}

// The whole arm from ONE bare-skin part, stretched over upper arm + forearm: its own taper runs
// sleeve-to-wrist with nothing at the elbow. The top (inside the sleeve) is shaded so the root
// reads as tucked in, and the strip starts a little below the joint so no cap exists at all.
function buildArmStrip(IR, name, a, b, rootW, sleeveLen) {
  const L = IR.rig.parts[name];
  const len = L.bottom.y - L.top.y, k = (a + b) / len;
  const xk = clamp(rootW / (L.wTop * k), 0.35, 2.2);
  const half = Math.max(L.top.x, L.w - L.top.x, L.bottom.x, L.w - L.bottom.x) * k * xk;
  const capBot = (L.h - L.bottom.y) * k;
  const skip = rootW * 0.3; // start under the sleeve, below the joint
  const W = Math.ceil(2 * half * RES) + 8, H = Math.ceil((a + b + capBot) * RES) + 8;
  const c = createCanvas(W, H), g = c.getContext('2d');
  const cx = W / 2, yS = 4, yE = yS + a * RES, yW = yE + b * RES;
  g.save(); g.beginPath(); g.rect(0, yS + skip * RES, W, H); g.clip();
  g.translate(cx, yS); g.scale(k * RES * xk, k * RES); g.drawImage(IR.img[name], -L.top.x, -L.top.y); g.restore();
  // shadow of the sleeve on the arm root, fading out a little past the hem
  // (rig.json "armShadow": false skips it: when the sleeve is a long one the whole arm is cloth)
  if (IR.rig.armShadow !== false) {
  g.save(); g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(0, yS, 0, yS + (sleeveLen + rootW * 0.5) * RES);
  gr.addColorStop(0, 'rgba(60,25,20,0.6)'); gr.addColorStop(0.7, 'rgba(60,25,20,0.42)'); gr.addColorStop(1, 'rgba(60,25,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
  }
  return { canvas: c, W, H, cx, yS, yE, yW, a, b, width: rootW };
}

// Bend a strip along the chain S -> E -> W. Slices of the straight strip are laid along the
// chain; around the joint the chain is a quadratic curve, so the bend is smooth.
function drawBentStrip(g, st, S, E, Wp, mirror = false) {
  const a = Math.hypot(E.x - S.x, E.y - S.y) || 1e-3, b = Math.hypot(Wp.x - E.x, Wp.y - E.y) || 1e-3;
  const du = { x: (E.x - S.x) / a, y: (E.y - S.y) / a }, df = { x: (Wp.x - E.x) / b, y: (Wp.y - E.y) / b };
  const w = Math.min(st.width * 0.55, a * 0.45, b * 0.45);
  const P0 = { x: E.x - du.x * w, y: E.y - du.y * w }, P2 = { x: E.x + df.x * w, y: E.y + df.y * w };
  const at = (s) => {
    if (s <= a - w) return { p: { x: S.x + du.x * s, y: S.y + du.y * s }, t: du };
    if (s >= a + w) return { p: { x: E.x + df.x * (s - a), y: E.y + df.y * (s - a) }, t: df };
    const q = (s - (a - w)) / (2 * w), m = 1 - q;
    return {
      p: { x: m * m * P0.x + 2 * m * q * E.x + q * q * P2.x, y: m * m * P0.y + 2 * m * q * E.y + q * q * P2.y },
      t: { x: 2 * m * (E.x - P0.x) + 2 * q * (P2.x - E.x), y: 2 * m * (E.y - P0.y) + 2 * q * (P2.y - E.y) },
    };
  };
  const ka = a / st.a, kb = b / st.b; // IK may stretch a hair; keep the texture on the bones
  const step = 2; // source px per slice
  for (let y = 0; y < st.H; y += step) {
    const ym = y + step / 2;
    let s;
    if (ym < st.yE) s = ((ym - st.yS) / RES) * ka; else s = a + ((ym - st.yE) / RES) * kb;
    const { p, t } = at(s);
    const ang = Math.atan2(t.y, t.x) - Math.PI / 2;
    const k = (ym < st.yE ? ka : kb);
    const wk = st.widthK || 1;
    g.save(); g.translate(p.x, p.y); g.rotate(ang); if (mirror) g.scale(-1, 1);
    g.drawImage(st.canvas, 0, y, st.W, step, -st.cx / RES * wk, -step / 2 / RES * k, st.W / RES * wk, (step / RES) * k + 0.9);
    g.restore();
  }
}

function silhouette(im, colour) {
  const pad = 8, c = createCanvas(im.width + pad * 2, im.height + pad * 2), g = c.getContext('2d');
  const tint = (col) => { const t = createCanvas(im.width, im.height), q = t.getContext('2d'); q.drawImage(im, 0, 0); q.globalCompositeOperation = 'source-atop'; q.fillStyle = col; q.fillRect(0, 0, im.width, im.height); return t; };
  const ink = tint(INK), body = tint(colour);
  for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [2, -2], [-2, 2]]) g.drawImage(ink, pad + dx, pad + dy);
  g.drawImage(body, pad, pad);
  return { canvas: c, pad };
}

// Over-the-shoulder back view, same placement as the front parts.
export function drawBackImg(g, R, P, J) {
  const IR = R.image, T = IR.rig.parts.torso, k = IR.kT;
  // a pose-only rig has no back art of its own (the silhouette would be the borrowed character):
  // the pack drawing is the only honest thing to show
  if (IR.poseOnly) return;
  g.save(); g.translate(J.hip.x, J.hip.y); g.rotate(P.lean); g.translate(0, -R.torsoH); g.scale(k * 1.08, k);
  g.drawImage(IR.backTorso.canvas, -T.hip.x - IR.backTorso.pad, -T.shirtTop - IR.backTorso.pad); g.restore();
  limb(g, [J.neckBase, { x: J.head.x, y: J.head.y + R.headRy * 0.6 }], R.neckW, IR.rig.skin, IR.rig.skinShade);
  const f = IR.rig.parts['head.front'].face, kh = R.headRx / f.rx;
  g.save(); g.translate(J.head.x, J.head.y); g.rotate(J.headAng); g.scale(kh, kh);
  g.drawImage(IR.backHead.canvas, -f.cx - IR.backHead.pad, -f.cy - IR.backHead.pad);
  g.restore();
  if (R.accessory === 'shades') {
    g.save(); g.translate(J.head.x, J.head.y); g.rotate(J.headAng);
    g.beginPath(); g.moveTo(-R.headRx * 1.0, -R.headRy * 0.72); g.quadraticCurveTo(0, -R.headRy * 0.6, R.headRx * 1.0, -R.headRy * 0.72); stroke(g, LW * 1.6, INK); stroke(g, LW * 0.6, '#e2b23c');
    g.restore();
  }
}

/* ------------------------------------------------------------------ parts */
function sprite(g, IR, name, px, py, k, { rot = 0, mirror = false, sx = 1, sy = 1, alpha = 1 } = {}) {
  const im = IR.img[name]; if (!im) return;
  g.save(); g.rotate(rot); if (mirror) g.scale(-1, 1); g.scale(k * sx, k * sy);
  if (alpha < 1) g.globalAlpha *= alpha;
  g.drawImage(im, -px, -py); g.restore();
}

function torsoFrame(g, IR, R, P, J) {
  const k = IR.kT;
  g.translate(J.hip.x + P.turn * 8, J.hip.y); g.rotate(P.lean); g.scale(1 - 0.12 * Math.abs(P.turn), J.br);
  // image hem sits a touch below the hip, shirt top at -torsoH
  g.translate(0, -R.torsoH); g.scale(k, k);
}
function drawTorso(g, IR, R, P, J) {
  const T = IR.rig.parts.torso;
  g.save(); torsoFrame(g, IR, R, P, J); g.drawImage(IR.body || IR.img.torso, -T.hip.x, -T.shirtTop); g.restore();
  if (IR.body) for (const s of ['L', 'R']) drawSleeveImg(g, IR, R, P, J, s, false);
}
// One side's sleeve again, over its own arm root (the arm is tucked inside it). It follows the
// shrug of that shoulder; it never covers the head.
function drawSleeveImg(g, IR, R, P, J, side, avoidHead = true) {
  if (!IR.sleeves) return;
  const T = IR.rig.parts.torso;
  g.save();
  if (avoidHead) {
    g.beginPath(); g.rect(-4000, -4000, 8000, 8000);
    g.ellipse(J.head.x, J.head.y, R.headRx * 1.05, R.headRy * 1.08, J.headAng, 0, Math.PI * 2);
    g.clip('evenodd');
  }
  torsoFrame(g, IR, R, P, J);
  const lift = -(side === 'L' ? P.shoulderL : P.shoulderR) / IR.kT;
  g.beginPath(); if (side === 'L') g.rect(-T.hip.x, -T.shirtTop - 200, T.hip.x, T.h + 400); else g.rect(0, -T.shirtTop - 200, T.w, T.h + 400); g.clip();
  g.drawImage(IR.sleeves, -T.hip.x, -T.shirtTop + lift);
  g.restore();
}

function drawNeck(g, IR, R, P, J) {
  const nb = J.neckBase, h = J.head;
  const top = { x: lerp(nb.x, h.x, 0.62), y: lerp(nb.y, h.y, 0.62) };
  limb(g, [{ x: nb.x, y: nb.y + 10 }, top], R.neckW, IR.rig.skin, IR.rig.skinShade, LW * 0.9);
}

const HAND = { open: 'hand.open', spread: 'hand.open', droop: 'hand.open', flat: 'hand.open', fist: 'hand.fist', pinch: 'hand.fist', point: 'hand.point' };
function drawHandImg(g, IR, R, p, ang, grip, side) {
  const name = HAND[grip] || 'hand.open', H = IR.rig.parts[name];
  const k = (R.hand * (grip === 'fist' || grip === 'pinch' ? 2.1 : 2.6)) / (H.len - H.wrist.y);
  g.save(); g.translate(p.x, p.y); g.rotate(ang - Math.PI / 2);
  if (side === 'L') g.scale(-1, 1);
  if (grip === 'spread') g.scale(1.12, 0.96);
  g.translate(0, -R.hand * 0.35);
  g.scale(k, k); g.drawImage(IR.img[name], -H.wrist.x, -H.wrist.y);
  g.restore();
}

function drawArm(g, IR, R, P, J, side, t, drawProp) {
  const A = P.arms[side], S = J.arms[side];
  drawBentStrip(g, IR.arm, S.s, S.elbow, S.hand, side === 'L');
  if (A.hold && drawProp) drawProp(g, A.hold, S.hand, S.ang, side, t, A);
  drawHandImg(g, IR, R, S.hand, S.ang, A.grip, side);
  if (A.hold && A.hold.over && drawProp) drawProp(g, A.hold, S.hand, S.ang, side, t, A, true);
}

function drawLegs(g, IR, R, P, J) {
  const F = IR.rig.parts.foot;
  const kF = (R.legW * 2.0) / F.len;
  for (const side of ['L', 'R']) {
    const Lg = J.legs[side];
    drawBentStrip(g, IR.leg, Lg.s, Lg.elbow, Lg.hand, side === 'L');
    const dir = P.legs.mode === 'stand' ? (side === 'L' ? -1 : 1) : P.legs.dir;
    g.save(); g.translate(Lg.hand.x, Lg.hand.y + R.legW * 0.15); if (dir < 0) g.scale(-1, 1);
    g.scale(kF, kF); g.drawImage(IR.img.foot, -F.ankle.x, -F.ankle.y - (F.sole - F.ankle.y) * 0.0);
    g.restore();
  }
}

/* ------------------------------------------------------------------- face */
const MOUTH = {
  rest: ['mouth.smile', 0.72], smile: ['mouth.smile', 1], smirk: ['mouth.smirk', 1], frown: ['mouth.frown', 1], wobble: ['mouth.frown', 0.9],
  mbp: ['mouth.M', 1], chew: ['mouth.M', 0.9], oh: ['mouth.O', 1], shock: ['mouth.O', 1.35], ee: ['mouth.E', 1], grin: ['mouth.E', 1.05],
  laugh: ['mouth.laugh', 1], ah: ['mouth.A', 1],
};
// target width of each mouth, in units of the rig's mouthW (the sheet draws them at whatever size)
const MOUTH_W = { 'mouth.M': 2.1, 'mouth.smile': 2.3, 'mouth.smirk': 2.2, 'mouth.frown': 1.9, 'mouth.E': 2.3, 'mouth.O': 1.25, 'mouth.A': 1.45, 'mouth.laugh': 2.7 };

function drawFace(g, IR, R, P, fx, fy, faceK, turn) {
  const F = P.face, parts = IR.rig.parts;
  const sq = 1 - 0.18 * Math.abs(turn);
  // eyes
  const lid = clamp(Math.max(F.lid, F.blink), 0, 1);
  let eyes = 'eyes.open';
  if (F.eyes === 'happy') eyes = 'eyes.happy';
  else if (F.eyes === 'squeeze') eyes = parts['eyes.closed2'] ? 'eyes.closed2' : 'eyes.closed';
  else if (lid > 0.8) eyes = 'eyes.closed';
  else if (lid > 0.34) eyes = 'eyes.half';
  const E = parts[eyes], E0 = parts['eyes.open'];
  const ek = (2 * (R.eyeX + R.eyeRx) * 1.12) / E0.width * (1 + F.wide * 0.12);
  const ex = fx + F.lookX * R.eyeRx * 0.16, ey = fy + R.eyeY * faceK + F.lookY * 2.5;
  g.save(); g.translate(ex, ey); g.scale(sq, 1); g.scale(ek, ek * (eyes === 'eyes.open' ? 1 + F.wide * 0.08 : 1));
  g.drawImage(IR.img[eyes], -E.c.x, -E.c.y); g.restore();
  // brows (vector, so they can act) unless the eye patches carry painted ones
  if (IR.rig.brows !== 'painted') {
    const eTop = ey - E0.height * ek * 0.5;
    for (const i of [-1, 1]) {
      const bx = ex + i * R.eyeX * sq * 1.02;
      const by = eTop - 10 - F.brow * 13;
      const inner = { x: bx - i * R.eyeRx * 0.85, y: by + F.browTilt * 10 };
      const outer = { x: bx + i * R.eyeRx * 1.05, y: by - F.browTilt * 4 + 3 };
      g.beginPath(); g.moveTo(inner.x, inner.y); g.quadraticCurveTo(bx, by - 7, outer.x, outer.y);
      stroke(g, LW * 1.9, IR.rig.hair);
    }
  }
  // blush
  if (F.blush > 0.01) {
    g.globalAlpha = clamp(F.blush, 0, 1) * 0.45;
    for (const i of [-1, 1]) { g.beginPath(); ellipse(g, fx + i * R.eyeX * 1.3 * sq, ey + R.eyeRy + 14, 15, 8); fill(g, R.blush); }
    g.globalAlpha = 1;
  }
  // nose
  const nx = fx + turn * 6;
  g.beginPath(); g.moveTo(nx - 5, fy + 28 * faceK); g.quadraticCurveTo(nx + 6, fy + 36 * faceK, nx - 2, fy + 40 * faceK); stroke(g, LW * 0.8);
  // mouth
  const [mname, ms] = MOUTH[F.mouth] || MOUTH.rest;
  const M = parts[mname];
  if (M) {
    const mk = (R.mouthW * MOUTH_W[mname] * ms) / M.width;
    let sy = 1;
    if (mname === 'mouth.A' || mname === 'mouth.O' || mname === 'mouth.laugh' || mname === 'mouth.E') sy = clamp(0.55 + 0.45 * (F.open ?? 1), 0.5, 1.25);
    if (F.mouth === 'chew') sy = 0.8 + 0.4 * (F.open ?? 1);
    const my = fy + R.mouthY * faceK;
    g.save(); g.translate(nx + turn * 4, my + (sy - 1) * M.height * mk * 0.25); g.scale(mk * sq, mk * sy);
    g.drawImage(IR.img[mname], -M.c.x, -M.c.y); g.restore();
  }
}

export function drawHeadImg(g, IR, R, P, J) {
  const F = P.face, parts = IR.rig.parts;
  const turn = clamp(P.turn, -1, 1);
  const use34 = Math.abs(turn) > 0.38 && parts['head.34'];
  const name = use34 ? 'head.34' : 'head.front', Hd = parts[name], f = Hd.face;
  const k = R.headRx / parts['head.front'].face.rx;
  const faceK = (parts['head.front'].face.ry * k) / R.headRy; // vertical proportion vs v2 face
  g.save(); g.translate(J.head.x, J.head.y); g.rotate(J.headAng);
  // the head sprite: face centre on the v2 head origin
  g.save(); if (use34 && turn < 0) g.scale(-1, 1);
  g.scale(k, k); g.drawImage(IR.img[name], -f.cx, -f.cy); g.restore();
  const tx = use34 ? Math.sign(turn) * R.headRx * 0.06 : turn * R.headRx * 0.3;
  drawFace(g, IR, R, P, tx, 0, faceK, use34 ? turn * 1.3 : turn);
  // sunglasses: parked on the hair (up = 1) or over the eyes (up = 0)
  if (parts.shades && R.accessory === 'shades') {
    const up = F.shadesUp, S = parts.shades;
    const y = lerp(R.eyeY * faceK + 4, -R.headRy * 0.8, up);
    const s = lerp(1.12, 0.84, up);
    const sk = ((2 * (R.eyeX + R.eyeRx) * 1.45) / S.width) * s;
    g.save(); g.translate(tx * lerp(1, 0.6, up), y); g.scale(sk * (1 - 0.15 * Math.abs(turn)), sk * lerp(1, 0.82, up));
    g.drawImage(IR.img.shades, -S.c.x, -S.c.y); g.restore();
  }
  // sweat drop
  if (F.sweat > 0.02) {
    const sx = R.headRx * 0.82 + tx * 0.3, sy = -R.headRy * 0.35 + (1 - F.sweat) * 10;
    g.globalAlpha = clamp(F.sweat, 0, 1);
    cel(g, (q) => { q.moveTo(sx, sy - 22); q.quadraticCurveTo(sx + 14, sy, sx, sy + 8); q.quadraticCurveTo(sx - 14, sy, sx, sy - 22); }, '#bfe6ff', null, null, LW * 0.7);
    g.globalAlpha = 1;
  }
  g.restore();
}

/* ------------------------------------------------------------ pose packs */
// A pose-pack clip replaces the puppet with full-body painted keys for its duration. The keys are
// drawings, so nothing inside them can move — but a drawing can still be *tipped*. The head band is
// rotated about the neck over a soft overlap band, the body leans about the hip, the chest rises on
// the rig's breath, and the blink/mouth patches ride the same transform as the head, so a blink can
// never slide off a tilted face. That is the difference between a slide-show of poses and a
// character standing there, breathing, turning and nodding.
// one drawn pose, drawn exactly once, with its face patches riding the same transform
function paintPose(g, IR, R, P, pack, j, lift, alpha, vel, microBase) {
  const K = pack.keys[j], img = pack.img[j];
  if (!K || !img || alpha <= 0.002) return;
  const k = IR._k || 1;
  const footX = K.foot.x, footY = K.foot.y;
  const micro = microBase;
  // ONE rigid draw, no head/body split and no partial alpha anywhere. Any composite of a drawing with
  // itself — a tipped head copy, a cross-fade in a band, a smear — leaves a zone where two copies of the
  // same character are on screen at once, and at any real movement that zone reads as a ghost. So the
  // whole drawing moves as one piece, and the face patches ride the same transform in image space, so
  // they can never slide off the face.
  //
  // The performance numbers arrive per frame and can step. A drawn pose is heavy, so they are low-passed
  // here: without that the drawing snaps between values on consecutive frames, which is the "shaky"
  // look. On a pose change (a cut) the smoothing resets, because gliding in from the outgoing pose is a
  // ghost of a different kind.
  const poseId = `${pack.name}:${j}`;
  if (IR._smId !== poseId) { IR._smId = poseId; IR._sm = null; }
  if (!IR._sm) IR._sm = {};
  const smooth = (key, target, rate = 0.16) => {
    const prev = IR._sm[key];
    IR._sm[key] = prev == null ? target : prev + (target - prev) * rate;
    return IR._sm[key];
  };
  const microCap = Math.max(1.2, K.h * 0.006 * (IR._k || 1));
  const microX = clamp(Math.sin(micro * 1.13 + 1.1) * 0.5 * (k * 5), -microCap, microCap);
  const microY = clamp(Math.sin(micro * 1.7) * 0.7 * (k * 5), -microCap, microCap);
  const breath = smooth('breath', (P.breath || 0) * 2.4, 0.2);
  const sway = clamp(smooth('sway', (P.headTilt || 0) * 4 + (P.hipDX || 0) * 0.3) + microX, -26, 26);
  const turn = clamp(smooth('turn', (P.turn || 0) * 0.06 + (P.headTilt || 0) * 0.1 + (P.lean || 0) * 0.08), -0.055, 0.055)
    + 0.004 * Math.sin(micro * 1.9);
  const hipY0 = -footY * 0.55;
  const squash = 1 + clamp((vel || 0) / 5000, -0.12, 0.18);
  const sxK = K.sx ?? 1, syK = K.sy ?? 1;
  const base = () => {
    g.translate(sway, -lift - breath + microY);
    g.translate(0, hipY0); g.rotate(turn); g.translate(0, -hipY0);
    g.scale((k * sxK) / Math.sqrt(squash), k * squash * syK);
  };

  g.save(); g.globalAlpha *= alpha; base();
  g.drawImage(img, -footX, -footY);
  g.restore();

  const patch = pack.face && pack.face[j];
  if (patch) {
    const F = P.face;
    g.save(); g.globalAlpha *= alpha; base();
    const px = (box) => [-footX + box.x, -footY + box.y];
    if (patch.blink && (F.blink ?? 0) > 0.45) {
      const b = K.face.blink, [bx, by] = px(b);
      g.drawImage(patch.blink, bx, by, b.w, b.h);
    } else {
      if (patch.eyes) {
        const E = patch.eyes, r = E.rect, [ex, ey] = px(r);
        g.drawImage(E.img, ex, ey, r.w, r.h);
        const p0 = r.pupil;
        const dx = clamp(F.lookX ?? 0, -1.2, 1.2) * r.w * 0.035, dy = clamp(F.lookY ?? 0, -1, 1) * r.h * 0.06;
        g.drawImage(E.pupils, ex + p0.x + dx, ey + p0.y + dy, r.w, r.h);
      }
      if (patch.mouth) {
        const m = patch.mouth.rect, [mx, my] = px(m);
        const mi = patch.mouth.map[MOUTH_TAG[F.mouth] || 'rest'] || patch.mouth.rest;
        if (mi) g.drawImage(mi, mx, my, m.w, m.h);
      }
    }
    g.restore();
  }
}

// A pose-pack clip replaces the puppet with full-body painted keys. Two things keep it alive:
//  · pose-to-pose timing — each key holds, and the first third of the hold cross-fades in from the
//    previous pose, so a change of pose is a move and never a cut. Changing to a DIFFERENT pack
//    cross-dissolves the same way, from the pose that was on screen a moment ago.
//  · micro-motion — a held drawing breathes, settles and rocks slightly, and the face patches ride
//    the same transform as the head.
export function drawPack(g, IR, R, P) {
  const pk = P.pack, pack = IR.packs[pk.name]; if (!pack) return false;
  // a small stable offset per character, so two talkers in one shot are not in sync
  const gOff = [...String(pk.name || '')].reduce((a, c2) => a + c2.charCodeAt(0), 0) * 0.37;
  const st = packState(pack, pk.u, pk.d, { offset: gOff });
  const bust = pack.mode === 'bust';
  const k = bust ? (pack.bustScale || (R.headRx * 1.18) / pack.headRx) : pack.scale * (pack.standPx ? IR.standH / pack.standPx : R.headRx / pack.headRx);
  IR._k = k;
  if (bust) g.translate(0, -(R.thigh + R.shin) * 0.965 + (pack.hipDrop ?? 10));

  const now = P.__t ?? 0;
  const clock = now + pk.u;

  // A pose change is a CUT. Nothing of the outgoing pose is left on screen — not a trail, not a
  // dissolve, not a smear — because every one of those is the same drawing composited with itself and
  // reads as a ghost. The character's life comes from the pose changing and from the motion inside a
  // pose (sway, turn, breath, blinks, lip-sync), never from blending two drawings.
  paintPose(g, IR, R, P, pack, st.i, st.lift, 1, st.vel, clock + st.i * 3.7);
  return true;
}

// Which key, how high, how fast. Keys hold on twos; lift follows the pack's arc.
export function packState(pack, u, d, opts = {}) {
  const total = pack.keys.reduce((a, k) => a + k.t, 0);
  // A pack with more than one key is a GESTURE set, not one drawing held forever: while the line is
  // spoken the character keeps changing gesture, the way people do when they talk. Each key holds for
  // a beat (~0.8 s, proportionally to its authored time), so a three-key pack cycles every ~2.4 s.
  // The offset means two people in the same shot do not gesture in lockstep.
  const multi = pack.keys.length > 1;
  const beat = opts.beat ?? 0.8;
  const cycle = multi ? Math.max(1.2, beat * pack.keys.length) : total;
  const offset = opts.offset ?? 0;
  const phase = multi ? (((u + offset) % cycle) + cycle) % cycle / cycle : clamp(u / d, 0, 0.9999);
  const x = phase * total;
  let acc = 0, i = 0; for (; i < pack.keys.length - 1; i++) { if (x < acc + pack.keys[i].t) break; acc += pack.keys[i].t; }
  const lift = (xx) => {
    // piecewise: each key has a target lift; ease between key starts (ballistic in the air)
    let a2 = 0; for (let j = 0; j < pack.keys.length; j++) {
      const kj = pack.keys[j], kn = pack.keys[j + 1];
      if (xx < a2 + kj.t || !kn) { const q = clamp((xx - a2) / kj.t, 0, 1); const e = kj.ease === 'out' ? 1 - (1 - q) * (1 - q) : kj.ease === 'in' ? q * q : q * q * (3 - 2 * q); return lerp(kj.lift || 0, kn ? kn.lift || 0 : kj.lift || 0, kn ? e : 0); }
      a2 += kj.t;
    }
    return 0;
  };
  const dt = 0.02 * total / (multi ? cycle : d);
  const L = lift(x), L2 = lift(Math.min(total, x + dt));
  const K = pack.keys[i];
  return { i, lift: L, vel: -(L2 - L) / (0.02), sx: K.sx, sy: K.sy };
}

/* ------------------------------------------------------------------ entry */
export function drawImageCharacter(g, R, P, J, { pass = 'body', t = 0, drawProp = null } = {}) {
  const IR = R.image;
  // a pose-only rig (no art of its own) must never fall through to the puppet: hold its default
  // pose pack instead, so the frame is always THIS character and never the rig it borrowed from
  if (!P.pack && IR.poseOnly && IR.fallbackPose && IR.packs[IR.fallbackPose]) {
    P = { ...P, pack: { name: IR.fallbackPose, u: 0, d: 1 } };
  }
  if (P.pack && pass === 'body' && IR.packs[P.pack.name]) {
    const pk = IR.packs[P.pack.name];
    if (pk.mode === 'bust' && !P.legs.hidden) drawLegs(g, IR, R, P, J); // the drawing is waist-up
    P = { ...P, __t: t };
    drawPack(g, IR, R, P); return;
  }
  if (P.pack && IR.packs[P.pack.name]) return;
  if (pass === 'body') {
    if (!P.legs.hidden) drawLegs(g, IR, R, P, J);
    for (const s of ['L', 'R']) if (P.arms[s].behind) drawArm(g, IR, R, P, J, s, t, drawProp);
    drawNeck(g, IR, R, P, J);
    drawTorso(g, IR, R, P, J);
    drawHeadImg(g, IR, R, P, J);
    for (const s of ['L', 'R']) if (!P.arms[s].front && !P.arms[s].behind) armAndSleeve(g, J, s, R.armW * 0.9, () => drawArm(g, IR, R, P, J, s, t, drawProp), () => drawSleeveImg(g, IR, R, P, J, s));
  } else {
    for (const s of ['L', 'R']) if (P.arms[s].front) armAndSleeve(g, J, s, R.armW * 0.9, () => drawArm(g, IR, R, P, J, s, t, drawProp), () => drawSleeveImg(g, IR, R, P, J, s));
  }
}
