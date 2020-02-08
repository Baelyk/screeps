import { ErrorMapper } from "utils/ErrorMapper"
import { watcher } from "utils/watch-client"
import { doRole, handleDead } from "creeps"
import { init } from "initialize"
import { spawnManager } from "spawns";
import { tick } from "utils/logger";

console.log("- - - - RESTARTING - - - -")

export const loop = ErrorMapper.wrapLoop(() => {
  tick()

  if (Memory.uninitialized) {
    init()
  }

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      handleDead(name)
      delete Memory.creeps[name]
    }
  }

  // Process creep behavior
  for (const name in Game.creeps) {
    doRole(Game.creeps[name])
  }

  // Process spawn behavior
  for (const name in Game.spawns) {
    spawnManager(Game.spawns[name])
  }

  // screeps-multimeter watcher
  watcher()
});
