import { nameCreep, countRole } from "utils/helpers";
import { errorConstant, stringifyBody, info, warn } from "utils/logger";
import { buildRoad, buildStructure, getSurroundingTiles } from "construct";
import { getExtensionSpots, getExtensionRoadSpots } from "planner";
import {
  GetPositionError,
  ScriptError,
  SpawnMemoryError,
  wrapper,
} from "utils/errors";

/**
 * Process spawn behavior
 *
 * @param spawn The spawn to process
 */
function spawnBehavior(spawn: StructureSpawn): void {
  // Currently no spawn queue, so we can only queue one creep per tick
  let allowSpawn = true;

  // Spawn harvester creeps
  const maxHarvesters = spawn.room.memory.populationLimit.harvester || 0;
  const harvestersCount = countRole(spawn.room, CreepRole.harvester);
  // Also, if there are no creeps, emergency spawn a harvester
  if (
    harvestersCount < maxHarvesters ||
    Object.keys(Game.creeps).length === 0
  ) {
    if (allowSpawn) {
      info(
        `${spawn.name}     requesting ${CreepRole.harvester}`,
        InfoType.spawn,
      );
      spawnCreep(spawn, CreepRole.harvester);
    } else {
      info(
        `${spawn.name} NOT requesting ${CreepRole.harvester}`,
        InfoType.spawn,
      );
    }
    allowSpawn = false;
  }

  // Spawn tender creeps
  const tenderCount = countRole(spawn.room, CreepRole.tender);
  const maxTenders = spawn.room.memory.populationLimit.tender || 0;
  if (tenderCount < maxTenders) {
    if (allowSpawn) {
      info(`${spawn.name}     requesting ${CreepRole.tender}`, InfoType.spawn);
      spawnCreep(spawn, CreepRole.tender);
    } else {
      info(`${spawn.name} NOT requesting ${CreepRole.tender}`, InfoType.spawn);
    }
    allowSpawn = false;
  }

  // Spawn miner creeps
  const sources = spawn.room.find(FIND_SOURCES);
  const minerCount = countRole(spawn.room, CreepRole.miner);
  const maxMiners = spawn.room.memory.populationLimit.miner || 0;
  if (minerCount < maxMiners) {
    if (allowSpawn) {
      info(`${spawn.name}     requesting ${CreepRole.miner}`, InfoType.spawn);
      const memory = generateMemoryByRole(CreepRole.miner, spawn.room);
      // Get the id of the miner, which is the number attached the end of it's name
      const id = Number(nameCreep(memory).replace("miner_", ""));
      const source = sources[id];
      const surrounding = getSurroundingTiles(source.pos, 1);
      const spot = surrounding.find((place) => {
        const structures = place.lookFor(LOOK_STRUCTURES);
        return (
          structures.find(
            (structure) => structure.structureType === STRUCTURE_CONTAINER,
          ) !== undefined
        );
      });
      if (spot === undefined) {
        warn(`Failed to assign spot to miner ${id}`);
      }
      spawnCreep(spawn, CreepRole.miner, {
        assignedSource: source.id,
        spot: spot,
        noRenew: true, // No renewing miners
      });
    } else {
      info(`${spawn.name} NOT requesting ${CreepRole.miner}`, InfoType.spawn);
    }
    allowSpawn = false;
  }

  // Spawn hauler creeps
  const haulerCount = countRole(spawn.room, CreepRole.hauler);
  const maxHaulers = spawn.room.memory.populationLimit.hauler || 0;
  if (haulerCount < maxHaulers) {
    if (allowSpawn) {
      info(`${spawn.name}     requesting ${CreepRole.hauler}`, InfoType.spawn);
      // Get the id of the hauler to associate it with the miner of the same id
      // by assigned them to the same spot
      const memory = generateMemoryByRole(CreepRole.hauler, spawn.room);
      const id = Number(nameCreep(memory).replace("hauler_", ""));
      const associated_miner = Game.creeps[`miner_${id}`];
      if (associated_miner === undefined) {
        throw new ScriptError(
          `Spawn ${spawn.name} can't find associated miner for hauler id ${id}`,
        );
      }
      spawnCreep(spawn, CreepRole.hauler, {
        spot: associated_miner.memory.spot,
      });
    } else {
      info(`${spawn.name} NOT requesting ${CreepRole.hauler}`, InfoType.spawn);
    }
    allowSpawn = false;
  }

  // Spawn upgrader creeps
  const maxUpgraders = spawn.room.memory.populationLimit.upgrader || 0;
  const upgraderCount = countRole(spawn.room, CreepRole.upgrader);
  if (upgraderCount < maxUpgraders) {
    if (allowSpawn) {
      info(
        `${spawn.name}     requesting ${CreepRole.upgrader}`,
        InfoType.spawn,
      );
      spawnCreep(spawn, CreepRole.upgrader);
    } else {
      info(
        `${spawn.name} NOT requesting ${CreepRole.upgrader}`,
        InfoType.spawn,
      );
    }
    allowSpawn = false;
  }

  // Spawn builder creeps
  const builderCount = countRole(spawn.room, CreepRole.builder);
  const maxBuilders = spawn.room.memory.populationLimit.builder || 0;
  if (builderCount < maxBuilders) {
    if (allowSpawn) {
      info(`${spawn.name}     requesting ${CreepRole.builder}`, InfoType.spawn);
      spawnCreep(spawn, CreepRole.builder);
    } else {
      info(`${spawn.name} NOT requesting ${CreepRole.builder}`, InfoType.spawn);
    }
    allowSpawn = false;
  }

  // Spawn tender creeps
  const extractorCount = countRole(spawn.room, CreepRole.extractor);
  const maxExtractors = spawn.room.memory.populationLimit.extractor || 0;
  if (extractorCount < maxExtractors) {
    if (allowSpawn) {
      info(
        `${spawn.name}     requesting ${CreepRole.extractor}`,
        InfoType.spawn,
      );
      spawnCreep(spawn, CreepRole.extractor);
    } else {
      info(
        `${spawn.name} NOT requesting ${CreepRole.extractor}`,
        InfoType.spawn,
      );
    }
    allowSpawn = false;
  }

  // Build extentions
  const controller = (spawn.room.controller as StructureController).level;
  let extensionCount = 0;
  if (spawn.memory.extensions) {
    extensionCount = spawn.memory.extensions.length;
  }

  const availableEnergy = spawn.room.storage
    ? spawn.room.storage.store.getUsedCapacity(RESOURCE_ENERGY)
    : -1;
  // Build an extension if there is less than the maximum number. However, if
  // there is a room storage, make sure there is enough energy in it for the
  // cost of the extension.
  if (
    (availableEnergy === -1 ||
      availableEnergy > CONSTRUCTION_COST[STRUCTURE_EXTENSION]) &&
    extensionCount < getMaxExtensions(controller)
  ) {
    requestExtentions(spawn);
  }
}

function spawnCreep(
  spawn: StructureSpawn,
  role: CreepRole,
  overrides?: Partial<CreepMemory>,
) {
  const memory = generateMemoryByRole(role, spawn.room);
  if (overrides != undefined) {
    for (const key in overrides) {
      memory[key] = overrides[key];
    }
  }
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
      const bodyUnits = Math.floor(spawn.room.energyCapacityAvailable / 50);
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
      return [MOVE, MOVE, CLAIM];
    }
    case CreepRole.harvester: {
      return [MOVE, CARRY, WORK];
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

function requestExtentions(spawn: StructureSpawn) {
  if (spawn.memory.extensions === undefined) {
    spawn.memory.extensions = [];
  }
  // Only request an extension when there is nothing in the build/repair queues
  if (
    spawn.room.memory.constructionQueue.length === 0 &&
    spawn.room.memory.repairQueue.length === 0
  ) {
    if (spawn.memory.extensionSpots === undefined) {
      throw new SpawnMemoryError(spawn, "extensionSpots");
    }
    const spot = spawn.memory.extensionSpots.shift();
    if (spot == undefined) {
      throw new ScriptError(
        `Spawn ${spawn.name} has run out of extension spots`,
      );
    }
    const position = spawn.room.getPositionAt(spot.x, spot.y);
    if (position == undefined) {
      throw new GetPositionError(spot);
    }
    info(
      `Spawn ${spawn.name} requesting extention at ${JSON.stringify(position)}`,
      InfoType.build,
    );
    if (buildStructure(position, STRUCTURE_EXTENSION)) {
      spawn.memory.extensions.push(position);
    } else {
      warn(
        `Spawn ${spawn.name} failed extention request at ${JSON.stringify(
          position,
        )}`,
      );
    }
  }
}

function getSpawnExtensions(spawn: StructureSpawn): StructureExtension[] {
  const extensions: StructureExtension[] = [];
  if (spawn.memory.extensions == undefined) return [];
  spawn.memory.extensions.forEach((position) => {
    const pos = spawn.room.getPositionAt(position.x, position.y);
    if (pos == undefined) return;
    pos
      .lookFor(LOOK_STRUCTURES)
      .filter((structure) => {
        return structure.structureType === STRUCTURE_EXTENSION;
      })
      .forEach((extension) => {
        extensions.push(extension as StructureExtension);
      });
  });
  return extensions;
}

export function getMaxExtensions(level: number): number {
  return CONTROLLER_STRUCTURES["extension"][level];
}

export function initSpawn(spawn: StructureSpawn): void {
  info(`Initializing spawn ${spawn.name}...`);

  // Construct a ring of roads around the spawn
  const spawn_ring = getSurroundingTiles(spawn.pos, 1);
  info(`Spawn ring road: ${JSON.stringify(spawn_ring)}`, InfoType.build);
  buildRoad(spawn_ring);

  // Construct the extension roads
  const extensionRoads = getExtensionRoadSpots(spawn.room);
  info(
    `Spawn extension road: ${JSON.stringify(extensionRoads)}`,
    InfoType.build,
  );
  buildRoad(extensionRoads);

  // Add the extension spots to the memory
  const extensionSpots = getExtensionSpots(spawn.room);
  spawn.memory.extensionSpots = extensionSpots;

  info(`Finished initizalizing spawn ${spawn.name}`);
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
