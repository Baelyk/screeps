// Manage spawn queues for a room
import { info, warn } from "utils/logger";
import { countRole, livenRoomPosition } from "utils/helpers";
import { getSurroundingTiles } from "construct";
import { GetByIdError, ScriptError } from "utils/errors";
import { RoomInfo, VisibleRoom } from "roomMemory";

export function updateSpawnQueue(room: VisibleRoom): void {
  // Add these roles to the top of the queue
  // Most important last
  const prioritySpawns = [
    CreepRole.claimer,
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
        case CreepRole.claimer:
          overrides = memoryOverridesClaimer(room);
          break;
        case CreepRole.scout:
          overrides = memoryOverridesScout(room);
          break;
      }

      if (room.roomType === RoomType.remote && role === CreepRole.hauler) {
        role = CreepRole.remoteHauler;
      }

      const queueEntry = { role, overrides };
      room.addToSpawnQueue(queueEntry, _.includes(prioritySpawns, role));
    }
  });

  // Modify the spawn queue in case of catastrophe
  catastropheSpawning(room);
}

function needRole(room: VisibleRoom, role: CreepRole): boolean {
  const gameRoom = room.getRoom();

  // Only guards and reservers can spawn in rooms with hostile creeps or
  // structures, and reservers only when the hostile is an invader core.
  if (role !== CreepRole.guard) {
    // Find hostile creeps AND structures (e.g. invader cores)
    const hostileCreeps: (Creep | AnyOwnedStructure)[] = gameRoom.find(
      FIND_HOSTILE_CREEPS,
    );
    const hostileStructures = gameRoom.find(FIND_HOSTILE_STRUCTURES);
    if (hostileCreeps.length + hostileStructures.length > 0) {
      // Reserver creeps can be spawned if there are no hostile creeps and there
      // is exactly one hostile structure that is a level 0 invader core.
      // However, the other need checks still need to be passed, so just return
      // false if these conditions are not met.
      if (
        role !== CreepRole.claimer ||
        hostileCreeps.length !== 0 ||
        hostileStructures.length !== 1 ||
        hostileStructures[0].structureType !== STRUCTURE_INVADER_CORE ||
        hostileStructures[0].level !== 0
      ) {
        return false;
      }
    }
  }

  const maximum = room.getRoleLimit(role);
  let count = _.filter(Memory.creeps, { room: room.name, role: role }).length; // countRole(room, role);

  if (room.roomType === RoomType.remote) {
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
  const remotes = room.getRemotes();
  // Wait to spawn another scout if their is a scout in this room, also make
  // sure there exist visionless rooms
  if (role === CreepRole.scout) {
    if (count > 0) {
      return false;
    }
    if (remotes.length === 0) {
      return false;
    } else {
      let existsVisionless = false;
      remotes.forEach((remoteName) => {
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
  if (role === CreepRole.builder && remotes.length > 0) {
    remotes.forEach((remoteName) => {
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
    const miners = _.filter(Memory.creeps, {
      role: CreepRole.miner,
      room: room.name,
    }).length;
    if (miners === 0 || count >= miners) {
      return false;
    }
  }

  // Spawn a creep if the count is less than the maximum and there is no entry
  // with the same role in the queue that is for the same room
  if (count < maximum) {
    let currentlySpawning = false;
    // Remote rooms should check the owner queue
    if (room.roomType === RoomType.remote) {
      const owner = new VisibleRoom(room.getRemoteOwner());
      // In remote rooms, hauler creeps get added as remote haulers
      const inOwnerQueue =
        owner
          .getSpawnQueue()
          .find(
            (entry) =>
              entry.role === role ||
              (role === CreepRole.hauler &&
                entry.role === CreepRole.remoteHauler),
          ) != undefined;
      if (inOwnerQueue) {
        return false;
      }
      const spawn = owner.getPrimarySpawn();
      if (spawn.spawning != undefined) {
        const spawningName = spawn.spawning.name;
        currentlySpawning =
          Memory.creeps[spawningName].role === role ||
          (Memory.creeps[spawningName].role === CreepRole.remoteHauler &&
            role === CreepRole.harvester);
      }
    } else {
      const spawn = room.getPrimarySpawn();
      if (spawn.spawning != undefined) {
        const spawningName = spawn.spawning.name;
        currentlySpawning = Memory.creeps[spawningName].role === role;
      }
    }
    const inRoomQueue =
      room.getSpawnQueue().find((entry) => entry.role === role) != undefined;

    return !currentlySpawning && !inRoomQueue;
  }
  return false;
}

function memoryOverridesMiner(room: VisibleRoom): Partial<CreepMemory> {
  // Find miners for the room
  const miners = _.filter(Memory.creeps, {
    role: CreepRole.miner,
    room: room.name,
  });

  // This miner's target source should be the "first" source in the room not
  // assigned to a miner in the room.
  const minedSources = miners.map((minerMem) => minerMem.assignedSource);
  const sourceId = room
    .getSources()
    .find((roomSource) => minedSources.indexOf(roomSource) === -1);
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
      const terrain = room.getRoom().getTerrain().get(pos.x, pos.y);
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

function memoryOverridesHauler(room: VisibleRoom): Partial<CreepMemory> {
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

function memoryOverridesClaimer(room: VisibleRoom): Partial<CreepMemory> {
  return { room: room.name, noRenew: true };
}

function memoryOverridesScout(room: VisibleRoom): Partial<CreepMemory> {
  const targetRoom = room.getRemotes().find((remoteName) => {
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
  const roomMemory = new RoomInfo(memory.room);
  const respawn: SpawnQueueItem = {
    role: memory.role,
    overrides: memory,
  };
  roomMemory.addToSpawnQueue(respawn);
}

function catastropheSpawning(room: VisibleRoom): void {
  switch (room.roomType) {
    case RoomType.remote:
      return;
    case RoomType.expansion: {
      try {
        room.getPrimarySpawn();
      } catch (error) {
        // No spawn, not ready for catastrophe spawning
        break;
      }
    }
    // falls through
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
      const energy =
        room.getRoom().energyAvailable +
        room.storedResourceAmount(RESOURCE_ENERGY);
      // No harvested queued
      const harvesterQueued = _.some(room.getSpawnQueue(), {
        role: CreepRole.harvester,
      });

      if (energy <= 300 && !harvesterQueued) {
        // Catastrophe detected!
        warn(`Catastrophe detected in ${room.roomType} room ${room.name}`);
        room.addToSpawnQueue({ role: CreepRole.harvester }, true);
      }
      break;
    }
    default:
      warn(
        `Unimplemented catastrophe spawning behavior for ${room.roomType} room ${room.name}`,
      );
      break;
  }
}
