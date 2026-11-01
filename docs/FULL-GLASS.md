# FULL GLASS — a 29 s reel on the chai tapri

Your sketch, rigged and animated: **Bunty** (the guy in the orange sweater, blue cap, round glasses
and walrus moustache) runs a 2 a.m. chai stall. **Chotu**, the kid in the pink beanie, wants a full
glass. Bunty explains the philosophy of the *cutting*. Chotu wins on logic. Bunty changes the rules.

| | |
|---|---|
| reel | `out/full-glass-v3.mp4` — 28.2 s, 720×1280, 30 fps, 845 frames, 3.0 MB (**v3: drawn poses**) |
| preview | `out/full-glass-clip.gif` — the chai-sip beat (9.5 s → 13.7 s) |
| contact sheet | `out/full-glass-sheet.jpg` — one frame every 2 s |
| script | `scripts/full-glass.md` |

```bash
npm run full-glass        # render the reel (~75 s on this box)
npx rigpop-motion still scripts/full-glass.md -t 14.4 -o out/stills
```

## What was built for it

### Characters
| | |
|---|---|
| `characters/bunty/` | Auto-rigged from AI part sheets drawn in the reference's marker-doodle style (cobalt ink, orange sweater, cream trousers, pink laces). 24 parts, own face kit, cap + glasses as the accessory, walrus moustache painted into the blank head. |
| `characters/chotu/` | Bunty's body parts recoloured (sweater → hot pink, trousers → cobalt) on the big-head `chhoti` skeleton, with his own head sheet (pink beanie, freckles). 26 parts. |

Two engine limits had to be worked around, both from the drawing itself being wider than the v2
skeleton:

* **Sleeves.** `src/v3/sleeves.mjs` paints its own sleeves into the torso and retires the upper-arm
  part. On a baggy raglan sweater that produced a hole and blue lining flaps. `tools/fix-bunty.mjs`
  rebuilds the torso from a purpose-drawn sweater sheet, slims it horizontally (height untouched,
  so `kT` and every rig unit stay correct), keeps an empty `sleeves.png` overlay and turns the arm
  into one continuous sweater tube, with the sleeve shadow switched off (`rig.json: armShadow: false`).
* **Proportions.** Bunty's pelvis→neck length is shortened with the `chhoti` base (`base: chhoti`),
  which is what lets a close-up frame his face on a 720×1280 reel.

### The set — `tools/scenes/chai-tapri.mjs`
A night chai tapri drawn in code in the same language as the rigs: cream plaster, cobalt dado,
wooden counter, a chalkboard menu with real type (CUTTING ₹7 / FULL ₹10 / EXTRA SUGAR — FREE /
GOSSIP — FREE), a steel shelf of kettles and jars, a radio, string bulbs, marigold bunting in the
foreground, and the back lane through the arch with a sleeping dog. It keeps the v2 world landmarks
so every camera mark still works — and the big chai patili sits exactly where the v2 pan lives, so
the engine's steam rises off it for free.

`scene: chai-tapri` in the front matter loads `tools/scenes/<scene>.mjs` (a small hook added to
`src/v3/cli.mjs`), so a set can expose its own `drawHeld` — that is how the cutting glass ends up in
Bunty's fist mid-sip.

### Gestures — `tools/clips/chai.mjs`
Pose-first rules apply: no big puppet swings. These are the small ones the rig is allowed to do —
`rest-counter` (hands on the counter, slow sway), `sip-chai` (glass to the moustache, eyes shut in
bliss), `present`, `cross-arms`, `point-up` — plus the library's own `stir`, `peek`, `sneak`.


## v3 — the puppet arms are gone

**The bug you saw.** The engine's default path is a *cut-out puppet*: the character's parts are cut
from art and the arms are drawn as tapered tubes by the rig. On Bunty the painted sweater sleeves
were part of the torso art, so the rig's arms sat on top of a second pair of sleeves — orange arms
overlaid on the drawing. That is the engine's design (v2 "vector cut-out" animation), and the fix is
not to patch it further but to stop using it for this character.

**The fix, the way rigpop-talk does it.** Every beat is now a *drawn pose*: a whole figure with its
own arms, in the same style. Poses live as individual images —

```
characters/bunty/poses/
  idle/    pose.png (source drawing) + key0.png (cut) + pack.json
  sip/  folded/  point/  laugh/
characters/chotu/poses/  excited/  point/  laugh/
```

and each is played with `[B pose-pack sip 60s &]`. The puppet only supplies position, depth and
timing; it never draws an arm. `tools/make-packs.mjs` builds a pack from one image or a folder of
images, and `tools/cut-sheet.mjs` cuts a pose *sheet* into individual pose images when the art
arrives as a grid (that is all a sheet is — a delivery format).

Three engine bugs found and fixed on the way, worth knowing about:

1. `tools/*` extraction treated connected-component id `0` as a valid mask label — but `0` is also
   "no component" — so pose cut-outs kept a solid plate of the background. Guarded with an alpha test.
2. Re-running `chromaKey` on an image that is already cut zeroed its RGB and destroyed the
   artwork's colour. Packs now detect an already-cut image and skip the key.
3. A pose pack was written to `poses/<name>/<name>/`, so the renderer kept picking up the previous
   `pack.json` and nothing appeared to change. Output path fixed.

Also added: a `bust` pack mode (waist-up art, the way talk-style characters are drawn) which is
sized by head width and stands on the rig's skinned legs, and the `scene:` hook now also imports
project-local gesture clips before compiling.

## Earlier fix log

**v2 — the "extra arms".** Bunty's torso sprite had two sleeve lobes painted into it, so his IK arms
hung *beside* a second pair of sleeves; the ghosts read as a spare set of arms laid on top of him.
`tools/fix-bunty.mjs` now repaints every non-fill pixel inside the silhouette (the seam lines and
their anti-aliased edges) in the sweater colour, keeping the outer outline and the collar/hem bands.
Second, `cross-arms` is retired from the reel — two forearms across a baggy sweater read as bars —
and replaced with `present`; `point-up` now points out to the side instead of across the chest.
Third, the `rest-counter` stance runs under the whole reel so no shot ever shows the arms hanging
off the body. Chotu's empty `shades` slot is gone as well.

## Shot list
1. wide — 2 a.m., the patili is hot, "sirf chai jaagti hai"
2. medium — stir, push-in
3. wide — Chotu sneaks in from off-right: "Ek full glass!"
4. close — "cutting chai ke devta hain", arms folded
5. medium / close — the sip: "Aadhi mein bhi pyaar hota hai"
6. medium — Chotu's finger goes up: "Aadhi mein sirf hisaab hota hai!"
7. ECU — the freeze, sting
8. close — "Naya rule! Full glass... double paisa!"
9. wide — "Deal!", slow push-in, payoff: "Tapri kabhi band nahi hoti."

## v6 — the faces come alive (final)

Pose packs replace the whole drawing, so the rig's face stack was bypassed and the characters went
dead. `tools/face-patches.mjs` now gives every packed key a small patch set: a blink patch over the
eyes and five mouth patches (rest / M / A / O / E) over the mouth, selected at draw time by the
rig's own `MOUTH_TAG` mapping.

What made the mouth stop looking like a sticker:

- **feathered erase** — the patch box is filled row by row by interpolating the real skin colour just
  outside the box on the left and on the right, so the drawing's own shading continues through the
  patch and both edges are pixel-identical. No flat rectangle, no seam.
- **anchored detection** — the mouth is found from the moustache (largest wide near-black blob under
  the eyes) or, for characters without one, from the lowest short ink stroke with chin skin under it.
  Collar arcs and jaw outlines were winning the naive tests.
- **lips under the moustache** — the pasted shape is placed just below the last moustache row
  (`inkBottom()`), and is sized from the character's own drawn mouth (`mw`) when there is one.
- **always-on idle** — `drawPack` adds the rig's breath and sway to every pose frame, so a held
  drawing is never frozen.

`[B]/[C] pose-pack` keys now blink (`P.face.blink > 0.45`) and lip-sync while the drawn poses carry
the body language. Keys where the head is occluded (Bunty `sip`, `laugh`) still fall back to the
drawing's own face, so they do not blink.
