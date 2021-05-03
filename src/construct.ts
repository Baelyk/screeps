import { info, warn } from "utils/logger";
import { GetPositionError, RoomMemoryError, ScriptError } from "utils/errors";

// Manages construction

// ISSUE: When a creep dies before it can completely construct something, the site is lost from the
// queue

/**
 * Initialize construction
 *
 * @param spawn The initial spawn
 */
export function initConstruction(spawn: StructureSpawn): void {
  const room = spawn.room;
  // Initialize an empty construction queue
  room.memory.constructionQueue = [];
}

/**
 * Create road construction sites along a path
 *
 * @param path An array of `RoomPosition`s
 */
export function buildRoad(path: RoomPosition[]): void {
  if (!Array.isArray(path) || path.length === 0) return;
  path.forEach((position) => {
    buildWithoutChecks(position as RoomPosition, STRUCTURE_ROAD);
  });
}

function buildWithoutChecks(
  position: RoomPosition,
  structureType: BuildableStructureConstant,
) {
  if (
    position.createConstructionSite &&
    position.createConstructionSite(structureType) === OK
  ) {
    addToQueue(position);
  } else {
    warn(JSON.stringify(position));
  }
}

/**
 * Build a construction site at a position
 *
 * @param position The room position at which to create the construction site
 * @param structureType The type of structure to create a construction site for
 * @returns Returns true if the construction site was successfully created
 */
export function build(
  position: RoomPosition,
  structureType: BuildableStructureConstant,
): boolean {
  const room = Game.rooms[position.roomName];
  // Attempt to create the construction site
  const response = position.createConstructionSite(structureType);

  // Handle the response
  if (response === ERR_INVALID_TARGET || response === ERR_INVALID_ARGS) {
    const structures = position.lookFor(LOOK_STRUCTURES).filter((structure) => {
      return structure.structureType === structureType;
    });
    const sites = position.lookFor(LOOK_CONSTRUCTION_SITES).filter((site) => {
      return site.structureType === structureType;
    });
    if (structures.length > 0 || sites.length > 0) {
      warn(
        `build attempted to build ${structureType} over site/structure of same type at ${position}`,
      );
    } else {
      warn(
        `build attempted to build ${structureType} over invalid terrain at ` +
          `(${response}) ${position}`,
      );
    }
  } else if (response === ERR_FULL) {
    warn(`build exceded construction capacity`);
  } else if (response === ERR_RCL_NOT_ENOUGH) {
    warn(
      `build attempted to build ${structureType} with insufficient RCL: ` +
        `${room.memory.level}`,
    );
  } else if (response === OK) {
    // Construction site successfullly created
    addToQueue(position);
    return true;
  }
  return false;
}

/**
 * Add construction sites at a position to the construction queue
 *
 * @param position The position at which there are construction sites to add to
 *   the construction queue
 */
function addToQueue(position: RoomPosition) {
  const room = Game.rooms[position.roomName];
  room.memory.constructionQueue.push(position);
}

/**
 * Gets and removes the first construction site from the queue
 *
 * @returns The id of the construction site if the queue is not empty
 */
export function fromQueue(room: Room): string | undefined {
  const queueItem = room.memory.constructionQueue.shift();
  if (queueItem == undefined) return;
  const position = Game.rooms[queueItem.roomName].getPositionAt(
    queueItem.x,
    queueItem.y,
  );
  if (position == undefined) return;
  const sites = position.lookFor(LOOK_CONSTRUCTION_SITES).map((site) => {
    return site.id;
  });
  info(`Removed ${position} from queue`);
  // Each construction sites should have it's own entry in the queue even if it has the same
  // position as another site. So for example, if there were two sites at point A, there would be
  // two entries in the queue for point A, so removing one instance will be fine.
  //
  // HOWEVER, if the second instance of point A in the queue is accessed before the first site is
  // finished, there will be an issue
  return sites[0];
}

/**
 * Gets the length of the construction queue
 *
 * @returns The length of the construction queue
 */
export function queueLength(room: Room): number {
  return room.memory.constructionQueue.length;
}

/**
 * Get a ring of the surrounding coords of radius
 *
 * @param x The x coord of the center
 * @param y The y coord of the center
 * @param radius=0 The radius of the ring, where radius 0 is just the point
 * @returns An array of coordinate pairs forming the ring
 */
function getSurroundingCoords(
  x: number,
  y: number,
  radius = 1,
): { x: number; y: number }[] {
  if (radius === 0) return [{ x, y }];

  const maxX = x + radius;
  const maxY = y + radius;
  const minX = x - radius;
  const minY = y - radius;
  const coords = [];

  for (let xCoord = minX; xCoord <= maxX; xCoord++) {
    coords.push({
      x: xCoord,
      y: maxY,
    });
    coords.push({
      x: xCoord,
      y: minY,
    });
  }

  // Don't include the coordinates at the corners, because they were included in the first for loop
  for (let yCoord = minY + 1; yCoord < maxY; yCoord++) {
    coords.push({
      x: maxX,
      y: yCoord,
    });
    coords.push({
      x: minX,
      y: yCoord,
    });
  }

  return coords;
}

export function getSurroundingTiles(
  position: RoomPosition,
  radius = 0,
): RoomPosition[] {
  const coords = getSurroundingCoords(position.x, position.y, radius);
  return coords.map((coord) => {
    return Game.rooms[position.roomName].getPositionAt(
      coord.x,
      coord.y,
    ) as RoomPosition;
  });
}

export function unassignConstruction(name: string): void {
  const memory = Memory.creeps[name];
  const site = Game.getObjectById(
    memory.assignedConstruction || "",
  ) as ConstructionSite | null;
  if (site != undefined) {
    const room = site.room;
    if (room == undefined) {
      throw new ScriptError(`Unable to obtain room of ${site.id} to requeue`);
    }
    room.memory.constructionQueue.unshift(site.pos);
    delete memory.assignedConstruction;
  } else {
    warn(
      `Attempted to delete undefined assigned construction for creep ${name}`,
    );
  }
}

function getStructuresNeedingRepair(room: Room): Id<Structure>[] {
  return room
    .find(FIND_STRUCTURES)
    .filter((structure) => {
      switch (structure.structureType) {
        case STRUCTURE_ROAD:
        case STRUCTURE_CONTAINER:
          return true;
        default:
          return false;
      }
    })
    .map((structure) => {
      return structure.id;
    });
}

function sortRepairQueue(room: Room) {
  room.memory.repairQueue = room.memory.repairQueue.sort((a, b) => {
    const structureA = Game.getObjectById(a) as Structure;
    const structureB = Game.getObjectById(b) as Structure;
    if (structureA.hits < structureB.hits) return -1;
    if (structureA.hits < structureB.hits) return -1;
    return 0;
  });
}

export function resetRepairQueue(room: Room): void {
  info(`Resetting repair queue`);
  const structures = getStructuresNeedingRepair(room);
  room.memory.repairQueue = structures;
  sortRepairQueue(room);
}

/**
 * Return a structure id from the repair queue. If there are none in the queue
 * that aren't full hits, returns undefined.
 */
export function fromRepairQueue(room: Room): Id<Structure> | undefined {
  let repair = Game.getObjectById(
    room.memory.repairQueue.shift() || "",
  ) as Structure | null;
  if (repair == undefined) return;
  while (repair.hits === repair.hitsMax) {
    repair = Game.getObjectById(
      room.memory.repairQueue.shift() || "",
    ) as Structure | null;
    if (repair == undefined) return;
  }
  return repair.id;
}

export function surroundingTilesAreEmpty(
  position: RoomPosition,
  exceptions?: StructureConstant[],
): boolean {
  const terrain = Game.map.getRoomTerrain(position.roomName);
  let empty = true;

  // Exceptions should not be undefined and should include roads, unless it is an empty array
  if (exceptions == undefined) {
    exceptions = [STRUCTURE_ROAD];
  }
  if (exceptions.length > 0 && exceptions.indexOf(STRUCTURE_ROAD) === -1) {
    exceptions.push(STRUCTURE_ROAD);
  }

  getSurroundingTiles(position, 1).forEach((positionAround) => {
    // If the terrain at the position isn't plain,
    if (terrain.get(positionAround.x, positionAround.y) !== 0) {
      // This terrain isn't viable
      empty = false;
    }
    positionAround.lookFor(LOOK_STRUCTURES).forEach((structure) => {
      if (
        (exceptions as StructureConstant[]).indexOf(structure.structureType) ===
        -1
      ) {
        empty = false;
      }
    });
  });

  return empty;
}

export function buildStructure(
  position: RoomPosition,
  type: BuildableStructureConstant,
): boolean {
  if (RoomPosition === undefined) {
    throw new ScriptError(`Asked to build ${type} at undefined position`);
  }
  return build(position, type);
}

export function buildStorage(roomName: string): void {
  const room = Game.rooms[roomName];
  const spawn = Game.getObjectById(room.memory.spawn) as StructureSpawn;
  if (spawn === null) {
    throw new RoomMemoryError(
      room,
      "spawn",
      "Room was asked to build spawn so it should know its spawn",
    );
  }
  const position = room.getPositionAt(spawn.pos.x - 2, spawn.pos.y - 1);
  if (position === null) {
    throw new GetPositionError({
      x: spawn.pos.x - 2,
      y: spawn.pos.y - 1,
      roomName,
    });
  }
  info(`Building storage at ${JSON.stringify(position)}`);
  buildStructure(position, STRUCTURE_STORAGE);
}

export function updateWallRepair(room: Room): void {
  const minHits = [0, 5e4, 5e4, 1e5, 2e5, 3e5, 4e5, 5e5, 1e6];
  if (room.memory.wallRepairQueue == undefined) {
    room.memory.wallRepairQueue = [];
  }
  room.memory.wallRepairQueue = room
    .find(FIND_STRUCTURES)
    .filter(
      // Only walls and ramparts with less than 3 million hits
      (structure) =>
        (structure.structureType === STRUCTURE_WALL ||
          structure.structureType === STRUCTURE_RAMPART) &&
        structure.hits < minHits[room.memory.level],
    )
    .sort((a, b) => a.hits - b.hits)
    .map((wall) => wall.id) as Id<StructureRampart | StructureWall>[];
}
