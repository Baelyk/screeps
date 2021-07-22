interface Memory {
  watch: ScreepsMultimeterWatch;
  debug: DebugMemory;
}

interface DebugMemory {
  disableMiners?: boolean;
  /** Whether creeps should `.say()` their task */
  sayTask?: boolean;
  resetExtensions?: boolean;
  resetRoomMemory?: boolean;
  resetPopLimits?: boolean;
  testWallPlanner?: boolean;
  resetPlanner?: boolean;
  executePlan?: boolean;
  harvestStats?: boolean;
  expandAllowed?: boolean;
  distTran?: string;
  plan?: any;
  visual?: any;
}

interface ScreepsMultimeterWatch {
  // eslint-disable-next-line @typescript-eslint/ban-types
  expressions?: object | undefined;
  values?: { [index: string]: any };
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
