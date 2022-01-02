import {
  InProgress,
  Done,
  NeedResource,
  NeedMove,
  NotFound,
  UnhandledScreepsReturn,
  Return,
} from "./returns";
import { CreepActor } from "./actor";
import { Position } from "classes/position";

export enum CreepTask {
  MineSource = "mine_source",
  GetEnergy = "get_energy",
  Build = "build",
  Repair = "repair",
  None = "none",
}

export interface ICreepTask {
  name: CreepTask;
  do: (creep: CreepActor, ...args: any[]) => Return;
}

const GetEnergyTask: ICreepTask = {
  name: CreepTask.GetEnergy,
  do(actor: CreepActor): InProgress | Done | NotFound | UnhandledScreepsReturn {
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

export const Tasks = {
  [CreepTask.Build]: BuildTask,
  [CreepTask.GetEnergy]: GetEnergyTask,
  [CreepTask.Repair]: RepairTask,
  [CreepTask.MineSource]: MineSourceTask,
  [CreepTask.None]: undefined,
};
