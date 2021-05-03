import { info, warn } from "utils/logger";
import { isControllerLink, resetLinkMemory, linkManager } from "links";
import { GetByIdError, wrapper } from "utils/errors";
import { towerManager } from "towers";
import { executePlan } from "planner";
import { census } from "population";
import { updateWallRepair, resetRepairQueue } from "construct";

export function initRoom(room: Room): void {
  info(`Initializing room ${room.name}`);
  // Initialize the room's memory
  updateRoomMemory(room);
}

export function updateRoomMemory(room: Room): void {
  info(`Resetting memory for room ${room.name}`);

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
    warn(`Failed to get spawn for room ${room.name}`);
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
  // Update population limits
  room.memory.populationLimit = {};
  census(room);
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
  }
}
