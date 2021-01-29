import { info, warn } from "utils/logger";
import { isControllerLink, resetLinkMemory } from "links";
import { GetByIdError } from "utils/errors";

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
  if (room.memory.storage == undefined) {
    return undefined;
  }
  const storage = Game.getObjectById(
    room.memory.storage,
  ) as StructureStorage | null;
  if (storage == undefined) {
    throw new GetByIdError(room.memory.storage, STRUCTURE_STORAGE);
  }
  return storage.store.getUsedCapacity(RESOURCE_ENERGY);
}

export function getLinksInRoom(room: Room): Record<string, StructureLink> {
  const links: Record<string, StructureLink> = {};
  for (const linkId in room.memory.links.all) {
    const link = Game.getObjectById(linkId as Id<StructureLink>);
    if (link != undefined) {
      links[linkId] = link;
    } else {
      throw new GetByIdError(linkId, STRUCTURE_LINK);
    }
  }
  return links;
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
