// Gesture clips for the chai-stall cast. A clip poses the IK arms between drawn poses; these are
// small motions (a sip, resting on the counter, folded arms), which is exactly what the puppet is
// allowed to do — the big stuff (a jump, a laugh) is pose packs.
//
// registered into the engine's CLIPS table at import time.
import { CLIPS } from '../../src/v2/motion.mjs';
import { clamp, lerp } from '../../src/v2/util.mjs';

const s = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const pole = (dx, dy) => (J) => ({ x: J.sh.R.x + dx, y: J.sh.R.y + dy });

// hands resting on the counter: elbows out, a slow sway so it never freezes
CLIPS['rest-counter'] = {
  dur: 8, rin: 0.35, rout: 0.3,
  f(c) {
    const sw = Math.sin(c.t * 1.7) * 3;
    return {
      body: { lean: 0.04, turn: 0.04 * Math.sin(c.t * 0.7) },
      R: { target: () => ({ x: 126 + sw, y: -186 }), grip: 'open', front: true, pole: pole(104, 84) },
      L: { target: () => ({ x: -118, y: -184 - sw }), grip: 'open', front: true, pole: (J) => ({ x: J.sh.L.x - 104, y: J.sh.L.y + 84 }) },
      look: { at: 'cam' },
    };
  },
};

// lift the cutting glass, sip, lower it: the stall's whole reason to exist
CLIPS['sip-chai'] = {
  dur: 2.9, rin: 0.3, rout: 0.32,
  f(c) {
    const u = c.u / c.d;
    const up = s((u - 0.06) / 0.24) * (1 - s((u - 0.66) / 0.3));
    const sip = s((u - 0.3) / 0.12) * (1 - s((u - 0.58) / 0.12));
    return {
      body: { headTilt: -0.05 * up, headDY: 3 * up, lean: 0.03 },
      R: {
        target: (J) => {
          const rest = { x: 126, y: -186 }, mouth = { x: J.head.x + 36, y: J.head.y + 120 };
          return { x: lerp(rest.x, mouth.x, up), y: lerp(rest.y, mouth.y, up) };
        },
        grip: 'fist', front: true, pole: pole(88, 96),
        hold: { type: 'glass', fill: 0.55, tilt: up * 0.5 + sip * 0.35 },
      },
      L: { target: () => ({ x: -104, y: -212 }), grip: 'open', front: true, pole: (J) => ({ x: J.sh.L.x - 96, y: J.sh.L.y + 70 }) },
      face: { brow: 0.3 + 0.4 * sip, lid: 0.3 + 0.6 * sip, mouth: sip > 0.3 ? 'smile' : 'rest', blush: 0.5 },
      look: { x: 0, y: -0.2 },
    };
  },
  sfx: (t0) => [{ t: t0 + 1.5, name: 'clink', gain: 0.25 }],
};

// both hands out, presenting the counter: "dekh, sab taiyaar hai"
CLIPS['present'] = {
  dur: 1.9, rin: 0.3, rout: 0.3,
  f(c) {
    const u = c.u / c.d, out = s(u / 0.3) * (1 - s((u - 0.7) / 0.3));
    return {
      body: { lean: 0.03, brow: 0 },
      R: { target: () => ({ x: lerp(112, 168, out), y: lerp(-216, -226, out) }), grip: 'open', front: true, pole: pole(120, 40) },
      L: { target: () => ({ x: lerp(-104, -150, out), y: lerp(-212, -226, out) }), grip: 'open', front: true, pole: (J) => ({ x: J.sh.L.x - 120, y: J.sh.L.y + 40 }) },
      face: { brow: 0.6, mouth: 'smile', blush: 0.5 },
      look: { at: 'cam' },
    };
  },
};

// arms folded. Kept for reference but NOT used in the reel: on a baggy sweater the two
// forearms read as bars lying across the chest (layered cut-out). Use 'present' instead.
CLIPS['cross-arms'] = {
  dur: 2.6, rin: 0.3, rout: 0.3,
  f(c) {
    const u = c.u / c.d, inx = s(u / 0.28) * (1 - s((u - 0.72) / 0.28));
    return {
      body: { lean: 0.02, headTilt: 0.04 },
      R: { target: () => ({ x: lerp(112, -54, inx), y: lerp(-216, -286, inx) }), grip: 'fist', front: true, pole: pole(120, 30) },
      L: { target: () => ({ x: lerp(-104, 58, inx), y: lerp(-212, -300, inx) }), grip: 'fist', front: true, pole: (J) => ({ x: J.sh.L.x - 120, y: J.sh.L.y + 30 }) },
      face: { brow: 0.1, browTilt: 0.3, lid: 0.35, mouth: 'smirk' },
      look: { x: 0.4, y: 0 },
    };
  },
};

// one finger up: "suno, meri baat"
CLIPS['point-up'] = {
  dur: 1.7, rin: 0.26, rout: 0.3,
  f(c) {
    const u = c.u / c.d, out = s(u / 0.25) * (1 - s((u - 0.72) / 0.28));
    return {
      body: { lean: 0.02, headTilt: -0.05, bob: 2 * Math.sin(c.t * 9) * out },
      R: { target: (J) => ({ x: lerp(112, J.head.x + 152, out), y: lerp(-216, J.head.y - 30, out) }), grip: 'point', handRot: -1.3, front: true, pole: pole(150, 40) },
      face: { brow: 0.8, mouth: 'E', browTilt: -0.2 },
      look: { at: 'cam' },
    };
  },
};
