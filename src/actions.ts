import { fromRepairQueue, getSurroundingTiles } from "construct";
import { error, errorConstant, warn, info } from "utils/logger";
import { countBodyPart, countRole } from "utils/helpers";
import { getNextTombInRoom } from "rooms";
import { CreepMemoryError, ScriptError } from "utils/errors";

/**
 * Harvest energy from a specified Source or find the first Source in the room.
 *
 * @param creep The creep to harvest the energy
 * @param source The Source, or undefined
 */
export function harvestEnergy(creep: Creep, source?: Source | Mineral): void {
  // TODO: This currently permanently assigns a source to creeps that shouldn't have a permanent
  // source. Additionally, this is a LOT of CPU for harvesting. Even worse, this doesn't even solve
  // the problem I wrote it to solve, which was picking a source not blocked by another creep.
  let path;
  if (source == undefined) {
    if (creep.memory.assignedSource == undefined) {
      const sources = [...creep.room.find(FIND_SOURCES)]
        .map((source) => {
          return { source, path: creep.pos.findPathTo(source) };
        })
        .sort((a, b) => {
          if (a.path.length < b.path.length) return -1;
          if (a.path.length > b.path.length) return 1;
          return 0;
        });
      source = sources[0].source as Source;
      path = sources[0].path;

      // If this amount of work is going to be done, we are going to assign this source to the creep
      creep.memory.assignedSource = source.id;
    } else {
      source = Game.getObjectById(creep.memory.assignedSource) as Source;
    }
  }

  // Try to harvest energy. If we can't because we're not in range, move towards the source
  const response = creep.harvest(source);
  if (response === ERR_NOT_IN_RANGE) {
    if (path) {
      creep.moveByPath(path);
    } else {
      creep.moveTo(source);
    }
    // Don't warn about the source being empty or the extractor/deposit being in
    // cooldown
  } else if (
    response !== OK &&
    response !== ERR_NOT_ENOUGH_RESOURCES &&
    response !== ERR_TIRED
  ) {
    warn(
      `Creep ${creep.name} harvesting ${
        source.pos
      } with response ${errorConstant(response)}`,
    );
  } else if (response === OK && creep.memory.role === CreepRole.miner) {
    const harvested = countBodyPart(creep.body, WORK) * HARVEST_POWER;
    if (Memory.debug.energyHarvested != undefined) {
      Memory.debug.energyHarvested.amount += harvested;
    } else {
      Memory.debug.energyHarvested = {
        startTick: Game.time,
        amount: harvested,
      };
    }
  }
}

/**
 * Get energy from a structure that can give out energy or harvestEnergy
 *
 * @param creep The creep to get the energy
 */
export function getEnergy(
  creep: Creep,
  target?: Structure | Tombstone | Ruin,
): ScreepsReturnCode {
  let response: ScreepsReturnCode;
  // If target isn't specified, try the room's storage
  if (target == undefined) {
    // If there is a storage, make sure it has energy first
    if (
      creep.room.storage != undefined &&
      creep.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    ) {
      // If it does have energy, it is the target
      target = creep.room.storage;
    }
  }
  // If there is no primary storage, proceed as normal
  if (target == undefined) {
    const structures = [...creep.room.find(FIND_STRUCTURES)]
      .filter((structure) => {
        // Filter for containers and storages
        return (
          (structure.structureType === STRUCTURE_CONTAINER ||
            structure.structureType === STRUCTURE_STORAGE) &&
          structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0
        );
      })
      .map((structure) => {
        return { structure, path: creep.pos.findPathTo(structure) };
      })
      .sort((a, b) => {
        if (a.path.length < b.path.length) return -1;
        if (a.path.length > b.path.length) return 1;
        return 0;
      });
    if (structures[0] == undefined) {
      warn(
        `Creep ${creep.name} unable to find suitable structure for getEnergy`,
      );
      if (countRole(creep.room, CreepRole.miner) === 0) {
        harvestEnergy(creep);
      } else {
        // No structures, no harvesting, so try and find energy on the ground.
        const pile = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
          filter: {
            resourceType: RESOURCE_ENERGY,
          },
        });
        if (pile != undefined) {
          const response = creep.pickup(pile);
          if (response === ERR_NOT_IN_RANGE) {
            creep.moveTo(pile);
          }
        }
      }
      // You just have to say you're OK because they would never understand
      return OK;
    }
    const structure = structures[0].structure as
      | StructureContainer
      | StructureStorage;
    const path = structures[0].path;

    // Try to harvest energy. If we can't because we're not in range, move
    // towards the target
    response = creep.withdraw(structure, RESOURCE_ENERGY);
    if (response === ERR_NOT_IN_RANGE) {
      creep.moveByPath(path);
    } else if (response !== OK) {
      warn(
        `Creep ${creep.name} getting energy ${
          structure.pos
        } with response ${errorConstant(response)}`,
      );
    }
  } else {
    // Try to harvest energy. If we can't because we're not in range, move
    // towards the target
    response = creep.withdraw(target, RESOURCE_ENERGY);
    if (response === ERR_NOT_IN_RANGE) {
      creep.moveTo(target);
    } else if (response !== OK && response !== ERR_NOT_ENOUGH_RESOURCES) {
      // Ignore ERR_NOT_ENOUGH_RESOURCES when target is specified (e.g. haulers)
      warn(
        `Creep ${creep.name} getting energy ${
          target.pos
        } with response ${errorConstant(response)}`,
      );
    }
  }

  return response;
}

/**
 * Deposit energy in the room's first spawn/extension/tower
 *
 * @param creep The creep to deposit the energy
 * @param disableUpgrading Whether to disable upgrading if no deposit locations
 * @returns True if depositing, false if not depositing and not upgrading
 */
export function depositEnergy(creep: Creep, disableUpgrading = false): boolean {
  // Get the first Spawn in the room
  const targets = creep.room.find(FIND_MY_STRUCTURES).filter((structure) => {
    return (
      (structure.structureType === STRUCTURE_SPAWN ||
        structure.structureType === STRUCTURE_EXTENSION ||
        structure.structureType === STRUCTURE_TOWER ||
        structure.structureType === STRUCTURE_LINK) &&
      structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    );
  }) as (
    | StructureSpawn
    | StructureExtension
    | StructureTower
    | StructureLink
  )[];
  // Prioritize: Spawn -> Extension -> Tower -> Link
  let target = targets.find(
    (structure) => structure.structureType === STRUCTURE_SPAWN,
  );
  if (target == undefined) {
    target = targets.find(
      (structure) => structure.structureType === STRUCTURE_EXTENSION,
    );
  }
  if (target == undefined) {
    // Don't target towers over half capacity
    target = targets.find(
      (structure) =>
        structure.structureType === STRUCTURE_TOWER &&
        structure.store.getUsedCapacity(RESOURCE_ENERGY) < TOWER_CAPACITY / 2,
    );
  }
  if (target == undefined) {
    const spawnLinkId = creep.room.memory.links.spawn;
    if (spawnLinkId != undefined) {
      const spawnLink = Game.getObjectById(spawnLinkId);
      if (spawnLink != undefined) {
        // Only target the spawn link if it is less than half full
        if (
          spawnLink.store.getUsedCapacity(RESOURCE_ENERGY) <
          LINK_CAPACITY / 2
        ) {
          target = spawnLink;
        }
      } else {
        error(
          `Unable to get spawn link of id ${spawnLinkId} in room ${creep.room.name}`,
        );
      }
    }
  }

  // If the target has free energy capacity
  if (
    target != undefined &&
    target.store.getFreeCapacity(RESOURCE_ENERGY) !== 0
  ) {
    // Try to transfer energy to the target.
    const response = creep.transfer(target, RESOURCE_ENERGY);
    if (response === ERR_NOT_IN_RANGE) {
      // If the spawn is not in range, move towards the spawn
      creep.moveTo(target);
    } else if (response !== OK) {
      warn(
        `Creep ${creep.name} depositing ${
          target.pos
        } with response ${errorConstant(response)}`,
      );
    }
    return true;
  } else {
    // If the target has no free energy capacity, upgrade the controller
    if (disableUpgrading) {
      return false;
    }
    upgradeController(creep);
    return true;
  }
}

/**
 * Store energy in container or storage within range.
 *
 * @param creep The creep storing energy
 * @param range The range
 */
export function storeEnergy(creep: Creep, target?: Structure): void {
  let structure = target;
  let path = undefined;
  if (structure === undefined) {
    const structures = [...creep.room.find(FIND_STRUCTURES)]
      .filter((structure) => {
        // Filter for containers and storages
        return (
          (structure.structureType === STRUCTURE_CONTAINER ||
            structure.structureType === STRUCTURE_STORAGE) &&
          structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
      })
      .map((structure) => {
        return { structure, path: creep.pos.findPathTo(structure) };
      })
      .sort((a, b) => {
        if (a.path.length < b.path.length) return -1;
        if (a.path.length > b.path.length) return 1;
        return 0;
      })
      .filter((strucPath) => {
        strucPath.path.length > 1;
      });
    if (structures[0] == undefined) {
      warn(
        `Creep ${creep.name} unable to find suitable structure for storeEnergy, depositing`,
      );
      depositEnergy(creep);
      return;
    }
    structure = structures[0].structure as
      | StructureContainer
      | StructureStorage;
    path = structures[0].path;
  }

  // Try to harvest energy. If we can't because we're not in range, move towards the source
  const response = creep.transfer(structure, RESOURCE_ENERGY);
  if (response === ERR_NOT_IN_RANGE) {
    if (path) {
      creep.moveByPath(path);
    } else {
      creep.moveTo(structure);
    }
  } else if (response !== OK) {
    warn(
      `Creep ${creep.name} getting energy ${
        structure.pos
      } with response ${errorConstant(response)}`,
    );
  }
}

export function storeResource(
  creep: Creep,
  target: Structure,
  resource?: ResourceConstant,
): void {
  // If the resource wasn't specified, get the "first" resource contained in the
  // creep's store.
  resource = resource || (Object.keys(creep.store)[0] as ResourceConstant);
  const response = creep.transfer(target, resource);
  if (response === ERR_NOT_IN_RANGE) {
    creep.moveTo(target);
  } else if (response !== OK) {
    warn(
      `Creep ${creep.name} storing ${resource} ${
        target.pos
      } with response ${errorConstant(response)}`,
    );
  }
}

/**
 * Upgrades the controller
 *
 * @param creep The creep to upgrade the controller
 */
export function upgradeController(creep: Creep): void {
  // Get the controller for the room that the creep is in
  const controller = creep.room.controller;
  // Ensure `controller` is a StructureController
  if (controller == undefined) {
    throw new ScriptError("upgradeController: creep.room.controller undefined");
  }

  // Attempt to upgrade the controller, and save the response (OK or error)
  const response = creep.upgradeController(controller);
  if (response === ERR_NOT_IN_RANGE) {
    creep.moveTo(controller);
  } else if (response !== OK) {
    warn(
      `Creep ${creep.name} attempting to upgrade controller with response ${response}`,
    );
  }
}

/**
 * Builds or moves to the creep's assigned construction site
 *
 * @param creep The creep
 */
export function build(creep: Creep, building?: ConstructionSite): void {
  if (building == undefined) {
    if (creep.memory.assignedConstruction == undefined) {
      throw new CreepMemoryError(
        creep,
        "assignedConstruction",
        "Action build called with no supplied construction site, " +
          "so assignedConstruction must be defined",
      );
    } else {
      building = Game.getObjectById(
        creep.memory.assignedConstruction,
      ) as ConstructionSite;
    }
  }

  const response = creep.build(building);
  if (response === ERR_NOT_IN_RANGE) {
    creep.moveTo(building);
  } else if (response !== OK) {
    warn(
      `Creep ${creep.name} building ${
        building.pos
      } with response ${errorConstant(response)}`,
    );
  } else {
    // TODO: does this work?
    // Repair walls and ramparts immediately after construction
    if (
      (building.structureType === STRUCTURE_WALL ||
        building.structureType === STRUCTURE_RAMPART) &&
      building.progress === building.progressTotal
    ) {
      const wallOrRampart = building.pos.lookFor(LOOK_STRUCTURES)[0];
      if (wallOrRampart != undefined) {
        creep.room.memory.wallRepairQueue.unshift(
          wallOrRampart.id as Id<StructureWall> | Id<StructureRampart>,
        );
        creep.memory.assignedRepairs = wallOrRampart.id;
        creep.memory.task = CreepTask.repair;
      }
    }
  }
}

/**
 * Repairs or moves to the creep's assigned repair site
 *
 * @param creep The creep
 * @param repair The structure to repair
 */
export function repair(creep: Creep, repair?: Structure): void {
  if (repair == undefined) {
    if (creep.memory.assignedRepairs == undefined) {
      const idToRepair = fromRepairQueue(creep.room);
      repair =
        (Game.getObjectById(idToRepair || "") as Structure | null) || undefined;
      creep.memory.assignedRepairs = idToRepair;
    } else {
      repair =
        (Game.getObjectById(
          creep.memory.assignedRepairs,
        ) as Structure | null) || undefined;
    }
  }

  // Nothing to repair
  if (repair == undefined) {
    return;
  }

  const response = creep.repair(repair);
  if (response === ERR_NOT_IN_RANGE) {
    creep.moveTo(repair);
  } else if (response !== OK) {
    warn(
      `Creep ${creep.name} repairing ${
        repair.pos
      } with response ${errorConstant(response)}`,
    );
  }
}

export function idle(creep: Creep, position?: RoomPosition): void {
  if (position === undefined) {
    // Idle creeps upgrade the controller
    upgradeController(creep);
  } else if (creep.pos != position) {
    creep.moveTo(position);
  }
}

export function haul(
  creep: Creep,
  target: Creep | PowerCreep | Structure,
): void {
  const response = creep.transfer(target, RESOURCE_ENERGY);
  if (response === ERR_NOT_IN_RANGE) {
    // If the spawn is not in range, move towards the spawn
    creep.moveTo(target);
  } else if (response !== OK) {
    warn(
      `Creep ${creep.name} hauling to ${
        target.pos
      } with response ${errorConstant(response)}`,
    );
  }
}

/**
 * Recover energy from tombs or resource piles within range.
 *
 * @param creep The creep to recover
 * @param range The range to look in, default 1
 * @returns The response code to the action take or ERR_NOT_FOUND if no valid
 *   tombs/piles were found
 */
export function recoverEnergy(creep: Creep, range = 1): ScreepsReturnCode {
  if (range === 1) {
    return recoverNearbyEnergy(creep);
  } else if (range === -1) {
    // If range is -1, get a tomb from the room's lst of tombs
    const tomb = getNextTombInRoom(creep.room);
    if (tomb != undefined) {
      let response: ScreepsReturnCode = creep.withdraw(tomb, RESOURCE_ENERGY);
      if (response === ERR_NOT_IN_RANGE) {
        response = creep.moveTo(tomb);
      }
      return response;
    }
    return ERR_NOT_FOUND;
  }

  // If the range is not a special value, try and find a valid tomb within the
  // range
  const tomb = creep.pos
    .findInRange(FIND_TOMBSTONES, range)
    // Most energy first
    .sort(
      (a, b) =>
        b.store.getUsedCapacity(RESOURCE_ENERGY) -
        a.store.getUsedCapacity(RESOURCE_ENERGY),
    )
    .find((tomb) => tomb.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
  if (tomb != undefined) {
    let response: ScreepsReturnCode = creep.withdraw(tomb, RESOURCE_ENERGY);
    if (response === ERR_NOT_IN_RANGE) {
      response = creep.moveTo(tomb);
    }
    return response;
  }
  const pile = creep.pos
    .findInRange(FIND_DROPPED_RESOURCES, range)
    .filter((pile) => pile.resourceType === RESOURCE_ENERGY)
    // Most energy first
    .sort((a, b) => b.amount - a.amount)
    .find((pile) => pile.amount > 0);
  if (pile != undefined) {
    let response: ScreepsReturnCode = creep.pickup(pile);
    if (response === ERR_NOT_IN_RANGE) {
      response = creep.moveTo(pile);
    }
    return response;
  }

  // No tombs/piles found
  return ERR_NOT_FOUND;
}

/**
 * Check the surrounding tiles for tombstones then energy piles to pickup.
 *
 * @param creep The creep
 * @returns The actions response code, ERR_NOT_FOUND if a tombstone/resource
 *   pile was not found.
 */
function recoverNearbyEnergy(creep: Creep): ScreepsReturnCode {
  const surrounding = getSurroundingTiles(creep.pos, 1);
  surrounding.push(creep.pos);
  const tombPos = surrounding.find(
    (tile) => tile.lookFor(LOOK_TOMBSTONES).length > 0,
  );
  if (tombPos == undefined) {
    const pilePos = surrounding.find(
      (tile) => tile.lookFor(LOOK_RESOURCES).length > 0,
    );
    if (pilePos != undefined) {
      const pile = pilePos.lookFor(LOOK_RESOURCES)[0];
      return creep.pickup(pile);
    }
  } else {
    const tomb = tombPos.lookFor(LOOK_TOMBSTONES)[0];
    return creep.withdraw(tomb, RESOURCE_ENERGY);
  }

  return ERR_NOT_FOUND;
}

/**
 * Moves the creep to the target room. If the target room is unsupplied, uses
 * `creep.memory.room`.
 */
export function moveToRoom(
  creep: Creep,
  destRoomName?: string,
  resetPath = false,
): void {
  if (destRoomName == undefined) {
    destRoomName = creep.memory.room;
  }

  if (
    resetPath ||
    creep.memory.path == undefined ||
    creep.memory.pathStartRoom == undefined ||
    creep.room.name !== creep.memory.pathStartRoom
  ) {
    // This scout is new, so initialize its path to its target
    const exitToRoom = creep.room.findExitTo(destRoomName);
    if (exitToRoom === ERR_NO_PATH || exitToRoom === ERR_INVALID_ARGS) {
      throw new ScriptError(
        `Error finding path to room ${destRoomName} from ${
          creep.room.name
        }: ${errorConstant(exitToRoom)}`,
      );
    }
    const exitPos = creep.pos.findClosestByPath(exitToRoom);
    if (exitPos == undefined) {
      throw new ScriptError(
        `No closest exit (${exitToRoom}) in room ${creep.room.name}`,
      );
    }
    const exitPath = creep.pos.findPathTo(exitPos);
    creep.memory.path = Room.serializePath(exitPath);
    creep.memory.pathStartRoom = creep.room.name;
  }

  // Use `creep.memory.path` to move
  const response = creep.moveByPath(creep.memory.path);
  if (response !== OK && response !== ERR_TIRED) {
    warn(
      `Creep ${creep.name} failed to move by path with response ${errorConstant(
        response,
      )}`,
    );
  }
}
