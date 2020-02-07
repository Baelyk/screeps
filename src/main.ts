import { ErrorMapper } from "utils/ErrorMapper"
import { watcher } from "utils/watch-client"
import { doRole } from "creeps"
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
      delete Memory.creeps[name]
    }
  }

  // Process creep behavior
  console.log(`Processing creep behavior`)
  for (const name in Game.creeps) {
    console.log(`  Processing behavior for ${name}`)
    doRole(Game.creeps[name])
  }

  // Process spawn behavior
  console.log(`Processing spawn behavior`)
  for (const name in Game.spawns) {
    console.log(`  Processing behavior for ${name}`)
    spawnManager(Game.spawns[name])
  }

  // screeps-multimeter watcher
  watcher()
});
