import { ErrorMapper } from "utils/ErrorMapper";
import { watcher } from "utils/watch-client";
import { tick } from "utils/logger";
import { debugPostLoop, debugLoop } from "utils/debug";
import { wrapper } from "utils/errors";
import { creepManager } from "./creeps";
import { spawnManager } from "spawns";
import { roomManager } from "rooms";
import { expansionManager } from "expansion";
import { mapVisualManager } from "mapVisuals";
import { ensureMemoryPaths } from "utils/helpers";
import { MemoryProfiler } from "./utils/profiler";

console.log("- - - - RESTARTING - - - -");
ensureMemoryPaths();
export const loop = ErrorMapper.wrapLoop(() => {
  tick();

  // Profile the CPU cost of parsing memory, which seems to be done on the first
  // access of the Memory object
  MemoryProfiler.firstParse();

  // Debug
  wrapper(() => debugLoop(), `Error in debug loop`);

  // Process spawn behavior
  wrapper(() => creepManager(), `Error managing creeps`);
  // Process spawn behavior
  wrapper(() => spawnManager(), `Error managing spawns`);
  // Process room behavior
  wrapper(() => roomManager(), `Error managing rooms`);
  // Process expansion behavior
  wrapper(() => expansionManager(), `Error managing expansions`);
  // Process map visuals
  wrapper(() => mapVisualManager(), `Error managing map visuals`);

  // screeps-multimeter watcher
  watcher();

  // Debug post-loop actions
  wrapper(() => debugPostLoop(), `Error in debug post loop`);
});
