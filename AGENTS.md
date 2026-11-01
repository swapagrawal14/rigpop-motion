# Rigpop Motion: rules for any AI agent making cartoon animation

**Pose first, motion second.** Every gesture and action starts from fully drawn character poses. Movement is only the smooth travel *between* those poses. Never animate a gesture by swinging puppet limbs on its own; that looks abrupt, chaotic and ugly.

## The workflow (always in this order)
1. **Script the beats.** List every action and gesture the character does (sneak, peek, shake packet, stir, taste, laugh, point, wave...).
2. **Generate the key poses first.** For each beat, generate a pose pack: 4-8 full-body drawings of the *same* character (one shared style bible plus the model sheet as reference), covering anticipation → main action → follow-through → settle. Use `rigpop-motion poses <character> <action>`.
3. **Clean and normalise.** Auto-cut, same scale, feet on one floor line, same lighting (the `poses` command does this).
4. **Then add motion between poses.**
   - Ease in and out of every key (no linear moves). Use anticipation before a big move and overshoot plus a settle after it.
   - Hold each key 3-8 frames. Cross-dissolve or smear one in-between frame on fast changes; never hard-pop between very different poses.
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
- Same character everywhere: reuse the exact style-bible text and model-sheet reference in every pose prompt, and regenerate any pose whose face or outfit drifts.
- QA before delivering: check a contact sheet and consecutive-frame strips for pops, jitter, detached parts or style drift. Fix them, and don't ship abrupt moves.

## Why
Hand-drawn studios animate pose-to-pose: strong keys first, timing and in-betweens after. Drawn poses always look intentional and appealing; procedural limb swings look robotic. The best results so far came from full drawn poses (Rigpop's doodle characters, AI-generated pose sheets) with smooth eased transitions between them.
