// rigpop-motion v2 · engine: scene state, camera, compositing, audio, encode.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { P as RP } from '../paths.mjs';
import { decode, SR, FFMPEG } from '../audio.mjs';
import { solve, drawCharacter, drawBack } from './rig.mjs';
import { CLIPS, evalActor, actorLoc } from './motion.mjs';
import { SET, depthScale, groundY, archPath, drawSky, drawHallway, drawWall, drawCounter, drawForeground, drawLights } from './scene.mjs';
import { drawHeld, steam, particles, block, exclaim } from './props.mjs';
import { INK } from './ink.mjs';
import { clamp, lerp, ease, noise, hash, TAU } from './util.mjs';

GlobalFonts.registerFromPath(RP('assets/fonts/LuckiestGuy-Regular.ttf'), 'Lucky');
GlobalFonts.registerFromPath(RP('assets/fonts/Baloo2.ttf'), 'Baloo');

// hooks (v3): { scene: { sky, hallway, wall, counter, foreground, lights }, drawHeld }
// A rig may carry its own drawer (R.draw), e.g. the v3 image rig.
export function createEngine(S, hooks = {}) {
  const SC = { sky: drawSky, hallway: drawHallway, wall: drawWall, counter: drawCounter, foreground: drawForeground, lights: drawLights, ...(hooks.scene || {}) };
  const HELD = hooks.drawHeld || drawHeld;
  const [W, H] = String(S.meta.size || '720x1280').split('x').map(Number);
  const FPS = Number(S.meta.fps || 30);
  const onTwos = S.meta.on_twos !== false;
  const canvas = createCanvas(W, H), g = canvas.getContext('2d');
  const tmp = createCanvas(W, H), tg = tmp.getContext('2d');
  const quant = (t) => (onTwos ? Math.floor(t * (FPS / 2) + 1e-6) / (FPS / 2) : t);

  /* ------------------------------------------------------------ scene state */
  function sceneState(t) {
    const st = { stoveOn: 0, fridgeOpen: 0, stashTaken: false, pan: { ...SET.pans.home, content: 'empty', stir: 0, jiggle: 0 } };
    for (const e of S.sceneEv) {
      if (e.t > t) break;
      if (e.key === 'stove') st.stoveOn = e.val ? ease.outBack(clamp((t - e.t) / 0.35, 0, 1), 2.5) : 0;
      else if (e.key === 'panContent') st.pan.content = e.val;
      else if (e.key === 'panMove') { st.pan.x = e.val.x; st.pan.y = e.val.y; }
      else if (e.key === 'fridge') st.fridgeOpen = e.val;
      else st[e.key] = e.val;
    }
    const contrib = [];
    for (const A of S.actors.values()) for (const C of A.clips) {
      const spec = CLIPS[C.name];
      if (!spec.state || t < C.t0) continue;
      const active = t <= C.t1;
      const o = spec.state(clamp(t - C.t0, 0, C.t1 - C.t0), C.t1 - C.t0, C.args);
      contrib.push({ t0: C.t0, o, active });
    }
    contrib.sort((a, b) => a.t0 - b.t0);
    for (const { o, active } of contrib) for (const [k, val] of Object.entries(o)) {
      if (k === 'stir' || k === 'jiggle') { if (active) st.pan[k] = val; }
      else if (k === 'content') st.pan.content = val;
      else st[k] = val;
    }
    return st;
  }
  const sceneSorted = S.sceneEv.sort((a, b) => a.t - b.t);

  /* ---------------------------------------------------------------- actors */
  const cache = new Map();
  const headWorld = (id, t) => {
    const A = S.actors.get(id), L = actorLoc(A, t), s = depthScale(L.z), R = A.R;
    const hipH = (R.thigh + R.shin) * 0.965;
    return { x: L.x, y: groundY(L.z) - s * (hipH + R.torsoH + R.neck + R.headRy * 0.8) };
  };
  const Wctx = { scene: (t) => sceneState(t), actors: S.actors, headWorld };
  function actorAt(id, t) {
    const key = id + '@' + t.toFixed(4);
    let r = cache.get(key);
    if (r) return r;
    const A = S.actors.get(id);
    const e = evalActor(A, t, Wctx);
    const J = solve(A.R, e.P);
    const sx = e.s * (e.P.sx || 1), sy = e.s * (e.P.sy || 1);
    const toW = (p) => ({ x: e.L.x + p.x * sx, y: e.gy + p.y * sy });
    r = { ...e, J, sx, sy, toW, A };
    if (cache.size > 400) cache.clear();
    cache.set(key, r);
    return r;
  }

  /* ---------------------------------------------------------------- camera */
  function framing(shot, t) {
    const R = (id) => actorAt(id, quant(t));
    const z0 = 0.84;
    switch (shot.kind) {
      case 'wide': return { x: SET.center.x, y: 770, zoom: 0.92 };
      case 'fridge': return { x: SET.fridge.x + 60, y: SET.fridge.y + 330, zoom: 1.3 };
      // character shots frame the body's rest pose, not the animated head, so head bobs,
      // laughs and jumps read as motion inside the frame instead of being cancelled out
      case 'medium': { const a = R(shot.a), h = headWorld(shot.a, quant(t)); return { x: h.x + 10, y: h.y + 105 * a.s, zoom: 1.7 / a.s }; }
      case 'close': { const a = R(shot.a), h = headWorld(shot.a, quant(t)); return { x: h.x, y: h.y + 80 * a.s, zoom: 2.25 / a.s }; }
      case 'ecu': { const a = R(shot.a), h = headWorld(shot.a, quant(t)); return { x: h.x, y: h.y + 18 * a.s, zoom: 3.0 / a.s }; }
      case 'insert': {
        if (shot.a === 'pan') { const st = sceneState(quant(t)); return { x: st.pan.x + 10, y: st.pan.y - 40, zoom: 2.7 }; }
        // average the hand over 0.6 s so a shaking hand still shakes on screen
        let x = 0, y = 0, n = 0; let a;
        for (const back of [0, 0.15, 0.3, 0.45, 0.6]) { a = R(shot.a); const aa = actorAt(shot.a, quant(Math.max(shot.t, t - back))); const hd = aa.toW(aa.J.arms[shot.b || 'R'].hand); x += hd.x; y += hd.y; n++; }
        return { x: x / n - 10 * a.s, y: y / n - 40 * a.s, zoom: 3.0 / a.s };
      }
      case 'two': {
        const a = R(shot.a), b = R(shot.b), ha = headWorld(shot.a, quant(t)), hb = headWorld(shot.b, quant(t));
        const span = Math.abs(ha.x - hb.x) + 330;
        return { x: (ha.x + hb.x) / 2, y: (ha.y + hb.y) / 2 + 120, zoom: clamp(W / span, 0.8, 2.2) };
      }
      case 'ots': {
        const b = R(shot.b), hb = headWorld(shot.b, quant(t));
        return { x: hb.x - 40, y: hb.y + 90 * b.s, zoom: 1.75 / b.s };
      }
      case 'at': return { x: Number(shot.args[0]), y: Number(shot.args[1]), zoom: Number(shot.args[2] || 1) };
      default: return { x: SET.center.x, y: SET.center.y, zoom: z0 };
    }
  }
  function shotAt(t) { let s = S.shots[0] || { t: 0, kind: 'wide' }; for (const x of S.shots) { if (x.t <= t) s = x; else break; } return s; }
  function camera(t) {
    const shot = shotAt(t);
    // lagged follow: average the framing over the last 0.3 s (but not across the cut)
    let x = 0, y = 0, z = 0, n = 0;
    for (const back of [0, 0.1, 0.2, 0.3]) {
      const tt = Math.max(shot.t, t - back);
      const f = framing(shot, tt);
      x += f.x; y += f.y; z += f.zoom; n++;
    }
    const c = { x: x / n, y: y / n, zoom: z / n, rot: 0, blur: 0, shot };
    for (const e of S.cam) {
      if (e.kind === 'push' && e.t0 >= shot.t && t >= e.t0) c.zoom *= lerp(1, e.amt, ease.inOut(clamp((t - e.t0) / (e.t1 - e.t0), 0, 1)));
      if (e.kind === 'shake' && t >= e.t0 && t <= e.t1) {
        const k = 1 - (t - e.t0) / (e.t1 - e.t0), a = e.amp * k * k / c.zoom;
        c.x += a * noise(t * 38, 1); c.y += a * noise(t * 41, 2); c.rot += 0.012 * k * noise(t * 30, 3);
      }
      if (e.kind === 'whip' && Math.abs(t - e.t) < e.d / 2) {
        const k = (t - e.t) / (e.d / 2); // -1..1, the cut lands at 0
        const off = (k < 0 ? ease.in(1 + k) : -(1 - ease.out(k))) * W * 1.1 / c.zoom;
        c.x += e.dir * off; c.blur = Math.max(c.blur, 1 - Math.abs(k));
      }
    }
    // handheld drift
    c.x += 3.2 * noise(t * 0.45, 7) / c.zoom * 1.4; c.y += 2.6 * noise(t * 0.5, 8) / c.zoom * 1.4;
    c.rot += 0.004 * noise(t * 0.3, 9);
    return c;
  }
  function setCam(c, f = 1) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(W / 2, H / 2); g.rotate(c.rot);
    const z = c.zoom * (f > 1 ? 1 + (f - 1) * 0.6 : 1);
    g.scale(z, z);
    const C0 = SET.center;
    g.translate(-(C0.x + (c.x - C0.x) * f), -(C0.y + (c.y - C0.y) * f));
  }

  /* --------------------------------------------------------------- drawing */
  function drawActor(a, pass, t) {
    g.save(); g.translate(a.L.x, a.gy); g.scale(a.sx, a.sy);
    (a.A.R.draw || drawCharacter)(g, a.A.R, a.P, a.J, { pass, t, drawProp: HELD });
    g.restore();
  }
  // smear: fast hands leave a tapered after-image (classic smear frame)
  function drawSmears(id, tq, side) {
    const step = onTwos ? 2 / FPS : 1 / FPS;
    if (actorAt(id, tq).P.pack) return;
    const a0 = actorAt(id, tq), a1 = actorAt(id, Math.max(0, tq - step)), a2 = actorAt(id, Math.max(0, tq - step * 2));
    const p0 = a0.toW(a0.J.arms[side].hand), p1 = a1.toW(a1.J.arms[side].hand), p2 = a2.toW(a2.J.arms[side].hand);
    const d = Math.hypot(p0.x - p1.x, p0.y - p1.y);
    if (d < 24 * a0.s) return;
    const r = a0.A.R.hand * a0.s;
    const k = clamp((d - 24 * a0.s) / (40 * a0.s), 0, 1);
    g.save();
    g.globalAlpha = 0.55 + 0.35 * k;
    const pts = [p2, p1, p0];
    const nrm = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return { x: -dy / L, y: dx / L }; };
    const n1 = nrm(p1, p0), n0 = nrm(p2, p1);
    g.beginPath();
    g.moveTo(p2.x, p2.y);
    g.quadraticCurveTo(p1.x + n0.x * r * 0.6, p1.y + n0.y * r * 0.6, p0.x + n1.x * r, p0.y + n1.y * r);
    g.lineTo(p0.x - n1.x * r, p0.y - n1.y * r);
    g.quadraticCurveTo(p1.x - n0.x * r * 0.6, p1.y - n0.y * r * 0.6, p2.x, p2.y);
    g.closePath();
    g.fillStyle = a0.A.R.skin; g.fill();
    g.lineWidth = 3.5 * a0.s; g.strokeStyle = INK; g.stroke();
    // speed lines behind
    g.globalAlpha = 0.6 * k;
    g.beginPath();
    for (const o of [-1.4, 0, 1.4]) { g.moveTo(p1.x + n1.x * r * o - (p0.x - p1.x) * 0.6, p1.y + n1.y * r * o - (p0.y - p1.y) * 0.6); g.lineTo(p2.x + n1.x * r * o - (p0.x - p2.x) * 0.4, p2.y + n1.y * r * o - (p0.y - p2.y) * 0.4); }
    g.lineWidth = 3 * a0.s; g.strokeStyle = INK; g.stroke();
    g.restore();
  }

  function drawFx(t, tq) {
    const st = sceneState(tq);
    // steam rises off the pan whenever there is something in it and heat under it
    const heat = st.pan.content === 'empty' ? 0 : st.pan.content === 'water' ? st.stoveOn * 0.8 : 0.55 + 0.45 * st.stoveOn + 0.4 * (st.pan.stir || 0);
    steam(g, st.pan.x, st.pan.y - 10, t, Math.min(1.2, heat), 70, 7);
    particles(g, S.fx.filter((e) => e.kind === 'fall' || e.kind === 'burst'), t);
    for (const e of S.fx) {
      if (e.kind === 'block' && t >= e.t && t <= e.t1) {
        const k = (t - e.t) / (e.t1 - e.t);
        block(g, lerp(e.x0, e.x1, k), lerp(e.y0, e.y1, ease.in(k)), k * 1.5);
      }
      if (e.kind === 'exclaim' && t >= e.t && t <= e.t1) {
        const a = actorAt(e.actor, tq), h = a.toW(a.J.head);
        const k = (t - e.t) / (e.t1 - e.t);
        const sc = ease.outBack(clamp(k / 0.25, 0, 1), 2.5) * (k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1);
        exclaim(g, h.x - 150 * a.s, h.y - 150 * a.s, sc * a.s * 1.1, -0.15);
        exclaim(g, h.x - 215 * a.s, h.y - 60 * a.s, sc * a.s * 0.75, -0.35);
      }
    }
  }

  function drawWorld(t) {
    const tq = quant(t);
    const cam = camera(t);
    const st = sceneState(tq);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#120e18'; g.fillRect(0, 0, W, H);
    // far plane: the sky inside the window frame, the hallway inside the arch
    setCam(cam, 1); g.save(); g.beginPath(); g.rect(SET.window.x, SET.window.y, SET.window.w, SET.window.h); g.clip(); setCam(cam, 0.55); SC.sky(g, t); g.restore();
    setCam(cam, 1); g.save(); g.beginPath(); archPath(g); g.clip(); setCam(cam, 0.82); SC.hallway(g, t); g.restore();
    setCam(cam, 1);
    SC.wall(g, t, st);
    const acts = [...S.actors.keys()].map((id) => actorAt(id, tq)).filter((a) => a.L.x > -150 && a.L.x < SET.w + 150);
    acts.sort((a, b) => b.L.z - a.L.z);
    for (const a of acts) {
      if (a.L.z > 1) {
        g.save(); g.beginPath(); archPath(g); g.clip(); drawActor(a, 'body', t); g.restore();
        drawActor(a, 'front', t);
      } else {
        for (const sd of ['L', 'R']) if (!a.P.arms[sd].front) drawSmears(a.A.id, tq, sd);
        drawActor(a, 'body', t);
      }
    }
    SC.counter(g, t, st);
    for (const a of acts) if (a.L.z <= 1) { for (const sd of ['L', 'R']) if (a.P.arms[sd].front) drawSmears(a.A.id, tq, sd); drawActor(a, 'front', t); }
    drawFx(t, tq);
    SC.lights(g, t, st);
    setCam(cam, 1.35); SC.foreground(g, t);
    // over-the-shoulder: the near character's back, big and dark, in the corner
    if (cam.shot.kind === 'ots') {
      const a = actorAt(cam.shot.a, tq);
      g.setTransform(1, 0, 0, 1, 0, 0);
      const sc = 2.1;
      g.translate(W * 0.16 + 6 * noise(t * 0.4, 4), H * 0.98); g.scale(sc, sc);
      g.translate(-a.J.head.x, -a.J.head.y - 300);
      (a.A.R.drawBack || drawBack)(g, a.A.R, a.P, a.J);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'multiply';
      const gr = g.createLinearGradient(0, H, W * 0.6, H * 0.5);
      gr.addColorStop(0, 'rgba(70,60,110,1)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (cam.blur > 0.02) {
      tg.setTransform(1, 0, 0, 1, 0, 0); tg.clearRect(0, 0, W, H); tg.drawImage(canvas, 0, 0);
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const n = 8, B = cam.blur * 90;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 / n;
      for (let i = 0; i < n; i++) g.drawImage(tmp, lerp(-B, B, i / (n - 1)), 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    // vignette
    const vg = g.createRadialGradient(W / 2, H * 0.48, H * 0.28, W / 2, H * 0.5, H * 0.75);
    vg.addColorStop(0, 'rgba(10,6,20,0)'); vg.addColorStop(1, 'rgba(10,6,20,0.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return cam;
  }

  /* ---------------------------------------------------------- title + subs */
  function drawTitle(t) {
    const title = S.meta.title; if (!title) return;
    const hi = String(S.meta.highlight || '').toUpperCase();
    const k = ease.outBack(clamp((t - 0.15) / 0.45, 0, 1), 2.2);
    if (k <= 0) return;
    g.save();
    g.translate(W / 2, 112 + Math.sin(t * 1.6) * 2); g.scale(k, k); g.rotate(Math.sin(t * 0.9) * 0.012);
    g.font = '58px Lucky'; g.textBaseline = 'middle';
    const words = String(title).toUpperCase().split(/\s+/);
    const sp = 18;
    const ws = words.map((w) => g.measureText(w).width);
    let x = -(ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1)) / 2;
    words.forEach((w, i) => {
      g.textAlign = 'left';
      g.lineJoin = 'round'; g.lineWidth = 13; g.strokeStyle = INK; g.strokeText(w, x, 0);
      g.fillStyle = w === hi ? '#ffcf2e' : '#ffffff'; g.fillText(w, x, 0);
      x += ws[i] + sp;
    });
    g.restore();
  }
  function wrap(words, font, maxW) {
    g.font = font; const rows = [[]]; let w = 0;
    for (const wd of words) {
      const ww = g.measureText(wd.word).width + 24;
      if (w + ww > maxW && rows[rows.length - 1].length) { rows.push([]); w = 0; }
      rows[rows.length - 1].push({ ...wd, w: ww }); w += ww;
    }
    return rows;
  }
  function drawCaptions(t) {
    const L = S.lines.find((l) => t >= l.t0 - 0.05 && t <= l.t1 + 0.2);
    if (!L) return;
    const font = '800 46px Baloo';
    const rows = wrap(L.words, font, W * 0.84);
    const pop = ease.outBack(clamp((t - L.t0 + 0.05) / 0.16, 0, 1), 2);
    const y0 = H * 0.735 - (rows.length - 1) * 28;
    g.save(); g.font = font; g.textBaseline = 'middle'; g.textAlign = 'left'; g.lineJoin = 'round';
    rows.forEach((row, ri) => {
      const tw = row.reduce((a, b) => a + b.w, 0);
      let x = W / 2 - tw / 2;
      for (const wd of row) {
        const on = t >= wd.t0 && t < wd.t1 + 0.05;
        const done = t >= wd.t1;
        const s = (on ? 1.12 : 1) * pop;
        g.save(); g.translate(x + wd.w / 2, y0 + ri * 56); g.scale(s, s);
        g.lineWidth = 10; g.strokeStyle = INK; g.strokeText(wd.word, -wd.w / 2, 0);
        g.fillStyle = on ? '#ffd83a' : done ? '#ffffff' : 'rgba(255,255,255,0.88)'; g.fillText(wd.word, -wd.w / 2, 0);
        g.restore();
        x += wd.w;
      }
    });
    g.restore();
  }

  function render(t) {
    drawWorld(t);
    drawTitle(t);
    drawCaptions(t);
    return canvas;
  }

  /* ----------------------------------------------------------------- audio */
  function sfxFile(name) {
    for (const d of ['assets/maggi', 'assets/chai']) for (const ext of ['.wav', '.m4a', '.mp3']) { const f = RP(d, name + ext); if (fs.existsSync(f)) return f; }
    return null;
  }
  const sfxCache = new Map();
  function sfxPcm(name) {
    if (sfxCache.has(name)) return sfxCache.get(name);
    let pcm;
    if (name === 'crinkle') {
      // synthesized foil crinkle: a few band-limited noise ticks
      const n = Math.floor(0.16 * SR); pcm = new Float32Array(n);
      let lp = 0, prev = 0;
      for (let i = 0; i < n; i++) {
        const tick = hash(Math.floor(i / (SR * 0.006)) + 0.5) > 0.55 ? 1 : 0.15;
        const x = (Math.random() * 2 - 1) * tick;
        lp += (x - lp) * 0.6; const hp = lp - prev; prev = lp;
        pcm[i] = hp * Math.exp(-i / (SR * 0.05)) * 1.6;
      }
    } else {
      const f = sfxFile(name);
      if (!f) { console.error(`(no sound "${name}", skipped)`); pcm = new Float32Array(1); }
      else pcm = decode(f);
    }
    sfxCache.set(name, pcm); return pcm;
  }
  function mixAudio(DUR) {
    const N = Math.ceil(DUR * SR);
    const mix = new Float32Array(N), voice = new Float32Array(N);
    const add = (buf, at, gain, into) => { const s0 = Math.floor(at * SR); for (let i = 0; i < buf.length; i++) { const j = s0 + i; if (j >= 0 && j < N) into[j] += buf[i] * gain; } };
    for (const L of S.lines) add(L.pcm, L.t0, Number(S.meta.voice_gain || 1), voice);
    if (S.meta.music) {
      const f = path.isAbsolute(S.meta.music) ? S.meta.music : RP(S.meta.music);
      const bed = decode(f);
      const gain = Number(S.meta.music_gain ?? 0.35);
      const win = 480; let e = 0;
      for (let i = 0; i < N; i++) {
        if (i % win === 0) { let s2 = 0; for (let k = 0; k < win && i + k < N; k++) s2 += voice[i + k] * voice[i + k]; e = Math.max(Math.sqrt(s2 / win), e); }
        e *= 0.99985;
        const duck = 1 - 0.5 * clamp(e / 0.05, 0, 1);
        const fade = Math.min(1, i / (SR * 0.5), (N - i) / (SR * 1.0));
        mix[i] += bed[i % bed.length] * gain * duck * fade;
      }
    }
    for (let i = 0; i < N; i++) mix[i] += voice[i];
    for (const e of S.sfx) add(sfxPcm(e.name), e.t, e.gain, mix);
    let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(mix[i]));
    const k = peak > 0 ? 0.95 / peak : 1;
    for (let i = 0; i < N; i++) mix[i] = Math.tanh(mix[i] * k * 1.1) * 0.97;
    return mix;
  }
  function writeWav(file, pcm) {
    const n = pcm.length, b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
    b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
    b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767))), 44 + i * 2);
    fs.writeFileSync(file, b);
  }

  // videoOnly: render a silent segment (long renders are done in parts, then muxed with the mix)
  async function renderVideo(out, { from = 0, to = S.DUR, crf = 21, progress = () => {}, videoOnly = false } = {}) {
    const DUR = to - from;
    const wav = out.replace(/\.mp4$/, '') + '.mix.wav';
    if (!videoOnly) {
      const full = mixAudio(S.DUR);
      writeWav(wav, full.subarray(Math.floor(from * SR), Math.floor(to * SR)));
    }
    const aIn = videoOnly ? [] : ['-i', wav, '-af', 'alimiter=limit=0.9:attack=4:release=80'];
    const aOut = videoOnly ? ['-an'] : ['-c:a', 'aac', '-b:a', '128k', '-shortest'];
    const ff = spawn(FFMPEG, [
      '-loglevel', 'error', '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
      ...aIn,
      '-c:v', 'libx264', '-preset', 'medium', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-crf', String(crf),
      ...aOut, '-movflags', '+faststart', out,
    ], { stdio: ['pipe', 'ignore', 'inherit'] });
    const NF = Math.round(DUR * FPS);
    for (let f = 0; f < NF; f++) {
      render(from + f / FPS);
      const px = g.getImageData(0, 0, W, H).data;
      if (!ff.stdin.write(Buffer.from(px.buffer, px.byteOffset, px.byteLength))) await new Promise((r) => ff.stdin.once('drain', r));
      if (f % 30 === 0) progress(f, NF);
    }
    ff.stdin.end();
    await new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg failed')))));
    fs.rmSync(wav, { force: true });
    return { frames: NF };
  }

  function still(t) { render(t); return canvas.toBuffer('image/png'); }

  function sheet(times, { cols = 5, scale = 0.25 } = {}) {
    const w = Math.round(W * scale), h = Math.round(H * scale);
    const rows = Math.ceil(times.length / cols);
    const out = createCanvas(cols * w, rows * (h + 22)), og = out.getContext('2d');
    og.fillStyle = '#111'; og.fillRect(0, 0, out.width, out.height);
    times.forEach((t, i) => {
      render(t);
      const x = (i % cols) * w, y = Math.floor(i / cols) * (h + 22);
      og.drawImage(canvas, x, y, w, h);
      og.fillStyle = '#fff'; og.font = '16px sans-serif'; og.fillText(`${t.toFixed(2)}s`, x + 6, y + h + 16);
    });
    return out.toBuffer('image/jpeg', 85);
  }

  return { W, H, FPS, DUR: S.DUR, render, still, sheet, renderVideo, mixAudio, writeWav, sceneState, camera, canvas };
}
