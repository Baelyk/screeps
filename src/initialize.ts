import { initConstruction } from "construct";

// For when you need to set up a new colony

export function init() {
  console.log("Initializing...")
  // If we are initializing, we should only have one spawn anyway, so this is fine
  const spawn = Game.spawns[Memory.initialSpawn]

  // Spawn a creep at the spawn, this will be our energy harvester
  let response = spawn.spawnCreep([WORK, MOVE, CARRY], "InitWorker1", {
    memory: {
      role: CreepRole.harvester,
      // The creep should default to harvesting
      task: CreepTask.harvest,
    }
  })
  console.log("spawn creep response: " + response)

  // Initialize construction
  initConstruction(spawn)

  Memory.uninitialized = false
  console.log("Initialized!")
}
