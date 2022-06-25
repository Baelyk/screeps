import { ScriptError } from "utils/errors";

export function hasBodyPart(creep: Creep, partType: BodyPartConstant): boolean {
  const body = creep.body;
  for (let i = 0; i < body.length; i++) {
    if (partType === body[i].type) return true;
  }
  return false;
}

export function countBodyPart(
  body: BodyPartDefinition[] | BodyPartConstant[],
  partType: BodyPartConstant,
): number {
  let count = 0;
  if (body.length === 0) {
    return 0;
  }
  if (typeof body[0] === "object" && body[0] !== null) {
    const partList = body as BodyPartDefinition[];

    partList.forEach((part) => {
      if (part.type === partType) count++;
    });
  } else {
    const partList = body as BodyPartConstant[];
    partList.forEach((part) => {
      if (part === partType) count++;
    });
  }
  return count;
}

export function bodyCost(
  body: BodyPartDefinition[] | BodyPartConstant[],
): number {
  let cost = 0;
  BODYPARTS_ALL.forEach((partType) => {
    const count = countBodyPart(body, partType);
    cost += count * BODYPART_COST[partType];
  });
  return cost;
}

export function livenRoomPosition(
  position:
    | RoomPosition
    | { x: number; y: number; roomName: string }
    | undefined,
): RoomPosition {
  if (position == undefined) {
    throw new ScriptError(`Cannot liven undefined position`);
  }
  const { x, y, roomName } = position;
  const room = Game.rooms[roomName];
  if (room == undefined) {
    throw new ScriptError(`Invalid room ${roomName}`);
  }
  const livingPosition = room.getPositionAt(x, y);
  if (livingPosition == undefined) {
    throw new ScriptError(`Invalid room position (${x}, ${y}) in ${roomName}`);
  }
  return livingPosition;
}

export function awayFromExitDirection(
  exitPos: RoomPosition,
): DirectionConstant {
  let direction: DirectionConstant = TOP;
  if (exitPos.x === 0) {
    direction = RIGHT;
  } else if (exitPos.x === 49) {
    direction = LEFT;
  } else if (exitPos.y === 0) {
    direction = BOTTOM;
  } else if (exitPos.y === 49) {
    direction = TOP;
  }
  return direction;
}

export function onExit(pos: RoomPosition): boolean {
  return pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49;
}

/**
 * Get a ring of the surrounding coords of radius
 *
 * @param x The x coord of the center
 * @param y The y coord of the center
 * @param radius=0 The radius of the ring, where radius 0 is just the point
 * @returns An array of coordinate pairs forming the ring
 */
export function getSurroundingCoords(
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

/**
 * Get a new array without duplicates from a supplied array.
 *
 * @param array The array to remove duplicates from
 * @returns A new array without duplicates
 */
export function roomPositionArrayRemoveDuplicates(
  array: RoomPosition[],
): RoomPosition[] {
  const newArray: RoomPosition[] = [];
  array.forEach((element) => {
    const duplicate = newArray.find((newElement) =>
      newElement.isEqualTo(element),
    );
    if (duplicate == undefined) newArray.push(element);
  });
  return newArray;
}
/**
 * Converts a path to a RoomPosition[]
 *
 * @param room The room the path is in
 * @returns The spots in the path as a RoomPosition[]
 */
export function pathToRoomPosition(
  room: Room,
  path: PathStep[],
): RoomPosition[] {
  const spots = path.map((step) => room.getPositionAt(step.x, step.y));
  const positions = spots.filter(
    (position) => position != undefined,
  ) as RoomPosition[];
  return positions;
}
