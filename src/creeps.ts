import { depositEnergy, getEnergy, harvestEnergy } from "actions"

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

export function doRole (creep: Creep) {
  const role = creep.memory.role
  if (role === "harvester") harvester(creep)
}
