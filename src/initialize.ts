// For when you need to set up a new colony

export function init() {
  console.log("Initializing...")
  // If we are initializing, we should only have one spawn anyway, so this is fine
  const spawn = Game.spawns[Memory.initialSpawn]
  const controller = spawn.room.controller
  // Get the Energy Source with the shortest path
  const source = Math.min(...spawn.room.find(FIND_SOURCES_ACTIVE).map( source => {
    return spawn.room.findPath(spawn.pos, source.pos).length
  }))

  // Spawn a creep at the spawn, this will be our energy harvester
  let response = spawn.spawnCreep([WORK, MOVE, CARRY], "InitWorker1", {
    memory: {
      role: "harvester",
      // The creep should default to harvesting
      task: CreepTask.harvest
    }
  })
  console.log("spawn creep response: " + response)

  Memory.uninitialzied = false
  console.log("Initialized!")
}
