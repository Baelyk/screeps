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
  visual?: any;
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
