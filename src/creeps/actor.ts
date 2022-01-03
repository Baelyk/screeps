import { CreepInfo } from "./memory";
import {
  Return,
  InProgress,
  Done,
  NeedResource,
  NeedMove,
  NotFound,
  UnhandledScreepsReturn,
} from "./returns";
import { Position } from "classes/position";
import { move } from "./move";
import * as Actions from "./actions";

export class CreepActor {
  creep: Creep;
  info: CreepInfo;

  constructor(creep: Creep) {
    this.creep = creep;
    this.info = new CreepInfo(creep.name);
  }

  hasResource(resource?: ResourceConstant): boolean {
    return this.creep.store.getUsedCapacity(resource) > 0;
  }

  hasFreeCapacity(resource?: ResourceConstant): boolean {
    const free = this.creep.store.getFreeCapacity(resource);
    if (free == undefined) {
      return false;
    }
    return free > 0;
  }

  get name(): string {
    return this.creep.name;
  }

  _position?: Position;
  get position(): Position {
    if (this._position == undefined) {
      this._position = new Position(this.creep.pos);
    }
    return this._position;
  }

  // Primitive actions
  pickupResource(
    pile: Resource,
  ): InProgress | NeedMove | UnhandledScreepsReturn {
    const response = this.creep.pickup(pile);
    if (response === OK) {
      return new InProgress();
    } else if (response === ERR_NOT_IN_RANGE) {
      return new NeedMove(pile.pos, 1);
    } else {
      return new UnhandledScreepsReturn(response);
    }
  }

  recoverResource(
    resource: ResourceConstant,
    range = 50,
  ): InProgress | NeedMove | NotFound | UnhandledScreepsReturn {
    const piles = this.creep.pos
      .findInRange(FIND_DROPPED_RESOURCES, range)
      .filter((pile) => pile.resourceType === resource && pile.amount > 0);
    if (piles.length > 0) {
      const pile = this.creep.pos.findClosestByPath(piles);
      if (pile != undefined) {
        return this.pickupResource(pile);
      }
    }
    return new NotFound();
  }

  getResourceFrom(
    target: AnyStoreStructure | Tombstone,
    resource: ResourceConstant,
    amount?: number,
  ): InProgress | NeedMove | UnhandledScreepsReturn {
    const response = this.creep.withdraw(target, resource, amount);
    if (response === OK) {
      return new InProgress();
    } else if (response === ERR_NOT_IN_RANGE) {
      return new NeedMove(target.pos, 1);
    } else {
      return new UnhandledScreepsReturn(response);
    }
  }

  putResourceInto(
    target: AnyStoreStructure,
    resource: ResourceConstant,
    amount?: number,
  ): InProgress | NeedMove | UnhandledScreepsReturn {
    const response = this.creep.transfer(target, resource, amount);
    if (response === OK) {
      return new InProgress();
    } else if (response === ERR_NOT_IN_RANGE) {
      return new NeedMove(target.pos, 1);
    } else {
      return new UnhandledScreepsReturn(response);
    }
  }

  // Actions

  harvest(
    target: Source | Mineral | Deposit,
  ): InProgress | NeedMove | UnhandledScreepsReturn {
    const response = this.creep.harvest(target);
    if (response === OK) {
      return new InProgress();
    } else if (response === ERR_NOT_IN_RANGE) {
      return new NeedMove(target.pos, 1);
    } else {
      return new UnhandledScreepsReturn(response);
    }
  }

  build(
    site: ConstructionSite,
  ): InProgress | NeedMove | NeedResource | UnhandledScreepsReturn {
    const response = this.creep.build(site);
    if (response === OK) {
      return new InProgress();
    } else if (response === ERR_NOT_IN_RANGE) {
      return new NeedMove(site.pos, 3);
    } else if (response === ERR_NOT_ENOUGH_RESOURCES) {
      return new NeedResource(RESOURCE_ENERGY);
    } else {
      return new UnhandledScreepsReturn(response);
    }
  }

  repair(
    structure: Structure,
  ): InProgress | NeedMove | NeedResource | UnhandledScreepsReturn {
    const response = this.creep.repair(structure);
    if (response === OK) {
      return new InProgress();
    } else if (response === ERR_NOT_IN_RANGE) {
      return new NeedMove(structure.pos, 3);
    } else if (response === ERR_NOT_ENOUGH_RESOURCES) {
      return new NeedResource(RESOURCE_ENERGY);
    } else {
      return new UnhandledScreepsReturn(response);
    }
  }

  moveTo(
    destination: Position,
    range = 0,
  ): InProgress | UnhandledScreepsReturn {
    const response = move(this.creep, destination.intoRoomPosition(), {
      range,
    });
    if (response === OK || response === ERR_TIRED) {
      return new InProgress();
    } else {
      return new UnhandledScreepsReturn(response);
    }
  }

  getEnergy(): InProgress | NeedMove | NotFound | UnhandledScreepsReturn {
    // Get energy from:
    // 0. Adjacent tombstones or piles
    // 1. Room storage
    // 2. Containers
    // 3. Nearest tombstone or pile
    // 4. Harvesting from sources

    const adjacentPiles = this.creep.pos
      .findInRange(FIND_DROPPED_RESOURCES, 1)
      .filter((r) => r.resourceType === RESOURCE_ENERGY);
    if (adjacentPiles.length > 0) {
      return this.pickupResource(adjacentPiles[0]);
    }
    const adjacentTombstones = this.creep.pos
      .findInRange(FIND_TOMBSTONES, 1)
      .filter((t) => t.store[RESOURCE_ENERGY] > 0);
    if (adjacentTombstones.length > 0) {
      return this.getResourceFrom(adjacentTombstones[0], RESOURCE_ENERGY);
    }

    const storage = this.creep.room.storage;
    if (storage != undefined && storage.store[RESOURCE_ENERGY] > 0) {
      return this.getResourceFrom(storage, RESOURCE_ENERGY);
    }

    const containers = this.creep.room
      .find(FIND_STRUCTURES)
      .filter(
        (s) =>
          s.structureType === STRUCTURE_CONTAINER &&
          s.store[RESOURCE_ENERGY] > 0,
      ) as StructureContainer[];
    if (containers.length > 0) {
      const container = this.creep.pos.findClosestByPath(containers);
      if (container != undefined) {
        return this.getResourceFrom(container, RESOURCE_ENERGY);
      }
    }

    const recoverResponse = this.recoverResource(RESOURCE_ENERGY);
    if (!(recoverResponse instanceof NotFound)) {
      return recoverResponse;
    }

    const sources = this.creep.room
      .find(FIND_SOURCES)
      .filter((s) => s.energy > 0);
    if (sources.length > 0) {
      const source = this.creep.pos.findClosestByPath(sources);
      if (source != undefined) {
        return this.harvest(source);
      }
    }

    return new NotFound();
  }

  attackController(
    controller: StructureController,
  ): InProgress | NeedMove | UnhandledScreepsReturn {
    const response = this.creep.attackController(controller);
    if (response === OK) {
      return new InProgress();
    } else if (response === ERR_NOT_IN_RANGE) {
      return new NeedMove(controller.pos, 1);
    } else {
      return new UnhandledScreepsReturn(response);
    }
  }

  claimController(
    controller: StructureController,
  ): InProgress | NeedMove | UnhandledScreepsReturn {
    const response = this.creep.claimController(controller);
    if (response === OK) {
      return new InProgress();
    } else if (response === ERR_NOT_IN_RANGE) {
      return new NeedMove(controller.pos, 1);
    } else {
      return new UnhandledScreepsReturn(response);
    }
  }

  reserveController(
    controller: StructureController,
  ): InProgress | NeedMove | UnhandledScreepsReturn {
    const response = this.creep.reserveController(controller);
    if (response === OK) {
      return new InProgress();
    } else if (response === ERR_NOT_IN_RANGE) {
      return new NeedMove(controller.pos, 1);
    } else {
      return new UnhandledScreepsReturn(response);
    }
  }

  upgradeController(
    controller: StructureController,
  ): InProgress | NeedResource | NeedMove | UnhandledScreepsReturn {
    const response = this.creep.upgradeController(controller);
    if (response === OK) {
      return new InProgress();
    } else if (response === ERR_NOT_ENOUGH_RESOURCES) {
      return new NeedResource(RESOURCE_ENERGY);
    } else if (response === ERR_NOT_IN_RANGE) {
      return new NeedMove(controller.pos, 3);
    } else {
      return new UnhandledScreepsReturn(response);
    }
  }
}
