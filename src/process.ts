import { info, errorConstant } from "./utils/logger";
import { nextAvailableName } from "./utils";

export interface Process {
  name: ProcessName;
  id: ProcessId;
  priority: number;
  run: () => boolean;
}

const enum ProcessName {
  ForgetDeadCreeps = "ForgetDeadCreeps",
  SpawnHarvester = "SpawnHarvester",
  ManageRoom = "ManageRoom",
  Harvester = "Harvester",
}

declare global {
  interface CreepMemory {
    process?: ProcessId;
  }
}

export type ProcessId = number;

export class ForgetDeadCreeps implements Process {
  name = ProcessName.ForgetDeadCreeps;
  id: ProcessId;
  priority = 0;

  constructor(id: ProcessId) {
    this.id = id;
  }

  run(): boolean {
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        info(`Deleting creep ${name} memory`);
        delete Memory.creeps[name];
      }
    }

    return false;
  }
}

export class SpawnHarvester implements Process {
  name = ProcessName.SpawnHarvester;
  id: ProcessId;
  priority = 0;

  room: Room;

  constructor(id: ProcessId, room: Room) {
    this.id = id;
    this.room = room;
  }

  run(): boolean {
    const spawn = this.room
      .find<StructureSpawn>(FIND_MY_STRUCTURES)
      .filter((s) => s.structureType === STRUCTURE_SPAWN)[0];
    if (spawn == undefined) {
      throw new Error(`Could not find a spawn in room ${this.room.name}`);
    }

    if (spawn.spawning == undefined) {
      const response = spawn.spawnCreep(
        [WORK, CARRY, MOVE],
        nextAvailableName("Harvester"),
      );
      info(
        `Spawning harvester in ${this.room.name} with response ${errorConstant(
          response,
        )}`,
      );
      return true;
    } else {
      return false;
    }
  }
}

export class ManageRoom implements Process {
  name = ProcessName.ManageRoom;
  id: ProcessId;
  priority = 1;

  room: Room;

  constructor(id: ProcessId, room: Room) {
    this.id = id;
    this.room = room;
  }

  run(): boolean {
    info(`Managing room ${this.room.name}`);
    const spawn = this.room
      .find<StructureSpawn>(FIND_MY_STRUCTURES)
      .filter((s) => s.structureType === STRUCTURE_SPAWN)[0];
    if (spawn == undefined) {
      throw new Error(`Could not find a spawn in room ${this.room.name}`);
    }

    if (spawn.spawning == undefined && spawn.store[RESOURCE_ENERGY] > 200) {
      global.kernel.spawnProcess(new SpawnHarvester(this.id, this.room));
    }

    const creeps = this.room.find(FIND_MY_CREEPS);
    creeps.forEach((creep) => {
      if (
        creep.memory.process == undefined ||
        !global.kernel.hasProcess(creep.memory.process)
      ) {
        creep.memory.process = global.kernel.spawnProcess(
          new Harvester(creep.name),
        );
      }
    });

    return false;
  }
}

declare const enum CreepTask {
  prepare = "prepare",
  execute = "execute",
}

export class Harvester implements Process {
  name = ProcessName.Harvester;
  id = -1;
  priority = 1;

  generator: Generator;

  _creepName: string;
  _creep?: Creep;
  _creepTick?: number;

  get creep(): Creep {
    if (this._creep == undefined || this._creepTick !== Game.time) {
      this._creep = Game.creeps[this._creepName];
      this._creepTick = Game.time;
    }
    if (this._creep == undefined) {
      throw new Error(`Unable to get creep ${this._creepName}`);
    }
    return this._creep;
  }

  constructor(creepName: string) {
    this._creepName = creepName;
    this.generator = this._generator();
  }

  *_generator(): Generator {
    while (true) {
      while (this.creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        const source = this.creep.pos.findClosestByPath(FIND_SOURCES);
        if (source == undefined) {
          throw new Error(`No source`);
        }

        let response: ScreepsReturnCode = this.creep.harvest(source);
        if (response === ERR_NOT_IN_RANGE) {
          response = this.creep.moveTo(source);
        }
        info(
          `Creep ${this.creep.name} harvesting with response ${errorConstant(
            response,
          )}`,
        );

        yield;
      }
      while (this.creep.store[RESOURCE_ENERGY] > 0) {
        const controller = this.creep.room.controller;
        if (controller == undefined) {
          throw new Error("No controller");
        }

        let response = this.creep.upgradeController(controller);
        if (response === ERR_NOT_IN_RANGE) {
          response = this.creep.moveTo(controller);
        }
        info(
          `Creep ${
            this.creep.name
          } upgrading controller with response ${errorConstant(response)}`,
        );

        yield;
      }
    }
  }

  run(): boolean {
    return this.generator.next().done || false;
  }
}
