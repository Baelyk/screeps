import { getSurroundingTiles } from "construct";
import { info } from "utils/logger";
import { generateBodyByRole } from "spawns";
import { bodyCost, countBodyPart } from "utils/helpers";
import { GetByIdError, ScriptError } from "utils/errors";

/**
 * Reasses population limits
 *
 * @param room The room
 */
export function census(room: Room): void {
  info(`Updating population limits`, InfoType.spawn);
  // Recalculate miners
  const miners = minerLimit(room);

  let harvesters = 0;
  // Pre-miners only harvesters upgrade
  let upgraders = 0;
  let haulers = 0;
  let tenders = 0;
  let extractors = 0;
  // One builder per two construction queue items
  let builders = room.memory.constructionQueue.length > 0 ? 1 : 0;
  // If there isn't a tower, builders must repair too
  if (room.memory.level < 3) {
    builders = Math.max(
      Math.floor(room.memory.constructionQueue.length / 2),
      builders,
    );
  }
  if (miners === 0) {
    // If we have no miners, we need harvesters
    harvesters = 2;
    // If we have no miners, no more than harvesters + 1 builders
    builders = Math.min(harvesters + 1, builders);
  } else {
    // if we have miners, no more than 1 builder per miner
    builders = Math.min(miners, builders);
    // If we have miners, we want upgraders
    upgraders = upgraderLimit(room);
    // One hauler per tender upgraders with a minimum of 1 tender
    tenders = Math.floor(upgraders / 4) || 1;
    // One hauler per miner
    haulers = miners;
    // One extractor creep per extractor structure (also one max)
    extractors = extractorLimit(room);
  }

  room.memory.populationLimit.miner = miners;
  room.memory.populationLimit.harvester = harvesters;
  room.memory.populationLimit.upgrader = upgraders;
  room.memory.populationLimit.builder = builders;
  room.memory.populationLimit.hauler = haulers;
  room.memory.populationLimit.tender = tenders;
  room.memory.populationLimit.extractor = extractors;
}

function minerLimit(room: Room): number {
  let miners = 0;
  // One miner per source with a container around it
  room.memory.sources.forEach((sourceId) => {
    const source = Game.getObjectById(sourceId) as Source;
    if (source != undefined) {
      let containersAroundSource = 0;
      getSurroundingTiles(source.pos, 1).forEach((position) => {
        containersAroundSource += position
          .lookFor(LOOK_STRUCTURES)
          .filter((structure) => {
            return structure.structureType === STRUCTURE_CONTAINER;
          }).length;
      });
      if (containersAroundSource > 0) {
        miners++;
      }
    } else {
      throw new GetByIdError(sourceId, "source");
    }
  });
  return miners;
}

function upgraderLimit(room: Room): number {
  const spawn = Game.getObjectById(room.memory.spawn) as StructureSpawn;
  if (spawn == undefined) {
    throw new GetByIdError(room.memory.spawn, STRUCTURE_SPAWN);
  }

  const storage = room.storage;
  if (storage == undefined) {
    info(
      `Room ${room.name} not ready for advance upgrader population limiting`,
    );
    // Default to 1 upgrader
    return 1;
  }

  const energy = storage.store.getUsedCapacity(RESOURCE_ENERGY);

  const body = generateBodyByRole(spawn, CreepRole.upgrader);
  const cost = bodyCost(body);
  const workParts = countBodyPart(body, WORK);
  // Upper limit on the amount of energy an upgrader will use in its lifetime
  const lifetimeCost =
    cost + workParts * UPGRADE_CONTROLLER_POWER * CREEP_LIFE_TIME;

  // At least 1 upgrader, but up to as many as the storage can afford over
  // the creeps entire lifetime
  return Math.max(1, Math.floor(energy / lifetimeCost));
}

function extractorLimit(room: Room): number {
  if (room.memory.level < 6) {
    // Save some time, if an extractor couldn't exist, don't waste CPU looking
    return 0;
  }
  // TODO: Only supports one extractor in a room. Is this a problem?
  const extractor = room
    .find(FIND_STRUCTURES)
    .find((struc) => struc.structureType === STRUCTURE_EXTRACTOR);
  if (extractor == undefined) {
    // Extractor not built yet
    return 0;
  }
  const mineral = extractor.pos.lookFor(LOOK_MINERALS)[0];
  if (mineral == undefined) {
    throw new ScriptError(
      `Extractor built over not minerals at ${extractor.pos}`,
    );
  }
  // If the mineral is exhausted and it will regen after the next census (100t)
  // with about enough time to spawn an extractor then (~100t), keep the limit
  // at 0.
  if (mineral.mineralAmount === 0 && mineral.ticksToRegeneration > 200) {
    return 0;
  }

  // Extractor built and mineral deposit has mineral let, so allow an extractor
  return 1;
}
