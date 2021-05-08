import { info, warn } from "utils/logger";
import { isControllerLink, resetLinkMemory, linkManager } from "links";
import {
  GetByIdError,
  RoomMemoryError,
  ScriptError,
  wrapper,
} from "utils/errors";
import { towerManager } from "towers";
import { makePlan, executePlan } from "planner";
import { census } from "population";
import {
  buildRoad,
  updateWallRepair,
  resetRepairQueue,
  resetConstructionQueue,
} from "construct";
import { pathToRoomPosition } from "utils/utilities";
import { roomDebugLoop } from "utils/debug";
import { updateSpawnQueue } from "spawning";
import { roomVisualManager } from "roomVisuals";
import { livenRoomPosition } from "utils/helpers";

export function initRoom(room: Room): void {
  info(`Initializing room ${room.name}`);
  // Initialize the room's memory
  updateRoomMemory(room);
}

export function updateRoomMemory(room: Room): void {
  info(`Resetting memory for room ${room.name}`);

  // Default to primary room
  room.memory.roomType = RoomType.primary;

  // Room level
  const controller = room.controller;
  if (controller !== undefined) {
    room.memory.level = controller.level;
  } else {
    warn(`Failed to get controller for room ${room.name}`);
  }
  // Primary spawn
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (spawn !== undefined) {
    room.memory.spawn = spawn.id;
  } else {
    // No spawn, so its a remote
    room.memory.roomType = RoomType.remote;
    warn(`Failed to get spawn for room ${room.name}`);
  }

  // Help orphaned/newborn remotes find their owner
  if (
    room.memory.roomType === RoomType.remote &&
    room.memory.owner === undefined
  ) {
    for (const roomName in Memory.rooms) {
      const memory = Memory.rooms[roomName];
      if (
        memory.remotes != undefined &&
        memory.remotes.indexOf(room.name) !== -1
      ) {
        room.memory.owner = roomName;
      }
    }
  }

  // Get towers in the room
  room.memory.towers = getTowersInRoom(room);
  // Get sources in the room
  room.memory.sources = getSourcesInRoom(room);
  // Get tombs in the room
  room.memory.tombs = getTombsInRoom(room);
  // Initialize wall repair queue to empty
  room.memory.wallRepairQueue = [];
  // Reset links memory
  room.memory.links = {
    all: {},
  };
  resetRoomLinksMemory(room);
  // Reset build and repair queues
  room.memory.constructionQueue = [];
  room.memory.repairQueue = [];
  resetRepairQueue(room);
  resetConstructionQueue(room);
  // Update population limits
  room.memory.populationLimit = {};
  census(room);
  // Create room plan
  makePlan(room);
  // Spawn queue
  room.memory.spawnQueue = [];
}

/**
 * Get the ids of the towers in the room.
 *
 * @param room The room to look in
 * @returns A string[] of tower ids, possibly empty if none were found
 */
export function getTowersInRoom(room: Room): Id<StructureTower>[] {
  return room
    .find(FIND_MY_STRUCTURES)
    .filter((structure) => structure.structureType === STRUCTURE_TOWER)
    .map((structure) => structure.id as Id<StructureTower>);
}

/**
 * Get the ids of the sources in the room.
 *
 * @param room The room to look in
 * @returns A string[] of source ids, possibly empty if none were found
 */
export function getSourcesInRoom(room: Room): Id<Source>[] {
  return room.find(FIND_SOURCES).map((source) => source.id);
}

function getTombsInRoom(room: Room): Id<Tombstone>[] {
  return room
    .find(FIND_TOMBSTONES)
    .filter((tomb) => tomb.store.getUsedCapacity(RESOURCE_ENERGY) > 50)
    .map((tomb) => tomb.id);
}

/**
 * Get the next tombstone from the room's list of tombstones.
 *
 * @param room The room
 * @returns The tombstone, or undefined if the no valid tombstone was found
 */
export function getNextTombInRoom(room: Room): Tombstone | undefined {
  if (room.memory.tombs == undefined) {
    room.memory.tombs = [];
    return undefined;
  }
  let tomb: Tombstone | null | undefined = undefined;
  while (tomb == undefined && room.memory.tombs.length > 0) {
    // If the tombstone is valid, we don't want to remove it from the list.
    // Otherwise, do remove it and move on the next tombstone.
    tomb = Game.getObjectById(room.memory.tombs[0]);
    if (tomb != undefined) {
      // Ignore tombstones with less than 50 energy
      if (tomb.store.getUsedCapacity(RESOURCE_ENERGY) < 50) {
        tomb = undefined;
        room.memory.tombs.shift();
      }
    } else {
      room.memory.tombs.shift();
    }
  }

  if (tomb == undefined) return undefined;
  return tomb;
}

export function getRoomAvailableEnergy(room: Room): number | undefined {
  if (room.storage == undefined) {
    return undefined;
  }
  return room.storage.store.getUsedCapacity(RESOURCE_ENERGY);
}

/**
 * Get the ids of the links in the room.
 *
 * @param room The room to look in
 * @returns A string[] of link ids, possibly empty if none were found
 */
export function resetRoomLinksMemory(room: Room): void {
  // Since this is a reset, don't use getLinksInRoom which uses the memory that
  // this function resets. That would be easier, but also would defeat the
  // purpose of a reset in most cases.
  room
    .find(FIND_MY_STRUCTURES)
    .filter((structure) => structure.structureType === STRUCTURE_LINK)
    .map((structure) => structure.id as Id<StructureLink>)
    .forEach((id) => {
      // Reset the memory of each link
      resetLinkMemory(id);
      // If the current link is the spawn link, update links.spawn
      if (room.memory.links.all[id].type === LinkType.spawn) {
        room.memory.links.spawn = id;
      }
      const link = Game.getObjectById(id);
      if (link != undefined && isControllerLink(link)) {
        room.memory.links.controller = link.id;
      }
    });
}

export function roomManager(): void {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    wrapper(
      () => roomBehavior(room),
      `Error processing behavior for room ${roomName}`,
    );
  }
}

function roomBehavior(room: Room): void {
  if (room.memory.level == undefined) {
    updateRoomMemory(room);
  }

  wrapper(() => roomDebugLoop(room), `Error debugging for room ${room.name}`);

  wrapper(
    () => updateSpawnQueue(room),
    `Errpr managing spawn queue for room ${room.name}`,
  );

  if (room.memory.level >= 3) {
    // Process tower behavior
    wrapper(
      () => towerManager(room),
      `Error managing links for room ${room.name}`,
    );
  }

  if (room.memory.level >= 4) {
    // Process link behavior
    wrapper(
      () => linkManager(room),
      `Error managing links for room ${room.name}`,
    );
  }

  if (room.memory.remotes != undefined && room.memory.remotes.length > 0) {
    wrapper(
      () => remoteManager(room),
      `Error managing remotes for room ${room.name}`,
    );
  }

  wrapper(() => roomVisualManager(room), `Error managing room visuals`);

  // Infrequent actions:
  wrapper(
    () => infrequentRoomActions(room),
    `Error during infrequent room actions for room ${room.name}`,
  );
}

function infrequentRoomActions(room: Room) {
  if (Game.time % 100 === 0) {
    const controller = room.controller;
    // If there isn't a controller in this room, this isn't a room that needs
    // these infrequent actions
    if (controller == undefined) {
      return;
    }

    if (room.memory.planner == undefined) {
      makePlan(room);
    }

    // TODO: This will not work with multiple rooms, despite the way I've made it
    // Update repair queue and pop limits every 100 ticks
    resetRepairQueue(room);
    updateWallRepair(room);
    census(room);

    // If the controller has leveled up, level up the room
    if (controller.level !== room.memory.level) {
      room.memory.level = controller.level;
      info(`Updating room memory level to ${room.memory.level}`);
      executePlan(room);
    }

    // Update special structure lists
    room.memory.towers = getTowersInRoom(room);
    room.memory.links = {
      all: {},
    };
    resetRoomLinksMemory(room);

    if (
      Memory.debug.expandAllowed &&
      room.memory.roomType === RoomType.primary &&
      room.memory.constructionQueue.length === 0 &&
      room.storage != undefined &&
      room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 10000
    ) {
      createRemoteRoom(room);
    }

    // Remote executePlan checker if no structures
    if (room.memory.roomType === RoomType.remote) {
      const structures = room.find(FIND_STRUCTURES);
      if (structures.length === 0) {
        executePlan(room);
      }
    }
  }

  function createRemoteRoom(room: Room): void {
    // 1. Identity room
    // 2. Plan road to exit towards remote
    // 3. Spawn claimer
    info(`Room ${room.name} looking to create remote room`);

    if (room.memory.roomType !== RoomType.primary) {
      warn(`Nonprimary room ${room.name} tried to plan remote`);
    }

    // Only continue planning if a creep can be spawned now
    if (room.memory.spawn == undefined) {
      throw new RoomMemoryError(room, "spawn");
    }
    const spawn = Game.getObjectById(room.memory.spawn);
    if (spawn == undefined) {
      throw new GetByIdError(room.memory.spawn, STRUCTURE_SPAWN);
    }
    if (spawn.spawning || room.energyAvailable < room.energyCapacityAvailable) {
      return;
    }

    // Only consider adjacent rooms not in memory
    const adjacentRooms = Object.values(
      Game.map.describeExits(room.name),
    ).filter((adjacentRoom) => {
      adjacentRoom != undefined && Memory.rooms[adjacentRoom] == undefined;
    });

    // TODO: Better remote targetting
    const remoteTarget = adjacentRooms[0];
    if (remoteTarget == undefined) {
      info(`Room ${room.name} unable to find remote target`);
      return;
    }
    // Add this remoteTarget to the list of this room's remotes
    if (room.memory.remotes == undefined) {
      room.memory.remotes = [];
    }
    room.memory.remotes.push(remoteTarget);

    const exitToRemote = room.findExitTo(remoteTarget);
    if (exitToRemote === ERR_NO_PATH || exitToRemote === ERR_INVALID_ARGS) {
      throw new ScriptError(
        `Error find path to remote ${remoteTarget} from owner ${room.name}: ${exitToRemote}`,
      );
    }
    const exitPos = spawn.pos.findClosestByPath(exitToRemote);
    if (exitPos == undefined) {
      throw new ScriptError(
        `No closest exit (${exitToRemote}) in owner room ${room.name}`,
      );
    }
    buildRoad(
      pathToRoomPosition(
        room,
        spawn.pos.findPathTo(exitPos, { ignoreCreeps: true }),
      ),
    );

    // Initiate room memory
    Memory.rooms[remoteTarget] = <RoomMemory>{};
    Memory.rooms[remoteTarget].roomType = RoomType.remote;
    Memory.rooms[remoteTarget].owner = room.name;
    const entrance = { x: exitPos.x, y: exitPos.y };
    switch (exitToRemote) {
      case FIND_EXIT_TOP:
        entrance.y = 49;
        break;
      case FIND_EXIT_RIGHT:
        entrance.x = 0;
        break;
      case FIND_EXIT_BOTTOM:
        entrance.y = 0;
        break;
      case FIND_EXIT_LEFT:
        entrance.x = 49;
        break;
    }
    Memory.rooms[remoteTarget].entrance = entrance;
  }
}

function remoteManager(owner: Room): void {
  if (owner.memory.remotes == undefined) {
    return;
  }
  owner.memory.remotes.forEach((remote) => {
    wrapper(
      () => remoteBehavior(owner, remote),
      `Error managing remote ${remote} for room ${owner.name}`,
    );
  });
}

function remoteBehavior(owner: Room, remoteName: string): void {
  const memory = Memory.rooms[remoteName];
  if (memory == undefined) {
    const remote = Game.rooms[remoteName];
    if (remote != undefined) {
      updateRoomMemory(remote);
    } else {
      warn(`Invisible remote ${remoteName} for room ${owner.name}`);
      return;
    }
  }

  if (memory.owner === undefined) {
    memory.owner = owner.name;
  }

  // Remotes don't manage their own construction, so add its sites to its owner's
  if (memory.constructionQueue.length > 0) {
    info(
      `Adding remote's (${remoteName}) construction queue to owner's (${owner.name})`,
    );
    owner.memory.constructionQueue.push(...memory.constructionQueue);
    memory.constructionQueue = [];
  }
}

// Notes on remote targeting:
// Room energy theoretical max: sources * 3000 / 300 = 10 energy per source per tick
// Costs per tick:
// - Creeps:
//   - Miner (6 WORK + 1 CARRY) = 650 energy per 1500 ticks ~= 0.43 energy per tick
//   - Hauler (max 10 MOVE + 20 CARRY) = 1500 per 1500 ticks = 1 energy per tick
// - Repairs
//   - Roads: decay 100 per 1000 ticks, repair 100 per energy, cost 1 energy per 1000 ticks = 0.001 energy per tick per road
//   - Container: decay 5000 per 100 (unowned) ticks, costs 50 energy per 100 ticks = 0.5 energy per tick per container
//   - (lacking a container costs 1 energy per tick, so a container nets 0.5 energy per tick)
//     - However, if the container is full and energy spills over, we loose 1.5 energy per tick, a loss of 0.5 energy without the container
// - Reserving
//   - Distance matters here a lot
//   - Min reserving costs per tick:
//     - 600 energy per reserver part, 1 reserve per reserve part, max 600 tick active reserving time = 1 energy per reserve
//     - So, (reserve part cost) / (ticks reserving) = energy cost to reserve a single tick
//     - So, 600 / 120 = 5, and 5 is the energy gained per tick by reserving
//     - Don't reserve if the reserver will have <= 120 ticks of reserve time
//     - Reservers move with zero fatigue over road and plain, so nonswamp path length < 480
//
// HOWEVER, while a miner is moving to the source, we gain 0 energy per tick. Calcs based on unreserved!
// Assuming the path is all roads, miner travel time is (road length) * 3.
// Cost per tick assumptions: 1.5 (creeps) + roads/1000 + 0.5 (container) = 2 + roads/1000
// Miner takes 7 * 3 ticks to spawn, so return to source time = 21 + roads * 3. Ignoring spawn time,
// Miner will harvest a max of 5 * (1500 - roads * 3) total / 1500 ticks
// So, we loose 1 energy per tick every 100 roads.

export function remoteTargetAnalysis(owner: Room, remote: Room): void {
  // Required memory entries:
  if (remote.memory.entrance == undefined) {
    return;
  }

  const minerCost = 6 * BODYPART_COST[WORK] + 1 * BODYPART_COST[MOVE]; // 650
  const remoteHaulerCost =
    1 * BODYPART_COST[WORK] +
    11 * BODYPART_COST[MOVE] +
    20 * BODYPART_COST[CARRY]; // 1650
  const reserverCost = 9 * (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]); // 5850

  const sources = remote.find(FIND_SOURCES);
  if (remote.memory.entrance == undefined) {
    throw new RoomMemoryError(remote, "entrance", "Remotes require entrances");
  }
  const entrance = remote.getPositionAt(
    remote.memory.entrance.x,
    remote.memory.entrance.y,
  );
  if (entrance == undefined) {
    throw new ScriptError(`Remote ${remote.name} has inaccessable entrance`);
  }
  const ownerSpawn = Game.getObjectById(owner.memory.spawn);
  if (ownerSpawn == undefined) {
    throw new GetByIdError(owner.memory.spawn, STRUCTURE_SPAWN);
  }
  //
  // NOT WORKING BECAUSE THE PATHFINDER DOESN"T LIKE MULTIPLE ROOMS
  // USE ENTRANCE AND FIND PATH TO ROOM AND FROM ENTRANCE TO SOURCES
  // COMBINE THE TWO LENGTHS WHEN NEEDED, DONT REPAIR OWNER ROOM STUFF
  //
  const exitToRemoteDirection = owner.findExitTo(remote);
  if (
    exitToRemoteDirection === ERR_NO_PATH ||
    exitToRemoteDirection === ERR_INVALID_ARGS
  ) {
    throw new ScriptError(
      `Unable to find exit to ${remote.name} from ${owner.name}`,
    );
  }
  const exitPos = ownerSpawn.pos.findClosestByPath(exitToRemoteDirection);
  if (exitPos == undefined) {
    throw new ScriptError(
      `Unable to find closest exit tile in ${owner.name} to ${remote.name}`,
    );
  }
  const ownerToRemotePathLength = owner.findPath(ownerSpawn.pos, exitPos, {
    ignoreCreeps: true,
  }).length;
  let sourcePathLength = 0;
  info(`sources: ${sources}`);
  sources.forEach((source) => {
    sourcePathLength += remote.findPath(
      livenRoomPosition(entrance),
      source.pos,
      { ignoreCreeps: true },
    ).length;
  });

  const roadDecayCost =
    sourcePathLength * ((ROAD_DECAY_AMOUNT / ROAD_DECAY_TIME) * REPAIR_COST);
  const containerDecayCost =
    (CONTAINER_DECAY / CONTAINER_DECAY_TIME) * REPAIR_COST;

  const remoteController = remote.controller;
  if (remoteController == undefined) {
    throw new ScriptError(`Remote ${remote.name} lacks controller`);
  }
  const reserverDistance = remote.findPath(
    ownerSpawn.pos,
    remoteController.pos,
    { ignoreCreeps: true },
  ).length;
  // Reservers travel at 1 tick per road or plain
  const reserveTime = CREEP_CLAIM_LIFE_TIME - reserverDistance;
  // 5 is max energy per tick gained by reserving
  const minReserveTime = BODYPART_COST[CLAIM] / 5;

  const minerTravelLoss =
    100 / (sourcePathLength / sources.length + ownerToRemotePathLength);

  const totalCost =
    minerCost / CREEP_LIFE_TIME +
    remoteHaulerCost / CREEP_LIFE_TIME +
    minReserveTime / reserveTime +
    roadDecayCost +
    containerDecayCost;
  info(
    `${minerTravelLoss} = 100 / (${sourcePathLength} / ${sources.length} + ${ownerToRemotePathLength})`,
  );
  const gain = sources.length * 10 - minerTravelLoss;

  info(`Analysis: cost ${totalCost}, gain ${gain}`);
}
