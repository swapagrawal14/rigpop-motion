# Does rigpop-motion need updates, or was it my mistake?

Short answer: **both — but the bigger share is the repo's.** I made real mistakes, and the two worst
looking parts of the reel (double arms, dead faces) are holes in the engine that its own rules say
should not exist. I have now closed those two holes inside the repo instead of in my scratch tools.

Anything marked **fixed here** is committed to the working tree of this checkout.

---

## A · What the repo requires, and what it doesn't do

| # | Gap | Evidence | Whose fault |
|---|-----|----------|-------------|
| A1 | **Pose packs ship without faces.** A pack replaces the whole drawing, so blinks / lip-sync / eye darts stop being drawn — yet `AGENTS.md` step 4 says *"Keep the face alive on top of the pose: blinks, eye darts, lip-sync mouth patches."* `cutPack()` wrote `pack.json` with keys only, and `drawPack()` drew no face. Follow the repo's own workflow exactly → a character standing there dead. | `AGENTS.md` §4 vs `src/v3/posepack.mjs` `cutPack()`, `src/v3/imagerig.mjs` `drawPack()` | **Repo** (documented invariant, unimplemented) |
| A2 | **Pose keys are frozen stills.** No breath, no sway, no hair/cloth offset on the pack itself. Between keys the engine cross-dissolves and smears, so it *moves*, but a held pose is a photograph. `AGENTS.md` asks for "secondary motion (breathing, a slight body sway)" on every pose. | `drawPack()` had no `P.breath`/`P.headTilt` term | **Repo** |
| A3 | **No guard against arms already painted into the body.** `rig`/`autorig` builds puppet arms from separate parts. If the uploaded drawing already has arms (the normal case for a doodle someone hands you), the puppet arms draw *on top of* the drawn ones. `AGENTS.md` forbids visible joints but nothing detects this, warns, or suggests the pose-pack route. | `src/v3/autorig.mjs`, `src/v3/sleeves.mjs` | **Repo** (trap), **me** (walked into it, then chose pose packs — which was right) |
| A4 | **`rig` and `poses` need an external image model.** There is no local fallback and no documented hand-drawn route. With a per-turn generation cap, generating 4–8 separate poses drifts off-model; the working answer (one sheet → cut into poses) lives in my `tools/`, not in the CLI. | `posePrompt()` emits a sheet prompt, but `cutPack()` only reads `poses/<action>/sheet.png` — nothing puts it there | **Repo** (undocumented seam) |
| A5 | **No QA gate.** `still --sheet` and `strip` exist, but nothing checks for pops, scale drift, colour drift or a missing `face` block. `AGENTS.md` says "QA before delivering" and gives you no way to fail a build. | `cli.mjs` | **Repo** |
| A6 | **Drawn mouth vs. rig mouth must match by eye.** The pack's drawn face and `parts/mouth.*` come from different sources (a sheet vs. the auto-rig), so the pasted mouth can disagree in line weight, ink colour and width. Nothing compares them. | `facepatch.mjs` (my patch) uses a fixed scale table | **Repo + me** |

## B · What was squarely my mistake

| # | Mistake | Status |
|---|---------|--------|
| B1 | **v2: puppet arms overlaid on a character whose arms were already drawn.** That produced the orange double arms you rejected. The repo points at pose packs; I reached for the puppet first. | dropped, superseded by pose packs |
| B2 | **v3: shipped pose packs with no face patches at all.** Even accepting that `cutPack()` doesn't make them, `AGENTS.md` step 4 tells you the packs must carry them — I should have built that before the first render, not after the review. | fixed |
| B3 | **First mouth patch read as a sticker** — a flat rectangle of averaged skin with a hard edge and lips too wide, sitting *over* the moustache. | fixed: edge-free fill + anchored placement, see below |
| B4 | Chased the mouth anchor through three wrong heuristics (skin on both sides → collar arc; skin below the stroke → jaw outline) before anchoring on the moustache. | fixed, but it cost renders |

## C · What I changed in the repo (this checkout)

1. **`src/v3/facepatch.mjs` (new)** — `patchPoses(charDir, {only, log})`. Detects the face (warm-hue
   skin blob), the eyes (bright neutral sclera), and the mouth (moustache anchor, else the lowest
   short ink stroke with chin skin under it); writes `keyN.blink.png` and `keyN.m.rest|M|A|O|E.png`
   and a `face` block into `pack.json`.
2. **`cutPack()` now calls it**, so `rigpop-motion poses <character> <action>` produces a *finished*
   pack — a cut pack is not done until its faces are alive.
3. **New CLI verb: `rigpop-motion faces <character> [pose]`** to re-cut patches after rebuilding a
   pack or after editing `parts/mouth.*`.
4. **`drawPack()`** draws the blink when the blink curve fires and otherwise the mouth patch the
   speech is asking for, and adds the rig's breath + head sway to every pose frame.
5. **`README.md`** documents the pose-pack face contract; **`AGENTS.md`** gains the two traps that
   cost the most: painted-in arms ⇒ pose pack, and never ship a pack whose keys have no `face` block.
6. `tools/face-patches.mjs` is now a two-line wrapper so older commands keep working.

## D · Still open — the honest list

- **Body language is pose-to-pose.** Head turns, weight shifts and hand/hair drift need drawn
  in-betweens or a mesh warp on the head; the engine still only cross-dissolves between keys.
- **Occluded keys don't blink** (Bunty `sip`, `laugh`) because the eyes are covered by a hand or a
  laugh line — those beats fall back to the drawing's own face.
- **A5/A6 remain unimplemented**: no build-failing QA, no drawn-vs-rig mouth comparison. A cheaper
  fix worth doing: have `poses` warn when a key has no face block, and when the detected moustache
  width and the rig's `mouthW` disagree by more than ~20%.
