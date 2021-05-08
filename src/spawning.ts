// Manage spawn queues for a room
import { info, warn } from "utils/logger";
import { countRole, livenRoomPosition } from "utils/helpers";
import { getSurroundingTiles } from "construct";
import { GetByIdError, RoomMemoryError, ScriptError } from "utils/errors";

export function updateSpawnQueue(room: Room): void {
  if (room.memory.spawnQueue == undefined) {
    room.memory.spawnQueue = [];
  }

  // Add these roles to the top of the queue
  // Most important last
  const prioritySpawns = [
    CreepRole.reserver,
    CreepRole.guard,
    CreepRole.miner,
    CreepRole.tender,
  ];

  // Nonpriority roles that use pop limit logic to determine spawns
  // Most important first
  const limitedRoles = [
    CreepRole.hauler,
    CreepRole.upgrader,
    CreepRole.builder,
    CreepRole.extractor,
    CreepRole.scout,
  ];

  limitedRoles.concat(prioritySpawns).forEach((role) => {
    if (needRole(room, role)) {
      let overrides: Partial<CreepMemory> = { room: room.name };
      // Role-based memory overrides
      switch (role) {
        case CreepRole.miner:
          overrides = memoryOverridesMiner(room);
          break;
        case CreepRole.hauler:
          overrides = memoryOverridesHauler(room);
          break;
        case CreepRole.reserver:
          overrides = memoryOverridesReserver(room);
          break;
        case CreepRole.scout:
          overrides = memoryOverridesScout(room);
          break;
      }

      if (
        room.memory.roomType === RoomType.remote &&
        role === CreepRole.hauler
      ) {
        role = CreepRole.remoteHauler;
      }

      const queueEntry = { role, overrides };
      if (prioritySpawns.indexOf(role) !== -1) {
        room.memory.spawnQueue.unshift(queueEntry);
      } else {
        room.memory.spawnQueue.push(queueEntry);
      }
    }
  });

  // Append remote spawn queue
  if (room.memory.remotes != undefined) {
    room.memory.remotes.forEach((remoteName) => {
      const remoteMemory = Memory.rooms[remoteName];
      if (remoteMemory != undefined) {
        room.memory.spawnQueue = room.memory.spawnQueue.concat(
          remoteMemory.spawnQueue,
        );
        remoteMemory.spawnQueue = [];
      }
    });
  }

  // Modify the spawn queue in case of catastrophe
  catastropheSpawning(room);
}

function needRole(room: Room, role: CreepRole): boolean {
  // Only guards and reservers can spawn in rooms with hostile creeps or
  // structures, and reservers only when the hostile is an invader core.
  if (role !== CreepRole.guard) {
    // Find hostile creeps AND structures (e.g. invader cores)
    const hostileCreeps: (Creep | AnyOwnedStructure)[] = room.find(
      FIND_HOSTILE_CREEPS,
    );
    const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
    if (hostileCreeps.length + hostileStructures.length > 0) {
      // Reserver creeps can be spawned if there are no hostile creeps and there
      // is exactly one hostile structure that is a level 0 invader core.
      // However, the other need checks still need to be passed, so just return
      // false if these conditions are not met.
      if (
        role !== CreepRole.reserver ||
        hostileCreeps.length !== 0 ||
        hostileStructures.length !== 1 ||
        hostileStructures[0].structureType !== STRUCTURE_INVADER_CORE ||
        hostileStructures[0].level !== 0
      ) {
        return false;
      }
    }
  }

  const maximum = room.memory.populationLimit[role];
  if (maximum == undefined) {
    warn(`Room ${room.name} has undefined pop limit for role ${role}`);
    return false;
  }
  let count = _.filter(Memory.creeps, { room: room.name, role: role }).length; // countRole(room, role);

  if (room.memory.roomType === RoomType.remote) {
    count = 0;
    for (const creep in Game.creeps) {
      if (
        Memory.creeps[creep].room === room.name &&
        (Memory.creeps[creep].role === role ||
          (role === CreepRole.hauler &&
            Memory.creeps[creep].role === CreepRole.remoteHauler))
      ) {
        count += 1;
      }
    }
  }

  // Wait to spawn another scout if their is a scout in this room, also make
  // sure there exist visionless rooms
  if (role === CreepRole.scout) {
    if (count > 0) {
      return false;
    }
    if (room.memory.remotes == undefined) {
      return false;
    } else {
      let existsVisionless = false;
      room.memory.remotes.forEach((remoteName) => {
        if (Game.rooms[remoteName] == undefined) {
          existsVisionless = true;
        }
      });
      if (!existsVisionless) {
        return false;
      }
    }
  }

  // Count builders (only) in remote rooms
  if (role === CreepRole.builder && room.memory.remotes != undefined) {
    room.memory.remotes.forEach((remoteName) => {
      const remote = Game.rooms[remoteName];
      // Assume that the remote room simply lacks vision, but does exist, and
      // no vision implies no creeps in the room
      if (remote != undefined) {
        count += countRole(remote, role);
      }
    });
  }

  // Wait for miners to spawn haulers
  if (role === CreepRole.hauler) {
    const miners = countRole(room, CreepRole.miner);
    if (miners === 0 || count >= miners) {
      return false;
    }
  }

  // Spawn a creep if the count is less than the maximum and there is no entry
  // with the same role in the queue that is for the same room
  if (count < maximum) {
    let currentlySpawning = false;
    // Remote rooms should check the owner queue
    if (room.memory.roomType === RoomType.remote) {
      if (room.memory.owner == undefined) {
        throw new RoomMemoryError(room, "owner", "Remotes need an owner");
      }
      const ownerMemory = Memory.rooms[room.memory.owner];
      if (ownerMemory == undefined) {
        throw new RoomMemoryError(room, "owner", "Invalid owner room");
      }
      // In remote rooms, hauler creeps get added as remote haulers
      const inOwnerQueue =
        ownerMemory.spawnQueue.find(
          (entry) =>
            entry.role === role ||
            (role === CreepRole.hauler &&
              entry.role === CreepRole.remoteHauler),
        ) != undefined;
      if (inOwnerQueue) {
        return false;
      }
      if (ownerMemory.spawn == undefined) {
        throw new RoomMemoryError(room, "owner", "Owner lacks spawn");
      }
      const spawn = Game.getObjectById(ownerMemory.spawn);
      if (spawn == undefined) {
        throw new GetByIdError(ownerMemory.spawn, STRUCTURE_SPAWN);
      }
      if (spawn.spawning != undefined) {
        const spawningName = spawn.spawning.name;
        currentlySpawning =
          Memory.creeps[spawningName].role === role ||
          (Memory.creeps[spawningName].role === CreepRole.remoteHauler &&
            role === CreepRole.harvester);
      }
    } else {
      if (room.memory.spawn == undefined) {
        throw new RoomMemoryError(room, "spawn");
      }
      const spawn = Game.getObjectById(room.memory.spawn);
      if (spawn == undefined) {
        throw new GetByIdError(room.memory.spawn, STRUCTURE_SPAWN);
      }
      if (spawn.spawning != undefined) {
        const spawningName = spawn.spawning.name;
        currentlySpawning = Memory.creeps[spawningName].role === role;
      }
    }
    const inRoomQueue =
      room.memory.spawnQueue.find((entry) => entry.role === role) !== undefined;

    return !currentlySpawning && !inRoomQueue;
  }
  return false;
}

function memoryOverridesMiner(room: Room): Partial<CreepMemory> {
  // Find miners for the room
  const miners = _.filter(Memory.creeps, {
    role: CreepRole.miner,
    room: room.name,
  });

  // This miner's target source should be the "first" source in the room not
  // assigned to a miner in the room.
  const minedSources = miners.map((minerMem) => minerMem.assignedSource);
  const sourceId = room.memory.sources.find(
    (roomSource) => minedSources.indexOf(roomSource) === -1,
  );
  if (sourceId == undefined) {
    throw new ScriptError(
      `Requested addition miner in ${room.name} but unable to find available source`,
    );
  }
  const source = Game.getObjectById(sourceId);
  if (source == undefined) {
    throw new GetByIdError(sourceId);
  }
  // Find a surrounding tile with a container
  const surrounding = getSurroundingTiles(source.pos, 1);
  let spot = surrounding.find((pos) => {
    return (
      pos
        .lookFor(LOOK_STRUCTURES)
        .find((structure) => structure.structureType === STRUCTURE_CONTAINER) !=
      undefined
    );
  });
  if (spot == undefined) {
    warn(
      `Unable to assign spot with container to a miner assigned to source ${sourceId} in ${source.pos.roomName}`,
    );
    // Assign to a surrounding non-wall spot
    spot = surrounding.find((pos) => {
      const terrain = room.getTerrain().get(pos.x, pos.y);
      return terrain != TERRAIN_MASK_WALL;
    });
  }

  // Note: a miner will be assigned a source (otherwise it will throw an error)
  // but a miner can be spawned with an undefiend spot
  return {
    room: room.name,
    assignedSource: sourceId,
    spot: spot,
    // Miners do not renew
    noRenew: true,
  };
}

function memoryOverridesHauler(room: Room): Partial<CreepMemory> {
  // okay so now that i think about this code def doesn't work at all for rooms
  // with more than 1 source

  // A hauler is associated to a miner by having the same assigned spot
  // Find haulers for the room
  const haulers = _.filter(Memory.creeps, {
    role: CreepRole.hauler,
    room: room.name,
  });
  const haulerSpots = haulers.map((creepMem) =>
    livenRoomPosition(creepMem.spot),
  );
  info(haulerSpots);

  // Find miners for the room
  const miners = _.filter(Memory.creeps, {
    role: CreepRole.miner,
    room: room.name,
  });

  // Find a miner with a spot that no hauler has
  const associatedMiner = miners.find((minerMemory) => {
    return haulerSpots.indexOf(livenRoomPosition(minerMemory.spot)) === -1;
  });

  if (associatedMiner == undefined) {
    throw new ScriptError(
      `Unable to associate a miner with a new hauler in room ${room.name}`,
    );
  }

  const spot = associatedMiner.spot;
  return { room: room.name, spot };
}

function memoryOverridesReserver(room: Room): Partial<CreepMemory> {
  return { room: room.name, noRenew: true };
}

function memoryOverridesScout(room: Room): Partial<CreepMemory> {
  if (room.memory.remotes == undefined) {
    throw new RoomMemoryError(
      room,
      "remotes",
      "Room wants scouts but lacks remotes",
    );
  }
  const targetRoom = room.memory.remotes.find((remoteName) => {
    return Game.rooms[remoteName] == undefined;
  });
  if (targetRoom == undefined) {
    throw new ScriptError(
      `Room ${room.name} wants scouts but lacks visionless remotes`,
    );
  }
  return { room: targetRoom, noRenew: true };
}

/** Adds to the spawn queue based on a dead creep's memory */
export function respawnCreep(memory: CreepMemory): void {
  const roomMemory = Memory.rooms[memory.room];
  const respawn: SpawnQueueItem = {
    role: memory.role,
    overrides: memory,
  };
  roomMemory.spawnQueue.push(respawn);
}

function catastropheSpawning(room: Room): void {
  switch (room.memory.roomType) {
    case RoomType.remote:
      return;
    case RoomType.primary: {
      // No harvester in/for the room
      const harvesterExists = _.some(Memory.creeps, {
        room: room.name,
        role: CreepRole.harvester,
      });
      if (harvesterExists) {
        return;
      }
      // Less than 300 energy available
      let energy = room.energyAvailable;
      const storage = room.storage;
      if (storage != undefined) {
        energy += storage.store.getUsedCapacity(RESOURCE_ENERGY);
      }
      // No harvested queued
      const harvesterQueued = _.some(room.memory.spawnQueue, {
        role: CreepRole.harvester,
      });

      if (energy <= 300 && !harvesterQueued) {
        // Catastrophe detected!
        warn(
          `Catastrophe detected in ${room.memory.roomType} room ${room.name}`,
        );
        room.memory.spawnQueue.unshift({ role: CreepRole.harvester });
      }
      break;
    }
    default:
      warn(
        `Unimplemented catastrophe spawning behavior for ${room.memory.roomType} room ${room.name}`,
      );
      break;
  }
}
