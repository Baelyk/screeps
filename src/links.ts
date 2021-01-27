import { error, errorConstant, info, warn } from "utils/logger";
import { getLinksInRoom } from "rooms";
import { getSurroundingTiles } from "construct";

export function resetLinkMemory(linkId: Id<StructureLink>): void {
  const link = Game.getObjectById(linkId);
  if (link == null) {
    error(`Link ${linkId} could not be obtained`);
    return;
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
  link.room.memory.links.all[linkId] = { mode: linkMode, type: linkType };
}

export function linkManager(link: StructureLink): void {
  if (getLinkMemory(link) == undefined) {
    warn(`Reseting memory of link ${link.id}`);
    resetLinkMemory(link.id);
  }

  const memory = getLinkMemory(link);
  if (memory == undefined) {
    error(
      `Memory of link ${link.id} cannot be found on room ${link.room.name}'s memory`
    );
    return;
  }

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
        error(`Unable to get spawn link`);
        return;
      }
      const response = link.transferEnergy(spawnLink);
      if (response !== OK) {
        warn(
          `Link ${link.id} sending to spawn link with response ${errorConstant(
            response
          )}`
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
          link.store.getFreeCapacity(RESOURCE_ENERGY) !== 0
      )
      .sort(
        (a, b) =>
          a.store.getUsedCapacity(RESOURCE_ENERGY) -
          b.store.getUsedCapacity(RESOURCE_ENERGY)
      )[0];
    if (targetLink != undefined) {
      const energyToSend = Math.min(
        link.store.getUsedCapacity(RESOURCE_ENERGY),
        targetLink.store.getFreeCapacity(RESOURCE_ENERGY)
      );
      // Don't bother sending less than 100 energy, also don't try and send
      // while the link is in cooldown.
      if (energyToSend > 100 && link.cooldown === 0) {
        const response = link.transferEnergy(targetLink, energyToSend);
        if (response !== OK) {
          warn(
            `Link ${link.id} sending to link ${
              targetLink.id
            } with response ${errorConstant(response)}`
          );
        }
      }
      return;
    }
  }
}

function getLinkMemory(link: StructureLink): LinkMemory | undefined {
  const memory = link.room.memory.links.all[link.id];
  if (memory == undefined) {
    error(`Unable to get memory of link ${link.id} in room ${link.room.name}`);
    return;
  }
  return memory;
}

function getLinkMemoryById(
  linkId: Id<StructureLink> | string,
  room?: Room
): LinkMemory | undefined {
  // If room wasn't specified, get the link structure and use the other override
  // which takes a StructureLink
  if (room == undefined) {
    const link = Game.getObjectById(linkId as Id<StructureLink>);
    if (link != undefined) {
      return getLinkMemory(link);
    } else {
      error(`Unable to get link of id ${linkId}`);
      return undefined;
    }
  }
  // If room was specified, just use the room's memory
  const memory = room.memory.links.all[linkId];
  if (memory == undefined) {
    error(`Unable to get memory of link ${linkId} in room ${room.name}`);
    return;
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