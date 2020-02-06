interface Memory {
  /** Whether the colony needs to be initialized */
  uninitialzied: boolean
  /** The name of the spawn to use when Initializing.
   *
   * E.g., Game.spawns[Memory.initialSpawn]
   */
  initialSpawn: string
}

interface CreepMemory {
  role: CreepRole,
  task: CreepTask,
  /**
   * A source assigned to this creep by id
   */
  assignedSource: string | undefined,
}

declare const enum CreepTask {
  harvest = "harvest",
  deposit = "deposit"
}

declare const enum CreepRole {
  // Simple creep that performs the harvest and deposit actions
  harvester = "harvester",
  // Creep that mines into a container near to the source
  miner = "miner"
}
