import { nameCreep } from "utils/helpers";
import { errorConstant, stringifyBody, info } from "utils/logger";
import { ScriptError, wrapper } from "utils/errors";
import { VisibleRoom } from "roomMemory";

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
    InfoType.spawn,
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
      const body: BodyPartConstant[] = [MOVE];
      // The capacity minus the carry and move part cost divided by the work part cost
      const workParts = Math.min(
        7,
        Math.floor((spawn.room.energyCapacityAvailable - 100) / 100),
      );
      for (let i = 0; i < workParts; i++) {
        body.push(WORK);
      }
      return body;
    }
    // General body
    case CreepRole.extractor:
    case CreepRole.builder:
    case CreepRole.upgrader: {
      const body: BodyPartConstant[] = [];
      const bodyUnits = Math.min(
        50,
        Math.floor(spawn.room.energyCapacityAvailable / 50),
      );
      // 1/3 each in priority order:
      // MOVE
      // WORK
      // CARRY
      // However, since WORK parts cost twice the normal, it's actually by 1/4s
      // of body units, which will produce the 1/3 body ratio.
      const fourth = bodyUnits / 4;
      const moves = Math.ceil(fourth);
      const works = Math.floor(fourth);
      const carries = Math.ceil(fourth);
      for (let i = 0; i < bodyUnits; i++) {
        if (i < moves) {
          body.push(MOVE);
        } else if (i < moves + works) {
          body.push(WORK);
        } else if (i < moves + works + carries) {
          body.push(CARRY);
        } else {
          // Done building the body
          break;
        }
      }
      return body;
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
      const bodyUnits = Math.min(30, Math.floor(availableEnergy / 50));
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
    case CreepRole.claimer: {
      return [MOVE, CLAIM];
    }
    case CreepRole.harvester: {
      return [MOVE, CARRY, WORK];
    }
    case CreepRole.reserver: {
      const body: BodyPartConstant[] = [];
      const availableEnergy = spawn.room.energyCapacityAvailable;
      const units = Math.min(
        9,
        Math.floor(
          availableEnergy / (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]),
        ),
      );
      for (let i = 0; i < units; i++) {
        body.push(CLAIM);
        body.push(MOVE);
      }
      body.sort();
      return body;
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
          Math.floor((energy - bodyUnits * unitCost) / 10),
        ) / 2,
      );
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
