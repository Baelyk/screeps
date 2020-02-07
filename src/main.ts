import { ErrorMapper } from "utils/ErrorMapper"
import { doRole } from "creeps"
import { init } from "initialize"

console.log("- - - - RESTARTING - - - -")

export const loop = ErrorMapper.wrapLoop(() => {
  console.log(`tick: ${Game.time}`)
  if (Memory.uninitialzied) {
    init()
  }

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name]
    }
  }

  // Process creep behavior
  for (const name in Game.creeps) {
    doRole(Game.creeps[name])
  }
});
