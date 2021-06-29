import { ScriptError } from "utils/errors";
import { info } from "utils/logger";

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

/**
 * Count the number of creeps of a certain role
 *
 * @param role The role to count
 * @returns The number of creeps
 */
export function countRole(
  room: Room,
  role: CreepRole,
  filter?: (creep: Creep) => boolean,
): number {
  if (filter == undefined) {
    filter = () => {
      return true;
    };
  }
  let count = 0;
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.role === role && creep.room === room && filter(creep))
      count++;
  }
  return count;
}

/**
 * Generates a name for the creep based on its memory
 *
 * @param memory The memory of the creep-to-be
 * @returns A name
 */
export function nameCreep(memory: CreepMemory): string {
  // Start the name with the creeps role
  const name = memory.role + "_";
  // Since there will be multiple creeps per role, a number will be need since names must be unique
  let number = 0;
  // While there is a creep with the same name, increment number
  while (Game.creeps[name + number] !== undefined) {
    number++;
  }
  return name + number;
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
