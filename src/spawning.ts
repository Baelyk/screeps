// Manage spawn queues for a room
import { info, warn } from "utils/logger";
import { getSurroundingTiles } from "utils/helpers";
import { GetByIdError, ScriptError } from "utils/errors";
import { RoomInfo, VisibleRoom } from "roomMemory";
import { Position } from "classes/position";
import { countRole, CreepRole, RoleCreepMemory } from "./creeps";

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
        case CreepRole.extractor:
          overrides = memoryOverridesExtractor(room);
          break;
      }

      if (room.roomType === RoomType.remote && role === CreepRole.hauler) {
        role = CreepRole.remoteHauler;
      }

      const queueEntry = { role, overrides };
      room.addToSpawnQueue(queueEntry, isPriority(room, role, overrides));
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

function memoryOverridesMiner(
  room: VisibleRoom,
): Partial<RoleCreepMemory.Miner> {
  // Find miners for the room
  const miners = _.filter(Memory.creeps, {
    role: CreepRole.miner,
    room: room.name,
  }) as RoleCreepMemory.Miner[];

  // This miner's target source should be the "first" source in the room not
  // assigned to a miner in the room.
  const minedSources = miners.map((minerMem) => minerMem.assignedSource);
  _.forEach(room.getSpawnQueue(), (item) => {
    if (
      item.role === CreepRole.miner &&
      item.overrides != undefined &&
      "assignedSource" in item.overrides &&
      item.overrides.assignedSource != undefined
    ) {
      minedSources.push(item.overrides.assignedSource);
    }
  });
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

  if (spot == undefined) {
    throw new ScriptError(
      `Unable to assign miner to container spot or nonempty spot in ${room.name} for ${source.pos}`,
    );
  }

  // Note: a miner will be assigned a source (otherwise it will throw an error)
  // but a miner can be spawned with an undefiend spot
  return {
    room: room.name,
    assignedSource: sourceId,
    spot: Position.serialize(spot),
    // Miners do not renew
    noRenew: true,
  };
}

function memoryOverridesHauler(
  room: VisibleRoom,
): Partial<RoleCreepMemory.Hauler> {
  // okay so now that i think about this code def doesn't work at all for rooms
  // with more than 1 source

  // A hauler is associated to a miner by having the same assigned spot
  // Find haulers for the room
  const haulers = _.filter(Memory.creeps, {
    role: CreepRole.hauler,
    room: room.name,
  }) as RoleCreepMemory.Hauler[];
  const haulerSpots = haulers.map((creepMemory) => {
    const spot = creepMemory.spot;
    if (spot == undefined) {
      throw new ScriptError(`Hauler creep has undefiend spot`);
    }
    return Position.serializedToRoomPosition(spot);
  });
  _.forEach(room.getSpawnQueue(), (item) => {
    if (
      item.role === CreepRole.hauler &&
      item.overrides != undefined &&
      "spot" in item.overrides &&
      item.overrides.spot != undefined
    ) {
      haulerSpots.push(Position.serializedToRoomPosition(item.overrides.spot));
    }
  });

  // Find miners for the room
  const miners = _.filter(Memory.creeps, {
    role: CreepRole.miner,
    room: room.name,
  }) as RoleCreepMemory.Miner[];

  // Find a miner with a spot that no hauler has
  const associatedMiner = miners.find((minerMemory) => {
    const spot = minerMemory.spot;
    if (spot == undefined) {
      throw new ScriptError(`Miner creep has undefined spot`);
    }
    const pos = Position.serializedToRoomPosition(spot);
    // If no hauler spot (`spot`) is equal to this miner's assigned spot (`pos`)
    if (!_.some(haulerSpots, (spot) => Position.areEqual(spot, pos))) {
      if (room.roomType === RoomType.primary) {
        // In primary rooms, check that there isn't a link adjacent
        return (
          pos.findInRange(FIND_MY_STRUCTURES, 1, {
            filter: { structureType: STRUCTURE_LINK },
          }).length === 0
        );
      } else {
        // Remote rooms won't have links, so this spot works
        return true;
      }
    }
    // Another hauler has this spot
    return false;
  });

  if (associatedMiner == undefined) {
    throw new ScriptError(
      `Unable to associate a miner with a new hauler in room ${room.name}`,
    );
  }

  const spot = associatedMiner.spot;
  return { room: room.name, spot };
}

function memoryOverridesClaimer(
  room: VisibleRoom,
): Partial<RoleCreepMemory.Claimer> {
  return { room: room.name, noRenew: true };
}

function memoryOverridesScout(
  room: VisibleRoom,
): Partial<RoleCreepMemory.Scout> {
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

function memoryOverridesExtractor(
  room: VisibleRoom,
): Partial<RoleCreepMemory.Extractor> {
  const extractor = room.getRoom().find(FIND_MY_STRUCTURES, {
    filter: { structureType: STRUCTURE_EXTRACTOR },
  })[0];
  if (extractor == undefined) {
    throw new ScriptError(`Unable to find extractor in room ${room.name}`);
  }
  const spot = Position.serialize(extractor.pos);
  return { room: room.name, spot };
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
      // If a harvester is queued, stop for now
      const harvesterQueued = _.some(room.getSpawnQueue(), {
        role: CreepRole.harvester,
      });
      if (harvesterQueued) {
        const harvester = _.remove(room.getSpawnQueue(), {
          role: CreepRole.harvester,
        })[0];
        if (harvester != undefined) {
          room.addToSpawnQueue(harvester, true);
        }
        return;
      }
      // There is a catastrophe if there is less than 300 energy available in
      // the room, or there are no harvesters/miners.
      const energy =
        room.getRoom().energyAvailable +
        room.storedResourceAmount(RESOURCE_ENERGY);
      if (energy <= 300 || countRole(room.getRoom(), CreepRole.miner) === 0) {
        // Catastrophe detected!
        warn(`Catastrophe detected in ${room.roomType} room ${room.name}`);

        // Spawn a harvester if there isn't one
        const harvesterExists = _.some(Memory.creeps, {
          room: room.name,
          role: CreepRole.harvester,
        });
        if (!harvesterExists) {
          room.addToSpawnQueue({ role: CreepRole.harvester }, true);
          return;
        }

        // If there is a harvester, let's now prioritize the spawn queue
        // If there are no miners alive, spawn a miner first. Then, spawn a
        // tender, then spawn haulers. Then carry on.
        const miners = countRole(room.getRoom(), CreepRole.miner);
        if (miners === 0) {
          const hauler = _.remove(room.getSpawnQueue(), {
            role: CreepRole.hauler,
            overrides: { room: room.name },
          })[0];
          if (hauler != undefined) {
            room.addToSpawnQueue(hauler, true);
          }
          const tender = _.remove(room.getSpawnQueue(), {
            role: CreepRole.tender,
            overrides: { room: room.name },
          })[0];
          if (tender != undefined) {
            room.addToSpawnQueue(tender, true);
          }
          // Remove whatever miner is in the room queue
          let miner = _.remove(room.getSpawnQueue(), {
            role: CreepRole.miner,
          })[0];
          // If the removed miner wasn't for this room (but probably for a
          // remote room), readd a miner for this room instead.
          if (
            miner != undefined &&
            miner.overrides != undefined &&
            miner.overrides.room !== room.name
          ) {
            miner = {
              role: CreepRole.miner,
              overrides: memoryOverridesMiner(room),
            };
          }
          if (miner != undefined) {
            room.addToSpawnQueue(miner, true);
          }
        }
      } else if (countRole(room.getRoom(), CreepRole.tender) === 0) {
        warn(`No tender detected in room ${room.name}, prioritizing`);
        const tender = _.remove(room.getSpawnQueue(), {
          role: CreepRole.tender,
          overrides: { room: room.name },
        })[0];
        if (tender != undefined) {
          room.addToSpawnQueue(tender, true);
        }
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

function isPriority(
  room: VisibleRoom,
  role: CreepRole,
  overrides: Partial<CreepMemory>,
): boolean {
  if (role === CreepRole.tender && room.name === overrides.room) {
    return true;
  }
  if (role === CreepRole.miner && room.name === overrides.room) {
    return true;
  }
  if (role === CreepRole.hauler && room.name === overrides.room) {
    return true;
  }

  const gameRoom = room.getRoom();
  const energySystemRunning =
    countRole(gameRoom, CreepRole.tender) >= 1 &&
    countRole(gameRoom, CreepRole.miner) >= 2 &&
    countRole(gameRoom, CreepRole.hauler) >= 2;
  // If the energy system is running, the following aren't priorities
  if (!energySystemRunning) {
    return false;
  }

  if (role === CreepRole.guard) {
    return true;
  }
  if (role === CreepRole.claimer) {
    return true;
  }

  // Default to false
  return false;
}
