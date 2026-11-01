<div align="center">

<img src="docs/banner.png" alt="rigpop-motion — cartoon animation in code" width="100%">

**Vector character rigs · IK arms · an always-alive motion system · stage-direction scripts.**
Write a short like a screenplay; get a 720×1280 reel with voices, captions and cue-locked sound.

<br>

<img src="docs/midnight-maggi.gif" width="300" alt="Midnight Maggi: Kabir tastes the Maggi, laughs, his little sister appears in the doorway, he jumps">

<br><br>

[**▶ Watch “Midnight Maggi” (40 s)**](out/midnight-maggi.mp4) &nbsp;·&nbsp;
[Script format](#-the-script-is-the-animation) &nbsp;·&nbsp;
[Quickstart](#-quickstart) &nbsp;·&nbsp;
[What makes it move](#-what-makes-it-move) &nbsp;·&nbsp;
[v1 docs](#-v1--motion-comic-from-generated-artwork)

<br>

![Node](https://img.shields.io/badge/node-%E2%89%A518-3c873a?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-1b1826?style=flat-square)
![Output](https://img.shields.io/badge/output-mp4%20%C2%B7%20720%C3%971280%20%C2%B7%2030fps-e8695f?style=flat-square)
![Art](https://img.shields.io/badge/art-100%25%20code%2C%20no%20raster%20AI-ffd94a?style=flat-square)

</div>

---

<img src="docs/logo.png" width="88" align="right" alt="rigpop-motion logo">

## 🎬 v2: from motion comic to cartoon

v1 made shorts out of painterly AI stills: a mouth patch, a slow zoom, a few pose cards
crossfaded. It looked like a motion comic, because it was one, and the characters barely moved.

v2 throws the stills away. Every character, prop and set is **drawn in code** with
`@napi-rs/canvas` paths in a flat Indian-cartoon look: bold outline, flat fill, one cel shadow.
Because the character is a rig and not a picture, it can **actually act**. It stirs, shakes
the packet, sprinkles masala, tastes, laughs, sneaks and jumps out of its skin. It breathes and
blinks the whole time.

<img src="out/midnight-maggi-sheet.jpg" width="100%" alt="Contact sheet of Midnight Maggi, one frame every 2 seconds">

<sub>One frame every 2 s of `out/midnight-maggi.mp4`: peek, whip-pan, sneak, fridge glow,
ECU, insert, cook, taste, laugh, the sister, the jump, close-ups, the payoff two-shot.</sub>

---

## 📝 The script is the animation

A short is a readable markdown file, not a thousand lines of drawing code. This is a real
excerpt from [`scripts/midnight-maggi.md`](scripts/midnight-maggi.md):

```markdown
---
title: MID NIGHT CRAVING
highlight: NIGHT
size: 720x1280
fps: 30
on_twos: true
music: assets/maggi/bed.m4a
cast:
  K: { rig: kabir, name: Kabir, voice: hi-IN-MadhurNeural, rate: +8% }
  C: { rig: chhoti, name: Chhoti, voice: hi-IN-SwaraNeural, pitch: +45, rate: +6% }
---

# 4 · Cook
[shot medium K]
[stove on]
[K drop-noodles 1.4s]
[shot insert pan]
[K stir 2.2s]
[shot medium K]
[K sprinkle 1.3s]
[K stir 2.6s &]
K (happy): Masala... full on!
[shot ecu K]
[K taste 2.4s]
[camera push 1.18x 0.5s]
[K laugh 1.8s &]
K (laugh): Kasam se... jannat!

# 5 · Caught
[C place arch]
[shot two K C]
C (naughty): Bhaiyaaa...
[K jump 0.9s &] [camera shake 0.5s 26]
```

You never write idle motion or lip-sync. The engine plays **breathing, sway, blinks, eye
darts, speech head-bob and visemes underneath every line** on its own.

### Directives

| Directive | What it does |
|---|---|
| `[shot wide]` `[shot medium K]` `[shot close K]` `[shot ecu K]` | hard cut; character shots frame the body so head motion reads |
| `[shot insert K R]` `[shot insert pan]` | insert on a hand (what it holds) or the pan |
| `[shot ots K C]` `[shot two K C]` `[shot at x y zoom]` | over-the-shoulder, two-shot, a custom frame |
| `[camera push 1.3x 0.6s]` `[camera shake 0.4s 20]` `[camera whip left 0.3s]` | camera moves; they never advance the clock |
| `[K place counter]` `[K walk fridge 1.5s]` `[K sneak arch 2s]` | blocking between set marks, with footsteps locked to each plant |
| `[K stir 3s]` `[K stir 3s &]` | an action; `&` runs it under whatever follows |
| `[K face sneaky]` `[K look C]` `[K hold R packet]` `[K drop R]` `[K shades down]` | state changes |
| `[stove on]` `[pan noodles]` `[pan move right]` `[fridge open]` | set state |
| `[sfx growl 0.8 +0.2s]` `[wait 0.5s]` | a sound cue, a pause |
| `K (excited): Do minute!` | a line: Edge TTS, lip-sync, word captions; the clock waits for it |

**Actions:** `stir` · `shake-packet` · `hold-packet` · `drop-noodles` · `sprinkle` · `taste` ·
`laugh` · `jump` · `peek` · `open-fridge` · `close-fridge` · `grab` · `push-shades` · `point` ·
`cover-mouth` · `hands-hips` · `eat` · `sad-shake` · `no-no` · `nod`

**Expressions:** `neutral` · `happy` · `sneaky` · `smug` · `hungry` · `excited` · `bliss` ·
`laugh` · `shock` · `scared` · `sad` · `naughty` · `angry`

**Marks** in the `night-kitchen` set: `hall` · `arch-peek` · `arch` · `back` · `back-left` ·
`fridge` · `counter` · `counter-mid` · `counter-right` · `off-left` · `off-right`

Errors point at the line: `line 6: unknown action "stirr" for K (have: stir, shake-packet, …)`.

---

## 🚀 Quickstart

```bash
npm install
npx rigpop-motion render scripts/midnight-maggi.md -o out/midnight-maggi.mp4
npx rigpop-motion still  scripts/midnight-maggi.md -t 20.3            # one PNG, instantly
npx rigpop-motion still  scripts/midnight-maggi.md --sheet 2          # contact sheet
npx rigpop-motion gif    out/midnight-maggi.mp4 -s 22.2 -d 6 -o docs/midnight-maggi.gif
```

Rendering runs at about **20 fps** on a 2-core ARM sandbox: the 40 s reel takes about a minute,
voices included (TTS is cached in `.cache/tts`). Edge TTS needs network on the first run. If
you are behind a proxy, the engine clears the proxy variables for that call only.

---

## 🦴 What makes it move

<table>
<tr><td width="50%" valign="top">

**The rig** (`src/v2/rig.mjs`)
- parented parts with pivots: ground → hip → torso → neck → head, shoulders → **2-bone IK
  arms**, hips → **2-bone IK legs**
- the elbow and knee are picked by a **pole target**, so elbows stay out and knees go forward
- limbs are drawn as rubber-hose strokes with round joins, **so a joint can't open a seam**;
  a hand is always at the end of its forearm, and an out-of-reach target clamps
- head: eyes (white, pupil, highlight, **upper and lower lids**), brows, nose, blush, sweat,
  ears, hair front and back; a **3/4 turn** slides the features
- **13 mouth shapes**: rest, smile, smirk, frown, wobble, mbp, chew, oh, ee, ah, shock, grin, laugh
- hands: open, droop, spread, fist/grip, pinch, point, flat (resting), holding any prop
- two characters: **Kabir** (big head, round gold shades, red tee) and **Chhoti** (pigtails, bows)

</td><td width="50%" valign="top">

**The motion** (`src/v2/motion.mjs`)
- **always on**: breathing, hip sway, head drift, blinks on a seeded schedule, saccadic
  eye darts, plus head-bob and brow lift driven by the voice amplitude
- **visemes** from the actual TTS audio (RMS plus zero-crossing rate)
- action clips blend in through **back-eased envelopes**, so a reach anticipates and
  overshoots
- `jump` is anticipation crouch → stretch → air → squash → spring settle
- `stir` runs an elliptical tip path with the pan handle and noodles jiggling in sync
- characters animate **on twos** (12 drawings/s); camera and FX stay on ones
- fast hands leave a **smear frame** with speed lines

</td></tr>
<tr><td valign="top">

**Props + FX** (`src/v2/props.mjs`)
- pan with wiggling noodles, bubbles and masala flecks
- a gas flame ring that flickers on noise
- procedural steam wisps
- a generic yellow 2-minute **noodles packet** (no real logo), a masala sachet, spatula,
  spoon, fork with dangling strands
- closed-form particle bursts: masala, splash, a falling noodle block
- comic "!" impact marks

</td><td valign="top">

**Set + camera** (`src/v2/scene.mjs`, `engine.mjs`)
- night kitchen drawn in code: tiles, fridge (the door swings open with a light glow and a
  "NO MAGGI AFTER 12" note), arch doorway, counter, stove, shelf of jars, ticking clock,
  window with moon and stars
- **3 parallax planes**: sky/hallway, the set, a foreground of hanging ladles
- depth: characters scale toward the back wall and step **through** the arch, which clips them
- shots, lagged follow, push/pull, **whip pan with motion blur**, shake, handheld drift
- night grade with warm stove light, cool fridge spill and moonlight

</td></tr>
</table>

### Sound

Voices are Edge neural TTS (`hi-IN-MadhurNeural`, `hi-IN-SwaraNeural` with a pitch lift), trimmed
and analysed. The music bed ducks under every line. SFX are **cue-locked by the actions
themselves**: `stir` schedules the boil and the spoon clinks, `sprinkle` the masala, `taste` the
clink, slurp and gulp, `open-fridge` the door and the hum, `sneak` a footstep on every plant, and
a whip pan its whoosh. The foil crinkle is synthesised.

### Add a character

Add an entry to `RIGS` in `src/v2/rig.mjs`: colours, head and body proportions, limb lengths,
`hairStyle` (`messy` or `pigtails`), `accessory`, and `dress`. Every action and expression works
on it straight away. Chhoti is the same rig as Kabir with different numbers.

---

## 🗺️ Roadmap

- [x] layered vector rig with IK arms and legs, pivots and parenting
- [x] always-on idle, blinks, saccades, speech-driven head and brows, visemes from audio
- [x] action clips with anticipation, overshoot, squash and stretch, smear frames, on twos
- [x] stage-direction script format + `render` / `still` / `gif` CLI
- [x] 3-plane parallax set, shot grammar (wide / medium / close / ECU / insert / OTS / two), whip pans
- [x] cue-locked SFX scheduled by the actions themselves
- [ ] side and back views for the rig (today it is front and 3/4)
- [ ] more sets (`hostel-room`, `chai-tapri`, `classroom`) from the same kit
- [ ] a third character type (warden aunty) and costume swaps
- [ ] word timings from TTS word-boundary events instead of the vowel-weighted estimate
- [ ] `[K walk-to C]` relative blocking and automatic eyelines between characters
- [ ] faster encode (worker threads per shot)

---

## 🗂️ Repo layout

```
bin/rigpop-motion.js      CLI: render · still · gif (v2) and the v1 tasks
src/v2/util.mjs           easing (back, spring), noise, 2-bone IK
src/v2/ink.mjs            outline + flat fill + cel shadow primitives
src/v2/rig.mjs            the character rig: parts, IK, faces, hands, back view
src/v2/motion.mjs         idle layer, expressions, locomotion, action clips
src/v2/props.mjs          pan, flame, steam, packet, utensils, particles
src/v2/scene.mjs          night-kitchen set, marks, parallax planes, lights
src/v2/script.mjs         stage-direction parser + compiler (TTS, cues)
src/v2/engine.mjs         scene state, camera, compositing, captions, audio mix, encode
src/v2/cli.mjs            render / still / gif
scripts/midnight-maggi.md the 40 s reel, as a script
assets/fonts/             Luckiest Guy (Apache 2.0) + Baloo 2 (OFL) for titles and captions
```

---

## 📼 v1 · motion comic from generated artwork

The original engine is still here and still works. It is the right tool when you want painterly
AI artwork rather than flat vector.

<img src="docs/hero.gif" width="300" alt="Cutting Chai — v1">

#### The problem v1 solved

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

<img src="docs/maggi.gif" width="420" alt="2 Baje Ki Maggi — cooking, the warden's entrance, the payoff">

<sub>**five drawings, one dinner.** action is a pose pack too: open the packet → snap the
noodles → stir → sprinkle masala → taste. Light-wrap, a foreground counter and a real entrance
keep him inside the room instead of pasted onto it.</sub>

---

#### v1 quickstart

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
node bin/rigpop-motion.js short   # or: npm run maggi for the 60 s Maggi short
```

---

#### How v1 works

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

#### What a v1 short looks like

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

#### …and the 60-second one

**`out/maggi-short.mp4`** — *“2 Baje Ki Maggi”*, a hostel comedy in seven shots: a title, a
craving, a tiptoe down the corridor, **him actually cooking the Maggi**, a knock, a warden who
smells the evidence and arrives properly, and a 3 AM payoff. Two characters, three plates, five
cooking poses, one 60 s score that changes act, eleven voice lines and a lip-sync track per actor.

```bash
npm run maggi:prep    # cut the cast, derive mouth patches
npm run maggi:assets  # voice lines, score, foley
npm run maggi         # → out/maggi-short.mp4
```

---

#### The five v1 rules (learned the hard way)

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

#### v1 repo layout

```
bin/rigpop-motion.js     CLI: assets · poses · walk · cutout · short
src/paths.mjs            repo-relative paths
src/audio.mjs            decode → PCM, Edge TTS helper
src/extract-poses.mjs    cutout + normalisation of generated poses
src/flipbook-walk.mjs    pose flip-book walk
src/cutout-walk.mjs      cut-out puppet walk
src/chai-short.mjs       30 s short: shots, camera, lip-sync, subtitles
src/chai-assets.mjs      dialogue, music bed and SFX, generated from scratch
src/maggi-short.mjs      60 s "2 Baje Ki Maggi": cooking pose pack, warden entrance, scoped camera
src/maggi-assets.mjs     Maggi dialogue, music bed and SFX
src/prep-maggi.mjs       cuts and normalises the Maggi cast (kabir-cook, warden)
characters/              pose sets (kabir-side, kabir-cook, street-cat, warden) + talk patches
assets/                  background plates, music bed, SFX
docs/                    hero gifs, diagrams, SPEC
```

**Add a character** = 6 walk poses + 1 front bust with A/E/O/blink patches. That's it; the
engine cuts, normalises and times it for you.

---

### The Rigpop family

- [**rigpop-agents**](https://github.com/swapagrawal14/rigpop-agents) — scripts in, talking videos out
- [**rigpop-talk**](https://github.com/swapagrawal14/rigpop-talk) — the browser app
- [**rigpop-ink**](https://github.com/swapagrawal14/rigpop-ink) — footage that redraws itself as ink
- **rigpop-motion** — full cartoon animation *(you are here)*

<sub>MIT © swapagrawal14 · brand assets regenerate with `node docs/brand/build-brand.mjs`</sub>
