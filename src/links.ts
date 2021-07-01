import { errorConstant, warn } from "utils/logger";
import { getSurroundingTiles } from "construct";
import { GetByIdError, ScriptError, wrapper } from "utils/errors";
import { VisibleRoom } from "roomMemory";

declare global {
  interface RoomLinksMemory {
    all: { [id: string]: LinkMemory };
    spawn?: Id<StructureLink>;
    controller?: Id<StructureLink>;
  }

  interface LinkMemory {
    mode: LinkMode;
    type: LinkType;
  }

  const enum LinkMode {
    none = "none",
    send = "send",
    recieve = "recieve",
  }

  const enum LinkType {
    spawn = "spawn",
    controller = "controller",
    source = "source",
    unknown = "unknown",
  }
}

export function createLinkMemory(
  room: VisibleRoom,
  linkId: Id<StructureLink>,
): LinkMemory {
  // TODO: Leaving the room.memory use for now until the planner is rewritten
  const link = Game.getObjectById(linkId);
  if (link == null) {
    throw new GetByIdError(linkId, STRUCTURE_LINK);
  }

  let linkMode = LinkMode.none;
  let linkType = LinkType.unknown;

  // Try and identify spawn/controller link
  const gameRoom = room.getRoom();
  const storage = gameRoom.storage;
  if (storage == undefined) {
    warn(
      `Room ${room.name} lacks a storage, preventing identification of the spawn link`,
    );
  } else {
    // The link adjacent to the storage is the spawn link
    if (link.pos.inRangeTo(storage.pos, 1)) {
      linkType = LinkType.spawn;
    }
  }
  const controller = gameRoom.controller;
  if (controller == undefined) {
    warn(
      `Room ${room.name} lacks a controller, preventing identification of the controller link`,
    );
  } else {
    // The link adjacent to the controller is the controller link
    if (link.pos.inRangeTo(controller.pos, 1)) {
      linkType = LinkType.controller;
      linkMode = LinkMode.recieve;
    }
  }

  return { mode: linkMode, type: linkType };
}

function linkBehavior(link: StructureLink): void {
  const memory = getLinkMemory(link);
  const room = new VisibleRoom(link.room.name);
  const linksMemory = room.getLinksMemory();

  // Link mode is send
  if (memory.mode === LinkMode.send) {
    if (link.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      // No energy to send
      return;
    }
    // Link is not spawn link
    if (memory.type !== LinkType.spawn) {
      // Send to spawn if spawn is recieving
      const spawnLinkId = linksMemory.spawn;
      if (spawnLinkId == undefined) {
        throw new ScriptError(`Room ${link.room.name} lacks a spawn link`);
      }
      const spawnLink = Game.getObjectById(spawnLinkId);
      if (spawnLink == undefined) {
        throw new GetByIdError(spawnLinkId, STRUCTURE_LINK);
      }
      const response = link.transferEnergy(spawnLink);
      if (response !== OK) {
        warn(
          `Link ${link.id} sending to spawn link with response ${errorConstant(
            response,
          )}`,
        );
      }
      return;
    }
    return;
  }

  // Link is spawn link and it has energy to send
  if (
    memory.type === LinkType.spawn &&
    link.store.getUsedCapacity(RESOURCE_ENERGY) > 0
  ) {
    // Get other links
    const gameRoom = room.getRoom();
    const links = gameRoom.find(FIND_MY_STRUCTURES, {
      filter: { structureType: STRUCTURE_LINK },
    }) as StructureLink[];
    const targetLink = links
      .filter(
        (link) =>
          linksMemory.all[link.id] != undefined &&
          linksMemory.all[link.id].type !== LinkType.spawn &&
          linksMemory.all[link.id].mode === LinkMode.recieve &&
          link.store.getFreeCapacity(RESOURCE_ENERGY) !== 0,
      )
      .sort(
        (a, b) =>
          a.store.getUsedCapacity(RESOURCE_ENERGY) -
          b.store.getUsedCapacity(RESOURCE_ENERGY),
      )[0];
    if (targetLink != undefined) {
      const energyToSend = Math.min(
        link.store.getUsedCapacity(RESOURCE_ENERGY),
        targetLink.store.getFreeCapacity(RESOURCE_ENERGY),
      );
      // Don't bother sending less than 100 energy, also don't try and send
      // while the link is in cooldown.
      if (energyToSend > 100 && link.cooldown === 0) {
        const response = link.transferEnergy(targetLink, energyToSend);
        if (response !== OK) {
          warn(
            `Link ${link.id} sending to link ${
              targetLink.id
            } with response ${errorConstant(response)}`,
          );
        }
      }
      return;
    }
  }
}

function getLinkMemory(link: StructureLink): LinkMemory {
  const memory = new VisibleRoom(link.room.name).getLinksMemory().all[link.id];
  if (memory == undefined) {
    throw new ScriptError(
      `Room ${link.room.name} lacks link memory for link ${link.id}`,
    );
  }
  return memory;
}

export function isControllerLink(link: StructureLink): boolean {
  const surrounding = getSurroundingTiles(link.pos, 1);
  let foundController = false;
  surrounding.find((pos) => {
    const structures = pos.lookFor(LOOK_STRUCTURES);
    structures.forEach((structure) => {
      if (
        structure != undefined &&
        structure.structureType === STRUCTURE_CONTROLLER
      ) {
        foundController = true;
      }
    });
  });
  return foundController;
}

export function linkManager(room: VisibleRoom): void {
  for (const linkId in room.getLinksMemory().all) {
    const link = Game.getObjectById(linkId) as StructureLink | null;
    if (link != undefined) {
      wrapper(
        () => linkBehavior(link),
        `Error processing link ${linkId} behavior`,
      );
    } else {
      throw new GetByIdError(
        linkId,
        STRUCTURE_LINK,
        `The link should be in room ${room.name}`,
      );
    }
  }
}
