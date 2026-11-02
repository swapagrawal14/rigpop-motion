# Rigpop Motion: rules for any AI agent making cartoon animation

**Pose first, motion second.** Every gesture and action starts from fully drawn character poses. Movement is only the smooth travel *between* those poses. Never animate a gesture by swinging puppet limbs on its own; that looks abrupt, chaotic and ugly.

## The workflow (always in this order)
1. **Script the beats.** List every action and gesture the character does (sneak, peek, shake packet, stir, taste, laugh, point, wave...).
2. **Generate the key poses first.** For each beat, generate a pose pack: 4-8 full-body drawings of the *same* character (one shared style bible plus the model sheet as reference), covering anticipation → main action → follow-through → settle. Use `rigpop-motion poses <character> <action>`.
3. **Clean and normalise.** Auto-cut, same scale, feet on one floor line, same lighting (the `poses` command does this).
4. **Then add motion between poses.**
   - Ease in and out of every key (no linear moves). Use anticipation before a big move and overshoot plus a settle after it.
   - Hold each key 3-8 frames. **Switch drawings on a hard cut.** Cross-dissolves and smears between
     two painted poses put both drawings on screen at once — verified on this engine, it reads as
     ghosting/double characters, which is exactly the artefact we are trying to kill. What sells the
     change is the cut landing on the beat plus the pose warp, breath, blink and mouth on the new key.
   - Keep the face alive on top of the pose: blinks, eye darts, lip-sync mouth patches. A pose pack
     replaces the drawing, so its face has to come back as patches — `rigpop-motion poses` writes
     `keyN.blink.png` and `keyN.m.*.png` for you; `rigpop-motion faces <character>` re-cuts them.
     Never ship a pack whose keys have no `face` block: those characters stand there dead.
   - Add secondary motion (breathing, a slight body sway, hair or cloth follow-through) as small offsets on the current pose, never as limb swings.
5. **Camera and cuts last:** shot choice, push-ins, shake on impacts.

## Hard rules
- **No visible puppet joints.** No shoulder balls, sleeve caps or joint circles. Sleeves belong to the torso; arms come out from under them.
- **If the character's arms are already painted into the body drawing, do not rig puppet arms on
  top of it** — you get two sets of arms. Use a pose pack for that character (`rigpop-motion poses`),
  and let the drawn art carry the gesture.
- A puppet/IK arm move is allowed only for **tiny** motions (a small stir loop, a hand resting) and only between two drawn poses. If a move is bigger than about 30°, generate a pose instead.
- Every action in a script must name a pose pack (`[K pose-pack stir 2s]`). If no pack exists, generate one before rendering.
- **A speaking character should not hold one drawing for a long beat.** Two working shapes:
  - a **rotation**, `[K poses talk point talk idle 60s &]` — shows the packs in turn, each holding
    the clip's hold time (~1.7 s; the number in the args overrides it), and a multi-key pack
    (`talk` has three keys) cycles inside its own turn; or
  - a **pinned pose**, `[K poses point 60s &]` — one drawing for the whole line. This is what
    `scripts/chappal-pro-max.md` does, one pose per beat: fine on lines up to ~3 s, because the
    camera, the pose warp and the face patches keep the drawing alive, and the cut to a new pose on
    the next beat is the motion.

  Either way every change is a cut, never a cross-fade. Keep the home pose first, put a gesture in
  the middle, and do not use a pose that reads as a resting posture (hands on hips, arms folded,
  sipping) as the *second* position in the middle of a sentence.
- Same character everywhere: reuse the exact style-bible text and model-sheet reference in every pose prompt, and regenerate any pose whose face or outfit drifts.
- QA before delivering: check a contact sheet and consecutive-frame strips for pops, jitter, detached parts or style drift. Fix them, and don't ship abrupt moves.

## New idea = new cast, new poses (reuse policy)

A new video idea is a new production, not a re-shoot of the last one. Build the performance assets
for it; reuse only the machinery.

**Build fresh, every idea:**

- the **cast** — `characters/<new-name>/` with its own drawn pose packs. Do not stage a new reel by
  borrowing another reel's character, and never point a new character's `rig.json` at someone
  else's pose PNGs to save a generation.
- the **pose packs** for every beat, from a new pose sheet with a style bible: `listen` / `think` /
  `point` / `explain` / `talk` shaped around what *these* characters actually do in *this* script.
  Do not recycle an existing pack name for a beat it was not drawn for.
- the **script** (`scripts/<idea>.md`) and a **writeup** (`docs/<IDEA>.md`) that records the beat
  table, the framing numbers and what went wrong on the way.

**Reuse freely — this is infrastructure, not performance:**

| reusable | why |
|---|---|
| `src/` engine, `src/v3/cli.mjs`, `tools/*` | the pipeline itself |
| sets in `tools/scenes/` | a new room can be copied and re-dressed; the layout maths is expensive |
| `characters/<x>/parts/mouth.{A,E,M,O}.png` | legible mouth *shapes* are a rig component — chappal v4 got working lips by copying bunty's into pihu/shukla |
| voices, music beds, sfx, `npm` scripts | cue-locked sound does not need to be re-authored |

**Do not extend the old IK gesture clips.** `tools/clips/viva.mjs` and `tools/clips/chai.mjs` are the
pre-pose-pack path (solved puppet arms driving a gesture). They are kept so old scripts still render;
they are not a template for new work, and a new gesture is a drawn pose pack, never a new clip in
those files. Same for `src/maggi-short.mjs` and the v2 reels — history, not starting points.

If a reel is deliberately a **continuation** of an existing series (same characters, next episode),
then reusing that cast's packs is correct — but say so in the script header (`continuity: <series>`),
and any *new* action still needs a newly drawn pose.

## Why
Hand-drawn studios animate pose-to-pose: strong keys first, timing and in-betweens after. Drawn poses always look intentional and appealing; procedural limb swings look robotic. The best results so far came from full drawn poses (Rigpop's doodle characters, AI-generated pose sheets) with smooth eased transitions between them.

## Face patches on pose packs (v3)

`rigpop-motion faces <character>` writes, per key, a blink patch, eye darts and five lip-sync mouth
patches, and stores their rects in that pose's `pack.json`. The mouth rect has to be the DRAWN mouth,
exactly: a patch that sits beside it leaves the drawing's own mouth on screen, i.e. two mouths.

Automatic detection is good on a clean face and unreliable on a real one — a white moustache swallows
the mouth, a spectacle frame swallows the eyes, white teeth read as sclera. When that happens the rects
are set by hand, per key, in `characters/<char>/poses/<pose>/pose.config.json`:

```json
{ "mode": "full", "out": "full",
  "face": { "key0": { "eyes": [126, 66, 51, 14], "mouth": [135, 112, 26, 15] } } }
```

- `eyes` is one box over both eyes (it gets split into a pair) or a PAIR of boxes
  `[[x,y,w,h],[x,y,w,h]]` for a turned head where the two eyes are not level.
- `mouth` is the box that IS the drawn mouth: it gets erased and the lips are pasted over it. A pose
  that hides the mouth (a cup at the lips) uses `"mouth": "skip"`.
- Numbers are in KEY-image pixels. Measure them, never guess, and then LOOK:

```bash
node tools/facegrid.mjs sharmaji talk key1.png 8      # zoom + pixel grid to read numbers off
node src/v3/cli.mjs faces sharmaji                     # regenerate the patches
node tools/face-rects.mjs sharmaji talk out/x.png      # the rects drawn on every key
node tools/face-paste-preview.mjs sharmaji talk A out/y.png  # the mouth patch pasted back on
node src/v3/cli.mjs qa scripts/chai-namak.md           # the automated backstop
```

The preview is the one that settles it: if the drawing's own mouth is still visible next to the patch,
the box is in the wrong place or too small, whatever the numbers say.


## Worked example, read this before building a reel

[docs/CHAPPAL-PRO-MAX.md](docs/CHAPPAL-PRO-MAX.md) is a 32 s reel built the strict way: two
characters, four full-body drawn poses each, no skeleton at all. It documents the three failures
that cost the most time — a pose pack with no `parts/mouth.{A,E,M,O}.png` renders with a dead mouth
and no error, `[shot medium K]` centre-crops a vertical frame so the head leaves the shot (use
`[shot at <x> <y> <zoom>]`, 2.0–2.4× for a full-body drawing), and a closed-eye frame is usually the
blink patch, not a bug.
