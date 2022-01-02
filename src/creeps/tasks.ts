import {
  Ok,
  Done,
  NeedResource,
  NeedMove,
  NotFound,
  UnhandledScreepsReturn,
} from "./returns";
import { CreepActor } from "./actor";

export enum CreepTask {
  GetEnergy = "get_energy",
  Build = "build",
}

export interface ICreepTask<T> {
  name: CreepTask;
  do: (creep: CreepActor, ...args: any[]) => T;
}

const GetEnergyTask: ICreepTask<
  Ok | Done | NotFound | UnhandledScreepsReturn
> = {
  name: CreepTask.GetEnergy,
  do(actor: CreepActor) {
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

const BuildTask: ICreepTask<Ok | NeedResource | UnhandledScreepsReturn> = {
  name: CreepTask.Build,
  do(actor: CreepActor, site: ConstructionSite) {
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

export const Tasks = {
  [CreepTask.Build]: BuildTask,
  [CreepTask.GetEnergy]: GetEnergyTask,
};
