import {
  depositEnergy,
  getEnergy,
  harvestEnergy,
  build,
  idle,
  recoverEnergy,
  repair,
  upgradeController,
  storeEnergy,
  storeResource,
  moveToRoom,
} from "actions";
import { fromQueue, unassignConstruction, fromRepairQueue } from "construct";
import { errorConstant, info, warn } from "utils/logger";
import { generateBodyByRole } from "spawns";
import {
  CreepRoleMemoryError,
  ScriptError,
  GetByIdError,
  GetPositionError,
  InvalidCreepTaskError,
  InvalidCreepRoleError,
  wrapper,
} from "utils/errors";
import { bodyCost, countRole, livenRoomPosition } from "utils/helpers";
import { getSurroundingTiles } from "construct";
import { respawnCreep } from "spawning";

/**
 * Behavior for a harvester creep (CreepRole.harvester)
 *
 * @param creep The harvester creep
 */
function harvester(creep: Creep) {
  if (creep.memory.task === CreepTask.fresh)
    creep.memory.task = CreepTask.harvest;

  switch (creep.memory.task) {
    // The creep is harvesting
    case CreepTask.harvest: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has more free energy, keep harvesting
        getEnergy(creep);
      } else {
        switchTaskAndDoRoll(creep, CreepTask.deposit);
        return;
      }
      break;
    }
    // The creep is depositing
    case CreepTask.deposit: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has energy, keep depositing
        depositEnergy(creep);
      } else {
        // If the creep has no energy, begin harvesting
        switchTaskAndDoRoll(creep, CreepTask.harvest);
        return;
      }
      break;
    }
    // The creep is neither harvesting nor depositing, i.e. it has an invalid task
    default: {
      throw new InvalidCreepTaskError(creep, [
        CreepTask.harvest,
        CreepTask.deposit,
      ]);
    }
  }
}

/**
 * Behavior function for a miner creep (CreepRole.miner). This creep should
 * stay near a source and harvest until full. Then deposit into a nearby energy
 * store, i.e. a container.
 *
 * @param creep The miner creep
 */
function miner(creep: Creep) {
  if (creep.memory.task === CreepTask.fresh) {
    creep.memory.task = CreepTask.harvest;
    // Move remote miners to their room
    if (creep.room.name !== creep.memory.room) {
      // Move them to the room and reset the path
      moveToRoom(creep, creep.memory.room, true);
    }
  }

  // First, move to the correct room
  if (creep.room.name !== creep.memory.room) {
    moveToRoom(creep);
    return;
  }

  // Tasks for this creep:
  // 0. Move to spot, if it has a spot
  // 1. CreepTask.harvest: harvest from assigned energy source
  let spot: RoomPosition | null = null;
  if (creep.memory.spot) {
    spot = Game.rooms[creep.memory.spot.roomName].getPositionAt(
      creep.memory.spot.x,
      creep.memory.spot.y,
    );
  }
  if (spot && (creep.pos.x !== spot.x || creep.pos.y !== spot.y)) {
    const response = errorConstant(creep.moveTo(spot));
    return;
  }
  const source: Source | null = Game.getObjectById(
    creep.memory.assignedSource || "",
  );
  harvestEnergy(creep, source || undefined);
}

/**
 * Behavior function for builder creeps (CreepRole.builder). These creeps
 * should construct buildings in the build queue.
 *
 * @param creep The builder creep
 */
function builder(creep: Creep) {
  if (creep.memory.task === CreepTask.fresh)
    creep.memory.task = CreepTask.getEnergy;

  // Tasks for this creep:
  // 1. CreepTask.getEnergy: Get energy to construct buildings
  // 2. CreepTask.build: Move to a construction site and build
  // 3. CreepTask.repair: Move to a repairable structure and repair
  // 4. CreepTask.idle: Move to the idle location and chill
  switch (creep.memory.task) {
    case CreepTask.getEnergy: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep can hold more energy, keep getting energy
        getEnergy(creep);
      } else {
        // If the creep has full energy, begin building
        switchTaskAndDoRoll(creep, CreepTask.build);
        return;
      }
      break;
    }
    case CreepTask.build: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has more energy, continue building

        // If the creep is assigned a construction site that still exists, build
        // it.
        if (creep.memory.assignedConstruction) {
          if (Game.getObjectById(creep.memory.assignedConstruction)) {
            build(creep);
            return;
          }
        }
        // If the creep is assigned a construction site that no longer exists or
        // doesn't have an assigned construction site, get one from the queue.
        let room = creep.room;
        if (creep.memory.room != undefined) {
          const memoryRoom = Game.rooms[creep.memory.room];
          if (memoryRoom != undefined) {
            room = memoryRoom;
          }
        }
        creep.memory.assignedConstruction = fromQueue(room);
        // If a construction site was successfully obtained from the queue,
        // build it.
        if (creep.memory.assignedConstruction != undefined) {
          build(creep);
          return;
        }
        // If the creep was unable to obtain a construction site, switch tasks
        // to repairing.
        info(`No items in the construction queue`, InfoType.general);
        switchTaskAndDoRoll(creep, CreepTask.repair);
        return;
      } else {
        switchTaskAndDoRoll(creep, CreepTask.getEnergy);
        return;
      }
    }
    case CreepTask.idle: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
        // If the creep has no energy, it should get energy
        switchTaskAndDoRoll(creep, CreepTask.getEnergy);
        return;
      } else if (
        creep.memory.assignedConstruction ||
        creep.room.memory.constructionQueue.length > 0
      ) {
        // Build
        switchTaskAndDoRoll(creep, CreepTask.build);
        return;
      } else if (
        creep.memory.assignedRepairs ||
        creep.room.memory.repairQueue.length > 0
      ) {
        // Repair
        switchTaskAndDoRoll(creep, CreepTask.repair);
        return;
      } else {
        // Remain idle
        info(`Creep ${creep.name} is idle`, InfoType.idleCreep);
        idle(creep);
      }
      break;
    }
    case CreepTask.repair: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        if (creep.memory.assignedRepairs == undefined) {
          creep.memory.assignedRepairs = fromRepairQueue(creep.room);
          if (creep.memory.assignedRepairs == undefined) {
            // If there is nothing to repair, idle
            info(`No items in the repair queue`, InfoType.general);
            switchTaskAndDoRoll(creep, CreepTask.idle);
            return;
          }
        }
        // Only repair structures that need repairs
        let repairStructure = Game.getObjectById(creep.memory.assignedRepairs);
        while (
          repairStructure == undefined ||
          repairStructure.hits === repairStructure.hitsMax
        ) {
          repairStructure = Game.getObjectById(
            fromRepairQueue(creep.room) || "",
          );
          // If we've reached the end of the repairQueue without a valid repair,
          if (repairStructure == undefined) {
            // Delete the creeps assigned repair
            delete creep.memory.assignedRepairs;
            // And go idle
            switchTaskAndDoRoll(creep, CreepTask.idle);
            return;
          }
        }
        creep.memory.assignedRepairs = repairStructure.id;

        repair(
          creep,
          Game.getObjectById(creep.memory.assignedRepairs) as Structure,
        );
      } else {
        switchTaskAndDoRoll(creep, CreepTask.getEnergy);
        return;
      }
      break;
    }
    // The creep  has an invalid task
    default: {
      throw new InvalidCreepTaskError(creep, [
        CreepTask.getEnergy,
        CreepTask.build,
        CreepTask.repair,
      ]);
    }
  }
}

function upgrader(creep: Creep) {
  if (creep.memory.task === CreepTask.fresh)
    creep.memory.task = CreepTask.getEnergy;

  // Tasks for this creep:
  // 1. Get energy
  // 2. Deposit energy first in the spawn then upgrade the controller
  switch (creep.memory.task) {
    // The creep is getting energy
    case CreepTask.getEnergy: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep can hold more energy, keep getting energy
        // If there is a controller link
        const controllerLinkId = creep.room.memory.links.controller;
        if (controllerLinkId != undefined) {
          const controllerLink = Game.getObjectById(controllerLinkId);
          if (controllerLink != undefined) {
            // Only target the controller link if it has available energy
            if (controllerLink.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
              getEnergy(creep, controllerLink);
              return;
            } else {
              // If the controller link has no energy but the creep does have
              // some energy, deposit for now with what the creep has.
              if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                switchTaskAndDoRoll(creep, CreepTask.deposit);
              }
            }
          } else {
            throw new GetByIdError(controllerLinkId, STRUCTURE_LINK);
          }
        }
        // If there isn't a controller link
        getEnergy(creep);
      } else {
        // If the creep has full energy, begin building
        switchTaskAndDoRoll(creep, CreepTask.deposit);
        return;
      }
      break;
    }
    // The creep is depositing
    case CreepTask.deposit: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // If hauler creeps exist, upgraders should exclusively upgrade
        if (countRole(creep.room, CreepRole.hauler) > 0) {
          upgradeController(creep);
        } else {
          depositEnergy(creep);
        }
      } else {
        // If the creep has no energy, begin getting energy
        switchTaskAndDoRoll(creep, CreepTask.getEnergy);
        return;
      }
      break;
    }
    // The creep is neither getting energy nor depositing, i.e. it has an
    // invalid task
    default: {
      throw new InvalidCreepTaskError(creep, [
        CreepTask.getEnergy,
        CreepTask.deposit,
      ]);
    }
  }
}

function hauler(creep: Creep) {
  if (creep.memory.task === CreepTask.fresh)
    creep.memory.task = CreepTask.getEnergy;

  // Tasks for this creep:
  // 1. getEnergy: Get energy from container at assigned spot
  // 2. deposit: Bring energy to spawnside energy storage
  switch (creep.memory.task) {
    // Creep is getting energy
    case CreepTask.getEnergy: {
      // >1 to prevent remote haulers from getting stuck
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 1) {
        if (creep.memory.spot == undefined) {
          throw new CreepRoleMemoryError(creep, "spot");
        }
        const spotRoom = Game.rooms[creep.memory.spot.roomName];
        if (spotRoom == undefined) {
          throw new CreepRoleMemoryError(
            creep,
            "spot",
            "Invalid/invisible spot",
          );
        }
        const spot = spotRoom.getPositionAt(
          creep.memory.spot.x,
          creep.memory.spot.y,
        );
        if (spot === null) {
          throw new GetPositionError(
            creep.memory.spot,
            `The position is ${creep.name}'s assigned spot`,
          );
        }
        const structure = spot
          .lookFor(LOOK_STRUCTURES)
          .find((found) => found.structureType === STRUCTURE_CONTAINER) as
          | StructureContainer
          | undefined;
        if (structure === undefined) {
          throw new ScriptError(
            `Hauler creep ${creep.name} unable to get container`,
          );
        }

        // Every 10 ticks check for nearby energy to recover. Otherwise, get
        // energy like normal.
        let response: ScreepsReturnCode = OK;
        if (Game.time % 10 === 0) {
          response = recoverEnergy(creep);
        }
        if (response === OK) {
          // Get energy from the container
          getEnergy(creep, structure);
        }
      } else {
        // Now deposit
        switchTaskAndDoRoll(creep, CreepTask.deposit);
      }
      break;
    }
    case CreepTask.deposit: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        let storage = creep.room.storage;
        // If Creep is not home, try and use the storage in the home room instead
        if (
          creep.room.memory.owner != undefined &&
          creep.room.name != creep.room.memory.owner
        ) {
          const homeRoom = Game.rooms[creep.room.memory.owner];
          if (homeRoom != undefined) {
            storage = homeRoom.storage || storage;
          }
        }
        if (storage == undefined) {
          warn(
            `Creep ${creep.name} noticed there is no primary storage for room ${creep.room.name}`,
          );
          storeEnergy(creep);
        } else {
          storeEnergy(creep, storage);
        }
      } else {
        // If the creep has no energy, begin getting energy
        switchTaskAndDoRoll(creep, CreepTask.getEnergy);
        return;
      }
      break;
    }
    default: {
      throw new InvalidCreepTaskError(creep, [
        CreepTask.getEnergy,
        CreepTask.deposit,
      ]);
    }
  }
}

function tender(creep: Creep) {
  if (creep.memory.task === CreepTask.fresh)
    creep.memory.task = CreepTask.getEnergy;

  // Tasks for this creep:
  // 1. getEnergy: Get energy from fullest container
  // 2. deposit: Deposit into spawn/extension or least full container
  switch (creep.memory.task) {
    // Creep is getting energy
    case CreepTask.getEnergy: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        getEnergy(creep);
      } else {
        // If the creep has full energy, begin building
        switchTaskAndDoRoll(creep, CreepTask.deposit);
        return;
      }
      break;
    }
    // The creep is depositing
    case CreepTask.deposit: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has energy, keep depositing
        const deposited = depositEnergy(creep, true);
        // If not depositing, recover energy from tombs
        if (!deposited) recoverEnergy(creep, -1);
      } else {
        // If the creep has no energy, begin getting energy
        switchTaskAndDoRoll(creep, CreepTask.getEnergy);
        return;
      }
      break;
    }
    default: {
      throw new InvalidCreepTaskError(creep, [
        CreepTask.getEnergy,
        CreepTask.deposit,
      ]);
    }
  }
}

function extractor(creep: Creep): void {
  if (creep.memory.task === CreepTask.fresh)
    creep.memory.task = CreepTask.harvest;

  // Tasks for this creep:
  // 0. Move to spot. If it doesn't have a spot, find extractor's position and
  //    assign it to the creep
  // 1. CreepTask.harvest: harvest from assigned energy source
  // 2. CreepTask.deposit: deposit harvested resource into storage
  switch (creep.memory.task) {
    case CreepTask.harvest: {
      if (creep.store.getFreeCapacity() === 0) {
        switchTaskAndDoRoll(creep, CreepTask.deposit);
        break;
      }
      let spot: RoomPosition | null = null;
      let mineral: Mineral | null = null;
      if (creep.memory.spot) {
        spot = Game.rooms[creep.memory.spot.roomName].getPositionAt(
          creep.memory.spot.x,
          creep.memory.spot.y,
        );
        if (spot == undefined) {
          throw new GetPositionError(
            creep.memory.spot,
            `Invalid spot for ${creep.name}`,
          );
        }
        mineral = spot.lookFor(LOOK_MINERALS)[0];
        if (mineral == undefined) {
          throw new CreepRoleMemoryError(
            creep,
            "spot",
            `spot doesn't have mineral`,
          );
        }
      } else {
        // Spot is undefined, so find the extractor and assign it to the creep
        // TODO: Is this going to cause problems if there are more than one mineral
        // deposit in the room? Is that possible?
        mineral = creep.room.find(FIND_MINERALS)[0];
        if (mineral == undefined) {
          throw new ScriptError(
            `Unable to find mineral in room ${creep.room},\n` +
              `but creep ${creep.name} is present as an ${creep.memory.role}`,
          );
        }
        spot = mineral.pos;
        creep.memory.spot = spot;
      }
      if (!creep.pos.inRangeTo(spot, 1)) {
        creep.moveTo(spot);
        return;
      }
      if (mineral.mineralAmount > 0) {
        // Only try to harvest if there is mineral left
        harvestEnergy(creep, mineral);
      }
      break;
    }
    case CreepTask.deposit: {
      if (creep.store.getUsedCapacity() === 0) {
        switchTaskAndDoRoll(creep, CreepTask.harvest);
        break;
      }
      const storage = creep.room.storage;
      if (storage == undefined) {
        throw new ScriptError(
          `Room ${creep.room.name} storage is undefined,` +
            `but has an extractor creep ${creep.name}`,
        );
      }
      storeResource(creep, storage);
    }
  }
}

function claimer(creep: Creep) {
  if (creep.memory.claimTarget == undefined) {
    throw new CreepRoleMemoryError(creep, "claimTarget");
  }

  if (creep.memory.task === CreepTask.fresh) {
    creep.memory.task = CreepTask.claim;
    // This claimer is brand new, so initialize it's path to the new room
    const exitToRoom = creep.room.findExitTo(creep.memory.claimTarget);
    if (exitToRoom === ERR_NO_PATH || exitToRoom === ERR_INVALID_ARGS) {
      throw new ScriptError(
        `Error finding path to room ${creep.memory.claimTarget} from ${creep.room.name}`,
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
  }

  // Tasks for this creep:
  // 1. getEnergy: Get energy from fullest container
  // 2. deposit: Deposit into spawn/extension or least full container
  switch (creep.memory.task) {
    // Creep is getting energy
    case CreepTask.claim: {
      if (creep.room.name !== creep.memory.claimTarget) {
        if (creep.memory.path == undefined) {
          throw new CreepRoleMemoryError(
            creep,
            "path",
            "Claimers need a path to their destination room",
          );
        }
        const path = Room.deserializePath(creep.memory.path);
        const exitPos = creep.room.getPositionAt(
          path[path.length - 1].x,
          path[path.length - 1].y,
        );
        if (exitPos == undefined) {
          throw new ScriptError(`Final position of path doesn't exist in room`);
        }
        if (creep.pos.isEqualTo(exitPos)) {
          // Move to room
        } else {
          const response = creep.moveByPath(path);
          if (response !== OK && response !== ERR_TIRED) {
            warn(
              `Creep ${
                creep.name
              } failed to move by path with response ${errorConstant(
                response,
              )}`,
            );
          }
        }
      } else {
        const controller = creep.room.controller;
        if (controller == undefined) {
          throw new ScriptError(
            `Undefined controller in room ${creep.room.name}`,
          );
        }
        if (controller.my) {
          info(`Creep ${creep.name} successfully claimed ${creep.room.name}`);
          if (
            controller.sign == undefined ||
            controller.sign.username !== "Baelyk"
          ) {
            creep.signController(controller, "hey I got it to work");
          }
          return;
        }
        const response = creep.claimController(controller);
        if (response === ERR_NOT_IN_RANGE) {
          creep.moveTo(controller);
        } else if (response !== OK) {
          warn(
            `Creep ${creep.name} failed to claim controller in ${
              creep.room.name
            } with response ${errorConstant(response)}`,
          );
        }
      }
      break;
    }
    default: {
      throw new InvalidCreepTaskError(creep, [CreepTask.claim]);
    }
  }
}

function reserver(creep: Creep) {
  if (creep.memory.task === CreepTask.fresh)
    creep.memory.task = CreepTask.claim;

  // Tasks for this creep:
  // 1. claim: Move to and start/maintain controller reservation
  switch (creep.memory.task) {
    case CreepTask.claim: {
      const targetRoom = Game.rooms[creep.memory.room];
      if (targetRoom == undefined) {
        throw new CreepRoleMemoryError(
          creep,
          "room",
          "Claimer creep must have visible room",
        );
      }
      const controller = targetRoom.controller;
      if (controller == undefined) {
        throw new CreepRoleMemoryError(
          creep,
          "room",
          "Claimer creep room must have controller",
        );
      }
      let response: CreepActionReturnCode;
      let action = "";
      if (
        controller.reservation == undefined ||
        controller.reservation.username === "Baelyk"
      ) {
        response = creep.reserveController(controller);
        action = "reserve";
      } else {
        response = creep.attackController(controller);
        action = "attack";
      }
      if (response === ERR_NOT_IN_RANGE) {
        creep.moveTo(controller);
      } else if (response !== OK) {
        warn(
          `Creep ${
            creep.name
          } failed to ${action} controller because ${errorConstant(response)}`,
        );
      }
      break;
    }
    default: {
      throw new InvalidCreepTaskError(creep, [CreepTask.claim]);
    }
  }
}

function remoteHauler(creep: Creep) {
  // Try and perform as a hauler
  try {
    hauler(creep);
  } catch (error) {
    // If there was an error acting as a hauler, try and just got to the spot
    // and recover energy there. The error was likely due to a lacking container
    // which is not a critical error for remote haulers. The other contender is
    // that the room lacks vision.
    let spot: RoomPosition;
    try {
      spot = livenRoomPosition(creep.memory.spot);
      if (!creep.pos.isNearTo(spot)) {
        creep.moveTo(spot);
      } else {
        recoverEnergy(creep);
      }
    } catch (spotError) {
      if (creep.room.name != creep.memory.room) {
        moveToRoom(creep);
      } else {
        throw new CreepRoleMemoryError(creep, "spot", "Unable liven spot");
      }
    }
  }
  // But repair roads under the creep
  const road = creep.pos
    .lookFor(LOOK_STRUCTURES)
    .find((structure) => structure.structureType === STRUCTURE_ROAD);
  if (road != undefined && road.hits < road.hitsMax) {
    creep.repair(road);
  } else if (
    Game.rooms[creep.memory.room] != undefined &&
    creep.pos.isNearTo(livenRoomPosition(creep.memory.spot))
  ) {
    const container = livenRoomPosition(creep.memory.spot)
      .lookFor(LOOK_STRUCTURES)
      .find((structure) => structure.structureType === STRUCTURE_CONTAINER);
    if (container != undefined && container.hits < container.hitsMax) {
      if (container.hits < container.hitsMax * 0.1) {
        // TODO: Don't wanna move, not really sure how this works
        creep.cancelOrder("move");
        creep.cancelOrder("moveTo");
        creep.cancelOrder("moveByPath");
      }
      creep.repair(container);
    }
  }
}

function scout(creep: Creep) {
  if (creep.memory.task === CreepTask.fresh) {
    creep.memory.task = CreepTask.claim;
    moveToRoom(creep, creep.memory.room);
  }

  // Tasks for this creep:
  // 1. claim: Move to target room
  switch (creep.memory.task) {
    // Creep is getting energy
    case CreepTask.claim: {
      if (creep.room.name !== creep.memory.room) {
        moveToRoom(creep, creep.memory.room);
      } else {
        // If the controller has not already been signed, let's sign it
        const controller = creep.room.controller;
        if (controller == undefined) {
          throw new ScriptError(
            `Undefined controller in room ${creep.room.name}`,
          );
        }
        if (controller.sign == undefined) {
          const response = creep.signController(
            controller,
            "no this is my favorite room so far",
          );
          if (response === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller);
          }
        } else {
          if (creep.pos.isNearTo(controller.pos)) {
            // Don't block the controller if there is only one access to it
            const path = PathFinder.search(
              creep.pos,
              { pos: controller.pos, range: 1 },
              { flee: true },
            ).path;
            creep.moveByPath(path);
          } else if (!creep.pos.inRangeTo(controller.pos, 3)) {
            // Be near the controller
            // TODO: This isn't really necessary, the creep just needs to be in
            // the room and ideally out of the way
            creep.moveTo(controller.pos);
          }
        }
      }
      break;
    }
    default: {
      throw new InvalidCreepTaskError(creep, [CreepTask.claim]);
    }
  }
}

function guard(creep: Creep) {
  if (creep.memory.task === CreepTask.fresh) creep.memory.task = CreepTask.idle;

  // Tasks for this creep:
  // 1. CreepTask.idle: Sit near room spawn and check for hostiles in room and
  //    its remotes
  // 2. CreepTask.move: Move to the target room (that was identified to contain
  //    hostiles)
  // 3. Attack hostiles in room
  switch (creep.memory.task) {
    case CreepTask.idle: {
      // Idle now, reset path
      delete creep.memory.path;

      // Check for hostiles in current room, home room, then home room's remotes
      const roomsToGuard = [creep.room.name, creep.memory.room];
      const homeRoomMemory = Memory.rooms[creep.memory.room];
      if (homeRoomMemory != undefined && homeRoomMemory.remotes != undefined) {
        roomsToGuard.push(...homeRoomMemory.remotes);
      }
      const roomTarget = _.find(roomsToGuard, (roomName) => {
        const room = Game.rooms[roomName];
        if (room == undefined) {
          return false;
        }
        // Find hostile creeps AND structures (e.g. invader cores)
        let targets: (Creep | AnyOwnedStructure)[] = room.find(
          FIND_HOSTILE_CREEPS,
        );
        targets = targets.concat(room.find(FIND_HOSTILE_STRUCTURES));
        return targets.length > 0;
      });
      // If a room was found, target it and move to it
      if (roomTarget != undefined) {
        info(`Creep ${creep.name} detected hostiles in ${roomTarget}`);
        creep.memory.roomTarget = roomTarget;
        switchTaskAndDoRoll(creep, CreepTask.move);
        return;
      }

      // No hostiles found, move to spawn
      if (creep.room.name !== creep.memory.room) {
        moveToRoom(creep, creep.memory.room);
      } else {
        // Move to spawn if exists
        if (homeRoomMemory.spawn == undefined) {
          throw new CreepRoleMemoryError(
            creep,
            "room",
            `Creep ${creep.name}'s home room ${creep.memory.room} lacks a spawn, needed for guards`,
          );
        }
        const spawn = Game.getObjectById(homeRoomMemory.spawn);
        if (spawn == undefined) {
          throw new GetByIdError(homeRoomMemory.spawn, STRUCTURE_SPAWN);
        }
        if (!creep.pos.isNearTo(spawn.pos)) {
          creep.moveTo(spawn.pos);
        }
      }
      break;
    }
    // The creep is in transit to its roomTarget
    case CreepTask.move: {
      if (creep.room.name != creep.memory.roomTarget) {
        moveToRoom(creep, creep.memory.roomTarget);
      } else {
        switchTaskAndDoRoll(creep, CreepTask.attack);
      }
      break;
    }
    // The creep is attacking hostile creeps in the room
    case CreepTask.attack: {
      // TODO: Don't simply attack closest hostile creep
      let targets: (Creep | AnyOwnedStructure)[] = creep.room.find(
        FIND_HOSTILE_CREEPS,
      );
      targets = targets.concat(creep.room.find(FIND_HOSTILE_STRUCTURES));
      const target = creep.pos.findClosestByPath(targets);
      // If there are no hostiles left, done attacking, go idle
      if (target == undefined) {
        switchTaskAndDoRoll(creep, CreepTask.idle);
        return;
      }

      // Hostiles present:
      // Move to AND do all attacks possible
      const moveResponse = creep.moveTo(target);
      info(
        `Creep ${creep.name} approaching target ${
          target.id
        } with response ${errorConstant(moveResponse)}`,
      );
      // if (creep.pos.isNearTo(target.pos)) {
      const attackResponse = creep.attack(target);
      info(
        `Creep ${creep.name} melee attacking ${
          target.id
        } with response ${errorConstant(attackResponse)}
          `,
      );
      // }
      // if (creep.pos.inRangeTo(target.pos, 3)) {
      const rangedResponse = creep.rangedAttack(target);
      info(
        `Creep ${creep.name} ranged attacking ${
          target.id
        } with response ${errorConstant(rangedResponse)}`,
      );
      // }
      break;
    }
    default: {
      throw new InvalidCreepTaskError(creep, [
        CreepTask.idle,
        CreepTask.move,
        CreepTask.attack,
      ]);
    }
  }
}

/**
 * Switches the creeps task and then calls doRoll on the creep
 *
 * @param creep The creep
 * @param task The new role for the creep
 */
function switchTaskAndDoRoll(creep: Creep, task: CreepTask) {
  creep.memory.task = task;
  info(
    `Creep ${creep.name} switching to ${task} and performing ${creep.memory.role}`,
    InfoType.task,
  );
  creepBehavior(creep);
}

function renewCreep(creep: Creep): void {
  info(`Creep ${creep.name} renewing`);
  const spawn = Game.getObjectById(creep.room.memory.spawn) as
    | StructureSpawn
    | undefined;
  if (spawn == undefined) {
    throw new GetByIdError(creep.room.memory.spawn, STRUCTURE_SPAWN);
  }

  // The energy required for each renew
  const energyCost = Math.ceil(bodyCost(creep.body) / 2.5 / creep.body.length);
  // The ratio of energy available to energy capacity of the spawn
  const energyRatio =
    creep.room.energyAvailable / creep.room.energyCapacityAvailable;

  // Only renew the creep if it has less than 1400 ticks to live and the spawn
  // has more than 50% of the energy it can have. This second part is largely
  // to combat tender renewal preventing all other creeps from spawning.
  if (creep.ticksToLive && creep.ticksToLive < 1400 && energyRatio > 0.5) {
    // If the creep is adjacent to the spawn
    if (creep.pos.getRangeTo(spawn) === 1) {
      spawn.renewCreep(creep);
    } else {
      creep.moveTo(spawn);
    }
  } else {
    switchTaskAndDoRoll(creep, CreepTask.fresh);
  }
}

function renewCheck(creep: Creep): void {
  // If the creep isn't allowed to renew or it is already renewing, do nothing.
  if (creep.memory.noRenew || creep.memory.task === CreepTask.renew) {
    return;
  }

  // If the creep is spawning (ticksToLive == undefined) or has more than 100
  // ticks to live, don't renew.
  if (creep.ticksToLive == undefined || creep.ticksToLive > 100) {
    return;
  }

  // If the creep's role is above the population limit, let it die.
  const roleLimit = creep.room.memory.populationLimit[creep.memory.role];
  if (
    roleLimit == undefined ||
    roleLimit < countRole(creep.room, creep.memory.role)
  ) {
    // An option here would be to set the creep to not renew, but the limit may
    // change while the creep still has a chance to renew, like in the case of
    // the builder limit increasing due to a change in the construction queue.
    return;
  }

  if (creep.room.memory.spawn == undefined) {
    return;
  }

  const spawn = Game.getObjectById(creep.room.memory.spawn) as
    | StructureSpawn
    | undefined;
  // If the spawn can't be found, log an error and do nothing.
  if (spawn == undefined) {
    throw new GetByIdError(creep.room.memory.spawn, STRUCTURE_SPAWN);
  }

  // If the spawn is spawning, don't renew
  if (spawn.spawning != undefined) {
    return;
  }

  // If the spawn doesn't have full capacity, don't renew
  if (spawn.room.energyAvailable !== spawn.room.energyCapacityAvailable) {
    return;
  }

  // If there is a new/better body for the creep, let it die.
  const newBody = generateBodyByRole(spawn, creep.memory.role);
  if (bodyCost(newBody) > bodyCost(creep.body)) {
    // Since there is a better body, don't check is this creep can renew again.
    creep.memory.noRenew = true;
    return;
  }

  // All checks passed, renew.
  switchTaskAndDoRoll(creep, CreepTask.renew);
}

/**
 * Passes creep to appropriate behavior function based on the creep's role
 * (`creep.memory.role`)
 *
 * @param creep The creep
 */
function creepBehavior(creep: Creep): void {
  if (creep.spawning) return;
  if (Memory.debug.sayTask) creep.say(creep.memory.task);

  // The renew task is the same regardless of role
  renewCheck(creep);
  if (creep.memory.task === CreepTask.renew) {
    renewCreep(creep);
    // Creep is renewing; don't process normal behavior
    return;
  }

  switch (creep.memory.role) {
    case CreepRole.harvester:
      harvester(creep);
      break;
    case CreepRole.builder:
      builder(creep);
      break;
    case CreepRole.miner:
      miner(creep);
      break;
    case CreepRole.upgrader:
      upgrader(creep);
      break;
    case CreepRole.hauler:
      hauler(creep);
      break;
    case CreepRole.tender:
      tender(creep);
      break;
    case CreepRole.extractor:
      extractor(creep);
      break;
    case CreepRole.claimer:
      claimer(creep);
      break;
    case CreepRole.reserver:
      reserver(creep);
      break;
    case CreepRole.remoteHauler:
      remoteHauler(creep);
      break;
    case CreepRole.scout:
      scout(creep);
      break;
    case CreepRole.guard:
      guard(creep);
      break;
    default:
      throw new InvalidCreepRoleError(creep);
  }
}

/**
 * Performs actions upon the death of a creep based on the creeps roll
 *
 * @param name The name of the dead creep
 */
export function handleDead(name: string): void {
  info(`Handling death of creep ${name}`, InfoType.general);
  const memory = Memory.creeps[name];
  switch (memory.role) {
    case CreepRole.builder:
      if (memory.assignedConstruction) {
        unassignConstruction(name);
      }
      break;
    // Bandaid/potentially better way to replace dead haulers
    case CreepRole.hauler:
      respawnCreep(memory);
      break;
  }
  if (memory.room != undefined) {
    const room = Game.rooms[memory.room];
    if (room != undefined) {
      const tomb = room
        .find(FIND_TOMBSTONES)
        .find((tomb) => tomb.creep.name === name);
      if (tomb != undefined) {
        if (tomb.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
          if (room.memory.tombs == undefined) {
            room.memory.tombs == [];
          }
          info(`Adding dead creep ${name}'s tomb to room ${room.name}'s tombs`);
          room.memory.tombs.push(tomb.id);
        }
      } else {
        warn(`Unable to find tomb for dead creep ${name} in ${room.name}`);
      }
    }
  }
}

export function creepManager(): void {
  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      wrapper(() => {
        handleDead(name);
        delete Memory.creeps[name];
      }, `Error handling death of creep ${name}`);
    }
  }

  // Process creep behavior
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    wrapper(
      () => creepBehavior(creep),
      `Error processing creep ${name} behavior`,
    );
  }
}
