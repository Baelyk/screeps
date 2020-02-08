import { nameCreep, countRole } from "creeps";
import { errorConstant, stringifyBody, info } from "utils/logger";

export function spawnManager(spawn: StructureSpawn) {
  // Currently no spawn queue, so we can only queue one creep per tick
  let allowSpawn = true

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

  // Spawn builder creeps
  if (Memory.constructionQueue.length > 0) {
    // If there are items in the build queue,
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
  }

  // Spawn miner creeps
  let sources = spawn.room.find(FIND_SOURCES)
  let minerCount = countRole(CreepRole.miner)
  let maxMiners = Memory.populationLimit.miner || 0
  if (!Memory.debug.disableMiners && minerCount < sources.length && minerCount < maxMiners) {
    if (allowSpawn) {
      info(`${spawn.name}     requesting ${CreepRole.miner}`, InfoType.spawn)
      let memory = generateMemoryByRole(CreepRole.miner)
      // Get the id of the miner, which is the number attached the end of it's name
      let id = memory.name.replace("miner_", "")
      spawnCreep(spawn, CreepRole.miner, {
        assignedSource: sources[id].id
      })
    }  else {
      info(`${spawn.name} NOT requesting ${CreepRole.miner}`, InfoType.spawn)
    }
    allowSpawn = false
  }
}

function spawnCreep (spawn: StructureSpawn, role: CreepRole, overrides?: Partial<CreepMemory>) {
  let memory = generateMemoryByRole(role)
  if (overrides != undefined) {
    for (let key in overrides) {
      memory[key] = overrides[key]
    }
  }
  let name = nameCreep(memory)
  let body = generateBodyByRole(role)
  let response = spawn.spawnCreep(body, name, {
    memory
  })
  info(`${spawn.name} spawning creep ${name} (${stringifyBody(body)}): ` +
  `${errorConstant(response)}`, InfoType.spawn)
}

function generateBodyByRole (role: CreepRole): BodyPartConstant[] {
  switch (role) {
    case CreepRole.builder: return [WORK, CARRY, MOVE]
    // 10 WORK, 1 CARRY, 1 MOVE
    case CreepRole.miner: return [WORK, WORK, CARRY, MOVE]
    default: throw new Error(`getBodyPartsFromRole invalid role ${role}`)
  }
}

function generateMemoryByRole (role: CreepRole): CreepMemory {
  return {
    role,
    task: CreepTask.fresh
  }
}
