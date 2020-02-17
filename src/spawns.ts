import { nameCreep, countRole } from "creeps";
import { errorConstant, stringifyBody, info, error, warn } from "utils/logger";
import { queueLength, getSurroundingTiles, buildStructure, repairQueueLength } from "construct";

export function spawnManager(spawn: StructureSpawn) {
  // Currently no spawn queue, so we can only queue one creep per tick
  let allowSpawn = true;

  // Spawn harvester creeps
  let maxHarvesters = Memory.populationLimit.harvester || 0
  let harvestersCount = countRole(CreepRole.harvester)
  if (harvestersCount < maxHarvesters) {
    if (allowSpawn) {
      info(`${spawn.name}     requesting ${CreepRole.harvester}`, InfoType.spawn)
      spawnCreep(spawn, CreepRole.harvester)
    } else {
      info(`${spawn.name} NOT requesting ${CreepRole.harvester}`, InfoType.spawn)
    }
    allowSpawn = false
  }

  // Spawn miner creeps
  let sources = spawn.room.find(FIND_SOURCES)
  let minerCount = countRole(CreepRole.miner)
  let maxMiners = Memory.populationLimit.miner || 0
  if (minerCount < maxMiners) {
    if (allowSpawn) {
      info(`${spawn.name}     requesting ${CreepRole.miner}`, InfoType.spawn)
      let memory = generateMemoryByRole(CreepRole.miner)
      // Get the id of the miner, which is the number attached the end of it's name
      let id = Number(nameCreep(memory).replace("miner_", ""))
      spawnCreep(spawn, CreepRole.miner, minerCount < sources.length ? {
        assignedSource: sources[id].id
      } : {})
    }  else {
      info(`${spawn.name} NOT requesting ${CreepRole.miner}`, InfoType.spawn)
    }
    allowSpawn = false
  }

  // Spawn upgrader creeps
  let maxUpgraders = Memory.populationLimit.upgrader || 0
  let upgraderCount = countRole(CreepRole.upgrader)
  if (upgraderCount < maxUpgraders) {
    if (allowSpawn) {
      info(`${spawn.name}     requesting ${CreepRole.upgrader}`, InfoType.spawn)
      spawnCreep(spawn, CreepRole.upgrader)
    } else {
      info(`${spawn.name} NOT requesting ${CreepRole.upgrader}`, InfoType.spawn)
    }
    allowSpawn = false
  }

  // Spawn builder creeps
  let builderCount = countRole(CreepRole.builder)
  let maxBuilders = Memory.populationLimit.builder || 0
  if (builderCount < maxBuilders) {
    if (allowSpawn) {
      info(`${spawn.name}     requesting ${CreepRole.builder}`, InfoType.spawn)
      spawnCreep(spawn, CreepRole.builder)
    } else {
      info(`${spawn.name} NOT requesting ${CreepRole.builder}`, InfoType.spawn)
    }
    allowSpawn = false
  }

  // Spawn hauler creeps
  let haulerCount = countRole(CreepRole.hauler)
  let maxHaulers = Memory.populationLimit.hauler || 0
  if (haulerCount < maxHaulers) {
    if (allowSpawn) {
      info(`${spawn.name}     requesting ${CreepRole.hauler}`, InfoType.spawn)
      spawnCreep(spawn, CreepRole.hauler)
    } else {
      info(`${spawn.name} NOT requesting ${CreepRole.hauler}`, InfoType.spawn)
    }
    allowSpawn = false
  }

  // Build extentions
  let controller = (spawn.room.controller as StructureController).level
  if (spawn.memory.extensions.length < getMaxExtensions(controller)) requestExtentions(spawn)
}

function spawnCreep (spawn: StructureSpawn, role: CreepRole, overrides?: Partial<CreepMemory>) {
  let memory = generateMemoryByRole(role)
  if (overrides != undefined) {
    for (let key in overrides) {
      memory[key] = overrides[key]
    }
  }
  let name = nameCreep(memory)
  let body = generateBodyByRole(spawn, role)
  let response = spawn.spawnCreep(body, name, {
    memory
  })
  info(`${spawn.name} spawning creep ${name} (${stringifyBody(body)}): ` +
  `${errorConstant(response)}`, InfoType.spawn)
}

function generateBodyByRole (spawn: StructureSpawn, role: CreepRole): BodyPartConstant[] {
  switch (role) {
    case CreepRole.miner: {
      let body: BodyPartConstant[] = [CARRY, MOVE]
      // The capacity minus the carry and move part cost divided by the work part cost
      let workParts = Math.floor((getSpawnCapacity(spawn) - 100) / 100)
      for (let i = 0; i < workParts; i++) {
        // If there are more than five work parts, alternate between adding work and carry parts
        if (i > 5 && i % 2 === 1) {
          // One carry costs 50, so two carry costs the same as one work
          body.push(CARRY, CARRY)
          continue
        }
        body.push(WORK)
      }
      return body
    }
    case CreepRole.builder:
    case CreepRole.upgrader: {
      let body: BodyPartConstant[] = []
      let bodyUnits = Math.floor((getSpawnCapacity(spawn)) / 100)
      for (let i = 0; i < bodyUnits; i++) {
        if (i % 2 === 0) {
          body.push(MOVE, CARRY)
        } else {
          body.push(WORK)
        }
      }
      return body
    }
    case CreepRole.hauler: {
      let body: BodyPartConstant[] = [WORK]
      // Energy capacity minus work cost divided by MOVE/CARRY cost
      let bodyUnits = Math.floor((getSpawnCapacity(spawn) - 100) / 50)
      // Alternate between adding move and carry parts
      for (let i = 0; i < bodyUnits; i++) {
        if (i % 2 === 0) {
          body.push(MOVE)
        } else {
          body.push(CARRY)
        }
      }
      return body
    }
    default: error(`getBodyPartsFromRole invalid role ${role}`); return []
  }
}

function generateMemoryByRole (role: CreepRole): CreepMemory {
  return {
    role,
    task: CreepTask.fresh
  }
}

function requestExtentions (spawn: StructureSpawn) {
  if (spawn.memory.extensions == undefined) spawn.memory.extensions = []
  if (queueLength() === 0 && repairQueueLength() == 0) {
    let shouldRequest = true
    let terrain = Game.map.getRoomTerrain(spawn.room.name)
    let surrounding = getSurroundingTiles(spawn.pos, 2).filter(position => {
      let empty = true
      if (terrain.get(position.x, position.y) !== 0) {
        // This terrain isn't viable
        empty = false
      }
      position.lookFor(LOOK_STRUCTURES).forEach(() => {
        empty = false
      })
      position.lookFor(LOOK_CONSTRUCTION_SITES).forEach(site => {
        empty = false
        if (site.structureType === STRUCTURE_EXTENSION) {
          shouldRequest = false
        }
      })
      return empty
    })

    if (shouldRequest) {
      info(`Spawn ${spawn.name} requesting extention at ${surrounding[0]}`, InfoType.build)
      if (buildStructure(surrounding[0], STRUCTURE_EXTENSION)) {
        spawn.memory.extensions.push(surrounding[0])
      } else {
        warn(`Spawn ${spawn.name} failed extention request at ${surrounding[0]}`)
      }
    }
  }
}

function getSpawnExtensions (spawn: StructureSpawn): StructureExtension[] {
  let extensions: StructureExtension[] = []
  if (spawn.memory.extensions == undefined) return []
  spawn.memory.extensions.forEach(position => {
    let pos = spawn.room.getPositionAt(position.x, position.y)
    if (pos == undefined) return
    pos.lookFor(LOOK_STRUCTURES).filter(structure => {
      return structure.structureType === STRUCTURE_EXTENSION
    }).forEach(extension => {
      extensions.push(extension as StructureExtension)
    })
  })
  return extensions
}

function getSpawnCapacity (spawn: StructureSpawn): number {
  let capacity = spawn.store.getCapacity(RESOURCE_ENERGY)
  getSpawnExtensions(spawn).forEach(extension => {
    capacity += extension.store.getCapacity(RESOURCE_ENERGY)
  })
  return capacity
}

function getSpawnEnergy (spawn: StructureSpawn): number {
  let energy = spawn.store.getUsedCapacity(RESOURCE_ENERGY)
  getSpawnExtensions(spawn).forEach(extension => {
    energy += extension.store.getUsedCapacity(RESOURCE_ENERGY)
  })
  return energy
}

export function getMaxExtensions (level: number): number {
  switch (level) {
    case 2: return 5
    case 3: return 10
    case 4: return 20
    case 5: return 30
    case 6: return 40
    case 7: return 50
    case 8: return 60
    default: return 0
  }
}
