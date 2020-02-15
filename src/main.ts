import { ErrorMapper } from "utils/ErrorMapper"
import { watcher } from "utils/watch-client"
import { doRole, handleDead } from "creeps"
import { init } from "initialize"
import { spawnManager, getMaxExtensions } from "spawns";
import { tick, info, warn } from "utils/logger";
import { resetRepairQueue, constructMinerContainers } from "construct"
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
  Memory.status = {}
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
      let room = Game.rooms[name]
      // This will not work with multiple rooms, despite the way I've made it
      resetRepairQueue(room)
      census(room)
      // If we have reached the miner tier, queue as many containers as possible for sources
      if (!Memory.status.builtAllSourceContainers && Memory.populationLimit.miner) {
        let maxExtensions = getMaxExtensions((room.controller as StructureController).level)
        let extensionsCount = room.find(FIND_MY_STRUCTURES).filter(structure => {
          return structure.structureType === STRUCTURE_EXTENSION
        }).length
        if (extensionsCount === maxExtensions) {
          info(`Requesting containers around sources`, InfoType.build)
          constructMinerContainers(room, -1)
          Memory.status.builtAllSourceContainers = true
        } else {
          info(`Waiting for max extensions to request containers around sources`, InfoType.build)
        }
      }
    }
  }

  // screeps-multimeter watcher
  watcher()
});
