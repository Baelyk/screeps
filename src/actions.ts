/**
 * Harvest energy from a specified Source or find the first Source in the room.
 *
 * @param  creep The creep to harvest the energy
 * @param  source The Source, or undefined
 */
export function harvestEnergy (creep: Creep, source?: Source) {
  if (source == undefined) {
    // For now, if source is undefined, just use the first source found in the room.
    source = creep.room.find(FIND_SOURCES_ACTIVE)[0]
  }

  // Try to harvest energy. If we can't because we're not in range, move towards the source
  if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
    creep.moveTo(source);
  }
}

/**
 * Get energy from a structure that can give out energy or harvestEnergy
 *
 * @param  creep The creep to get the energy
 */
export function getEnergy (creep: Creep) {
  // For now, just harvest energy
  harvestEnergy(creep)
}

/**
 * Deposit energy in the room's first spawn
 *
 * @param  creep The creep to deposit the energy
 */
export function depositEnergy (creep: Creep) {
  // Get the first Spawn in the room
  let spawn = creep.room.find(FIND_MY_STRUCTURES).filter(structure => {
    return structure.structureType == STRUCTURE_SPAWN
  })[0] as StructureSpawn

  // If the spawn has free energy capacity
  if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) !== 0) {
    // Try to transfer energy to the spawn.
    let response = creep.transfer(spawn, RESOURCE_ENERGY)
    if (response === ERR_NOT_IN_RANGE) {
      // If the spawn is not in range, move towards the spawn
      creep.moveTo(spawn)
    }
  } else {
    // If the spawn has no free energy capacity, upgrade the controller
    upgradeController(creep)
  }
}

/**
 * Upgrades the controller
 *
 * @param creep the creep to upgrade the controller
 */
export function upgradeController (creep: Creep) {
  // Get the controller for the room that the creep is in
  let controller = creep.room.controller
  // Ensure `controller` is a StructureController
  if (controller == undefined) {
    throw new Error("upgradeController: creep.room.controller undefined")
  }

  // Attempt to upgrade the controller, and save the response (OK or error)
  let response = creep.upgradeController(controller)
  if (response === ERR_NOT_IN_RANGE) {
    creep.moveTo(controller)
  }
}
