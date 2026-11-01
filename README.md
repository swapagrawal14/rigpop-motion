# rigpop-motion

**Full cartoon animation from generated artwork.** Pose-based flip-book locomotion, cut-out
rigs, camera moves, lip-sync and cue-locked sound design — rendered headlessly from Node,
with no editing software and no API keys.

```bash
npm install
npm run short          # -> out/chai-short.mp4   (30s, 720x1280, lip-synced, scored)
```

▶ **[Watch the demo — out/chai-short.mp4](out/chai-short.mp4)** · 30 s · 4 shots · lip-synced · scored

---

## Why it exists

[Rigpop](../rigpop-agents) turns a script into a talking bust: one drawing, mouth patches,
bounce. That is perfect for dialogue — and useless for a character that has to *walk across a
street*. `rigpop-motion` adds the missing half: **motion**.

The idea is deliberately small. A cartoon is three things:

1. **Poses** — drawings, not rigs.
2. **Timing** — how long each drawing is held, and how it lines up with sound.
3. **Camera** — where you look, and what moves.

This repo is a tiny engine for those three.

## Two ways to move a character

| | Cut-out puppet | Pose flip-book |
|---|---|---|
| Art | 1 drawing, pieces pivot on bones | 6–8 drawings |
| Overlap artifacts | possible (limbs slide over each other) | **none — every frame is complete art** |
| Smoothness | unlimited angles | stepped, but reads as *animation* |
| Good for | idle, talk, turn, close-ups | **walk, run, action, dance** |
| Cost | 1 generation | 6–8 generations |

The rule of thumb we landed on: **locomotion = flip-book, conversation = cut-out.**

## Quickstart

```bash
# 1. generate a pose for each frame (any image model), then:
npm run poses        # clean cutouts + normalise to one head axis and one sole baseline

# 2. render
npm run walk         # flip-book walk on a scrolling street
npm run cutout       # cut-out puppet walk
npm run assets       # dialogue (Edge TTS) + music bed + SFX
npm run short        # the 30 s short: 4 shots, subtitles, lip-sync, sound
```

## What a short looks like

`src/chai-short.mjs` is the reference implementation — **"Cutting Chai"**, 30 s:

| Time | Shot | Technique |
|---|---|---|
| 0–1.7 s | title | camera pan over one background plate |
| 1.7–8.7 s | walk-in | 6-pose flip-book + Parallax scroll + footsteps synced to stride |
| 9.1–16 s | counter | cut-out bust, mouth patches driven by the real voice RMS |
| 16.5–23.6 s | the theft | side view; tea level drops **only** on each visible lap |
| 23.6–30 s | payoff | close-up, anger mark, camera shake, outro card |

## The five rules (learned the hard way)

1. **Locomotion = pose flip-book.** A cut-out puppet overlaps itself and drags stray props.
2. **One pose = one generation.** Ask a model for a 6-pose sheet and the figures end up
   touching, which makes clean segmentation impossible.
3. **Clear every background-coloured pixel**, not just the flood-filled ring — enclosed
   pockets (between a lifted leg and a trouser) otherwise survive as halos.
4. **Normalise on the head axis and the sole baseline**, or the character drifts and bobs
   between frames.
5. **One background plate + camera pan/zoom = several shots.** Cinematic variety without
   extra art.

## Repo layout

```
bin/rigpop-motion.js     CLI
src/paths.mjs            repo-relative paths
src/audio.mjs            decode -> PCM, Edge TTS helper
src/extract-poses.mjs    cutout + normalise generated poses
src/flipbook-walk.mjs    pose flip-book walk
src/cutout-walk.mjs      cut-out puppet walk
src/chai-short.mjs       30 s short (shots, camera, lip-sync, subtitles)
src/chai-assets.mjs      dialogue, music bed, SFX
characters/              pose sets + talk patches
assets/                  background plates + audio
docs/SPEC.md             full design notes and the mistakes behind each rule
```

## Roadmap

- [ ] 8-pose cycles (smoother walk) + run / jump / turn-around sets
- [ ] stage-direction script format (`[walk-in from left]`, `[camera zoom-in 1.4x]`)
- [ ] 3-layer parallax scenes instead of a single plate
- [ ] multi-character scenes with depth sorting and a shared floor line
- [ ] actions beyond locomotion: sit, fall, point-at, dance

MIT.
