import { ErrorMapper } from "utils/ErrorMapper";
import { watcher } from "utils/watch-client";
import { tick } from "utils/logger";
import { debugPostLoop, debugLoop } from "utils/debug";
import { wrapper } from "utils/errors";
import { init } from "initialize";
import { creepManager } from "creeps";
import { spawnManager } from "spawns";
import { roomManager } from "rooms";
//import { testFunction } from "roomMemory";

console.log("- - - - RESTARTING - - - -");

export const loop = ErrorMapper.wrapLoop(() => {
  tick();

  // If uninitialized, initialize
  if (Memory.uninitialized) {
    wrapper(() => init(), `Error initializing`);
  }

  // Debug
  debugLoop();

  // Process spawn behavior
  wrapper(() => creepManager(), `Error managing creeps`);
  // Process spawn behavior
  wrapper(() => spawnManager(), `Error managing spawns`);
  // Process room behavior
  wrapper(() => roomManager(), `Error managing rooms`);
  _.filter(["hello"], { key: "world" });

  // Debug post-loop actions
  debugPostLoop();

  // screeps-multimeter watcher
  watcher();
});
