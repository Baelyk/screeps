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
  repairQueueLength,
} from "construct";
import { error, errorConstant, info, warn } from "utils/logger";
import { generateBodyByRole, getSpawnCapacity, getSpawnEnergy } from "spawns";
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
      throw new Error(
        "harvester creep.memory.task should be harvest or deposit, not " +
          creep.memory.task
      );
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
      creep.memory.spot.y
    );
  }
  if (spot && (creep.pos.x !== spot.x || creep.pos.y !== spot.y)) {
    const response = errorConstant(creep.moveTo(spot));
    info(
      `Creep ${creep.name} moving to spot ${JSON.stringify(spot)}: ${response}`
    );
    return;
  }
  const source: Source | null = Game.getObjectById(
    creep.memory.assignedSource || ""
  );
  harvestEnergy(creep, source || undefined);

  /* // Old miner
  switch (creep.memory.task) {
    // The creep is harvesting
    case CreepTask.harvest: {
      // Move to this miners spot (if it exists)
      if (creep.memory.spot && creep.pos !== creep.memory.spot) {
        creep.moveTo(creep.memory.spot);
        return;
      }
      // Proceed as normal once at spot (or spot doesn't exist)
      const source = Game.getObjectById(creep.memory.assignedSource) as Source;
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has more free energy, keep harvesting
        harvestEnergy(creep, source);
      } else {
        // If the creep has no free energy, begin depositing
        switchTaskAndDoRoll(creep, CreepTask.deposit);
        return;
      }
      break;
    }
    // The creep is depositing
    case CreepTask.deposit: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has energy, keep depositing
        storeEnergy(creep);
      } else {
        // If the creep has no energy, begin harvesting
        switchTaskAndDoRoll(creep, CreepTask.harvest);
        return;
      }
      break;
    }
    // The creep is neither harvesting nor depositing, i.e. it has an invalid task
    default: {
      throw new Error(
        "miner creep.memory.task should be harvest or deposit, not " +
          creep.memory.task
      );
    }
  }
  */
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
        if (creep.memory.assignedConstruction || queueLength() > 0) {
          if (
            creep.memory.assignedConstruction == undefined ||
            Game.getObjectById(creep.memory.assignedConstruction) == undefined
          ) {
            creep.memory.assignedConstruction = fromQueue();
            if (creep.memory.assignedConstruction == undefined) {
              error(
                `queueLength was positive but creep ${creep.name} unable to get assignment`
              );
              // End the behavior function
              return;
            }
          }
          // Perform the build action
          build(creep);
        } else {
          // If there is nothing to build, repair
          info(`No items in the construction queue`, InfoType.general);
          switchTaskAndDoRoll(creep, CreepTask.repair);
          return;
        }
      } else {
        switchTaskAndDoRoll(creep, CreepTask.getEnergy);
        return;
      }
      break;
    }
    case CreepTask.idle: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
        // If the creep has no energy, it should get energy
        switchTaskAndDoRoll(creep, CreepTask.getEnergy);
        return;
      } else if (creep.memory.assignedConstruction || queueLength() > 0) {
        // Build
        switchTaskAndDoRoll(creep, CreepTask.build);
        return;
      } else if (creep.memory.assignedRepairs || repairQueueLength() > 0) {
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
          creep.memory.assignedRepairs = fromRepairQueue();
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
          repairStructure = Game.getObjectById(fromRepairQueue() || "");
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
          Game.getObjectById(creep.memory.assignedRepairs) as Structure
        );
      } else {
        switchTaskAndDoRoll(creep, CreepTask.getEnergy);
        return;
      }
      break;
    }
    // The creep  has an invalid task
    default: {
      error(
        `builder creep.memory.task should be ${CreepTask.getEnergy} or ` +
          `${CreepTask.build}, not ${creep.memory.task}`
      );
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
            error(
              `Unable to get controller link of id ${controllerLinkId} in room ${creep.room.name}`
            );
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
        if (countRole(CreepRole.hauler) > 0) {
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
    // The creep is neither harvesting nor depositing, i.e. it has an invalid task
    default: {
      error(
        `Creep ${creep} should have tasks ${CreepTask.getEnergy} or ${CreepTask.deposit}, ` +
          `not ${creep.memory.task}`
      );
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
          error(`Hauler creep ${creep.name} has no assigned spot`);
          return;
        }
        const spot = creep.room.getPositionAt(
          creep.memory.spot.x,
          creep.memory.spot.y
        );
        if (spot === null) {
          error(
            `Hauler creep ${
              creep.name
            } unable to get assigned spot ${JSON.stringify(creep.memory.spot)}`
          );
          return;
        }
        const structure = spot
          .lookFor(LOOK_STRUCTURES)
          .find((found) => found.structureType === STRUCTURE_CONTAINER) as
          | StructureContainer
          | undefined;
        if (structure === undefined) {
          error(`Hauler creep ${creep.name} unable to get container`);
          return;
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
            creep.room.memory.storage || ""
          ) as StructureStorage) || null;
        if (storage == undefined) {
          warn(
            `Creep ${creep.name} noticed there is no primary storage for room ${creep.room.name}`
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
    InfoType.task
  );
  doRole(creep);
}

/**
 * Count the number of creeps of a certain role
 *
 * @param role The role to count
 * @returns The number of creeps
 */
export function countRole(role: CreepRole): number {
  let count = 0;
  for (const name in Game.creeps) {
    if (Game.creeps[name].memory.role === role) count++;
  }
  return count;
}

/**
 * Generates a name for the creep based on its memory
 *
 * @param memory The memory of the creep-to-be
 * @returns A name
 */
export function nameCreep(memory: CreepMemory): string {
  // Start the name with the creeps role
  const name = memory.role + "_";
  // Since there will be multiple creeps per role, a number will be need since names must be unique
  let number = 0;
  // While there is a creep with the same name, increment number
  while (Game.creeps[name + number] !== undefined) {
    number++;
  }
  return name + number;
}

function renewCreep(creep: Creep): void {
  info(`Creep ${creep.name} renewing`);
  const spawn = Game.getObjectById(creep.room.memory.spawn) as
    | StructureSpawn
    | undefined;
  if (spawn == undefined) {
    error(
      `Couldn't find spawn in room ${creep.room.name} to renew creep ${creep.name}`
    );
    return;
  }

  if (creep.ticksToLive && creep.ticksToLive < 1400) {
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
  const roleLimit = Memory.populationLimit[creep.memory.role];
  if (roleLimit == undefined || roleLimit < countRole(creep.memory.role)) {
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
    error(
      `Couldn't get spawn in room ${creep.room.name} to set renew task for creep ${creep.name}`
    );
    return;
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
export function doRole(creep: Creep): void {
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
      throw new Error("doRole invalid role " + creep.memory.role);
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

export function hasBodyPart(creep: Creep, partType: BodyPartConstant): boolean {
  const body = creep.body;
  for (let i = 0; i < body.length; i++) {
    if (partType === body[i].type) return true;
  }
  return false;
}

export function countBodyPart(
  body: BodyPartDefinition[] | BodyPartConstant[],
  partType: BodyPartConstant
): number {
  let count = 0;
  if (body.length === 0) {
    return 0;
  }
  if (typeof body[0] === "object" && body[0] !== null) {
    const partList = body as BodyPartDefinition[];

    partList.forEach((part) => {
      if (part.type === partType) count++;
    });
  } else {
    const partList = body as BodyPartConstant[];
    partList.forEach((part) => {
      if (part === partType) count++;
    });
  }
  return count;
}

export function bodyCost(
  body: BodyPartDefinition[] | BodyPartConstant[]
): number {
  let cost = 0;
  BODYPARTS_ALL.forEach((partType) => {
    const count = countBodyPart(body, partType);
    cost += count * BODYPART_COST[partType];
  });
  return cost;
}
