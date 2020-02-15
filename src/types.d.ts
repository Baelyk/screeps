interface Memory {
  /** Whether the colony needs to be initialized */
  uninitialized: boolean,
  /** The name of the spawn to use when Initializing.
   *
   * E.g., Game.spawns[Memory.initialSpawn]
   */
  initialSpawn: string,
  /**
   * The construction queue: an array of ConstructionSite positions
   */
  constructionQueue: ConstructionQueue,
  /**
   * The repair queue: an array of Structure ids that need repairs, sorted by least hits to most
   */
  repairQueue: RepairQueue
  watch: ScreepsMultimeterWatch,
  debug: DebugMemory,
  populationLimit: MemoryPopulationLimit,
  status: StatusMemory
}

interface StatusMemory {
  builtAllSourceContainers?: boolean
}

type MemoryPopulationLimit = { [key in CreepRole]?: number }

interface DebugMemory {
  disableMiners?: boolean,
  /** Whether creeps should `.say()` their task */
  sayTask?: boolean
  log: LogSettings
}

interface LogSettings {
  infoSettings: { [key in InfoType]?: boolean }
}

interface ScreepsMultimeterWatch {
  expressions?: object | undefined,
  values?: { [index: string]: any }
}

type ConstructionQueue = RoomPosition[]
type RepairQueue = string[]

interface CreepMemory {
  [key: string]: any
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
  /**
   * A structuring needing repairs that this creep is repairing
   */
  assignedRepairs?: string | undefined
}

// The exact task depends also on the role
declare const enum CreepTask {
  /** Role indicating the creep is freshly spawned (i.e. uninit) */
  fresh = "fresh",
  /** Task indicating the creep is waiting for further instructions/state change */
  idle = "idle",
  harvest = "harvest",
  deposit = "deposit",
  getEnergy = "get_energy",
  build = "build",
  repair = "repair"
}

declare const enum CreepRole {
  /** Simple creep that performs the harvest and deposit actions */
  harvester = "harvester",
  /** Creep that mines into a container near to the source */
  miner = "miner",
  /** Creep that constructs buildings */
  builder = "builder",
  /** Creep that gets energy and deposits energy to spawn then controller */
  upgrader = "upgrader",
}

declare const enum InfoType {
  general = "general",
  spawn = "spawn",
  task = "task",
  idleCreep = "idleCreep",
  build = "build"
}

interface Coord {
  x: number,
  y: number,
  room?: string
}

interface SpawnMemory {
  // Array of extension positions this spawn can use
  extensions: RoomPosition[]
}
