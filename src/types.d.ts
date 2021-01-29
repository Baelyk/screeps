interface Memory {
  /** Whether the colony needs to be initialized */
  uninitialized: boolean;
  /**
   * The name of the spawn to use when Initializing.
   *
   * E.g., Game.spawns[Memory.initialSpawn]
   */
  initialSpawn: string;
  /** The construction queue: an array of ConstructionSite positions */
  constructionQueue: ConstructionQueue;
  /**
   * The repair queue: an array of Structure ids that need repairs, sorted by
   * least hits to most
   */
  repairQueue: RepairQueue;
  watch: ScreepsMultimeterWatch;
  debug: DebugMemory;
  populationLimit: MemoryPopulationLimit;
  status: StatusMemory;
}

interface StatusMemory {
  builtAllSourceContainers?: boolean;
}

type MemoryPopulationLimit = { [key in CreepRole]?: number };

interface DebugMemory {
  disableMiners?: boolean;
  /** Whether creeps should `.say()` their task */
  sayTask?: boolean;
  log: LogSettings;
  resetExtensions?: boolean;
  resetRoomMemory?: boolean;
  resetPopLimits?: boolean;
  testWallPlanner?: boolean;
  resetPlanner?: boolean;
  executePlan?: boolean;
  harvestStats?: boolean;
  energyHarvested?: DebugEnergyHarvested;
}

interface DebugEnergyHarvested {
  startTick: number;
  amount: number;
}

interface LogSettings {
  infoSettings: { [key in InfoType]?: boolean };
}

interface ScreepsMultimeterWatch {
  // eslint-disable-next-line @typescript-eslint/ban-types
  expressions?: object | undefined;
  values?: { [index: string]: any };
}

type ConstructionQueue = RoomPosition[];
type RepairQueue = Id<Structure>[];

interface CreepMemory {
  [key: string]: any;
  role: CreepRole;
  task: CreepTask;
  // Undefined if the creep is spawning
  room: string | undefined;
  /** A source assigned to this creep by id */
  assignedSource?: Id<Source> | undefined;
  /** A construction site assigned to this creep by id */
  assignedConstruction?: string | undefined;
  /** A structuring needing repairs that this creep is repairing */
  assignedRepairs?: Id<Structure> | undefined;
  /** A spot assigned to this creep */
  spot?: RoomPosition | undefined;
  /** Whether to prevent this creep from being renewed */
  noRenew?: boolean | undefined;
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
  repair = "repair",
  renew = "renew",
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
  /** Creep that hauls energy between sources and deposits energy */
  hauler = "hauler",
  /** Creep that moves to other rooms to claim them */
  claimer = "claimer",
  /** Creep that keeps energy in spawns, extensions, and towers */
  tender = "tender",
}

declare const enum InfoType {
  general = "general",
  spawn = "spawn",
  task = "task",
  idleCreep = "idleCreep",
  build = "build",
}

interface Coord {
  x: number;
  y: number;
  room?: string;
}

interface SpawnMemory {
  // Array of extension positions this spawn can use
  extensions: RoomPosition[] | undefined;
  extensionSpots: RoomPosition[] | undefined;
}

interface TowerMemory {
  // The id of the object the tower is targetting
  target: string | undefined;
}

interface RoomMemory {
  level: number;
  spawn: Id<StructureSpawn>;
  towers: Id<StructureTower>[];
  sources: Id<Source>[];
  tombs: Id<Tombstone>[];
  storage: Id<StructureStorage> | undefined;
  wallRepairQueue: Id<StructureRampart | StructureWall>[];
  planner: PlannerMemory | undefined;
  links: RoomLinksMemory;
}

interface PlannerMemory {
  // A serialized cost matrix for the planner
  costMatrix: number[] | undefined;
  plan: PlannerPlan;
}

type PlannerPlan = {
  [key in BuildableStructureConstant]?: PlannerStructurePlan;
};

interface PlannerStructurePlan {
  pos: PlannerCoord[];
}

interface PlannerCoord {
  x: number;
  y: number;
}

interface RoomLinksMemory {
  all: { [id: string]: LinkMemory };
  spawn?: Id<StructureLink>;
  controller?: Id<StructureLink>;
}

interface LinkMemory {
  mode: LinkMode;
  type: LinkType;
}

declare const enum LinkMode {
  none = "none",
  send = "send",
  recieve = "recieve",
}

declare const enum LinkType {
  spawn = "spawn",
  controller = "controller",
  source = "source",
  unknown = "unknown",
}
