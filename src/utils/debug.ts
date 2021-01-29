import { info, warn } from "utils/logger";
import { census } from "population";
import {
  executePlan,
  getExitWallsAndRamparts,
  getExtensionSpots,
  makePlan,
} from "planner";
import { updateRoomMemory } from "rooms";

export function debugLoop(): void {
  const spawn = Game.spawns[Memory.initialSpawn];

  if (Memory.debug.resetExtensions) {
    resetExtensionSpots();
    Memory.debug.resetExtensions = false;
  }

  if (Memory.debug.resetRoomMemory) {
    resetRoomMemory();
    Memory.debug.resetRoomMemory = false;
  }

  if (Memory.debug.resetPopLimits) {
    resetPopLimits();
    Memory.debug.resetPopLimits = false;
  }

  if (Memory.debug.testWallPlanner) {
    getExitWallsAndRamparts(spawn.room);
    Memory.debug.testWallPlanner = false;
  }

  if (Memory.debug.resetPlanner) {
    makePlan(spawn.room);
    Memory.debug.resetPlanner = false;
  }

  if (Memory.debug.executePlan) {
    executePlan(spawn.room);
    Memory.debug.executePlan = false;
  }
}

function resetMemory(): void {
  warn("Reseting memory");
  Memory.uninitialized = true;
  Memory.initialSpawn = "Spawn1";
  Memory.constructionQueue = [];
  Memory.repairQueue = [];
  Memory.watch = {};
  Memory.debug = {
    log: {
      infoSettings: {
        build: true,
        general: true,
        idleCreep: true,
        spawn: true,
        task: true,
      },
    },
  };
  Memory.populationLimit = {
    builder: 1,
  };
  Memory.status = {};
}

function resetExtensionSpots(): void {
  warn("Resetting extensions");
  const spawn = Game.spawns[Memory.initialSpawn];
  // Reset spawn extensionSpots memory
  spawn.memory.extensionSpots = getExtensionSpots(spawn.room);
  // Reset list of (built) extensions
  const extensions = spawn.room
    .find(FIND_MY_STRUCTURES)
    .filter((structure) => structure.structureType === STRUCTURE_EXTENSION)
    .map((extension) => extension.pos);
  const extensionSites = spawn.room
    .find(FIND_MY_CONSTRUCTION_SITES)
    .filter((structure) => structure.structureType === STRUCTURE_EXTENSION)
    .map((extension) => extension.pos);
  spawn.memory.extensions = extensions.concat(extensionSites);
}

function resetRoomMemory(): void {
  warn("Resetting room memory");
  for (const roomName in Game.rooms) {
    updateRoomMemory(Game.rooms[roomName]);
  }
}

function resetPopLimits(): void {
  warn("Resetting population limits");
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    census(room);

    // Only run once
    break;
  }
}

export function debugEnergyHarvested(): void {
  // Only print harvest statistics in harvestStats flag is true
  if (!Memory.debug.harvestStats) return;

  // If energyharvested is undefined for some reason, initialize it
  if (Memory.debug.energyHarvested == undefined) {
    Memory.debug.energyHarvested = { startTick: Game.time, amount: 0 };
  }
  // Every 10 ticks, print harvested energy stats
  if (Game.time % 10 === 0) {
    const { startTick, amount } = Memory.debug.energyHarvested;
    const ticks = Game.time - startTick + 1;
    // Round per tick amount to 2 decimal places
    const perTick = Math.round((amount / ticks) * 100) / 100;
    info(
      `Harvesting ${perTick} / t (${amount} total in ${ticks} t since ${startTick})`,
    );
  }
  // Note about statistics:
  // Sources have 3000 energy and regenerate every 300 ticks. Therefore, I want
  // to harvest as close to 10 energy / tick / source as possible.
}
