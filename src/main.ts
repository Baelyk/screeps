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
import "./utils/profiler";

console.log("- - - - RESTARTING - - - -");
ensureMemoryPaths();
export const loop = ErrorMapper.wrapLoop(() => {
  let beforeCpu = Game.cpu.getUsed();
  function cpuUsed(msg: string): void {
    console.log(`${msg} ${Game.cpu.getUsed() - beforeCpu}`);
    beforeCpu = Game.cpu.getUsed();
  }
  tick();
  cpuUsed("tick");

  wrapper(() => console.log(Memory.debug.resetRoomMemory), `Error saying hi`);
  cpuUsed("hiing");

  // Debug
  wrapper(() => debugLoop(), `Error in debug loop`);
  cpuUsed("debug");

  // Process spawn behavior
  wrapper(() => creepManager(), `Error managing creeps`);
  cpuUsed("creep");
  // Process spawn behavior
  wrapper(() => spawnManager(), `Error managing spawns`);
  cpuUsed("spawn");
  // Process room behavior
  wrapper(() => roomManager(), `Error managing rooms`);
  cpuUsed("room");
  // Process expansion behavior
  wrapper(() => expansionManager(), `Error managing expansions`);
  cpuUsed("expansion");
  // Process map visuals
  wrapper(() => mapVisualManager(), `Error managing map visuals`);
  cpuUsed("map");

  // screeps-multimeter watcher
  watcher();
  cpuUsed("watch");

  // Debug post-loop actions
  wrapper(() => debugPostLoop(), `Error in debug post loop`);
  cpuUsed("debug post");
});
