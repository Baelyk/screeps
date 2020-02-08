import { nameCreep, countRole } from "creeps";
import { errorConstant, stringifyBody, info } from "utils/logger";

const MAX_BUILDERS = 2

export function spawnManager(spawn: StructureSpawn) {
  // Currently no spawn queue, so we can only queue one creep per tick
  let allowSpawn = true
  // Spawn builder creeps
  if (Memory.constructionQueue.length > 0) {
    // If there are items in the build queue,
    let builderCount = countRole(CreepRole.builder)
    if (builderCount < MAX_BUILDERS) {
      if (allowSpawn) {
        info(`${spawn.name}     requesting ${CreepRole.builder}`)
        spawnCreep(spawn, CreepRole.builder)
      } else {
        info(`${spawn.name} NOT requesting ${CreepRole.builder}`)
      }
      allowSpawn = false
    }
  }

  // Spawn miner creeps
  let sources = spawn.room.find(FIND_SOURCES)
  let minerCount = countRole(CreepRole.miner)
  if (!Memory.debug.disableMiners && minerCount < sources.length) {
    if (allowSpawn) {
      info(`${spawn.name}     requesting ${CreepRole.miner}`)
      spawnCreep(spawn, CreepRole.miner, {
        assignedSource: sources[minerCount].id
      })
    }  else {
      info(`${spawn.name} NOT requesting ${CreepRole.miner}`)
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
  console.log(`${spawn.name} spawning creep ${name} (${stringifyBody(body)}): ` +
  `${errorConstant(response)}`)
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
