import { error, errorConstant, info, warn } from "utils/logger";
import { generateBodyByRole } from "spawns";
import { ScriptError, GetByIdError, wrapper } from "utils/errors";
import { awayFromExitDirection, bodyCost, onExit } from "utils/helpers";
import { countRole } from "./utils";
import { RoomInfo, VisibleRoom } from "roomMemory";
import { CreepInfo } from "./memory";
import { CreepAction as actions } from "./actions";
import { Position } from "classes/position";
import { profile } from "utils/profiler";
import { LogisticsInfo, LogisticsRequest } from "logistics";
import { ICreepTask, CreepTask, Tasks, AssertControlType } from "./tasks";
import { CreepJob as CreepJobName, Jobs, Job } from "creeps/jobs";

@profile
class CreepBehavior {
  static renewCheck(creep: Creep): void {
    const creepInfo = new CreepInfo(creep.name);
    // If the creep isn't allowed to renew or it is already renewing, do nothing.
    if (creepInfo.noRenew || creepInfo.task === CreepTask.Renew) {
      return;
    }

    // If the creep is spawning (ticksToLive == undefined) or has more than 100
    // ticks to live, don't renew.
    if (creep.ticksToLive == undefined || creep.ticksToLive > 100) {
      return;
    }

    const room = new VisibleRoom(creepInfo.assignedRoomName);

    // If the creep's role is above the population limit, let it die.
    const role = creepInfo.role;
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
      creepInfo.noRenew = true;
      return;
    }

    // All checks passed, renew.
    CreepBehavior.switchTaskAndDoRoll(creep, CreepTask.Renew);
  }

  /**
   * Passes creep to appropriate behavior static based on the creep's role
   * (`creep.memory.role`)
   *
   * @param creep The creep
   */
  static creepBehavior(creep: Creep): void {
    if (creep.spawning) return;

    const creepInfo = new CreepInfo(creep.name);
    const task = creepInfo.task;

    if (Memory.debug.sayTask) creep.say(task);

    const attackNotifications = creepInfo.attackNotifications;
    if (attackNotifications != undefined) {
      info(
        `Creep ${creep.name} changing attack notifications to ${attackNotifications}`,
      );
      creep.notifyWhenAttacked(attackNotifications);
      creepInfo.attackNotifications == undefined;
    }

    try {
      // The renew task is the same regardless of role
      CreepBehavior.renewCheck(creep);
      if (task === CreepTask.Renew) {
        creepInfo.job = new Jobs[CreepJobName.Renew](
          creepInfo.assignedRoomName,
        );
        // Creep is renewing; don't process normal behavior
        return;
      }
    } catch (error) {
      // Renewing didn't work :(
      warn(
        `Due to a failed renew, Creep ${creep.name} no longer eligible for renewal`,
      );
      creepInfo.noRenew = true;
      if (creepInfo.task === CreepTask.Renew) {
        creepInfo.task = CreepTask.None;
      }
    }

    switch (creepInfo.role) {
      case CreepRole.Scout:
        CreepBehavior.scout(creep);
        break;
      case CreepRole.Guard:
        CreepBehavior.guard(creep);
        break;
      case CreepRole.Hauler:
        CreepBehavior.hauler(creep);
        break;
      case CreepRole.None:
        // do stuff
        break;
      default:
        throw new ScriptError(
          `Unexpected role ${creepInfo.role} on ${creep.name}`,
        );
    }
  }
}

/**
 * Performs actions upon the death of a creep based on the creeps roll
 *
 * @param name The name of the dead creep
 */
export function handleDead(name: string): void {
  info(`Handling death of creep ${name}`);
  const creepInfo = new CreepInfo(name);

  const assignedRoomName = creepInfo.assignedRoomName;
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
      () => CreepBehavior.creepBehavior(creep),
      `Error processing creep ${name} behavior`,
    );
  }
}
