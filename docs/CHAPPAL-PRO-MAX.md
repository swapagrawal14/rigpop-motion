# CHAPPAL PRO MAX — a 32 s reel in the viva room

New cast, new set, and a different answer to "the gestures look wrong".

| | |
|---|---|
| reel | `out/chappal-pro-max-v3.mp4` — 32.3 s, 720×1280, 30 fps, 968 frames, 4.7 MB |
| script | `scripts/chappal-pro-max.md` |
| render | `npm run chappal` (~35 s on this box) |

## The idea

A final-year student pitches **Chappal Pro Max** at her viva: GPS, bluetooth, a solar battery, and a
slipper that shouts at whoever steals it. Prof. D.K. Shukla is not impressed, then orders two.

## What is different here

**1. Vector puppets, not pose packs.** `chai-namak` / `full-glass` cut between drawn poses, which is
why their gestures come in steps. This reel is the v2 skeleton again (`rig: vector:pihu` /
`rig: vector:prof`): IK arms solve every frame, so a gesture is a *motion* — a hand travels to the
table, lands, comes back — and nothing is ever swapped, blended or cross-faded. Frame-diff median is
1.17 / 255 (the pose-pack reels sit at 0.4–0.7) with every bit of it being real movement.

**2. Two new characters, drawn by the rig.** `src/v2/rig.mjs` gained

* `hairStyle: 'bald'` — grey tufts over the ears, a shiny scalp, so an old man is a *silhouette*
  change rather than a colour change;
* `accessory: 'glasses'` — steel rims with a lens glint, and a `moustache` flag above the lip;
* `sleeve: false` — arms as one clean skin tube out of a rounded shoulder cap. This is what makes big
  gestures readable: the sleeve polygons were the thing that broke when an arm swung past ~35°.
* a lanyard + college ID on the chest of the student.

**3. A set made of daylight.** `tools/scenes/viva-room.mjs`: cream plaster, a green dado, a chalkboard
with the viva checklist (item 2 circled in chalk, drawn over time), a notice board with a sheet always
about to fall, a calendar with the day circled, a clock at 11:58 — and a ceiling fan that never stops
turning, which keeps the wide shots alive without moving a character.

**4. Gestures chosen by the emotion of the line** — `tools/clips/viva.mjs`:

| the line is… | the hands do |
|---|---|
| nervous | `papers` — the answer sheets, shuffled in both hands |
| deadpan / smug | `tap-table`, `push-glasses`, `clasp` |
| excited | `chappal-up` — picks the chappal off the table and holds it up |
| explaining | `explain`, `show-size`, `point-fwd` |
| angry | `slap-table` — the palm lands on the desk (with the `clink`) |
| beaten | `hands-up` |

Every clip is authored in the actor's own local rig units via `c.toLocal(...)`, so the same gesture
works wherever the character is standing.

**5. New engine bits**, both small:

* `src/v3/cli.mjs` loads *every* file in `tools/clips/` (it used to hard-code `chai.mjs`).
* `[scene chappalTaken on]` — a generic set switch; the chappal stops being drawn on the desk in the
  same frame the character picks it up.
* `desk-left` / `desk-mid` / `desk-right` marks: the near edge of the counter, for two people standing
  at a table instead of behind it.
* `tools/lines.mjs` — prints the compiled line timings, which is how the gesture durations were tuned.
