import { nameCreep } from "creeps";

export function spawnManager(spawn: StructureSpawn) {
  // Spawn builder creeps
  if (Memory.constructionQueue.length > 0) {
    // If there are items in the build queue,
    let builderCount = 0
    for (let name in Game.creeps) {
      if (Game.creeps[name].memory.role === CreepRole.builder) builderCount++
    }
    if (builderCount === 0) {
      spawnCreep(spawn, CreepRole.builder)
    }
  }
}

function spawnCreep (spawn: StructureSpawn, role: CreepRole) {
  let memory = generateMemoryByRole(role)
  let name = nameCreep(memory)
  let response = spawn.createCreep(generateBodyByRole(role), name, memory)
  console.log(`${spawn.name} spawning creep ${name}: ${response}`)
}

function generateBodyByRole (role: CreepRole): BodyPartConstant[] {
  switch (role) {
    case CreepRole.builder: return [WORK, CARRY, MOVE]
    default: throw new Error(`getBodyPartsFromRole invalid role ${role}`)
  }
}

function generateMemoryByRole (role: CreepRole): CreepMemory {
  return {
    role,
    task: CreepTask.fresh
  }
}
