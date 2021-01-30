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
} from "actions";
import {
  fromQueue,
  queueLength,
  unassignConstruction,
  fromRepairQueue,
} from "construct";
import { error, errorConstant, info, warn } from "utils/logger";
import { generateBodyByRole, getSpawnCapacity, getSpawnEnergy } from "spawns";
import {
  CreepRoleMemoryError,
  ScriptError,
  GetByIdError,
  GetPositionError,
  InvalidCreepTaskError,
  InvalidCreepRoleError,
  wrapper,
} from "utils/errors";
import { bodyCost, countRole } from "utils/helpers";

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
  if (creep.memory.task === CreepTask.fresh)
    creep.memory.task = CreepTask.harvest;

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
    info(
      `Creep ${creep.name} moving to spot ${JSON.stringify(spot)}: ${response}`,
    );
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
        creep.memory.assignedConstruction = fromQueue(creep.room);
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
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        if (creep.memory.spot === undefined) {
          throw new CreepRoleMemoryError(creep, "spot");
        }
        const spot = creep.room.getPositionAt(
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
        const storage =
          (Game.getObjectById(
            creep.room.memory.storage || "",
          ) as StructureStorage) || null;
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

// function claimer(creep: Creep) {}

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
  if (getSpawnEnergy(spawn) !== getSpawnCapacity(spawn)) {
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

export function creepManager() {
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
