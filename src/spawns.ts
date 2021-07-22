import { nameCreep } from "utils/helpers";
import { errorConstant, stringifyBody, info, warn } from "utils/logger";
import { ScriptError, wrapper } from "utils/errors";
import { VisibleRoom } from "roomMemory";
import { CreepRole, CreepTask } from "./creeps";

/**
 * Process spawn behavior
 *
 * @param spawn The spawn to process
 */
function spawnBehavior(spawn: StructureSpawn): void {
  const room = new VisibleRoom(spawn.room.name);

  let allowSpawn = !spawn.spawning;

  // Spawn from spawn queue
  if (allowSpawn) {
    const creepFromQueue = room.getFromSpawnQueue();
    if (creepFromQueue != undefined) {
      spawnCreep(spawn, creepFromQueue.role, creepFromQueue.overrides);
      allowSpawn = false;
    }
  }
}

function spawnCreep(
  spawn: StructureSpawn,
  role: CreepRole,
  overrides?: Partial<CreepMemory>,
) {
  const memory: CreepMemory = _.assign(
    generateMemoryByRole(role, spawn.room),
    overrides,
  );
  const name = nameCreep(memory);
  const body = generateBodyByRole(spawn, role);
  const response = spawn.spawnCreep(body, name, {
    memory,
  });
  info(
    `${spawn.name} spawning creep ${name} (${stringifyBody(body)}): ` +
      `${errorConstant(response)}`,
  );
  // If spawn unsuccessful, readd to queue
  if (response !== OK) {
    const room = new VisibleRoom(spawn.room.name);
    room.addToSpawnQueue({ role, overrides, name }, true);
  }
}

/**
 * Generate a creep body based on its role and the spawn's capacity.
 *
 * @param spawn The spawn the creep will be spawned from to determine available energy
 * @param role The role to generate a body for
 * @returns An array of BodyPartConstants representing the creep's body
 */
export function generateBodyByRole(
  spawn: StructureSpawn,
  role: CreepRole,
): BodyPartConstant[] {
  switch (role) {
    case CreepRole.miner: {
      let energy = spawn.room.energyCapacityAvailable;
      if (
        energy >
        BODYPART_COST[CARRY] + 4 * (BODYPART_COST[WORK] + BODYPART_COST[MOVE])
      ) {
        // Enough energy to use segmented miner
        return ([CARRY] as BodyPartConstant[]).concat(
          bodyFromSegments([MOVE, WORK, WORK], energy - BODYPART_COST[CARRY]),
        );
      } else {
        // Prioritize work parts over move parts
        energy -= BODYPART_COST[MOVE] + BODYPART_COST[CARRY];
        const body: BodyPartConstant[] = [CARRY, MOVE];
        // The capacity minus the carry and move part cost divided by the work part cost
        const workParts = Math.min(7, Math.floor(energy / BODYPART_COST[WORK]));
        energy -= workParts * BODYPART_COST[WORK];
        const additionalMoves = Math.floor(energy / BODYPART_COST[MOVE]);
        info(
          `${spawn.room.energyCapacityAvailable} ${workParts} ${additionalMoves} ${energy}`,
        );
        for (let i = 0; i < additionalMoves; i++) {
          body.push(MOVE);
        }
        for (let i = 0; i < workParts; i++) {
          body.push(WORK);
        }
        return body;
      }
    }
    // General body
    case CreepRole.rangedHarvester:
    case CreepRole.extractor:
    case CreepRole.builder:
    case CreepRole.upgrader: {
      const energy = spawn.room.energyCapacityAvailable;
      return bodyFromSegments([MOVE, WORK, CARRY], energy);
    }
    case CreepRole.tender:
    case CreepRole.hauler: {
      const body: BodyPartConstant[] = [];
      let availableEnergy = spawn.room.energyCapacityAvailable;
      // If the creep is a tender, only count truly available energy so we
      // always have a tender. Although, this may lead to spawning "low-level"
      // tenders.
      if (role === CreepRole.tender) {
        availableEnergy = spawn.room.energyAvailable;
      }
      // Haulers/tenders don't really need more thnat 30 body parts, allowing
      // them 1000 carry capacity and 1 move speed on roads empty and full.
      // Energy capacity minus work cost divided by MOVE/CARRY cost
      //
      // Also, require at least 2 body units for a move and a carry
      const bodyUnits = Math.max(
        2,
        Math.min(30, Math.floor(availableEnergy / 50)),
      );
      // 1/3 MOVE, rest CARRY
      for (let i = 0; i < bodyUnits; i++) {
        // Prioritize MOVE parts so that the creep always moves in 1
        if (i < Math.ceil(bodyUnits / 3)) {
          body.push(MOVE);
        } else {
          body.push(CARRY);
        }
      }
      return body;
    }
    case CreepRole.harvester: {
      return [MOVE, CARRY, WORK];
    }
    case CreepRole.claimer: {
      const energy = spawn.room.energyCapacityAvailable;
      return bodyFromSegments([CLAIM, MOVE], energy, 9);
    }
    case CreepRole.remoteHauler: {
      const availableEnergy = spawn.room.energyCapacityAvailable;
      const bodyUnits = Math.floor(availableEnergy / 50);
      const haulerBody = generateBodyByRole(spawn, CreepRole.hauler);
      // If the body can support 33 units, prepend a move (1), append a work (2)
      if (bodyUnits >= 33) {
        haulerBody.unshift(MOVE);
        haulerBody.push(WORK);
      } else {
        // Replace a carry with a work otherwise
        haulerBody[haulerBody.length - 1] = WORK;
      }
      return haulerBody;
    }
    case CreepRole.scout: {
      return [MOVE];
    }
    case CreepRole.guard: {
      // Guard body is as many (MOVE, MOVE, ATTACK, RANGED_ATTACK) as possible,
      // with (TOUGH, MOVE) to fill in the remaining amount of energy
      const energy = spawn.room.energyCapacityAvailable;
      const unitCost =
        2 * BODYPART_COST[MOVE] +
        BODYPART_COST[ATTACK] +
        BODYPART_COST[RANGED_ATTACK];
      const bodyUnits = Math.min(
        Math.floor(50 / 4),
        Math.floor(energy / unitCost),
      );
      const toughs = Math.floor(
        Math.min(
          50 - bodyUnits * 4,
          Math.floor(
            (energy - bodyUnits * unitCost) /
              (BODYPART_COST[TOUGH] + BODYPART_COST[MOVE]),
          ),
        ) / 2,
      );
      info(`${energy} ${unitCost} ${bodyUnits} ${toughs}`);
      const body: BodyPartConstant[] = [];
      for (let i = 0; i < toughs; i++) {
        body.push(TOUGH);
      }
      for (let i = 0; i < toughs + 2 * bodyUnits - 1; i++) {
        body.push(MOVE);
      }
      for (let i = 0; i < bodyUnits; i++) {
        body.push(ATTACK);
      }
      for (let i = 0; i < bodyUnits; i++) {
        body.push(RANGED_ATTACK);
      }
      // Keep a MOVE at the end of the body to so the creep can always move
      body.push(MOVE);
      return body;
    }
    case CreepRole.escort: {
      // Escort body is 10 MOVE/HEALS and then as many [MOVE, RANGED_ATTACK]
      // segments as possible. Order: [MOVE, RANGED_ATTACK, HEAL].
      let energy =
        spawn.room.energyCapacityAvailable -
        10 * (BODYPART_COST[MOVE] + BODYPART_COST[HEAL]);
      // If the energy is too little for the minimum size body, log a warning
      // and set the energy to the minimum to generate a too-large-to-spawn body
      if (energy < BODYPART_COST[MOVE] + BODYPART_COST[RANGED_ATTACK]) {
        warn(`Spawn ${spawn.name} unable to spawn minimum-size ${role} creep`);
        energy = BODYPART_COST[MOVE] + BODYPART_COST[RANGED_ATTACK];
      }
      const body: BodyPartConstant[] = _.fill(Array(10), MOVE);
      body.push(...bodyFromSegments([MOVE, RANGED_ATTACK], energy, 15));
      body.push(..._.fill(Array(10), HEAL));
      return body;
    }
    default:
      throw new ScriptError(`getBodyPartsFromRole invalid role ${role}`);
  }
}

function generateMemoryByRole(role: CreepRole, room: Room): CreepMemory {
  return {
    role,
    task: CreepTask.fresh,
    room: room.name,
  };
}

export function spawnManager(): void {
  for (const spawnName in Game.spawns) {
    const spawn = Game.spawns[spawnName];
    wrapper(
      () => spawnBehavior(spawn),
      `Error processing spawn behavior for spawn ${spawn.name}`,
    );
  }
}

function bodyFromSegments(
  segment: BodyPartConstant[],
  energy: number,
  maxUnits = 50,
): BodyPartConstant[] {
  // 50 parts max, so 50 / parts in a segment max
  if (maxUnits === 50) {
    maxUnits = Math.floor(50 / segment.length);
  }
  const cost = _.sum(segment, (part) => {
    return BODYPART_COST[part];
  });
  const units = Math.min(maxUnits, Math.floor(energy / cost));
  const parts = _.countBy(segment, _.identity);
  const body: BodyPartConstant[] = [];
  let addMove = false;

  _.forEach(parts, (count, part) => {
    let quantity = count * units;
    if (part === MOVE) {
      addMove = true;
      quantity = count * units - 1;
    }
    for (let i = 0; i < quantity; i++) {
      body.push(part as BodyPartConstant);
    }
  });

  if (addMove) {
    body.push(MOVE);
  }

  return body;
}
