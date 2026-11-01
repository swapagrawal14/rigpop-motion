<div align="center">

# 🎬 rigpop-motion

**Full cartoon animation from generated artwork.**
Pose flip-books, cut-out rigs, camera moves, lip-sync and cue-locked sound —
rendered headlessly from Node.

<sub>no editing software · no timeline scrubbing · no API keys</sub>

<br>

<img src="docs/hero.gif" width="330" alt="Cutting Chai — order, the cat laps the tea, Kabir's reaction">

<br><br>

[**▶ Watch the 30 s short**](out/chai-short.mp4) &nbsp;·&nbsp;
[Quickstart](#-quickstart) &nbsp;·&nbsp;
[How it works](#-how-it-works) &nbsp;·&nbsp;
[The 5 rules](#-the-five-rules-learned-the-hard-way) &nbsp;·&nbsp;
[Design notes](docs/SPEC.md)

<br>

![Node](https://img.shields.io/badge/node-%E2%89%A518-3c873a?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-1b1826?style=flat-square)
![Output](https://img.shields.io/badge/output-mp4%20%C2%B7%20720%C3%971280%20%C2%B7%2030fps-e8695f?style=flat-square)
![Deps](https://img.shields.io/badge/runtime-zero%20API%20keys-ffd94a?style=flat-square)

</div>

---

## 😵 The problem

[Rigpop Agents](https://github.com/swapagrawal14/rigpop-agents) turns a script into a **talking
bust**: one drawing, mouth patches, a little bounce. Perfect for dialogue — and completely
useless the moment your character has to *walk across a street*.

`rigpop-motion` is the other half. It doesn't animate pixels; it animates **drawings, timing
and camera**.

|  | Cut-out puppet | **Pose flip-book** |
|---|---|---|
| Art | 1 drawing, pieces pivot on bones | 6–8 drawings |
| Overlap artifacts | possible — limbs slide over each other | **none, every frame is complete art** |
| Smoothness | unlimited angles | stepped, and that's the charm |
| Good for | idle · talk · turn · close-ups | **walk · run · action · dance** |

> Rule of thumb: **locomotion = flip-book, conversation = cut-out.** Both live in this repo.

<br>

<img src="docs/walk.gif" width="420" alt="Six generated drawings playing as a walk cycle">

<sub>**six drawings, one walk.** 6 poses × 5 frames @30fps = a 1.0 s cycle, background scroll
matched to stride length so the feet never skate.</sub>

---

## 🚀 Quickstart

```bash
npm install
npm run short        # → out/chai-short.mp4   30 s, 720×1280, lip-synced, scored
```

Want just a walk?

```bash
npm run poses        # cut + normalise your generated poses
npm run walk         # flip-book walk on a scrolling street
npm run cutout       # the cut-out puppet alternative
```

Or use the CLI:

```bash
npx rigpop-motion short
```

---

## 🔧 How it works

<img src="docs/pipeline.svg" width="100%" alt="pipeline: generate → clean → normalise → play → camera and sound">

Every stage is one file, no framework:

| Stage | File | What it really does |
|---|---|---|
| **generate** | *your image model* | 6 side-view walking drawings, one per generation |
| **clean** | `src/extract-poses.mjs` | kills every background-coloured pixel, 1 px erosion, re-inks the border |
| **normalise** | `src/extract-poses.mjs` | same body height · head axis on canvas centre · soles on one baseline |
| **play** | `src/flipbook-walk.mjs` | hold each pose 5 frames, scroll the world at stride × cadence |
| **camera + sound** | `src/chai-short.mjs` | pan/zoom/shake, subtitles, footsteps on stride, SFX on the beat |

---

## 🎞️ What a short looks like

<img src="docs/shots.svg" width="100%" alt="Cutting Chai shot timeline: title, walk-in, counter, the theft, payoff">

**`out/chai-short.mp4`** — *“Cutting Chai”*, 30 seconds, four shots:

| Time | Shot | Technique on show |
|---|---|---|
| 0–1.7 s | **title** | one background plate, camera pan |
| 1.7–8.7 s | **walk-in** | 6-pose flip-book · parallax scroll · footsteps locked to stride |
| 9.1–16 s | **counter** | cut-out bust · mouth shapes from the voice RMS |
| 16.5–23.6 s | **the theft** | tea level drops **only** on each visible lap · slurp SFX on the same beat |
| 23.6–30 s | **payoff** | camera shake · anger mark · comedy button · outro card |

And the whole soundtrack — 100 BPM ukulele-ish bed, four slurps, two gulps, one guilty meow —
is generated from code in `src/chai-assets.mjs`. No samples, no licences.

---

## 🧠 The five rules (learned the hard way)

> 1. **Locomotion = pose flip-book.**
>    A cut-out puppet overlaps itself and drags stray props along.
>
> 2. **One pose = one generation.**
>    Ask a model for a 6-pose sheet and the figures end up touching — segmentation becomes
>    impossible. Six separate generations, every time.
>
> 3. **Clear every background-coloured pixel**, not just the flood-filled ring.
>    Enclosed pockets (between a lifted leg and a trouser) survive as halos otherwise.
>
> 4. **Normalise on the head axis and the sole baseline**,
>    or the character drifts and bobs between frames.
>
> 5. **One background plate + camera pan/zoom = several shots.**
>    Cinematic variety for zero extra art.

Each of these is a bug we shipped first. The gory details are in [`docs/SPEC.md`](docs/SPEC.md).

---

## 📁 Repo layout

```
bin/rigpop-motion.js     CLI: assets · poses · walk · cutout · short
src/paths.mjs            repo-relative paths
src/audio.mjs            decode → PCM, Edge TTS helper
src/extract-poses.mjs    cutout + normalisation of generated poses
src/flipbook-walk.mjs    pose flip-book walk
src/cutout-walk.mjs      cut-out puppet walk
src/chai-short.mjs       30 s short: shots, camera, lip-sync, subtitles
src/chai-assets.mjs      dialogue, music bed and SFX, generated from scratch
characters/              pose sets (kabir-side, street-cat) + talk patches
assets/                  background plates, music bed, SFX
docs/                    hero gifs, diagrams, SPEC
```

**Add a character** = 6 walk poses + 1 front bust with A/E/O/blink patches. That's it; the
engine cuts, normalises and times it for you.

---

## 🗺️ Roadmap

- [x] pose flip-book walk with normalised frames
- [x] cut-out puppet fallback for talk/idle
- [x] camera pan · zoom · shake
- [x] lip-sync from real audio RMS
- [x] generated soundtrack + cue-locked SFX
- [ ] 8-pose cycles, plus run / jump / turn-around sets
- [ ] stage-direction script format — `[walk-in from left]`, `[camera zoom-in 1.4x]`
- [ ] 3-layer parallax scenes instead of a single plate
- [ ] multi-character scenes with depth sorting and a shared floor line
- [ ] actions beyond locomotion: sit · fall · point-at · dance

---

<div align="center">
<sub>

**The Rigpop family**

[agents](https://github.com/swapagrawal14/rigpop-agents) — scripts in, talking videos out &nbsp;·&nbsp;
[talk](https://github.com/swapagrawal14/rigpop-talk) — the browser app &nbsp;·&nbsp;
**motion** — full cartoon animation

MIT © swapagrawal14

</sub>
</div>
