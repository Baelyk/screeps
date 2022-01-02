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

export enum CreepTask {
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

export const Tasks = {
  [CreepTask.Build]: BuildTask,
  [CreepTask.GetEnergy]: GetEnergyTask,
  [CreepTask.Repair]: RepairTask,
  [CreepTask.None]: undefined,
};
