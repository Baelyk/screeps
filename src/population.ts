import { info } from "utils/logger";
import { generateBodyByRole } from "spawns";
import { bodyCost, countBodyPart, getSurroundingTiles } from "utils/helpers";
import { GetByIdError, ScriptError } from "utils/errors";
import { VisibleRoom } from "roomMemory";
import { CreepRole, CreepRoleList } from "./creeps";

type PopulationInterface = Record<CreepRole, number>;

export class PopulationManager implements PopulationInterface {
  // Initialize limits to zero
  [CreepRole.harvester] = 0;
  [CreepRole.miner] = 0;
  [CreepRole.builder] = 0;
  [CreepRole.upgrader] = 0;
  [CreepRole.hauler] = 0;
  [CreepRole.claimer] = 0;
  [CreepRole.tender] = 0;
  [CreepRole.extractor] = 0;
  [CreepRole.remoteHauler] = 0;
  [CreepRole.scout] = 0;
  [CreepRole.guard] = 0;
  [CreepRole.escort] = 0;
  [CreepRole.rangedHarvester] = 0;

  roomInfo: VisibleRoom;

  static recalculatePopulationLimits(
    roomName: string,
  ): Partial<PopulationInterface> {
    const populationManager = new PopulationManager(roomName);
    populationManager.calculate();
    return populationManager.getLimits();
  }

  constructor(roomName: string) {
    this.roomInfo = new VisibleRoom(roomName);
  }

  getLimits(): Partial<PopulationInterface> {
    const limits: Partial<PopulationInterface> = {};
    CreepRoleList.forEach((role) => {
      if (this[role] !== 0) {
        limits[role] = this[role];
      }
    });
    return limits;
  }

  /**
   * Reasses population limits
   *
   * @param room The room
   */
  calculate(): void {
    info(`Room ${this.roomInfo.name} updating population limits`);
    // Recalculate miners
    this[CreepRole.miner] = this.minerLimit();

    // Builders build and repair
    this[CreepRole.builder] =
      this.roomInfo.getConstructionQueue().length +
        this.roomInfo.getRepairQueue().length >
      0
        ? 1
        : 0;

    if (this[CreepRole.miner] === 0) {
      // If we have no miners, we need harvesters
      this[CreepRole.harvester] = 2;
    } else if (this.roomInfo.roomType != RoomType.remote) {
      // If we have miners, we want upgraders
      this[CreepRole.upgrader] = this.upgraderLimit();
      this[CreepRole.tender] = 1;
      this[CreepRole.hauler] = this.haulerLimit();
      // One extractor creep per extractor structure (also one max)
      this[CreepRole.extractor] = this.extractorLimit();
      // Scouts based on visionless remotes of this room
      this[CreepRole.scout] = this.scoutLimit();
    }

    // Allow 1 claimer in a remote room if the reservation is < 500 ticks or
    // not mine
    const controller = this.roomInfo.getRoom().controller;
    if (
      this.roomInfo.roomType === RoomType.remote &&
      controller != undefined &&
      (controller.reservation == undefined ||
        controller.reservation.username != "Baelyk" ||
        controller.reservation.ticksToEnd < 500)
    ) {
      this[CreepRole.claimer] = 1;
    }

    // Primary rooms have 1 guard
    if (this.roomInfo.roomType === RoomType.primary) {
      const unitCost =
        2 * BODYPART_COST[MOVE] +
        BODYPART_COST[ATTACK] +
        BODYPART_COST[RANGED_ATTACK];
      this[CreepRole.guard] =
        this.roomInfo.getRoom().energyCapacityAvailable > unitCost ? 1 : 0;
    }
  }

  minerLimit(): number {
    let miners = 0;
    // Remote rooms don't *need* containers
    if (this.roomInfo.roomType === RoomType.remote) {
      return this.roomInfo.getSources().length;
    }
    // One miner per source with a container around it
    this.roomInfo.getSources().forEach((sourceId) => {
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

  upgraderLimit(): number {
    // RCL 8 rooms can have max 1 upgrader due to controller upgrade limit
    if (this.roomInfo.roomLevel() === 8) {
      // If there is more than 100k energy, spawn an upgrader anyway
      if (this.roomInfo.storedResourceAmount(RESOURCE_ENERGY) > 100000) {
        return 1;
      }

      const controller = this.roomInfo.getRoom().controller;
      if (controller == undefined) {
        throw new ScriptError(`Room ${this.roomInfo.name} lacks a controller`);
      }
      if (controller.ticksToDowngrade < CONTROLLER_DOWNGRADE[8] * 0.1) {
        return 1;
      } else {
        return 0;
      }
    }

    // If RCL 7 and the room has less than 10k energy stored and the controller
    // has over 10% downgrade, don't spawn an upgrader.
    if (this.roomInfo.roomLevel() === 7) {
      if (this.roomInfo.storedResourceAmount(RESOURCE_ENERGY) < 10000) {
        const controller = this.roomInfo.getRoom().controller;
        if (controller == undefined) {
          throw new ScriptError(
            `Room ${this.roomInfo.name} lacks a controller`,
          );
        }
        if (controller.ticksToDowngrade > CONTROLLER_DOWNGRADE[7] * 0.1) {
          return 0;
        }
      }
    }

    const gameRoom = this.roomInfo.getRoom();

    // If there is a storage, use the storage to calculate how many upgraders.
    // Otherwise, use containers, or suppose 0 energy.
    let energy = 0;
    if (
      gameRoom.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_STORAGE },
      }).length !== 0
    ) {
      energy = this.roomInfo.storedResourceAmount(RESOURCE_ENERGY);
    } else {
      const containers = gameRoom.find(FIND_STRUCTURES, {
        filter: { structureType: STRUCTURE_CONTAINER },
      }) as StructureContainer[];
      _.forEach(
        containers,
        (container) =>
          (energy += container.store.getUsedCapacity(RESOURCE_ENERGY)),
      );
      const piles = gameRoom.find(FIND_DROPPED_RESOURCES, {
        filter: { resourceType: RESOURCE_ENERGY },
      });
      _.forEach(piles, (pile) => (energy += pile.amount));
    }

    const body = generateBodyByRole(
      this.roomInfo.getPrimarySpawn(),
      CreepRole.upgrader,
    );
    const cost = bodyCost(body);
    const workParts = countBodyPart(body, WORK);
    // Upper limit on the amount of energy an upgrader will use in its lifetime
    const lifetimeCost =
      cost + workParts * UPGRADE_CONTROLLER_POWER * CREEP_LIFE_TIME;

    // At least 1 upgrader, but up to as many as the storage can afford over
    // the creeps entire lifetime
    return Math.max(1, Math.floor(energy / lifetimeCost));
  }

  extractorLimit(): number {
    if (this.roomInfo.roomLevel() < 6) {
      // Save some time, if an extractor couldn't exist, don't waste CPU looking
      return 0;
    }

    const gameRoom = this.roomInfo.getRoom();
    // A room without a storage is a room not ready for extractors
    if (gameRoom.storage == undefined) {
      return 0;
    }

    // TODO: Only supports one extractor in a this.roomInfo. Is this a problem?
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
    if (this.roomInfo.storedResourceAmount(mineral.mineralType) > 100000) {
      return 0;
    }

    // Extractor built and mineral deposit has mineral let, so allow an extractor
    return 1;
  }

  scoutLimit(): number {
    let count = 0;
    this.roomInfo.getRemotes().forEach((remoteName) => {
      const remote = Game.rooms[remoteName];
      // Visionless remotes require a scout
      if (remote == undefined) {
        count++;
      }
    });
    return count;
  }

  haulerLimit(): number {
    // Need RCL 6 to have miner links
    const sources = this.roomInfo.getSources();
    if (this.roomInfo.roomLevel() < 6) {
      return sources.length;
    }
    let minerLinks = 0;
    _.forEach(sources, (sourceId) => {
      const source = Game.getObjectById(sourceId);
      if (source != undefined) {
        if (
          source.pos.findInRange(FIND_MY_STRUCTURES, 2, {
            filter: { structureType: STRUCTURE_LINK },
          }).length > 0
        ) {
          minerLinks++;
        }
      }
    });
    // Need a hauler for each source without a miner link
    return sources.length - minerLinks;
  }
}
