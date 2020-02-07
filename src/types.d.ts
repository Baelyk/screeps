interface Memory {
  /** Whether the colony needs to be initialized */
  uninitialized: boolean,
  /** The name of the spawn to use when Initializing.
   *
   * E.g., Game.spawns[Memory.initialSpawn]
   */
  initialSpawn: string,
  /**
   * The construction queue: an array of ConstructionSite ids
   */
  constructionQueue: ConstructionQueue,
  watch: ScreepsMultimeterWatch
}

interface ScreepsMultimeterWatch {
  expressions?: object | undefined,
  values?: { [index: string]: any }
}

type ConstructionQueue = string[]

interface CreepMemory {
  role: CreepRole,
  task: CreepTask,
  /**
   * A source assigned to this creep by id
   */
  assignedSource?: string | undefined,
  /**
   * A construction site assigned to this creep by id
   */
  assignedConstruction?: string | undefined,
}

// The exact task depends also on the role
declare const enum CreepTask {
  harvest = "harvest",
  deposit = "deposit",
  getEnergy = "get_energy",
  build = "build"
}

declare const enum CreepRole {
  /** Simple creep that performs the harvest and deposit actions */
  harvester = "harvester",
  /** Creep that mines into a container near to the source */
  miner = "miner",
  /** Creep that constructs buildings */
  builder = "builder"
}
