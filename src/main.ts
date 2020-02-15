import { ErrorMapper } from "utils/ErrorMapper"
import { watcher } from "utils/watch-client"
import { doRole, handleDead } from "creeps"
import { init } from "initialize"
import { spawnManager } from "spawns";
import { tick, info, warn } from "utils/logger";
import { resetRepairQueue } from "construct"
import { census } from "population";

console.log("- - - - RESTARTING - - - -")

export function resetMemory() {
  warn("Reseting memory")
  Memory.uninitialized = true
  Memory.initialSpawn = "Spawn1"
  Memory.constructionQueue = []
  Memory.repairQueue = []
  Memory.watch = {}
  Memory.debug = {
    log: {
      infoSettings: {
        general: true,
        spawn: true,
        task: true,
        idleCreep: true,
        build: true
      }
    }
  }
  Memory.populationLimit = {
    builder: 1
  }
}

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

  // Update repair queue and pop limits every 100 ticks
  if (Game.time % 100 === 0) {
    for (const name in Game.rooms) {
      // This will not work with multiple rooms, despite the way I've made it
      resetRepairQueue(Game.rooms[name])
      census(Game.rooms[name])
    }
  }

  // screeps-multimeter watcher
  watcher()
});
