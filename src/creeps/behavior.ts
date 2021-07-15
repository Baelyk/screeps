import { error, errorConstant, info, warn } from "utils/logger";
import { generateBodyByRole } from "spawns";
import { ScriptError, GetByIdError, wrapper } from "utils/errors";
import { awayFromExitDirection, bodyCost, onExit } from "utils/helpers";
import { countRole } from "./utils";
import { RoomInfo, VisibleRoom } from "roomMemory";
import {
  CreepTask,
  CreepRole,
  CreepInfo,
  InvalidCreepTaskError,
  InvalidCreepRoleError,
  CreepRoleMemoryError,
  RoleCreepInfo,
} from "./memory";
import * as actions from "./actions";
import { Position } from "classes/position";

function getTask(creep: Creep, defaultTask: CreepTask): CreepTask {
  const creepInfo = new CreepInfo(creep.name);
  const task = creepInfo.getTask();
  if (task === CreepTask.fresh) {
    creepInfo.setTask(defaultTask);
  }
  return creepInfo.getTask();
}

/**
 * Behavior for a harvester creep (CreepRole.harvester)
 *
 * @param creep The harvester creep
 */
function harvester(creep: Creep) {
  const task = getTask(creep, CreepTask.harvest);

  switch (task) {
    // The creep is harvesting
    case CreepTask.harvest: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has more free energy, keep harvesting
        actions.getEnergy(creep);
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
        actions.depositEnergy(creep);
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
 * move to its assigned spot and mine. If there is an adjacent link, it should
 * deposit energy into the link when possible. When not mining, repair the
 * container at its spot if present.
 *
 * @param creep The miner creep
 */
function miner(creep: Creep) {
  // Creep is taskless

  const creepInfo = new RoleCreepInfo[CreepRole.miner](creep.name);

  // Move to assigned spot
  const spot = creepInfo.getSpot();
  if (!Position.areEqual(creep.pos, spot)) {
    actions.move(creep, spot);
    return;
  }

  // If creep has energy and there is a link, transfer energy to the link
  if (creep.store[RESOURCE_ENERGY] > 0) {
    const link = creep.pos.findInRange(FIND_MY_STRUCTURES, 1, {
      filter: { structureType: STRUCTURE_LINK },
    })[0] as StructureLink | null;
    if (link != undefined && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      const amount = Math.min(
        creep.store[RESOURCE_ENERGY],
        link.store.getFreeCapacity(RESOURCE_ENERGY),
      );
      actions.putResource(creep, link, RESOURCE_ENERGY, amount);
    }
  }

  // Harvest energy from the source
  const source = creepInfo.getAssignedSource();
  if (source == undefined) {
    throw new CreepRoleMemoryError(creep, "assignedSource");
  }
  const response = actions.harvest(creep, source);

  // Repair if the creep did not harvest due to the source being empty
  if (response === ERR_NOT_ENOUGH_RESOURCES) {
    const container = _.find(spot.lookFor(LOOK_STRUCTURES), {
      structureType: STRUCTURE_CONTAINER,
    }) as StructureContainer | null;
    if (container == undefined) {
      return;
    }
    if (creep.store[RESOURCE_ENERGY] > 0) {
      actions.repair(creep, container);
    } else if (container.store[RESOURCE_ENERGY] > 0) {
      const amount = Math.min(
        creep.store.getFreeCapacity(),
        container.store[RESOURCE_ENERGY],
      );
      actions.getResource(creep, container, RESOURCE_ENERGY, amount);
    }
  }
}

/**
 * Behavior function for builder creeps (CreepRole.builder). These creeps
 * should construct buildings in the build queue.
 *
 * @param creep The builder creep
 */
function builder(creep: Creep) {
  const task = getTask(creep, CreepTask.getEnergy);
  // Tasks for this creep:
  // 1. CreepTask.getEnergy: Get energy to construct buildings
  // 2. CreepTask.build: Move to a construction site and build
  // 3. CreepTask.repair: Move to a repairable structure and repair
  // 4. CreepTask.idle: Move to the idle location and chill

  const creepInfo = new RoleCreepInfo[CreepRole.builder](creep.name);

  switch (task) {
    case CreepTask.getEnergy: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep can hold more energy, keep getting energy
        actions.getEnergy(creep);
      } else {
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
        const assignedConstruction = creepInfo.getAssignedConstruction();
        if (assignedConstruction != undefined) {
          actions.build(creep, assignedConstruction);
          return;
        }

        // If the creep is assigned a construction site that no longer exists or
        // doesn't have an assigned construction site, get one from the queue.
        let room;
        if (VisibleRoom.isVisible(creepInfo.getAssignedRoomName())) {
          room = new VisibleRoom(creepInfo.getAssignedRoomName());
        } else {
          room = new VisibleRoom(creep.room.name);
        }
        const newSiteId = room.getNextConstructionSite();
        // If a construction site was successfully obtained from the queue,
        // run through build behavior with the new site.
        if (newSiteId != undefined) {
          creepInfo.setAssignedConstruction(newSiteId);
          switchTaskAndDoRoll(creep, CreepTask.build);
          return;
        }

        // If the creep was unable to obtain a construction site, switch tasks
        // to repairing.
        info(
          `No items in the construction queue in ${room.name}`,
          InfoType.general,
        );
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
      } else {
        // Remain idle
        info(`Creep ${creep.name} is idle`, InfoType.idleCreep);
        actions.idle(creep);
      }
      break;
    }
    case CreepTask.repair: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        const assignedRepairs = creepInfo.getAssignedRepairs();

        // Repair if the assigned repair target exists and needs repairs.
        // Otherwise, remove the assigned repair target and try and find a new
        // target.
        if (assignedRepairs != undefined) {
          if (assignedRepairs.hits < assignedRepairs.hitsMax) {
            actions.repair(creep, assignedRepairs);
            return;
          } else {
            creepInfo.removeAssignedRepairs();
          }
        }

        // Get new repair assignment
        // Try and get a repair in the creep's assigned room, then it's
        // current room
        let room;
        if (VisibleRoom.isVisible(creepInfo.getAssignedRoomName())) {
          room = new VisibleRoom(creepInfo.getAssignedRoomName());
        } else {
          room = new VisibleRoom(creep.room.name);
        }
        const repairTarget = room.getNextRepairTarget();
        if (repairTarget != undefined) {
          // Assign the new target and rerun repair logic
          creepInfo.setAssignedRepairs(repairTarget.id);
          switchTaskAndDoRoll(creep, CreepTask.repair);
          return;
        } else {
          // No repair. If assigned to a remote, reassign to remote's owner
          if (room.roomType === RoomType.remote) {
            creepInfo.setAssignedRoomName(room.getRemoteOwner());
            info(
              `Creep ${creep.name} (in ${
                creep.room.name
              }) reassigned to remote's owner ${creepInfo.getAssignedRoomName()}`,
            );
            // Try and build again
            switchTaskAndDoRoll(creep, CreepTask.build);
            return;
          }
          switchTaskAndDoRoll(creep, CreepTask.idle);
          return;
        }
      } else {
        switchTaskAndDoRoll(creep, CreepTask.getEnergy);
        return;
      }
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
  const task = getTask(creep, CreepTask.getEnergy);
  // Tasks for this creep:
  // 1. Get energy
  // 2. Deposit energy first in the spawn then upgrade the controller

  const creepInfo = new RoleCreepInfo[CreepRole.upgrader](creep.name);

  switch (task) {
    // The creep is getting energy
    case CreepTask.getEnergy: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep can hold more energy, keep getting energy
        // If there is a controller link
        const room = new VisibleRoom(creep.room.name);
        const controllerLinkId = room.getLinksMemory().controller;
        if (controllerLinkId != undefined) {
          const controllerLink = Game.getObjectById(controllerLinkId);
          if (controllerLink == undefined) {
            throw new GetByIdError(controllerLinkId, STRUCTURE_LINK);
          }

          // Only target the controller link if it has available energy
          const controllerLinkEnergy = controllerLink.store[RESOURCE_ENERGY];
          if (controllerLinkEnergy > 0) {
            const amount = Math.min(
              creep.store.getFreeCapacity(),
              controllerLinkEnergy,
            );
            actions.getResource(creep, controllerLink, RESOURCE_ENERGY, amount);
            return;
          } else {
            // If the controller link is empty but the creep has some energy,
            // upgrade for now with what the creep has.
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
              switchTaskAndDoRoll(creep, CreepTask.deposit);
            }
          }
        }

        // If there isn't a controller link
        actions.getEnergy(creep);
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
        // If tender/hauler creeps exist, upgraders should exclusively upgrade
        if (
          countRole(creep.room, CreepRole.tender) > 0 ||
          countRole(creep.room, CreepRole.hauler) > 0
        ) {
          const controller = creep.room.controller;
          if (controller == undefined) {
            const assignedRoomName = creepInfo.getAssignedRoomName();
            if (creep.room.name !== assignedRoomName) {
              actions.moveToRoom(creep, assignedRoomName);
            } else {
              warn(
                `Creep ${creep.name} cannot find controller in room ${creep.room.name}`,
              );
            }
          } else {
            actions.upgrade(creep, controller);
          }
        } else {
          actions.depositEnergy(creep);
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
  const task = getTask(creep, CreepTask.getEnergy);
  // Tasks for this creep:
  // 1. getEnergy: Get energy from container at assigned spot
  // 2. deposit: Bring energy to spawnside energy storage

  const creepInfo = new RoleCreepInfo[CreepRole.hauler](creep.name);

  switch (task) {
    // Creep is getting energy
    case CreepTask.getEnergy: {
      // >1 to prevent remote haulers from getting stuck
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 1) {
        const spot = creepInfo.getSpot();
        if (spot == undefined) {
          throw new CreepRoleMemoryError(creep, "spot");
        }

        const container = spot
          .lookFor(LOOK_STRUCTURES)
          .find((found) => found.structureType === STRUCTURE_CONTAINER) as
          | StructureContainer
          | undefined;
        if (container != undefined && container.store[RESOURCE_ENERGY] > 0) {
          const amount = Math.min(
            creep.store.getFreeCapacity(RESOURCE_ENERGY),
            container.store[RESOURCE_ENERGY],
          );
          actions.getResource(creep, container, RESOURCE_ENERGY, amount);
        } else {
          if (container == undefined) {
            error(`Creep ${creep.name} unable to get container`);
            warn(`Creep ${creep.name} attempting to recover at spot`);
            if (
              creep.room.name === creepInfo.getAssignedRoomName() &&
              creep.pos.inRangeTo(spot, 1)
            ) {
              actions.recoverResource(creep, RESOURCE_ENERGY);
            } else {
              actions.move(creep, spot, { range: 1 });
            }
          } else if (!creep.pos.inRangeTo(spot, 1)) {
            actions.move(creep, spot, { range: 1 });
          }
        }
      } else {
        // Now deposit
        switchTaskAndDoRoll(creep, CreepTask.deposit);
      }
      break;
    }
    case CreepTask.deposit: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // If creep assigned to a remote room, use the remote's owner as the
        // backup room instead of its assigned owner. Additionally warn based on
        // the owner room's level and not the current room's level.
        const room = new VisibleRoom(creep.room.name);
        let roomLevel = room.roomLevel();
        let backupName = creepInfo.getAssignedRoomName();
        const backupRoom = new RoomInfo(backupName);
        if (backupRoom.roomType === RoomType.remote) {
          backupName = backupRoom.getRemoteOwner();
          roomLevel = new RoomInfo(backupName).roomLevel();
        }
        const response = actions.storeEnergy(creep, backupName, roomLevel >= 4);
        if (response === ERR_NOT_FOUND) {
          warn(`Creep ${creep.name} unable to store energy so depositing`);
          actions.depositEnergy(creep);
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
  const task = getTask(creep, CreepTask.getEnergy);

  if (creep.store.getCapacity() == undefined) {
    warn(`Creep ${creep.name} has no capacity so will suicide`);
    creep.suicide();
    return;
  }

  // Tasks for this creep:
  // 1. getEnergy: Get energy from fullest container
  // 2. deposit: Deposit into spawn/extension or least full container
  switch (task) {
    // Creep is getting energy
    case CreepTask.getEnergy: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        let response = null;
        try {
          const room = new VisibleRoom(creep.room.name);
          const spawnLink = room.getSpawnLink();
          response = actions.tendLink(
            creep,
            spawnLink,
            LINK_CAPACITY / 2,
            "get",
          );
        } catch (error) {
          // Error getting energy from the spawn link first
          warn(`Creep ${creep.name} failed to get from spawn link ${error}`);
        }
        if (response !== OK) {
          actions.getEnergy(creep);
        }
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
        let response = actions.depositEnergy(creep);
        // If not depositing, tend to the spawn link
        if (response !== OK) {
          try {
            const room = new VisibleRoom(creep.room.name);
            const spawnLink = room.getSpawnLink();
            response = actions.tendLink(
              creep,
              spawnLink,
              LINK_CAPACITY / 2,
              "decide",
              false,
            );
            if (response === ERR_FULL && creep.store.getFreeCapacity() === 0) {
              actions.storeEnergy(creep);
            }
          } catch (error) {
            // Error getting energy from the spawn link first
            warn(`Creep ${creep.name} failed to put into spawn link ${error}`);
          }
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

function extractor(creep: Creep): void {
  const task = getTask(creep, CreepTask.harvest);
  // Tasks for this creep:
  // 0. Move to spot. If it doesn't have a spot, find extractor's position and
  //    assign it to the creep
  // 1. CreepTask.harvest: harvest from assigned energy source
  // 2. CreepTask.deposit: deposit harvested resource into storage

  const creepInfo = new RoleCreepInfo[CreepRole.extractor](creep.name);

  switch (task) {
    case CreepTask.harvest: {
      if (creep.store.getFreeCapacity() === 0) {
        switchTaskAndDoRoll(creep, CreepTask.deposit);
        break;
      }
      const spot = creepInfo.getSpot();
      if (spot == undefined) {
        throw new CreepRoleMemoryError(creep, "spot");
      }
      if (!creep.pos.inRangeTo(spot, 1)) {
        actions.move(creep, spot, { range: 1 });
        return;
      }
      const mineral = spot.lookFor(LOOK_MINERALS)[0];
      if (mineral == undefined) {
        throw new CreepRoleMemoryError(
          creep,
          "spot",
          `spot doesn't have mineral`,
        );
      }
      if (mineral.mineralAmount > 0) {
        // Only try to harvest if there is mineral left
        actions.harvest(creep, mineral);
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
      const resource = _.findKey(creep.store, (amount) => {
        return (amount as number) > 0;
      }) as ResourceConstant;
      const amount = Math.min(
        creep.store[resource],
        storage.store.getFreeCapacity(resource),
      );
      actions.putResource(creep, storage, resource, amount);
    }
  }
}

function claimer(creep: Creep) {
  const task = getTask(creep, CreepTask.reserve);

  // Tasks for this creep:
  // 1. reserve: Move to and start/maintain controller reservation
  // 2. claim: Move to and claim controller

  const creepInfo = new RoleCreepInfo[CreepRole.claimer](creep.name);

  switch (task) {
    case CreepTask.reserve:
    case CreepTask.claim: {
      const targetRoom = Game.rooms[creepInfo.getAssignedRoomName()];
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
      let response: ScreepsReturnCode;
      let action = "";
      if (
        controller.reservation == undefined ||
        controller.reservation.username === "Baelyk"
      ) {
        if (task === CreepTask.claim) {
          response = creep.claimController(controller);
          action = "claim";
          creep.signController(
            controller,
            "It would be a shame if this doesn't work",
          );
        } else {
          response = creep.reserveController(controller);
          action = "reserve";
        }
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
  hauler(creep);
  // But repair roads under the creep
  const road = creep.pos
    .lookFor(LOOK_STRUCTURES)
    .find((structure) => structure.structureType === STRUCTURE_ROAD);
  if (road != undefined && road.hits < road.hitsMax) {
    creep.repair(road);
  }
}

function scout(creep: Creep) {
  const task = getTask(creep, CreepTask.claim);

  // Tasks for this creep:
  // 1. claim: Move to target room and stay
  // 2. scout: Move to target room and then potentially move on to another room

  const creepInfo = new RoleCreepInfo[CreepRole.scout](creep.name);
  const assignedRoom = creepInfo.getAssignedRoomName();

  switch (task) {
    case CreepTask.scout: {
      // If the creep just entered a room (i.e. on exit)
      if (onExit(creep.pos)) {
        // Move off the exit first
        creep.move(awayFromExitDirection(creep.pos));
        break;
      } else {
        if (creep.room.name === assignedRoom) {
          // Creep is not on an exit, so find where to go from here
          const newTarget = RoomInfo.findNearestUnscoutedRoom(
            creep.room.name,
            50,
            true,
            (roomName) => {
              // Avoid hostile rooms
              try {
                const room = Game.rooms[roomName];
                if (room != undefined) {
                  if (
                    room.find(FIND_HOSTILE_CREEPS).length > 0 ||
                    room.find(FIND_HOSTILE_STRUCTURES).length > 0
                  ) {
                    return false;
                  }
                } else {
                  const roomInfo = new RoomInfo(roomName);
                  if (
                    roomInfo.roomType === RoomType.occupied ||
                    roomInfo.roomType === RoomType.central
                  ) {
                    const scoutingMemory = roomInfo.getScoutingMemory();
                    if (
                      scoutingMemory != undefined &&
                      Game.time - scoutingMemory.time < 5000
                    ) {
                      return true;
                    }
                    return false;
                  }
                }
              } catch (e) {
                // Something went wrong, go to the default return
              }
              // Default to searching the room
              return true;
            },
          );
          if (newTarget == undefined) {
            // If unable to find a new target, stay here and provide vision
            switchTaskAndDoRoll(creep, CreepTask.claim);
            break;
          } else {
            creepInfo.setAssignedRoomName(newTarget);
            info(`Creep ${creep.name} switching scout target to ${newTarget}`);
            actions.moveToRoom(creep, newTarget);
          }
        } else {
          // Move to the room
          try {
            actions.moveToRoom(creep, assignedRoom);
          } catch (error) {
            warn(
              `Creep ${creep.name} unable to move to room. Abandoning room target`,
            );
            creepInfo.setAssignedRoomName(creep.room.name);
            creep.move(awayFromExitDirection(creep.pos));
          }
        }
      }
      break;
    }
    case CreepTask.claim: {
      if (creep.room.name !== assignedRoom) {
        actions.moveToRoom(creep, assignedRoom);
      } else {
        if (onExit(creep.pos)) {
          creep.move(awayFromExitDirection(creep.pos));
          return;
        }
        // If the controller has not already been signed, let's sign it
        const controller = creep.room.controller;
        if (controller == undefined) {
          warn(
            `Creep ${creep.name} cannot find controller in ${creep.room.name}`,
          );
          creep.move(awayFromExitDirection(creep.pos));
          return;
        }
        if (controller.sign == undefined) {
          const response = creep.signController(
            controller,
            "no this is my favorite room so far",
          );
          if (response === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller, { maxRooms: 1 });
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
            creep.moveTo(controller.pos, { maxRooms: 1 });
          }
        }
      }
      break;
    }
    default: {
      throw new InvalidCreepTaskError(creep, [
        CreepTask.claim,
        CreepTask.scout,
      ]);
    }
  }
}

function guard(creep: Creep) {
  const task = getTask(creep, CreepTask.idle);

  // Tasks for this creep:
  // 1. CreepTask.idle: Sit near room spawn and check for hostiles in room and
  //    its remotes
  // 2. CreepTask.move: Move to the target room (that was identified to contain
  //    hostiles)
  // 3. Attack hostiles in room

  const creepInfo = new RoleCreepInfo[CreepRole.guard](creep.name);

  switch (task) {
    case CreepTask.idle: {
      const homeRoomName = creepInfo.getAssignedRoomName();
      // Check for hostiles in current room, home room, then home room's remotes
      const roomsToGuard = [creep.room.name, homeRoomName];
      const homeRoom = new VisibleRoom(homeRoomName);
      roomsToGuard.push(...homeRoom.getRemotes());
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
        creepInfo.setTargetRoom(roomTarget);
        switchTaskAndDoRoll(creep, CreepTask.move);
        return;
      }

      // No hostiles found, move to spawn
      if (creep.room.name !== homeRoomName) {
        actions.moveToRoom(creep, homeRoomName, { avoidHostiles: false });
      } else {
        // Move to spawn if exists
        const spawn = homeRoom.getPrimarySpawn();
        if (!creep.pos.isNearTo(spawn.pos)) {
          actions.move(creep, spawn.pos, { range: 1 });
        }
      }
      break;
    }
    // The creep is in transit to its roomTarget
    case CreepTask.move: {
      const targetRoom = creepInfo.getTargetRoom();
      if (targetRoom != undefined && creep.room.name != targetRoom) {
        actions.moveToRoom(creep, targetRoom, { avoidHostiles: false });
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
      const target = _.min(targets, "hits") as
        | Creep
        | Structure
        | typeof Infinity;
      // If there are no hostiles left, done attacking, go idle
      if (target == undefined || typeof target === "number") {
        switchTaskAndDoRoll(creep, CreepTask.idle);
        return;
      }

      // Hostiles present:
      // Move to AND do all attacks possible
      const moveResponse = actions.move(creep, target.pos, {
        avoidHostiles: false,
      });
      info(
        `Creep ${creep.name} approaching target ${
          target.id
        } with response ${errorConstant(moveResponse)}`,
      );
      const attackResponse = creep.attack(target);
      info(
        `Creep ${creep.name} melee attacking ${
          target.id
        } with response ${errorConstant(attackResponse)}
          `,
      );
      const range = creep.pos.getRangeTo(target);
      if (range > 1 && range <= 3) {
        const rangedResponse = creep.rangedAttack(target);
        info(
          `Creep ${creep.name} ranged attacking ${
            target.id
          } with response ${errorConstant(rangedResponse)}`,
        );
      } else {
        const massResponse = creep.rangedMassAttack();
        info(
          `Creep ${
            creep.name
          } mass range attacking with response ${errorConstant(massResponse)}`,
        );
      }
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
  const creepInfo = new CreepInfo(creep.name);
  creepInfo.setTask(task);
  info(
    `Creep ${
      creep.name
    } switching to ${task} and performing ${creepInfo.getRole()}`,
    InfoType.task,
  );
  creepBehavior(creep);
}

function renewCreep(creep: Creep): void {
  info(`Creep ${creep.name} renewing`);
  const spawn = new VisibleRoom(creep.room.name).getPrimarySpawn();

  // The ratio of energy available to energy capacity of the spawn
  const energyRatio =
    creep.room.energyAvailable / creep.room.energyCapacityAvailable;

  // Only renew the creep if it has less than 1400 ticks to live and the spawn
  // has more than 50% of the energy it can have. This second part is largely
  // to combat tender renewal preventing all other creeps from spawning.
  if (creep.ticksToLive && creep.ticksToLive < 1400 && energyRatio > 0.5) {
    // If the creep is adjacent to the spawn
    const response = spawn.renewCreep(creep);
    if (response === ERR_NOT_IN_RANGE) {
      creep.moveTo(spawn);
    } else if (response !== OK) {
      info(
        `Creep ${
          creep.name
        } cancelling renew due to spawn renew ${errorConstant(response)}`,
      );
      switchTaskAndDoRoll(creep, CreepTask.fresh);
    }
  } else {
    switchTaskAndDoRoll(creep, CreepTask.fresh);
  }
}

function renewCheck(creep: Creep): void {
  const creepInfo = new CreepInfo(creep.name);
  // If the creep isn't allowed to renew or it is already renewing, do nothing.
  if (creepInfo.noRenew() || creepInfo.getTask() === CreepTask.renew) {
    return;
  }

  // If the creep is spawning (ticksToLive == undefined) or has more than 100
  // ticks to live, don't renew.
  if (creep.ticksToLive == undefined || creep.ticksToLive > 100) {
    return;
  }

  const room = new VisibleRoom(creepInfo.getAssignedRoomName());

  // If the creep's role is above the population limit, let it die.
  const role = creepInfo.getRole();
  const roleLimit = room.getRoleLimit(role);
  const roleCount = _.filter(Memory.creeps, {
    room: room.name,
    role: role,
  }).length;
  if (roleCount > roleLimit) {
    // An option here would be to set the creep to not renew, but the limit may
    // change while the creep still has a chance to renew, like in the case of
    // the builder limit increasing due to a change in the construction queue.
    return;
  }

  const spawn = room.getPrimarySpawn();

  // If the spawn is spawning, don't renew
  if (spawn.spawning != undefined) {
    return;
  }

  // If the spawn doesn't have full capacity, don't renew
  if (spawn.room.energyAvailable !== spawn.room.energyCapacityAvailable) {
    return;
  }

  // If there is a new/better body for the creep, let it die.
  const newBody = generateBodyByRole(spawn, role);
  if (bodyCost(newBody) > bodyCost(creep.body)) {
    // Since there is a better body, don't check is this creep can renew again.
    creepInfo.setNoRenew(true);
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

  const creepInfo = new CreepInfo(creep.name);
  const task = creepInfo.getTask();

  if (Memory.debug.sayTask) creep.say(task);

  const attackNotifications = creepInfo.getAttackNotifications();
  if (attackNotifications != undefined) {
    info(
      `Creep ${creep.name} changing attack notifications to ${attackNotifications}`,
    );
    creep.notifyWhenAttacked(attackNotifications);
    creepInfo.deleteAttackNotifications();
  }

  try {
    // The renew task is the same regardless of role
    renewCheck(creep);
    if (task === CreepTask.renew) {
      renewCreep(creep);
      // Creep is renewing; don't process normal behavior
      return;
    }
  } catch (error) {
    // Renewing didn't work :(
    warn(
      `Due to a failed renew, Creep ${creep.name} no longer eligible for renewal`,
    );
    creepInfo.setNoRenew(true);
    if (creepInfo.getTask() === CreepTask.renew) {
      creepInfo.setTask(CreepTask.fresh);
    }
  }

  switch (creepInfo.getRole()) {
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
  const creepInfo = new CreepInfo(name);
  switch (creepInfo.getRole()) {
    case CreepRole.builder: {
      // Re-add assigned construction to the room queue
      const creepInfo = new RoleCreepInfo[CreepRole.builder](name);
      const construction = creepInfo.getAssignedConstruction();
      if (construction != undefined) {
        creepInfo.removeAssignedConstruction();
        const room = new RoomInfo(construction.pos.roomName);
        room.addToConstructionQueue(construction.pos, true);
      }
      break;
    }
  }

  const assignedRoomName = creepInfo.getAssignedRoomName();
  try {
    const room = new VisibleRoom(assignedRoomName);
    room.updateTombsMemory();
  } catch (error) {
    warn(
      `Unable to update tombs memory for creep ${name} for ${assignedRoomName}`,
    );
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
