import { error, errorConstant, info, warn } from "utils/logger";
import { getLinksInRoom } from "utils/helpers";
import { getSurroundingTiles } from "construct";
import {
  GetByIdError,
  RoomMemoryError,
  ScriptError,
  wrapper,
} from "utils/errors";
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
  const link = Game.getObjectById(linkId);
  if (link == null) {
    throw new GetByIdError(linkId, STRUCTURE_LINK);
  }
  let linkMode = LinkMode.none;
  let linkType = LinkType.unknown;
  if (link.room.memory.planner != undefined) {
    const linkPlanner = link.room.memory.planner.plan[STRUCTURE_LINK];
    if (linkPlanner != null) {
      const spawnLinkPos = linkPlanner.pos[0];
      const controllerLinkPos = linkPlanner.pos[1];
      if (link.pos.x == spawnLinkPos.x && link.pos.y == spawnLinkPos.y) {
        linkType = LinkType.spawn;
      }
      if (
        link.pos.x == controllerLinkPos.x &&
        link.pos.y == controllerLinkPos.y
      ) {
        linkMode = LinkMode.recieve;
        linkType = LinkType.controller;
      }
    }
  }
  return { mode: linkMode, type: linkType };
}

function linkBehavior(link: StructureLink): void {
  const memory = getLinkMemory(link);

  // Link mode is send
  if (memory.mode === LinkMode.send) {
    if (link.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      // No energy to send
      return;
    }
    // Link is not spawn link
    if (memory.type !== LinkType.spawn) {
      // Send to spawn if spawn is recieving
      let spawnLink: StructureLink | undefined = undefined;
      for (const linkId in link.room.memory.links.all) {
        if (link.room.memory.links.all[linkId].type === LinkType.spawn) {
          const otherLink = Game.getObjectById(linkId) as StructureLink | null;
          if (otherLink == undefined) {
            warn(`Unable to get other link of id ${linkId}`);
          } else {
            spawnLink = otherLink;
          }
        }
      }
      if (spawnLink == undefined) {
        throw new ScriptError(
          `Unable to get spawn link in room ${link.room.name}`,
        );
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
    const links = Object.values(getLinksInRoom(link.room));
    const targetLink = links
      .filter(
        (link) =>
          link.room.memory.links.all[link.id].type !== LinkType.spawn &&
          link.room.memory.links.all[link.id].mode === LinkMode.recieve &&
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
  const memory = link.room.memory.links.all[link.id];
  if (memory == undefined) {
    throw new RoomMemoryError(
      link.room,
      "links",
      `Unable to get memory of link ${link.id} in room ${link.room.name}`,
    );
  }
  return memory;
}

function getLinkMemoryById(
  linkId: Id<StructureLink> | string,
  room?: Room,
): LinkMemory | undefined {
  // If room wasn't specified, get the link structure and use the other override
  // which takes a StructureLink
  if (room == undefined) {
    const link = Game.getObjectById(linkId as Id<StructureLink>);
    if (link != undefined) {
      return getLinkMemory(link);
    } else {
      throw new GetByIdError(linkId, STRUCTURE_LINK);
    }
  }
  // If room was specified, just use the room's memory
  const memory = room.memory.links.all[linkId];
  if (memory == undefined) {
    throw new RoomMemoryError(
      room,
      "links",
      `Unable to get memory of link ${linkId} in room ${room.name}`,
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

export function linkManager(room: Room): void {
  for (const linkId in room.memory.links.all) {
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
