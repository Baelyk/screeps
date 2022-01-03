import {
  InProgress,
  Done,
  NeedResource,
  NeedMove,
  NotFound,
  NoCapacity,
  UnhandledScreepsReturn,
  Return,
} from "./returns";
import { CreepActor } from "./actor";
import { Position } from "classes/position";
import { RoomInfo, VisibleRoom } from "roomMemory";
import { ScriptError } from "utils/errors";
import { warn } from "utils/logger";

export enum CreepTask {
  MineSource = "mine_source",
  GetEnergy = "get_energy",
  Build = "build",
  Repair = "repair",
  Upgrade = "upgrade",
  Store = "store",
  GetResource = "get_resource",
  Harvest = "harvest",
  AssertControl = "assert_control",
  Protect = "protect",
  Unload = "unload",
  Renew = "renew",
  None = "none",
}

export interface ICreepTask {
  name: CreepTask;
  do: (creep: CreepActor, ...args: any[]) => Return;
}

const GetEnergyTask: ICreepTask = {
  name: CreepTask.GetEnergy,
  do(
    actor: CreepActor,
  ): InProgress | Done | NotFound | NoCapacity | UnhandledScreepsReturn {
    if (actor.hasFreeCapacity(RESOURCE_ENERGY)) {
      const response = actor.getEnergy();
      if (response instanceof NeedMove) {
        return actor.moveTo(response.value.destination, response.value.range);
      }
      return response;
    }
    return new Done();
  },
};

const BuildTask: ICreepTask = {
  name: CreepTask.Build,
  do(
    actor: CreepActor,
    site: ConstructionSite,
  ): InProgress | NeedResource | UnhandledScreepsReturn {
    if (!actor.hasResource(RESOURCE_ENERGY)) {
      return new NeedResource(RESOURCE_ENERGY);
    }
    const response = actor.build(site);
    if (response instanceof NeedMove) {
      return actor.moveTo(response.value.destination, response.value.range);
    }
    return response;
  },
};

const RepairTask: ICreepTask = {
  name: CreepTask.Repair,
  do(
    actor: CreepActor,
    structure: Structure,
  ): InProgress | NeedResource | UnhandledScreepsReturn {
    if (!actor.hasResource(RESOURCE_ENERGY)) {
      return new NeedResource(RESOURCE_ENERGY);
    }
    const response = actor.repair(structure);
    if (response instanceof NeedMove) {
      return actor.moveTo(response.value.destination, response.value.range);
    }
    return response;
  },
};

const MineSourceTask: ICreepTask = {
  name: CreepTask.MineSource,
  do(
    actor: CreepActor,
    spot: Position,
    source: Source,
    container: StructureContainer | undefined,
    link: StructureLink | undefined,
  ) {
    // Move to mining spot
    if (!Position.areEqual(spot, actor.position)) {
      return actor.moveTo(spot, 0);
    }

    // Transfer energy to the link
    if (link != undefined && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      if (actor.hasResource(RESOURCE_ENERGY)) {
        return actor.putResourceInto(link, RESOURCE_ENERGY);
      }
    }

    // Harvest energy from the source
    if (source.energy > 0) {
      return actor.harvest(source);
    }

    // If not harvesting, repair the container
    if (container != undefined && container.hits < container.hitsMax) {
      const response = actor.repair(container);
      if (
        response instanceof NeedResource &&
        response.value === RESOURCE_ENERGY
      ) {
        // Try to get energy from the ground then the container
        const findResponse = actor.recoverResource(RESOURCE_ENERGY, 1);
        if (findResponse instanceof NotFound) {
          return actor.getResourceFrom(container, RESOURCE_ENERGY);
        } else {
          return findResponse;
        }
      } else {
        return response;
      }
    }

    // Idle...
    return new InProgress();
  },
};

const UpgradeTask: ICreepTask = {
  name: CreepTask.Upgrade,
  do(
    actor: CreepActor,
    roomInfo: RoomInfo,
    controller: StructureController | undefined,
  ): InProgress | NeedResource | UnhandledScreepsReturn {
    // Make sure we have energy
    if (!actor.hasResource(RESOURCE_ENERGY)) {
      return new NeedResource(RESOURCE_ENERGY);
    }

    // Get vision on the controller
    if (controller == undefined) {
      if (VisibleRoom.isVisible(roomInfo.name)) {
        throw new ScriptError(
          `Cannot upgrade room ${roomInfo.name} lacking controller`,
        );
      }
      // Move to the room
      const position = new Position(new RoomPosition(25, 25, roomInfo.name));
      return actor.moveTo(position, 24);
    }

    // Upgrade the controller
    const response = actor.upgradeController(controller);
    if (response instanceof NeedMove) {
      return actor.moveTo(response.value.destination, response.value.range);
    } else {
      return response;
    }
  },
};

const StoreTask: ICreepTask = {
  name: CreepTask.Store,
  do(
    actor: CreepActor,
    resource?: ResourceConstant,
    structure?: AnyStoreStructure,
    amount?: number,
  ): InProgress | NeedResource | NoCapacity | UnhandledScreepsReturn {
    // Auto-select resource if unspecified
    if (resource == undefined) {
      for (const res in actor.creep.store) {
        resource = res as ResourceConstant;
        break;
      }
      if (resource == undefined) {
        throw new ScriptError(`Creep cannot store if it has no resources`);
      }
    }
    // Make sure we have the resource
    if (!actor.hasResource(resource)) {
      return new NeedResource(resource);
    }

    // Auto store in this creeps assigned room's storage
    if (structure == undefined) {
      if (actor.creep.room.name !== actor.info.assignedRoomName) {
        const position = new Position(
          new RoomPosition(25, 25, actor.info.assignedRoomName),
        );
        return actor.moveTo(position, 24);
      }
      structure = actor.creep.room.storage;
      if (structure == undefined) {
        throw new ScriptError(
          `Creep cannot auto store if room lacks a storage`,
        );
      }
      return this.do(actor, resource, structure, amount) as
        | InProgress
        | NeedResource
        | UnhandledScreepsReturn;
    }

    // Normal store in specified structure
    const response = actor.putResourceInto(structure, resource, amount);
    if (response instanceof NeedMove) {
      return actor.moveTo(response.value.destination, response.value.range);
    }
    return response;
  },
};

const HarvestTask: ICreepTask = {
  name: CreepTask.Harvest,
  do(
    actor: CreepActor,
    target: Source | Mineral | Deposit | undefined,
    roomName: string,
  ): InProgress | UnhandledScreepsReturn {
    if (actor.creep.room.name !== roomName) {
      // Move to the room
      const position = new Position(new RoomPosition(25, 25, roomName));
      return actor.moveTo(position, 24);
    }
    if (target == undefined) {
      throw new ScriptError(
        `Unexpected undefined harvest target while in room`,
      );
    }
    const response = actor.harvest(target);
    if (response instanceof NeedMove) {
      return actor.moveTo(response.value.destination, response.value.range);
    }
    return response;
  },
};

export const enum AssertControlType {
  Claim = "claim",
  Reserve = "reserve",
  Attack = "attack",
}
const AssertControlTask: ICreepTask = {
  name: CreepTask.AssertControl,
  do(
    actor: CreepActor,
    controller: StructureController | undefined,
    roomName: string,
    type: AssertControlType,
  ): InProgress | UnhandledScreepsReturn {
    const room = Game.rooms[roomName];
    if (room == undefined) {
      // Move to the room
      const position = new Position(new RoomPosition(25, 25, roomName));
      return actor.moveTo(position, 24);
    }
    if (controller == undefined) {
      throw new ScriptError(`Room ${roomName} lacks controller`);
    }

    let response: InProgress | NeedMove | UnhandledScreepsReturn;
    if (
      controller.reservation == undefined ||
      controller.reservation.username === "Baelyk"
    ) {
      if (type === AssertControlType.Claim) {
        response = actor.claimController(controller);
      } else if (type === AssertControlType.Reserve) {
        response = actor.reserveController(controller);
      } else {
        warn(
          `No need to attack owned controller ${Position.serialize(
            controller.pos,
          )}`,
        );
        response = new InProgress();
      }
    } else {
      response = actor.attackController(controller);
    }

    if (response instanceof NeedMove) {
      return actor.moveTo(response.value.destination, response.value.range);
    }
    return response;
  },
};

const ProtectTask: ICreepTask = {
  name: CreepTask.Protect,
  do(
    actor: CreepActor,
    protectee: CreepActor,
  ): InProgress | UnhandledScreepsReturn {
    // Attack closest hostile within range
    const hostiles = protectee.creep.pos.findInRange(FIND_HOSTILE_CREEPS, 5);
    function closerToActor(a: Creep, b: Creep): Creep {
      return actor.creep.pos.getRangeTo(a) < actor.creep.pos.getRangeTo(b)
        ? a
        : b;
    }
    const target = hostiles.reduce(closerToActor);
    if (target != undefined) {
      const distance = actor.creep.pos.getRangeTo(target);
      if (distance > 3) {
        return actor.moveTo(new Position(target.pos), 3);
      } else if (distance < 3) {
        return actor.moveTo(new Position(target.pos), 3, true);
      } else {
        const response = actor.attack(target);
        if (response instanceof NeedMove) {
          throw new ScriptError(`Shouldn't need to move`);
        }
        return response;
      }
    }
    return new InProgress();
  },
};

const GetResourceTask: ICreepTask = {
  name: CreepTask.GetResource,
  do(
    actor: CreepActor,
    resource: ResourceConstant,
    amount?: number,
    structure?: AnyStoreStructure,
  ) {
    // If the creep has the specified amount or has some and cannot carry more,
    // done.
    if (amount != undefined && actor.storedAmount(resource) >= amount) {
      return new Done();
    } else if (
      amount == undefined &&
      actor.hasResource(resource) &&
      !actor.hasFreeCapacity(resource)
    ) {
      return new Done();
    } else if (!actor.hasFreeCapacity(resource)) {
      return new NoCapacity(resource);
    }

    // If no specified structure, uto select this creeps assigned room's storage
    if (structure == undefined) {
      if (actor.creep.room.name !== actor.info.assignedRoomName) {
        const position = new Position(
          new RoomPosition(25, 25, actor.info.assignedRoomName),
        );
        return actor.moveTo(position, 24);
      }
      structure = actor.creep.room.storage;
      if (structure == undefined) {
        throw new ScriptError(
          `Creep cannot auto store if room lacks a storage`,
        );
      }
      return this.do(actor, resource, structure, amount) as
        | InProgress
        | NeedResource
        | UnhandledScreepsReturn;
    }

    const response = actor.getResourceFrom(structure, resource, amount);
    if (response instanceof NeedMove) {
      return actor.moveTo(response.value.destination, response.value.range);
    }
    return response;
  },
};

const UnloadTask: ICreepTask = {
  name: CreepTask.Unload,
  do(actor: CreepActor, keep?: ResourceConstant[], store?: AnyStoreStructure) {
    let resource: ResourceConstant | undefined;
    for (const resKey in actor.creep.store) {
      const res = resKey as ResourceConstant;
      if (keep == undefined || keep.indexOf(res) === -1) {
        resource = res;
        break;
      }
    }
    if (resource == undefined) {
      return new Done();
    }
    return StoreTask.do(actor, resource, store);
  },
};

const RenewTask: ICreepTask = {
  name: CreepTask.Renew,
  do(actor: CreepActor, roomName: string) {
    if (actor.creep.room.name !== roomName) {
      const position = new Position(new RoomPosition(25, 25, roomName));
      return actor.moveTo(position, 24);
    }
    const response = actor.renew(roomName);
    if (response instanceof NeedMove) {
      return actor.moveTo(response.value.destination, response.value.range);
    }
    return response;
  },
};

export const Tasks = {
  [CreepTask.Build]: BuildTask,
  [CreepTask.GetEnergy]: GetEnergyTask,
  [CreepTask.Repair]: RepairTask,
  [CreepTask.MineSource]: MineSourceTask,
  [CreepTask.Upgrade]: UpgradeTask,
  [CreepTask.Store]: StoreTask,
  [CreepTask.Harvest]: HarvestTask,
  [CreepTask.AssertControl]: AssertControlTask,
  [CreepTask.Protect]: ProtectTask,
  [CreepTask.GetResource]: GetResourceTask,
  [CreepTask.Unload]: UnloadTask,
  [CreepTask.Renew]: RenewTask,
  [CreepTask.None]: undefined,
};
