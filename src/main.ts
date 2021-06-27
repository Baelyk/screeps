import { ErrorMapper } from "utils/ErrorMapper";
import { watcher } from "utils/watch-client";
import { tick } from "utils/logger";
import { debugPostLoop, debugLoop } from "utils/debug";
import { wrapper } from "utils/errors";
import { creepManager } from "creeps";
import { spawnManager } from "spawns";
import { roomManager } from "rooms";
import { testFunction } from "roomMemory";

console.log("- - - - RESTARTING - - - -");

export const loop = ErrorMapper.wrapLoop(() => {
  tick();

  if (Memory.uninitialized) {
    console.log(`!! Uninitialized !!`);
  }

  // Debug
  wrapper(() => debugLoop(), `Error in debug loop`);

  // Process spawn behavior
  wrapper(() => creepManager(), `Error managing creeps`);
  // Process spawn behavior
  wrapper(() => spawnManager(), `Error managing spawns`);
  // Process room behavior
  wrapper(() => roomManager(), `Error managing rooms`);

  // Debug post-loop actions
  wrapper(() => debugPostLoop(), `Error in debug post loop`);

  // screeps-multimeter watcher
  watcher();
});
