import { initConstruction } from "construct";
import { initSpawn } from "spawns";
import { initRoom } from "rooms";
import { info, warn } from "utils/logger";

// For when you need to set up a new colony

export function init() {
  warn("[!!] Initializing... [!!]");

  // Initialize room(s)
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    initRoom(room);
  }

  // Initialize spawn
  // If we are initializing, we should only have one spawn anyway, so this is fine
  const spawn = Game.spawns[Memory.initialSpawn];
  initSpawn(spawn);
  // Spawn a creep at the spawn, this will be our energy harvester
  const response = spawn.spawnCreep([WORK, MOVE, CARRY], "InitWorker1", {
    memory: {
      role: CreepRole.harvester,
      // The creep should default to harvesting
      task: CreepTask.harvest,
      room: spawn.room.name,
    },
  });
  info(`Initial spawn response: ${response}`);

  // Initialize construction
  initConstruction(spawn);

  Memory.uninitialized = false;
  console.log("Initialized!");
}
