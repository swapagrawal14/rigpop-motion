// Gesture clips for the viva room. Every one of these is a small, specific motion the puppet can
// actually perform with its IK arms — no drawing is ever swapped, so nothing teleports and nothing
// ghosts. The line's expression still owns the face; these clips only add the body language that
// matches it:
//
//   neutral / explaining   papers, explain, show-size, tap-table, push-glasses
//   nervous                fidget, scratch
//   angry                  slap-table, jab
//   beaten                 hands-up, sigh
//   smug / punchline       clasp, chappal-up
//
// Registered into the engine's CLIPS table at import time (src/v3/cli.mjs loads every file in
// tools/clips/).
import { CLIPS } from '../../src/v2/motion.mjs';
import { clamp, lerp } from '../../src/v2/util.mjs';

const s = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
// a bump that rises at a, holds, and falls by b, all in clip-progress units
const bump = (u, a, b) => s((u - a) / 0.18) * (1 - s((u - b) / 0.22));
const pole = (dx, dy, side = 'R') => (J) => ({ x: J.sh[side].x + (side === 'R' ? dx : -dx), y: J.sh[side].y + dy });
// a point on the table top, in the actor's own local rig units, wherever it is standing
const tableAt = (c, dx = 0) => c.toLocal({ x: c.loc.x + dx * c.s, y: 994 });

// the answer sheets, held in both hands, shuffled. The default stance of a nervous candidate.
CLIPS['papers'] = {
  dur: 6, rin: 0.4, rout: 0.35,
  f(c) {
    const sh = Math.sin(c.t * 2.3) * 3, sh2 = Math.sin(c.t * 2.3 + 1.1) * 2.4;
    return {
      body: { lean: 0.03, turn: 0.04 * Math.sin(c.t * 0.8), headDY: 2 * Math.sin(c.t * 1.7) },
      R: { target: (J) => ({ x: J.hip.x + 96 + sh, y: J.hip.y - 176 + sh2 }), grip: 'fist', front: true, hold: { type: 'papers', rot: -0.12 }, pole: pole(84, 96) },
      L: { target: (J) => ({ x: J.hip.x - 86 - sh, y: J.hip.y - 172 - sh2 }), grip: 'fist', front: true, pole: pole(84, 96, 'L') },
      look: { at: 'cam' },
    };
  },
};

// both palms out, one small beat per clause: the gesture for "let me explain"
CLIPS['explain'] = {
  dur: 2.4, rin: 0.28, rout: 0.3,
  f(c) {
    const u = c.u / c.d, out = bump(u, 0.02, 0.7);
    const beat = Math.sin(c.u * 7.5) * 4 * out;
    return {
      body: { lean: 0.02, headTilt: -0.03, bob: beat * 0.3 },
      R: { target: (J) => ({ x: lerp(J.hip.x + 80, J.hip.x + 208, out) + beat, y: lerp(J.hip.y - 150, J.hip.y - 226, out) }), grip: 'spread', handRot: -0.9, front: true, pole: pole(120, 116) },
      L: { target: (J) => ({ x: lerp(J.hip.x - 76, J.hip.x - 190, out) - beat, y: lerp(J.hip.y - 148, J.hip.y - 218, out) }), grip: 'spread', handRot: 0.9, front: true, pole: pole(120, 116, 'L') },
      look: { at: 'cam' },
    };
  },
};

// hands apart, then together: "it is THIS big" / "and then it does THIS"
CLIPS['show-size'] = {
  dur: 2.2, rin: 0.26, rout: 0.3,
  f(c) {
    const u = c.u / c.d;
    const wide = bump(u, 0.02, 0.42), close = bump(u, 0.5, 0.86);
    const spread = lerp(lerp(90, 224, wide), 52, close);
    const y = lerp(-190, -238, wide) + 8 * close;
    return {
      body: { lean: 0.02, headTilt: -0.02, brow: 0.1 },
      R: { target: (J) => ({ x: J.hip.x + spread, y: J.hip.y + y }), grip: 'pinch', front: true, pole: pole(110, 96) },
      L: { target: (J) => ({ x: J.hip.x - spread, y: J.hip.y + y }), grip: 'pinch', front: true, pole: pole(110, 96, 'L') },
      look: { at: 'cam' },
    };
  },
};

// one finger out, at the other person in the room
CLIPS['point-fwd'] = {
  dur: 1.9, rin: 0.24, rout: 0.3,
  f(c) {
    const u = c.u / c.d, out = bump(u, 0.02, 0.72);
    const tgt = c.targetWorld ? c.toLocal(c.targetWorld) : null;
    return {
      body: { lean: 0.03 * out, turn: 0.06 * out, headTilt: -0.04 * out },
      R: {
        target: (J) => {
          const rest = { x: J.hip.x + 84, y: J.hip.y - 150 };
          const aim = tgt ? { x: tgt.x, y: tgt.y - 170 } : { x: J.hip.x + 232, y: J.hip.y - 218 };
          return { x: lerp(rest.x, aim.x, out), y: lerp(rest.y, aim.y, out) };
        },
        grip: 'point', handRot: -1.35, front: true, pole: pole(112, 72),
      },
      L: { target: (J) => ({ x: J.hip.x - 78, y: J.hip.y - 116 }), grip: 'open', front: true, pole: pole(92, 96, 'L') },
      look: tgt ? { x: tgt.x > 0 ? 0.6 : -0.6, y: -0.05 } : { at: 'cam' },
    };
  },
};

// the examiner's index finger, drumming on the table. Deadpan, patient, a little cruel.
CLIPS['tap-table'] = {
  dur: 3, rin: 0.3, rout: 0.3,
  f(c) {
    const hit = Math.max(0, Math.sin(c.u * 9.4));
    const p = tableAt(c, 96);
    return {
      body: { lean: 0.05, bob: 1.6 * hit },
      R: { target: { x: p.x - 8, y: p.y - 12 - 16 * hit }, grip: 'point', handRot: -1.2, front: true, pole: pole(92, 104) },
      L: { target: c.toLocal({ x: c.loc.x - 100 * c.s, y: 1000 }), grip: 'open', front: true, pole: pole(96, 60, 'L') },
      look: { x: 0.3, y: -0.1 },
    };
  },
};

// push the spectacles up the nose. One of the two things this man does with his hands.
CLIPS['push-glasses'] = {
  dur: 1.9, rin: 0.26, rout: 0.3,
  f(c) {
    const u = c.u / c.d, up = bump(u, 0.04, 0.5), nudge = Math.sin(clamp((u - 0.3) / 0.4, 0, 1) * Math.PI);
    return {
      body: { headDY: -3 * up, headTilt: 0.03 * up },
      R: {
        target: (J) => ({ x: lerp(J.hip.x + 80, J.head.x + 44, up), y: lerp(J.hip.y - 120, J.head.y + 40 - 6 * nudge, up) }),
        grip: 'pinch', handRot: -1.5, front: true, pole: pole(146, 92),
      },
      look: { at: 'cam' },
    };
  },
};

// the palm comes down on the table. The whole room feels it.
CLIPS['slap-table'] = {
  dur: 2.2, rin: 0.22, rout: 0.32,
  f(c) {
    const u = c.u / c.d;
    const down = u < 0.34 ? s((u - 0.08) / 0.2) : 1 - s((u - 0.62) / 0.26);
    const hit = u > 0.28 ? Math.exp(-(u - 0.28) * 14) : 0;
    const p = tableAt(c, 104);
    return {
      body: { lean: 0.1 * down + 0.05 * hit, bob: -4 * hit, headDY: 3 * hit, shoulderR: 6 * down },
      R: { target: (J) => ({ x: lerp(J.hip.x + 150, p.x, down), y: lerp(J.hip.y - 268, p.y - 4, down) }), grip: 'flat', handRot: 1.5, front: true, pole: pole(112, 104) },
      L: { target: c.toLocal({ x: c.loc.x - 104 * c.s, y: 1000 }), grip: 'open', front: true, pole: pole(96, 60, 'L') },
      look: { x: 0.5, y: 0.1 },
      face: { brow: -0.2, browTilt: 0.7 },
    };
  },
  sfx: (t0) => [{ t: t0 + 0.62, name: 'clink', gain: 0.4 }],
};

// the angry version: leaning over the table, finger stabbing at the candidate, twice
CLIPS['jab'] = {
  dur: 2.6, rin: 0.24, rout: 0.32,
  f(c) {
    const u = c.u / c.d;
    const lean = bump(u, 0.02, 0.8);
    const stab = Math.max(0, Math.sin(u * 12.5)) ** 2;
    return {
      body: { lean: 0.14 * lean, turn: 0.1 * lean, bob: -2 * stab, headTilt: 0.05 * lean },
      R: {
        target: (J) => ({ x: J.hip.x + 196 + 46 * stab, y: J.hip.y - 236 + 10 * stab }),
        grip: 'point', handRot: -1.25, front: true, pole: pole(142, 74),
      },
      L: c.toLocal({ x: c.loc.x - 108 * c.s, y: 1000 }),
      look: { x: 0.55, y: 0 },
      face: { brow: -0.25, browTilt: 0.85, lid: 0.3 },
    };
  },
  sfx: (t0, t1) => [0.5, 1.1, 1.7].filter((k) => t0 + k < t1).map((k) => ({ t: t0 + k, name: 'clink', gain: 0.22 })),
};

// both palms up, fingers spread: "sir, please"
CLIPS['hands-up'] = {
  dur: 2.4, rin: 0.26, rout: 0.32,
  f(c) {
    const u = c.u / c.d, up = bump(u, 0.03, 0.75);
    return {
      body: { lean: -0.04 * up, bob: -2 * up, headTilt: -0.05 * up },
      R: { target: (J) => ({ x: J.hip.x + 158, y: lerp(J.hip.y - 150, J.hip.y - 320, up) }), grip: 'spread', handRot: -1.1, front: true, pole: pole(160, 96) },
      L: { target: (J) => ({ x: J.hip.x - 150, y: lerp(J.hip.y - 146, J.hip.y - 314, up) }), grip: 'spread', handRot: 1.1, front: true, pole: pole(160, 96, 'L') },
      look: { at: 'cam' },
    };
  },
};

// fingers laced in front of the belly. The examiner's neutral, and worse than a frown.
CLIPS['clasp'] = {
  dur: 5, rin: 0.4, rout: 0.35,
  f(c) {
    const sw = Math.sin(c.t * 1.1) * 2;
    return {
      body: { lean: 0.03, turn: 0.03 * Math.sin(c.t * 0.6) },
      R: { target: (J) => ({ x: J.hip.x + 34 + sw, y: J.hip.y - 96 }), grip: 'open', handRot: -0.4, front: true, pole: pole(108, 96) },
      L: { target: (J) => ({ x: J.hip.x - 34 - sw, y: J.hip.y - 92 }), grip: 'open', handRot: 0.4, front: true, pole: pole(108, 96, 'L') },
      look: { at: 'cam' },
    };
  },
};

// nervous: scratch the back of the head, look away, come back
CLIPS['scratch'] = {
  dur: 2.3, rin: 0.26, rout: 0.3,
  f(c) {
    const u = c.u / c.d, up = bump(u, 0.05, 0.55), itch = Math.sin(u * 26) * 5 * up;
    return {
      body: { headTilt: -0.08 * up, turn: -0.1 * up, bob: 1.5 * up },
      R: {
        target: (J) => ({ x: lerp(J.hip.x + 80, J.head.x + 62 + itch, up), y: lerp(J.hip.y - 120, J.head.y - 62, up) }),
        grip: 'open', handRot: -1.9, front: true, pole: pole(158, 44),
      },
      look: { x: -0.7, y: 0.2 },
    };
  },
};

// the punchline: pick the chappal off the table and hold it up like a trophy
CLIPS['chappal-up'] = {
  dur: 3.4, rin: 0.26, rout: 0.34,
  f(c) {
    const u = c.u / c.d;
    const reach = bump(u, 0.02, 0.3);
    const lift = s((u - 0.26) / 0.34);
    const hold = lift * (1 - s((u - 0.86) / 0.14));
    const sh = Math.sin(u * 22) * 3 * hold;
    const p = tableAt(c, 132);
    return {
      body: { lean: 0.08 * reach, headTilt: -0.06 * lift, bob: -3 * lift, turn: 0.12 * lift },
      R: {
        target: (J) => {
          const rest = c.toLocal({ x: c.loc.x + 132 * c.s, y: 1000 });
          const up = { x: J.hip.x + 196 + sh, y: J.hip.y - 356 };
          return { x: lerp(rest.x, up.x, lift), y: lerp(rest.y, up.y, lift) };
        },
        grip: 'fist', front: true, handRot: -1.4,
        hold: hold > 0.05 ? { type: 'chappal', rot: -0.55 + sh * 0.04 } : undefined,
        pole: pole(150, 92),
      },
      look: { x: 0.4, y: -0.3 },
    };
  },
  sfx: (t0) => [{ t: t0 + 1.2, name: 'clink', gain: 0.2 }],
};

// a long, flat exhale in the shoulders: "beta, bahar jaao"
CLIPS['sigh'] = {
  dur: 3, rin: 0.35, rout: 0.35,
  f(c) {
    const u = c.u / c.d, down = bump(u, 0.05, 0.8);
    return {
      body: { bob: 4 * down, headDY: 6 * down, shoulderL: -4 * down, shoulderR: -4 * down, lean: -0.03 * down },
      R: { target: (J) => ({ x: J.hip.x + 66, y: J.hip.y - 116 + 10 * down }), grip: 'open', front: true, pole: pole(96, 96) },
      L: { target: (J) => ({ x: J.hip.x - 62, y: J.hip.y - 112 + 10 * down }), grip: 'open', front: true, pole: pole(96, 96, 'L') },
      face: { lid: 0.5, browTilt: -0.5 },
      look: { x: 0, y: 0.4 },
    };
  },
};
