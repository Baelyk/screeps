interface Memory {
  /** Whether the colony needs to be initialized */
  uninitialized: boolean;
  /**
   * The name of the spawn to use when Initializing.
   *
   * E.g., Game.spawns[Memory.initialSpawn]
   */
  initialSpawn: string;
  watch: ScreepsMultimeterWatch;
  debug: DebugMemory;
}

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
  expandAllowed?: boolean;
  distTran?: string;
  plan?: any;
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

interface CreepMemory {
  role: CreepRole;
  task: CreepTask;
  // Undefined if the creep is spawning
  room: string;
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
  /** The room this claimer creep is targetting */
  claimTarget?: string | undefined;
  /** A path for this creep to use, serialized with `Room.serializePath` */
  path?: string;
  /** The room the path originated in, to know when to recreate path */
  pathStartRoom?: string;
  /** The room this creep is targetting */
  roomTarget?: string;
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
  claim = "claim",
  /** Move to target */
  move = "move",
  /** Attack hostiles */
  attack = "attack",
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
  /** Creep that works mineral deposits */
  extractor = "extractor",
  /** Creep that starts and maintains reservations */
  reserver = "reserver",
  /** Creep that hauls between remotes */
  remoteHauler = "remote_hauler",
  /** Creep that moves to a room to provide vision */
  scout = "scout",
  /** Creep that guards rooms and their remotes */
  guard = "guard",
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
