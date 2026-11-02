# CHAPPAL PRO MAX — a 32 s reel, made entirely of drawn poses

New cast, new set, and the final answer to "the gestures look wrong".

| | |
|---|---|
| reel | `out/chappal-pro-max.mp4` — 32.3 s, 720×1280, 30 fps (on twos), 968 frames, 4.1 MB |
| script | `scripts/chappal-pro-max.md` |
| render | `npm run chappal` (~33 s on this box) |
| cast | `characters/pihu` (student), `characters/shukla` (examiner) |
| set | `tools/scenes/viva-room.mjs` |

## The idea

A final-year student pitches **Chappal Pro Max** at her viva: GPS, bluetooth, a solar battery, and a
slipper that shouts at whoever steals it. Prof. D.K. Shukla is not impressed, then orders two.

## The rule this reel is built on: no puppets

Every character in this reel is **one full-body drawing per pose**. There is no skeleton, no arm
polygon, no IK solve, no blending. The engine swaps the drawing on a cut and animates the *camera*,
the breath, the blinks and the mouth inside it.

That is a deliberate trade: you lose continuous arm motion, and in exchange you can never get the
thing that made the earlier cuts unwatchable — a limb that swings away from the artwork it was cut
from. A pose change is always a hard cut, never a cross-fade, so there is no ghosting and no double
character.

```
characters/pihu/poses/listen/key0.png    one drawing, whole body, hands already where they belong
characters/pihu/poses/point / think / explain
```

## Cast and the four packs

| pack | the drawing | used when the line is… |
|---|---|---|
| `listen` | hands folded / on chest, mouth closed | the other person is talking, or a nervous question |
| `think` | arms crossed, chin on knuckles, eyes up | doubt, a catch, "aur agar chori ho jaye?" |
| `point` | one arm out, finger out, weight on one leg | selling it, accusing, correcting |
| `explain` | both palms open, elbows in | plain explaining, no drama |
| `talk` | drawn key set with the arc of the line | anything that needs a beat of motion |

**Gestures follow the emotion of the line, never a loop.** Each beat in the script names the pack it
wants and holds it for the length of its line:

```
# 4 · The catch
[S poses think 60s &]
S (suspicious): Aur agar chori ho jaye?

# 5 · The fix
[P poses point 60s &]
P (proud): GPS, bluetooth, solar battery!
```

`60s` is how long the clip is allowed to run and `&` makes it a **background** action, so the pose
plays *while* the line is spoken instead of before it. Naming the pack pins the actor to that one
drawing for the whole line (`poses` builds a rotation out of the names it is given — one name, one
drawing). Leaving the name out, `[P poses 60s &]`, hands the choice to the emotion of the line via
`GESTURES[expr]` in `src/v3/posepack.mjs`, which is the right call when a speaking beat needs to
move between drawings. This reel mostly pins, because one clear pose per beat reads better in a
30-second short: ordinary dialogue is `listen`/`explain`, while `point` and `think` are accents,
about one per two lines, so nobody waves their hands for thirty seconds.

## Three things that cost the most debugging time

**1. A pose pack with no mouth files is silent, and it fails quietly.** `facepatch.mjs` needs
`characters/<name>/parts/mouth.{A,E,M,O}.png` to build the viseme patches. Without them the pack
still renders, `pack.json` still looks valid, and `face.mouth.files` comes back `{}` — the character
talks with a dead closed mouth. Check it after every `faces` run:

```
node src/v3/cli.mjs faces pihu       # writes key0.m.*.png for every key
node -e "console.log(require('./characters/pihu/poses/point/pack.json').face)"
```

Face rects are per key and live in the pack config, in source pixels of that key:

```
characters/pihu/poses/point/pose.config.json
  { "face": { "key0": { "eyes": [x, y, w, h], "mouth": [x, y, w, h] } } }
```

**2. `[shot medium K]` is wrong for a 720×1280 frame.** The named framings centre-crop, which on a
vertical frame puts the head above the top edge and fills the screen with empty wall — the effect is
"the actor walked out of shot". Author the frame explicitly instead:

```
[shot at <x> <y> <zoom>]        # 1.0 = whole frame, x/y = the point that stays centred
```

Framing that works on this set:

| shot | mark |
|---|---|
| student, medium | `[shot at 195 800 2.0]` |
| student, close | `[shot at 195 760 2.0]` |
| examiner, medium | `[shot at 705 780 2.0]` |
| examiner, close | `[shot at 705 700 2.4]` |
| both, establishing | `[shot two P S]` + `[camera push 1.42x 2.8s]` |

Above ~2.5× the head is clipped at the top and the hands get cut by the frame edges, so 2.0–2.4 is
the usable close-up range for a full-body drawing.

**3. Blinks look like a bug and are not.** The face patch survives the pose swap, so a closed-eye
frame is usually just the blink curve crossing 0.45 for ~0.1 s. Confirm before "fixing" it — dump
stills 0.1 s apart across the suspect beat:

```
node src/v3/cli.mjs strip scripts/chappal-pro-max.md -t 13.0 -n 12 --step 0.1 --scale 0.5 -o out/strip.jpg
```

## QA pass for this reel

```
node tools/lines.mjs                                  # 12 lines, 32.26 s
node src/v3/cli.mjs faces pihu && node src/v3/cli.mjs faces shukla
node src/v3/cli.mjs still scripts/chappal-pro-max.md -t 4.6,6.9,13.0,17.9 -o out/cpz
node src/v3/cli.mjs render scripts/chappal-pro-max.md -o out/chappal-pro-max.mp4 --crf 24
ffmpeg -i out/chappal-pro-max.mp4 -vf "select='not(mod(n\,32))',scale=240:-1,tile=6x6" \
       -frames:v 1 out/sheet.jpg                      # every 1.07 s, all 36 cells
```

What the contact sheet has to show, and does: one character per frame (no ghosts, no doubles), every
mouth on the drawn mouth, heads inside the frame on every shot size, and a different silhouette on
each beat.

## Where the reel went, in order

| cut | cast | motion |
|---|---|---|
| v1–v3 | vector puppets, IK arms | continuous, and the arms were the problem |
| v4 (this one) | drawn pose packs | hard cuts between full-body drawings |

v3 is kept in the history for the vector path (`rig: vector:*`, `tools/clips/viva.mjs`); the shipped
reel is v4.
