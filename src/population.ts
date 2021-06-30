import { getSurroundingTiles } from "construct";
import { info } from "utils/logger";
import { generateBodyByRole } from "spawns";
import { bodyCost, countBodyPart } from "utils/helpers";
import { GetByIdError, ScriptError } from "utils/errors";
import { VisibleRoom } from "roomMemory";

/**
 * Reasses population limits
 *
 * @param room The room
 */
export function census(room: VisibleRoom): void {
  info(`Updating population limits`, InfoType.spawn);
  // Recalculate miners
  const miners = minerLimit(room);

  let harvesters = 0;
  // Pre-miners only harvesters upgrade
  let upgraders = 0;
  let haulers = miners;
  let tenders = 0;
  let extractors = 0;
  let claimers = 0;
  let scouts = 0;
  let guards = 0;
  // One builder per two construction queue items
  let builders = room.getConstructionQueue().length > 0 ? 1 : 0;
  // If there isn't a tower, builders must repair too
  if (
    room
      .getRoom()
      .find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } })
      .length > 0
  ) {
    builders = Math.max(room.getRepairQueue().length > 0 ? 1 : 0, builders);
  }
  if (miners === 0) {
    // If we have no miners, we need harvesters
    harvesters = 2;
    // If we have no miners, no more than harvesters + 1 builders
    builders = Math.min(harvesters + 1, builders);
  } else if (room.roomType != RoomType.remote) {
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
    // Scouts based on visionless remotes of this room
    scouts = scoutLimit(room);
  }

  // Allow 1 claimer in a remote room if the reservation is < 500 ticks or
  // not mine
  const controller = room.getRoom().controller;
  if (
    room.roomType === RoomType.remote &&
    controller != undefined &&
    (controller.reservation == undefined ||
      controller.reservation.username != "Baelyk" ||
      controller.reservation.ticksToEnd < 500)
  ) {
    claimers = 1;
  }

  // Primary rooms have 1 guard
  if (room.roomType === RoomType.primary) {
    const unitCost =
      2 * BODYPART_COST[MOVE] +
      BODYPART_COST[ATTACK] +
      BODYPART_COST[RANGED_ATTACK];
    guards = room.getRoom().energyCapacityAvailable > unitCost ? 1 : 0;
  }

  room.setRoleLimit(CreepRole.miner, miners);
  room.setRoleLimit(CreepRole.harvester, harvesters);
  room.setRoleLimit(CreepRole.upgrader, upgraders);
  room.setRoleLimit(CreepRole.builder, builders);
  room.setRoleLimit(CreepRole.hauler, haulers);
  room.setRoleLimit(CreepRole.tender, tenders);
  room.setRoleLimit(CreepRole.extractor, extractors);
  room.setRoleLimit(CreepRole.claimer, claimers);
  room.setRoleLimit(CreepRole.scout, scouts);
  room.setRoleLimit(CreepRole.guard, guards);
}

function minerLimit(room: VisibleRoom): number {
  let miners = 0;
  // Remote rooms don't *need* containers
  if (room.roomType === RoomType.remote) {
    return room.getSources().length;
  }
  // One miner per source with a container around it
  room.getSources().forEach((sourceId) => {
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

function upgraderLimit(room: VisibleRoom): number {
  // RCL 8 rooms can have max 1 upgrader due to controller upgrade limit
  if (room.roomLevel() === 8) {
    return 1;
  }

  const spawn = room.getPrimarySpawn();

  const energy = room.storedResourceAmount(RESOURCE_ENERGY);

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

function extractorLimit(room: VisibleRoom): number {
  if (room.roomLevel() < 6) {
    // Save some time, if an extractor couldn't exist, don't waste CPU looking
    return 0;
  }

  const gameRoom = room.getRoom();
  // A room without a storage is a room not ready for extractors
  if (gameRoom.storage == undefined) {
    return 0;
  }

  // TODO: Only supports one extractor in a room. Is this a problem?
  const extractor = gameRoom
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

  // If we already have 100k of the mineral, no extract pls
  if (room.storedResourceAmount(mineral.mineralType) > 100000) {
    return 0;
  }

  // Extractor built and mineral deposit has mineral let, so allow an extractor
  return 1;
}

function scoutLimit(room: VisibleRoom): number {
  let count = 0;
  room.getRemotes().forEach((remoteName) => {
    const remote = Game.rooms[remoteName];
    // Visionless remotes require a scout
    if (remote == undefined) {
      count++;
    }
  });
  return count;
}
