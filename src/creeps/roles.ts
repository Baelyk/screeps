import { error, errorConstant, info, warn } from "utils/logger";
import { CreepAction as actions } from "./actions";
import { profile } from "utils/profiler";

@profile
export class Roles {
  static hauler(creep: Creep) {
    const task = CreepBehavior.getTask(creep, CreepTask.getEnergy);
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
          CreepBehavior.switchTaskAndDoRoll(creep, CreepTask.deposit);
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
          const response = actions.storeEnergy(
            creep,
            backupName,
            roomLevel >= 4,
          );
          if (response === ERR_NOT_FOUND) {
            warn(`Creep ${creep.name} unable to store energy so depositing`);
            actions.depositEnergy(creep);
          }
        } else {
          // If the creep has no energy, begin getting energy
          CreepBehavior.switchTaskAndDoRoll(creep, CreepTask.getEnergy);
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
  static scout(creep: Creep) {
    const task = CreepBehavior.getTask(creep, CreepTask.claim);

    // Tasks for this creep:
    // 1. claim: Move to target room and stay
    // 2. scout: Move to target room and then potentially move on to another room

    const creepInfo = new RoleCreepInfo[CreepRole.scout](creep.name);
    const assignedRoom = creepInfo.getAssignedRoomName();
    const targetRoom = creepInfo.getTargetRoom() || assignedRoom;

    switch (task) {
      case CreepTask.scout: {
        // If the creep just entered a room (i.e. on exit)
        if (onExit(creep.pos)) {
          // Move off the exit first
          creep.move(awayFromExitDirection(creep.pos));
          break;
        } else {
          if (creep.room.name === targetRoom) {
            // Creep is not on an exit, so find where to go from here
            const newTarget = RoomInfo.findNearestUnscoutedRoom(
              assignedRoom,
              10,
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
              CreepBehavior.switchTaskAndDoRoll(creep, CreepTask.claim);
              break;
            } else {
              creepInfo.setAssignedRoomName(newTarget);
              info(
                `Creep ${creep.name} switching scout target to ${newTarget}`,
              );
              actions.moveToRoom(creep, newTarget);
            }
          } else {
            // Move to the room
            try {
              actions.moveToRoom(creep, targetRoom);
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

  static guard(creep: Creep) {
    const task = CreepBehavior.getTask(creep, CreepTask.idle);

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
        const roomsToGuard = [homeRoomName];
        const homeRoom = new RoomInfo(homeRoomName);
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
          CreepBehavior.switchTaskAndDoRoll(creep, CreepTask.move);
          return;
        }

        // No hostiles found, move to spawn
        if (creep.room.name !== homeRoomName) {
          actions.moveToRoom(creep, homeRoomName, { avoidHostiles: false });
        } else {
          // Move to spawn if exists
          const spawn = new VisibleRoom(homeRoomName).getPrimarySpawn();
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
          CreepBehavior.switchTaskAndDoRoll(creep, CreepTask.attack);
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
          CreepBehavior.switchTaskAndDoRoll(creep, CreepTask.idle);
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
            } mass range attacking with response ${errorConstant(
              massResponse,
            )}`,
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
  static switchTaskAndDoRoll(creep: Creep, task: CreepTask) {
    const creepInfo = new CreepInfo(creep.name);
    creepInfo.task = task;
    info(
      `Creep ${creep.name} switching to ${task} and performing ${creepInfo.role}`,
    );
    CreepBehavior.creepBehavior(creep);
  }
}
