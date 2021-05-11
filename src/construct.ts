import { warn } from "utils/logger";
import { ScriptError } from "utils/errors";
import { RoomInfo } from "roomMemory";

// Manages construction

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
    const controller = room.controller;
    let level = 0;
    if (controller != undefined) {
      level = controller.level;
    }
    warn(
      `build attempted to build ${structureType} with insufficient RCL: ` +
        `${level}`,
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
  const room = new RoomInfo(position.roomName);
  room.addToConstructionQueue(position);
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
  // RoomPosition or null/undefined array
  const positions = coords.map((coord) => {
    return Game.rooms[position.roomName].getPositionAt(coord.x, coord.y);
  });
  // RoomPosition[] after removing undefinedish elements
  return positions.filter(
    (position) => position != undefined,
  ) as RoomPosition[];
}

export function unassignConstruction(name: string): void {
  const memory = Memory.creeps[name];
  const assignedConstruction = memory.assignedConstruction as Id<
    ConstructionSite
  >;
  if (assignedConstruction == undefined) {
    return;
  }
  const site = Game.getObjectById(assignedConstruction);
  if (site != undefined) {
    const room = new RoomInfo(site.pos.roomName);
    room.addToConstructionQueue(site.pos, true);
  }
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
