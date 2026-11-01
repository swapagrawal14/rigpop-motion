// Kept for older commands: the implementation now lives in src/v3/facepatch.mjs and runs
// automatically at the end of `rigpop-motion poses`. Use `rigpop-motion faces <character> [pose]`.
import { patchPoses } from '../src/v3/facepatch.mjs';
await patchPoses(`characters/${process.argv[2]}`, { log: (m) => console.log(m) });
