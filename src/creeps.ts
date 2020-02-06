import { depositEnergy, getEnergy, harvestEnergy, storeEnergy } from "actions"

/**
 * Behavior for a harvester creep (CreepRole.harvester)
 *
 * @param  creep the harvester creep
 */
function harvester (creep: Creep) {
  creep.say(creep.memory.task)
  switch (creep.memory.task) {
    // The creep is harvesting
    case CreepTask.harvest: {
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has more free energy, keep harvesting
        harvestEnergy(creep)
      } else {
        // If the creep has no free energy, begin depositing
        creep.memory.task = CreepTask.deposit
        // Call harvester again with the updated information
        console.log("recursing in harvester harvest")
        harvester(creep)
        return;
      }
      break;
    }
    // The creep is depositing
    case CreepTask.deposit: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has energy, keep depositing
        depositEnergy(creep)
      } else {
        // If the creep has no energy, begin harvesting
        creep.memory.task = CreepTask.harvest
        // Call harvester again with the updated information
        console.log("recursing in harvester deposit")
        harvester(creep)
        return;
      }
      break;
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
        creep.memory.task = CreepTask.deposit
        // Call harvester again with the updated information
        console.log("recursing in miner harvest")
        miner(creep)
        return;
      }
      break;
    }
    // The creep is depositing
    case CreepTask.deposit: {
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // If the creep has energy, keep depositing
        storeEnergy(creep, 3)
      } else {
        // If the creep has no energy, begin harvesting
        creep.memory.task = CreepTask.harvest
        // Call harvester again with the updated information
        console.log("recursing in miner deposit")
        miner(creep)
        return;
      }
      break;
    }
    // The creep is neither harvesting nor depositing, i.e. it has an invalid task
    default: {
      throw new Error("miner creep.memory.task should be harvest or deposit, not "
      + creep.memory.task)
    }
  }
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
      break;
    default:
      throw new Error("doRole invalid role " + creep.memory.role)
  }
}
