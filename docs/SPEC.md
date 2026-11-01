# rigpop-motion — talking heads se full cartoon animation tak
_Spec + aaj ka working proof-of-concept, 1 Nov 2026_

Aaj ka demo: **`rigpop-motion-demo.mp4`** (10s, 720×1280, 30fps, sound ke saath) aur walk-cycle contact sheet **`rigpop-motion/cycle.png`**.
Code: **`rigpop-motion/demo-walk.mjs`** (~450 lines, koi dependency nahi siwaay canvas + ffmpeg ke).

---

## 1. Asli problem kya hai

Rigpop abhi **"talking head"** engine hai. Ek static PNG + mouth patches + bounce. Wo perfect hai dialogue ke liye, lekin:

| Aaj jo hai | Jo "cartoon animation" kehlata hai |
|---|---|
| Character ek jagah khada, hile-dule | Character **chalta** hai, mudta hai, baithta hai, girta hai |
| Background still photo | **Parallax layers**, camera pan/dolly, scene change |
| Pose = 4 pre-baked PNGs | Pose = **infinite**, bones se generated |
| Timing = audio pe | Timing = **animation curve** (ease, anticipation, overshoot) |

Asli gap: **rigpop ke paas "motion" ka koi model nahi hai — sirf "image swap" hai.**

---

## 2. Solution ka core idea: sprite ki jagah SKELETON

Aaj ki industry (Spine, Live2D, Rive, DragonBones) ka pattern:
**character art ko pieces mein kaato → har piece ko ek bone do → bone ko angle/pivot se ghumao → beech ke frames engine bana de.**

Maine wahi cheez aaj canvas par se seedha implement kar di, **bina kisi art file ke** — character hi math se draw hota hai:

```
hip ─┬─ spine ── neck ── head
     ├─ thigh ── shin ── foot
     └─ upperArm ── foreArm ── hand
```

Har joint ek simple function hai:

```js
const down = (parent, angle, len) => ({
  x: parent.x + Math.sin(angle) * len,
  y: parent.y + Math.cos(angle) * len,
});
```

Bas. Iske upar **walk cycle** — 4 sine waves + 2 rules:

```js
thighL = swing * sin(2πp)          // legs opposite phase
thighR = swing * sin(2πp + π)
knee   = -lift * max(0, sin(2πp + 1.15))^1.4   // knee sirf swing mein mudta hai
bob    = -|cos(2πp)| * 5.5          // body per-step upar-neeche
```

Yehi asli animation ka jaadu hai: **knee kabhi hyper-extend nahi hota, bob per-step hota hai (per-stride nahi), aur arms legs ke opposite chalte hain.** In teeno ke bina walk "sliding doll" lagta hai. Demo mein exactly yahi tune kiya hai.

### Scene bhi math
- **3 parallax layers** (hills 0.12×, houses/trees 0.34×, bushes 1.9×) — camera chalti nahi, duniya scroll hoti hai.
- Road dashes 1.25× speed — depth ka illusion.
- Camera: halka handheld sway + slow zoom (0.7 Hz) — "cinematic" feel, koi shake nahi.
- Vignette + film grain grade.

**Render cost:** 300 frames = **6.6 seconds**. Yani ek 60-second cartoon short ~40s mein render. Isliye iterations sasta hain — asli advantage.

---

## 3. Ab asli kaam: AI art ko bones mein daalna

Math wala part solve ho gaya. **Hard part** = aapke AI-generated doodle (jaise Kabir/Meera) ko **body parts mein kaatna**. Ye 3 tarah se ho sakta hai:

### Phase 1 — "Auto-cut" (v0.1, sabse zaroori)
User ek character sheet de (standing pose, arms alag, legs alag):
```
front.png, arm_l.png, arm_r.png, leg_l.png, leg_r.png, head.png, torso.png
```
`rigpop-motion rig character-sheet.png -o characters/kabir-rig` →
- background remove (aaj ka flood-fill cutout code — proven),
- connected-component segmentation se limbs identify,
- har piece ka **pivot point** (shoulder/hip/neck) auto-detect,
- output: `rig.json` with bones + pivots + z-order.

Agar user ke paas sirf **ek** image hai (jaise Kabir), to:
- upper/lower limb split torso ke proportion se **procedurally** karo (assumption: waist 0.55, knee 0.82 height),
- chhote gap pe limb ko "cut" karke thigh/shin alag,
- texture se joint hole bharna (inpaint ya skin-colour flat fill — doodle art mein ye invisible lagta hai).

### Phase 2 — "Puppet from one image" (v0.2)
MediaPipe Pose (33 landmarks, browser + node) se **ek photo se hi** skeleton nikaal lo. Photo → 33 points → usi image ko bones ke hisaab se warp (mesh deform, 2D). Ye "photo puppet" hai — thoda uncanny but instantly impressive.

### Phase 3 — AI-generated poses (v0.3, optional)
`rigpop-rig` wale image-gen se "same character, walk frame 3" generate karo → auto-cut → **real hand-drawn-looking animation**. Yani animation ka look AI ka, timing hamara.

---

## 4. Script language ka extension (yahi repo ko rigpop se jodta hai)

Aaj ka script dialogue-only hai. Motion ke liye **stage directions** chahiye — Hinglish-friendly, readable:

```markdown
---
title: SH 4 Ka Shraap — Episode 1
scene: night-highway          # parallax scene preset
camera: slow-dolly-in
cast:
  K: { rig: characters/kabir-rig, voice: hi-IN-MadhurNeural }
  M: { rig: characters/meera-rig, voice: hi-IN-SwaraNeural }
---

# Act 1 — Highway
[K walk-in from left 2.0s]
[K stop] K (scared): Yaar ... last bus nikal gayi!
[M appear center-fade]
[M idle sway]
K (shout): [point] Kaun hai wahan?!
[camera zoom-in 1.4x 0.8s]
[M turn-to-camera]
M (whisper): Kabir ... tumhe thand lag rahi hai na?
[M eyes-glow 1.5s]
[shake 0.25 0.6s]
K (scream): [run-away right 1.2s]
```

Bas 8 naye verbs: `walk-in`, `stop`, `turn-to-camera`, `idle`, `run-away`, `appear`, `eyes-glow`, `shake` + `camera` ke 4 moves. **Yahi ek line mein pura difference hai** — dialogue + blocking ek hi file mein. Aur agent (MCP) ise likh sakta hai.

---

## 5. Repo plan

```
rigpop-motion/
├─ bin/rigpop-motion.js         # rig | preview | render | scene list
├─ src/
│  ├─ skeleton.js               # bones, IK, joint hierarchy          ✅ (aaj)
│  ├─ cycles.js                 # walk/run/idle/talk-turn curves      🟡 walk done
│  ├─ rig.js                    # auto-cut + pivots + rig.json        ❌ next
│  ├─ scenes.js                 # parallax scene presets (night-road, ghat, classroom…)
│  ├─ camera.js                 # dolly/pan/zoom/shake with easing
│  ├─ stage.js                  # stage-direction parser  ([walk-in], [camera …])
│  └─ render.js                 # reuses rigpop's mp4 writer + audio pipeline
├─ characters/                  # .rig folders (rig.json + parts)
├─ scenes/*.png                 # layered backgrounds (sky/mid/fg)
└─ examples/highway-ep1.md
```

### Milestones
| Version | Kaam | Kitna time |
|---|---|---|
| **v0.1** | `rig` CLI (auto-cut) + walk/turn/idle + 2 scenes + stage parser; `rigpop render` ke saath compatible | ~4 din |
| **v0.2** | Rigpop ka audio/voice/caption pipeline motion rigs par (character chalte hue bol sakta hai) | ~2 din |
| **v0.3** | Camera moves + transitions + 5 scene presets + jump/fall/point-at | ~4 din |
| **v0.4** | MediaPipe photo-puppet fallback + AI pose frames | ~1 hafta |

**Pehla killer demo:** 45-second "SH-4 Ka Shraap" ka Ep-1 *animated* version — Kabir highway par **chalte hue** aata hai, spotlight, Meera **fade-in** hoti hai, camera zoom, ghost eyes reveal, Kabir bhaagta hai. Wahi kahani jo kal bani, par ab **chal rahi hai**.

---

## 6. Honest limitations (jo mai chhupaunga nahi)

1. **Front-view walk best lagta hai.** 3/4 ya side view ke liye image ko mesh-deform karna padega — v0.2 ka kaam.
2. **Ek hi style (flat doodle) perfect.** Realistic photos ke liye puppet uncanny lagta hai — isliye Phase 3 (AI poses).
3. **Physics nahi hai.** Hair, kapde, tail — abhi rigid. Secondary motion (spring bones) v0.3+ mein.
4. **Lip-sync + walk ek saath** kaam karega, par mouth patches ko bone space mein map karna padega (~1 din ka kaam).
5. **Har scene ke layers chahiye.** AI se "sky/mid/fg" 3 image generate karke parallax banega — aaj ke background jaisa hi, bas 3 baar.

---

## 7. Aaj ke demo ko samajhne ke liye 3 cheezein

1. `rigpop-motion/cycle.png` — 8 phases ek stride ke. Dekho knee aur bob: **har phase mein pair change ho raha hai**, koi frame "same" nahi.
2. `rigpop-motion-demo.mp4` — cat sidekick alag cadence par chalta hai (2.1 vs 1.35 stride/s) — cheap trick, bahut depth deta hai.
3. Poora scene **zero art assets** se bana hai (except nothing!) — sab code. Iska matlab: naya scene banana = ~60 lines.

---

## 8. UPDATE — cut-out rig, real AI artwork (v0.1 proof)

Aapne sahi pakda: pehla demo **shapes** se bana tha (math sahi, art nahi). Ab dono cheezein alag ho gayi hain:

**`rigpop-motion-kabir.mp4`** — Kabir ka **actual AI-generated artwork** walking.
Source: `characters/kabir/side/base.png` (generated side-profile), clean cutout `base_cut.png`. Code: `rigpop-motion/cutout-walk.mjs`.

### Puppet 3 pieces se banta hai (image se kata, drawn nahi)
| Piece | Crop (source px) | Pivot |
|---|---|---|
| head | `300,20 330×260` | neck `(470,264)` |
| torso (jacket + backpack + arms) | `262,240 350×560` | hip `(466,772)` |
| legs (both trousers + shoes) | `340,690 280×480` | hip `(462,772)` |

- **Far leg** = legs piece ka darkened copy, hip pivot par **−phase** se rotate — isliye dono pair alag dikhte hain aur depth aata hai.
- **Torso** chhota lean karta hai, **head** neck par counter-rotate.
- **Bob** = `−|cos(2πp)|·5px`, per-step, aur ek chhota contact shadow.
- Background: AI-generated 21:9 street ko **seamless tile** karke scroll (0.55× character speed).

### Cutout ka ek asli seekh (repo ke liye note)
Fill ke andar agar background dikh raha ho (jaise shoes ke beech ka gap jo pants se connect nahi hota), flood-fill use nahi pakadta → wahan badami halo reh jaata hai.
**Fix:** background se touch hone wale sare pixels ke saath **1px erosion** karo (ring bhi hatao), phir border ko ink-dark + 170 alpha se redraw karo. Isse fringe khatam, anti-aliasing bachi. Ye `rig.js` ka permanent step hai.

### Kya ab bhi baaki hai (v0.2)
1. **Arms alag** — abhi jacket ke saath rigid hain. Do alag arm pieces chahiye (ya `rigpop-rig` se generate).
2. **Knee bend** — legs ek rigid piece hain; chalne ke liye theek, par "run/jump" ke liye thigh+shin split chahiye.
3. **Parallax depth** — abhi background ek layer hai; 3 layers (sky/mid/fg) chahiye.
4. **Lip-sync + walk** — mouth patches ko bone space mein map karna.

---

## 9. UPDATE — pose-based flip-book (v0.1 final)

Aapki baat sahi thi: **cut-out puppet mein limbs overlap karte hain** (aur meri crop mein shoes ka gap palette se clear na hone ki wajah se ek extra "prop" jaisa patch bhi aa gaya). To approach badla:

**`rigpop-flipbook-kabir.mp4`** — 8s, 6 hand-drawn (AI-generated) poses ka flip-book walk, zero overlap, zero cut-limb artifact.

### Pipeline (4 steps, sab code mein)
1. **Pose generation** — `pose1..6.png`, har pose **alag** generate kiya (same character reference, same style), `characters/kabir/side/`.
   _Seekh:_ ek hi sheet mein 6 poses maangne se model unhe touch kara deta hai (feet overlap) — segmentation impossible ho jaata hai. **Ek pose = ek generation** hi reliable hai.
2. **Clean cutout** — background-coloured **saare** pixels clear (sirf flood-fill ring nahi), phir 1px erosion + ink-coloured border. Isse enclosed pockets (lifted leg aur trouser ke beech ka gap) bhi saaf.
3. **Normalise** — har pose ko same body height par scale, **head axis** canvas-centre par, **soles** ek hi baseline par. Frame: `716×1157`, `poses.json` mein metadata.
4. **Playback** — 6 poses × **5 frames hold** @30fps = 6 drawings/sec = **1.0s per cycle (2 steps/s)**. Background scroll = stride length × steps/s, isliye paon kabhi "skate" nahi karte.

Code: `rigpop-motion/extract-poses.mjs` + `rigpop-motion/flipbook-walk.mjs`.

### Cut-out vs flip-book — kab kya
| | Cut-out puppet | Pose flip-book |
|---|---|---|
| Art | 1 image, bones se ghulti hai | 6–8 drawings |
| Overlap artifact | Haan (limbs ek doosre par chadhte hain) | **Nahi** — har frame poora drawn |
| Smoothness | Infinite (angle continuous) | Step-y, par **animation feel** zyada |
| Best for | Talk/idle/turn, close-ups | **Walk, run, action, dance** |
| Cost | 1 generation | 6–8 generations |

**Final architecture:** dono. Idle/talk ke liye cut-out rig, locomotion ke liye pose flip-book — aur `rigpop-motion` script mein `[walk-in]` batter pose sequence ko, `[idle]`/dialogue ko rig se chalaye.

---

## 10. First full short: "CUTTING CHAI" (30 s)

**`chai-short.mp4`** — 30s, 720×1280, 30fps, 5.3 MB. Code: `rigpop-motion/chai-short.mjs`.
Story: Kabir shaam ko chai ke liye tapri aata hai → "ek cutting chai, kadak" → cat chai pee jaati hai → "do cutting chai".

### Shot list (asli camera language)
| Time | Shot | Kya hota hai |
|---|---|---|
| 0–1.7s | Title | `CUTTING CHAI` pop card, pan |
| 1.7–8.7s | **Shot A · walk-in** | 6-pose flip-book walk, scrolling street, footsteps synced |
| 8.7–9.1s | Transition | comic whoosh, speed lines |
| 9.1–16s | **Shot B · counter medium** | lip-synced bust (real audio se mouth driver), steam, `kadak!` pop |
| 16–16.5s | Transition | second whoosh |
| 16.5–23.6s | **Shot C · the theft (cutaway)** | side view: glass full → ghut-ghut khaali, cat stroll + lick, `SLURP!`, `...khaali.` |
| 23.6–30s | **Shot D · payoff** | close-up, anger mark + camera shake on "Arre! Meri chai kahan gayi?!", cat pop, outro card |

### Kya naya bana is short ke liye
- **Depth (parallax shots):** tapri background ek generated plate hai, par camera **pan + zoom** se 3 alag shots nikalte hain (title, medium, close-up) — yahi "shot variety" ka sasta tareeka hai.
- **Lip-sync engine:** dialogue ka real PCM se RMS nikal ke mouth patch (A/E/O) choose hota hai — wahi trick jo Rigpop karta hai, par ab **apne renderer mein**.
- **Music + SFX ek hi mix mein:** 100 BPM cheerful ukulele-ish bed (C–Am–F–G), aur cue-locked footsteps, whoosh, steam hiss, slurp, gulp, cat meow.
- **Subtitle renderer:** word-wrap + ink stroke, dialogue timings script se.

### Ab tak jo seekha (repo ke rules ban gaye)
1. Pose flip-book > cut-out puppet for locomotion (no overlap, no stray props).
2. Ek pose = ek generation; sheet maangne se figures touch kar jaate hain.
3. Background-colour ke **saare** pixels clear karo, sirf flood-fill ring nahi.
4. Head-axis + sole-baseline normalisation zaroori — warna figure drift karti hai.
5. Camera pan/zoom se ek plate se 3 shot mil jaate hain — art budget bachta hai.

### 10.1 Fixes after review (v2)

Do problems the user caught, dono theek:

1. **"Cat SVG thi"** — cat code se draw ho rahi thi. Ab **3 generated poses** hain: `characters/street-cat/cat_{walk,drink,lick}.png` (+ clean `_cut` versions, same cutout recipe). Pecks:
   - `walk` → floor par chal kar aati hai (trotting bounce)
   - `drink` → **tongue-tip ko glass ke rim par pin kiya jaata hai** (`DRINK_TONGUE = [0.955, 0.62]` bbox-ratio), body uske peeche rock karti hai
   - `lick` → bench par baith kar paw chaat-ti hai (satisfied)
2. **"Chai apne aap kam ho rahi thi"** — ab level **sirf 4 visible laps par** girti hai (`lapEvery = 0.62s`, har lap par `1/4` level), aur har lap ka **apna `lap lap` / `slurrrp` caption + slurp SFX** hai. Audio bhi usi beat par hai: 4 slurps + 2 gulps, `lapStart = shotC + 1.40s`. Bench par **paw print** bhi reh jaata hai.

Also in v2: bench ab proper legs ke saath banti hai (cat aur glass dono usi plank par baithte hain, hawa mein nahi), aur glass ka base + tea level + steam sab coherent hai.

---

## 11. "2 Baje Ki Maggi" — a 60 s short, and the six bugs it cost

The first short proved the engine could hold a beat. The second one had to hold **four acts**
and a joke. Everything below is a rule the render fought for.

### 11.1 A camera is a scope, not a state

`camera(g, {...})` that calls `g.save()` and never restores leaks the transform into every later
frame: the canvas stack grows, shots drift, and a render "works" right up until it doesn't.
The helper is now `withCam(g, opts, fn)` — save, transform, draw the world, restore. Characters
go **inside** the scope, so a push-in zooms the actor and the background together. Zooming only
the plate and leaving the bust at screen scale is what makes an animation feel like a slideshow.

### 11.2 `canvas.encode()` is async; `canvas.toBuffer()` is not

In a still-export loop the async encoder can hand back the *next* frame's pixels, so you spend
an hour debugging a film where every frame is one scene behind. `toBuffer('image/png')` is
synchronous and correct.

### 11.3 Key the background by flood fill, never by colour alone

A white keying pass deletes eye-whites, teeth and bowl rims — they are white too. Flood fill
inward from the border over near-white pixels, then erode 1 px. Anything the ink encloses
survives.

### 11.4 Mouth patches are derived, not hand-placed

Ask the image model for the same character with a different mouth, then **diff** the variant
against the base after an alignment search. The changed region is the patch — no eyeballing
coordinates, and the box stays correct when the artwork is regenerated. The warden's
`patch_{A,E,O,blink,smile}.png` are produced that way by `src/prep-maggi.mjs`.

### 11.5 Steam is soft puffs, not line segments

Chains of tapered strokes read as dashed strings hanging in the air. Overlapping radial-gradient
puffs that rise, wobble and fade read as vapour. Same for the burner: a free-standing flame
sprite looks like a sticker on the oven panel — draw a heat glow plus a few blue licks hugging
the pot's base instead.

### 11.6 Duck the score, don't just lower it

A constant bed level under eleven lines is exhausting. An envelope follower on the voice bus
(`duck = 1 - 0.42 * clamp(env/0.06)`) with fast attack and slow release keeps the music present
between phrases and out of the way during them.

### 11.7 Shot sheet

| Time | Shot | What is actually happening |
|---|---|---|
| 0.0–5.0 | cold open | title on the room plate, then he surfaces out of the dark, clock overlay |
| 5.0–14.0 | the craving | cut-out bust, thought bubble with a drawn packet, growl gag |
| 14.0–24.0 | corridor walk | 6-pose flip-book, scrolling plate, footsteps locked to stride, **freeze** on a creak |
| 24.0–34.0 | kitchen | burner glow, steam puffs, falling masala, panning camera |
| 34.0–43.0 | the knock | dark grade, door light creeping in, three knocks, the hidden bowl |
| 43.0–52.0 | the warden | she slides in, sniff, dramatic push-in on her face, then a smile patch |
| 52.0–60.0 | payoff | two-shot with two bowls, slurps, end card |

Timing is cue-first: every line is placed on the beat, and the *visual* is written to match it —
never the other way round.

---

## 12. "2 Baje Ki Maggi" v2 — making a character belong to the room

The first cut had a floating bust in front of a photograph of a kitchen, a pot of nothing, and a
warden who teleported in. Six fixes, all of them structural:

### 12.1 Action is a pose pack, not a still with steam on it

"Steam rising off nothing" is the tell. The cooking beat needed **drawings of cooking**: five
generated action poses (open the packet → snap the noodles → stir → sprinkle masala → taste),
cut and normalised on the head axis exactly like the walk cycle. Then the *pot* is drawn in code
so the noodles actually appear, cook and get stirred, and dry noodles visibly fall from his hands
into it. Rule of thumb extended: **locomotion = flip-book, action = pose pack, conversation = cut-out.**

### 12.2 Light-wrap the cast, or they will always look pasted

Characters now render to their own transparent layer; a scene-coloured gradient plus a key light
is stamped onto that layer with `source-atop`, and only then is it composited into the plate.
Two extra stops of colour temperature is the difference between "in the room" and "on top of it".

### 12.3 A foreground layer buys more depth than any background

The same plate, scaled 6 % about the counter line and clipped below it, becomes a foreground
counter. The actor is sandwiched between the plate and its own foreground copy — real parallax,
real occlusion, and his cut-off waist stops being a bug. It also gives the shot an anchor for
contact shadows and a place to hide the frame edge.

### 12.4 Blocking beats entry

She used to appear in the frame. Now: light under the door → her shadow thrown up the wall →
her shape **resolving out of the silhouette** as she crosses → a hard cut to his face → her sniff →
the push-in → the smile. Same five seconds, ten times the weight, and not one extra drawing —
the silhouette is her own sprite with `source-atop` shade burned in.

### 12.5 Keep characters on opposite sides of the frame

Two busts at 0.74W and 0.72W is one character with a face problem. Whichever way the door is,
the intruder crosses *to* the far side and the guilty party backs into the near one. Staging is
cheaper than art.

### 12.6 Everything gets a breath

Every held pose now carries a slow 1.9 Hz sway and a hair of rotation. Nothing in the frame is
ever a still image — which is what "static" actually means to an audience.

### 12.7 Cook beat sheet

| t | Pose | Also on screen |
|---|---|---|
| 22.5 | `packet` — tearing it open | match strike, burner glow |
| 24.9 | `break` — snapping dry noodles | noodles falling into the pot, crinkle SFX |
| 27.5 | `stir` — ladle in the kadhai | noodles cooking, steam puffs, boil SFX |
| 29.5 | `masala` — pinching spice | spice specks falling |
| 30.9 | `taste` — spoon to his mouth | the line, "mmm!" |
