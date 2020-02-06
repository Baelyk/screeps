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
  role: string,
  task: CreepTask
}

declare const enum CreepTask {
  harvest = "harvest",
  deposit = "deposit"
}
