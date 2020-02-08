import { depositEnergy, getEnergy, harvestEnergy, storeEnergy, build, idle, repair } from "actions"
import { fromQueue, queueLength, unassignConstruction, fromRepairQueue, repairQueueLength } from "construct";
import { error, info } from "utils/logger";

/**
 * Behavior for a harvester creep (CreepRole.harvester)
 *
 * @param  creep the harvester creep
 */
function harvester (creep: Creep) {
  if (creep.memory.task === CreepTask.fresh) creep.memory.task = CreepTask.harvest

  // Announce current task
  creep.say(creep.memory.task)
  switch (creep.memory.task) {
    // The creep is harvesting
    case CreepTask.harvest: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has more free energy, keep harvesting
        harvestEnergy(creep)
      } else {
        switchTaskAndDoRoll(creep, CreepTask.deposit)
        return
      }
      break
    }
    // The creep is depositing
    case CreepTask.deposit: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has energy, keep depositing
        depositEnergy(creep)
      } else {
        // If the creep has no energy, begin harvesting
        switchTaskAndDoRoll(creep, CreepTask.harvest)
        return
      }
      break
    }
    // The creep is neither harvesting nor depositing, i.e. it has an invalid task
    default: {
      throw new Error("harvester creep.memory.task should be harvest or deposit, not "
      + creep.memory.task)
    }
  }
}

/**
 * Behavior function for a miner creep (CreepRole.miner). This creep should stay near a source and
 * harvest until full. Then deposit into a nearby energy store, i.e. a container.
 *
 * @param  creep the miner creep
 */
function miner (creep: Creep) {
  if (creep.memory.task === CreepTask.fresh) creep.memory.task = CreepTask.harvest

  // Announce current task
  creep.say(creep.memory.task)
  // Tasks for this creep:
  // 1. CreepTask.harvest: harvest from assigned energy source
  // 2. CreepTask.deposit: deposite into nearby energy store
  switch (creep.memory.task) {
    // The creep is harvesting
    case CreepTask.harvest: {
      let source = Game.getObjectById(creep.memory.assignedSource) as Source
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has more free energy, keep harvesting
        harvestEnergy(creep, source)
      } else {
        // If the creep has no free energy, begin depositing
        switchTaskAndDoRoll(creep, CreepTask.deposit)
        return
      }
      break
    }
    // The creep is depositing
    case CreepTask.deposit: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has energy, keep depositing
        storeEnergy(creep, 5)
      } else {
        // If the creep has no energy, begin harvesting
        switchTaskAndDoRoll(creep, CreepTask.harvest)
        return
      }
      break
    }
    // The creep is neither harvesting nor depositing, i.e. it has an invalid task
    default: {
      throw new Error("miner creep.memory.task should be harvest or deposit, not "
      + creep.memory.task)
    }
  }
}

/**
 * Behavior function for builder creeps (CreepRole.builder). These creeps should construct buildings
 * in the build queue.
 *
 * @param  creep the builder creep
 */
function builder (creep: Creep) {
  if (creep.memory.task === CreepTask.fresh) creep.memory.task = CreepTask.getEnergy

  // Announce current task
  creep.say(creep.memory.task)
  // Tasks for this creep:
  // 1. CreepTask.getEnergy: Get energy to construct buildings
  // 2. CreepTask.build: Move to a construction site and build
  // 3. CreepTask.repair: Move to a repairable structure and repair
  // 4. CreepTask.idle: Move to the idle location and chill
  switch (creep.memory.task) {
    case CreepTask.getEnergy: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep can hold more energy, keep getting energy
        getEnergy(creep)
      } else {
        // If the creep has full energy, begin building
        switchTaskAndDoRoll(creep, CreepTask.build)
        return
      }
      break
    }
    case CreepTask.build: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has more energy, continue building
        if (queueLength() > 0) {
          if (creep.memory.assignedConstruction == undefined
            || Game.getObjectById(creep.memory.assignedConstruction) == undefined) {
            creep.memory.assignedConstruction = fromQueue()
            if (creep.memory.assignedConstruction == undefined) {
              error(`queueLength was positive but creep ${creep.name} unable to get assignment`)
              // End the behavior function
              return
            }
          }
          // Perform the build action
          build(creep)
        } else {
          // If there is nothing to build, repair
          info(`No items in the construction queue`, InfoType.general)
          switchTaskAndDoRoll(creep, CreepTask.repair)
          return
        }
      } else {
        switchTaskAndDoRoll(creep, CreepTask.getEnergy)
        return
      }
      break
    }
    case CreepTask.idle: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has free energy, it should get energy
        switchTaskAndDoRoll(creep, CreepTask.getEnergy)
        return
      } else if (queueLength() > 0) {
        // Build
        switchTaskAndDoRoll(creep, CreepTask.build)
        return
      } else if (repairQueueLength() > 0) {
        // Repair
        switchTaskAndDoRoll(creep, CreepTask.repair)
        return
      } else {
        // Remain idle
        info(`Creep ${creep.name} is idle`, InfoType.idleCreep)
        idle(creep)
      }
      break
    }
    case CreepTask.repair: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        if (creep.memory.assignedRepairs == undefined) {
          creep.memory.assignedRepairs = fromRepairQueue()
          if (creep.memory.assignedRepairs == undefined) {
            // If there is nothing to repair, idle
            info(`No items in the repair queue`, InfoType.general)
            switchTaskAndDoRoll(creep, CreepTask.idle)
            return
          }
        }
        // Only repair structures that need repairs
        let repairStructure = Game.getObjectById(creep.memory.assignedRepairs) as Structure
        while (repairStructure.hits === repairStructure.hitsMax) {
          repairStructure = Game.getObjectById(fromRepairQueue()) as Structure
          if (repairStructure == undefined) {
            switchTaskAndDoRoll(creep, CreepTask.idle)
            return
          }
        }
        creep.memory.assignedRepairs = repairStructure.id

        repair(creep, Game.getObjectById(creep.memory.assignedRepairs) as Structure)
      } else {
        switchTaskAndDoRoll(creep, CreepTask.getEnergy)
        return
      }
      break
    }
    // The creep  has an invalid task
    default: {
      error(`builder creep.memory.task should be ${CreepTask.getEnergy} or ` +
        `${CreepTask.build}, not ${creep.memory.task}`)
    }
  }
}

function upgrader (creep: Creep) {
  if (creep.memory.task === CreepTask.fresh) creep.memory.task = CreepTask.getEnergy

  // Announce current task
  creep.say(creep.memory.task)
  // Tasks for this creep:
  // 1. Get energy
  // 2. Deposit energy first in the spawn then upgrade the controller
  switch (creep.memory.task) {
    // The creep is getting energy
    case CreepTask.getEnergy: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep can hold more energy, keep getting energy
        getEnergy(creep)
      } else {
        // If the creep has full energy, begin building
        switchTaskAndDoRoll(creep, CreepTask.deposit)
        return
      }
      break
    }
    // The creep is depositing
    case CreepTask.deposit: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has energy, keep depositing
        depositEnergy(creep)
      } else {
        // If the creep has no energy, begin getting energy
        switchTaskAndDoRoll(creep, CreepTask.getEnergy)
        return
      }
      break
    }
    // The creep is neither harvesting nor depositing, i.e. it has an invalid task
    default: {
      error(`Creep ${creep} should have tasks ${CreepTask.getEnergy} or ${CreepTask.deposit}, ` +
        `not ${creep.memory.task}`)
    }
  }
}

/**
 * Switches the creeps task and then calls doRoll on the creep
 *
 * @param  creep the creep
 * @param  task the new role for the creep
 */
function switchTaskAndDoRoll (creep: Creep, task: CreepTask) {
  creep.memory.task = task
  info(`Creep ${creep.name} switching to ${task} and performing ${creep.memory.role}`,
    InfoType.task)
  doRole(creep)
}

/**
 * Count the number of creeps of a certain role
 *
 * @param  role the role to count
 *
 * @return the number of creeps
 */
export function countRole (role: CreepRole): number {
  let count = 0
  for (let name in Game.creeps) {
    if (Game.creeps[name].memory.role === role) count++
  }
  return count
}

/**
 * Generates a name for the creep based on its memory
 *
 * @param  memory the memory of the creep-to-be
 *
 * @return a name
 */
export function nameCreep (memory: CreepMemory) {
  // Start the name with the creeps role
  let name = memory.role + "_"
  // Since there will be multiple creeps per role, a number will be need since names must be unique
  let number = 0
  // While there is a creep with the same name, increment number
  while (Game.creeps[name + number] !== undefined) {
    number++
  }
  return name + number
}

/**
 * Passes creep to appropriate behavior function based on the creep's role (`creep.memory.role`)
 *
 * @param  creep the creep
 */
export function doRole (creep: Creep) {
  switch (creep.memory.role) {
    case CreepRole.harvester:
      harvester(creep)
      break
    case CreepRole.builder:
      builder(creep)
      break
    case CreepRole.miner:
      miner(creep)
      break
    case CreepRole.upgrader:
      upgrader(creep)
      break
    default:
      throw new Error("doRole invalid role " + creep.memory.role)
  }
}

/**
 * Performs actions upon the death of a creep based on the creeps roll
 *
 * @param  name the name of the dead creep
 */
export function handleDead (name: string) {
  info(`Handling death of creep ${name}`, InfoType.general)
  let memory = Memory.creeps[name]
  switch (memory.role) {
    case CreepRole.builder:
      if (memory.assignedConstruction) {
        unassignConstruction(name)
      }
  }
}
