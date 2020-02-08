import { errorConstant, warn } from "utils/logger";
import { fromRepairQueue } from "construct";

/**
 * Harvest energy from a specified Source or find the first Source in the room.
 *
 * @param  creep The creep to harvest the energy
 * @param  source The Source, or undefined
 */
export function harvestEnergy (creep: Creep, source?: Source) {
  // TODO: This currently permanently assigns a source to creeps that shouldn't have a permanent
  // source. Additionally, this is a LOT of CPU for harvesting. Even worse, this doesn't even solve
  // the problem I wrote it to solve, which was picking a source not blocked by another creep.
  let path;
  if (source == undefined) {
    if (creep.memory.assignedSource == undefined) {
      let sources = [...creep.room.find(FIND_SOURCES)].map(source => {
        return { source, path: creep.pos.findPathTo(source)}
      }).sort((a, b) => {
        if (a.path.length < b.path.length) return -1
        if (a.path.length > b.path.length) return 1
        return 0
      })
      source = sources[0].source as Source
      path = sources[0].path

      // If this amount of work is going to be done, we are going to assign this source to the creep
      creep.memory.assignedSource = source.id
    } else {
      source = Game.getObjectById(creep.memory.assignedSource) as Source
    }
  }

  // Try to harvest energy. If we can't because we're not in range, move towards the source
  let response = creep.harvest(source)
  if (response === ERR_NOT_IN_RANGE) {
    if (path) {
      creep.moveByPath(path)
    } else {
      creep.moveTo(source);
    }
  } else if (response !== OK) {
    warn(`Creep ${creep.name} harvesting ${source.pos} with response ${errorConstant(response)}`)
  }
}

/**
 * Get energy from a structure that can give out energy or harvestEnergy
 *
 * @param  creep The creep to get the energy
 */
export function getEnergy (creep: Creep) {
  let structures = [...creep.room.find(FIND_STRUCTURES)]
  .filter(structure => {
    // Filter for containers and storages
    return structure.structureType === STRUCTURE_CONTAINER
    || structure.structureType === STRUCTURE_STORAGE
  })
  .map(structure => {
    return { structure, path: creep.pos.findPathTo(structure)}
  }).sort((a, b) => {
    if (a.path.length < b.path.length) return -1
    if (a.path.length > b.path.length) return 1
    return 0
  })
  let structure = structures[0].structure as StructureContainer | StructureStorage
  let path = structures[0].path


  // Try to harvest energy. If we can't because we're not in range, move towards the source
  let response = creep.withdraw(structure, RESOURCE_ENERGY)
  if (response === ERR_NOT_IN_RANGE) {
    creep.moveByPath(path)
  } else if (response !== OK) {
    warn(`Creep ${creep.name} getting energy ${structure.pos} with response ${errorConstant(response)}`)
  }
}

/**
 * Deposit energy in the room's first spawn
 *
 * @param  creep The creep to deposit the energy
 */
export function depositEnergy (creep: Creep) {
  // Get the first Spawn in the room
  let spawn = creep.room.find(FIND_MY_STRUCTURES).filter(structure => {
    return structure.structureType === STRUCTURE_SPAWN
  })[0] as StructureSpawn

  // If the spawn has free energy capacity
  if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) !== 0) {
    // Try to transfer energy to the spawn.
    let response = creep.transfer(spawn, RESOURCE_ENERGY)
    if (response === ERR_NOT_IN_RANGE) {
      // If the spawn is not in range, move towards the spawn
      creep.moveTo(spawn)
    } else if (response !== OK) {
      warn(`Creep ${creep.name} depositing ${spawn.pos} with response ${errorConstant(response)}`)
    }
  } else {
    // If the spawn has no free energy capacity, upgrade the controller
    upgradeController(creep)
  }
}

/**
 * Store energy in container or storage within range.
 *
 * @param  creep the creep storing energy
 * @param  range the range
 */
export function storeEnergy (creep: Creep, range: number) {
  let stores = creep.room.lookForAtArea(LOOK_STRUCTURES, creep.pos.y - range, creep.pos.x - range,
    creep.pos.y + range, creep.pos.x + range, true).filter(structure => {
      // Filter for containers and storages
      return structure.structure.structureType === STRUCTURE_CONTAINER
      || structure.structure.structureType === STRUCTURE_STORAGE
    }).map(structure => {
      // Extract just the structure from the look result
      return structure.structure as StructureContainer | StructureStorage
    })

  stores.forEach(store => {
    if (store.store.getFreeCapacity() > 0) {
      // If there is free capacity, store energy here
      let response = creep.transfer(store, RESOURCE_ENERGY)
      if (response === ERR_NOT_IN_RANGE) {
        creep.moveTo(store)
        return
      } else if (response === OK) {
        return
      } else {
        warn(`Creep ${creep.name} found no valid stores within ${range}, depositing instead`)
      }
    }
    // If there is no free capacity, skip to the next store
  })

  // If no valid store was found, perform the deposit action
  depositEnergy(creep)
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
  } else if (response !== OK) {
    warn(`Creep ${creep.name} attempting to upgrade controller with response ${response}`)
  }
}

/**
 * Builds or moves to the creep's assigned construction site
 *
 * @param  creep the creep
 */
export function build (creep: Creep, building?: ConstructionSite) {
  if (building == undefined) {
    if (creep.memory.assignedConstruction == undefined) {
      throw new Error ("build creep has no assigned construction site")
    } else {
      building = Game.getObjectById(creep.memory.assignedConstruction) as ConstructionSite
    }
  }

  let response = creep.build(building)
  if (response === ERR_NOT_IN_RANGE) {
    creep.moveTo(building)
  } else if (response !== OK) {
    warn(`Creep ${creep.name} building ${building.pos} with response ${errorConstant(response)}`)
  }
}

/**
 * Repairs or moves to the creep's assigned repair site
 *
 * @param  creep the creep
 * @param  repair the structure to repair
 */
export function repair (creep: Creep, repair?: Structure) {
  if (repair == undefined) {
    if (creep.memory.assignedRepairs == undefined) {
      let idToRepair = fromRepairQueue()
      repair = Game.getObjectById(idToRepair) as Structure
      creep.memory.assignedRepairs = idToRepair
    } else {
      repair = Game.getObjectById(creep.memory.assignedRepairs) as Structure
    }
  }

  let response = creep.repair(repair)
  if (response === ERR_NOT_IN_RANGE) {
    creep.moveTo(repair)
  } else if (response !== OK) {
    warn(`Creep ${creep.name} repairing ${repair.pos} with response ${errorConstant(response)}`)
  }
}

export function idle (creep: Creep, position?: RoomPosition) {
  // TODO: Temporary hardcoded idle position
  if (position == undefined) position = creep.room.getPositionAt(11, 21) as RoomPosition
  creep.moveTo(position)
}
