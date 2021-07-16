import { CreepRole } from "./memory";

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
    if (
      creep.memory.role === role &&
      creep.room.name === room.name &&
      filter(creep)
    )
      count++;
  }
  return count;
}
