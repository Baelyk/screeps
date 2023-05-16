import { info, errorConstant, warn } from "./utils/logger";
import { nextAvailableName } from "./utils";

export interface Process {
  name: ProcessName;
  id: ProcessId;
  priority: number;
  display: () => string;
  run: () => ProcessReturnCode;
}

const enum ProcessName {
  ForgetDeadCreeps = "ForgetDeadCreeps",
  SpawnHarvester = "SpawnHarvester",
  SpawnBuilder = "SpawnBuilder",
  ManageRoom = "ManageRoom",
  Harvester = "Harvester",
  PlanRoom = "PlanRoom",
  Builder = "Builder",
  Construct = "Construct",
}

const enum ProcessReturnCode {
  Stop = -1,
  Done = 0,
  OkContinue = 1,
}

declare global {
  interface CreepMemory {
    process?: ProcessId;
  }
}

export type ProcessId = number;

function* sleep(ticks: number) {
  while (ticks > 0) {
    ticks--;
    yield;
  }
}

export class ForgetDeadCreeps implements Process {
  name = ProcessName.ForgetDeadCreeps;
  id = -1;
  priority = 0;

  display(): string {
    return `${this.id} ${this.name}`;
  }

  run(): ProcessReturnCode {
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        info(`Deleting creep ${name} memory`);
        delete Memory.creeps[name];
      }
    }

    return ProcessReturnCode.OkContinue;
  }
}

export class SpawnHarvester implements Process {
  name = ProcessName.SpawnHarvester;
  id = -1;
  priority = 0;

  room: Room;

  generator: Generator;

  constructor(room: Room) {
    this.room = room;
    this.generator = this._generator();
    this._spawnId = null;
  }

  display(): string {
    return `${this.id} ${this.name} ${this.room.name}`;
  }

  _spawnId: Id<StructureSpawn> | null;
  _spawn?: StructureSpawn;
  _spawnTick?: number;

  get spawn(): StructureSpawn {
    if (this._spawn == undefined || this._spawnTick !== Game.time) {
      let spawn = null;
      if (this._spawnId != null) {
        spawn = Game.getObjectById(this._spawnId);
        if (spawn == undefined) {
          throw new Error(`Unable to get spawn ${this._spawnId}`);
        }
      } else {
        spawn = this.room
          .find<StructureSpawn>(FIND_MY_STRUCTURES)
          .filter((s) => s.structureType === STRUCTURE_SPAWN)[0];
        if (spawn == undefined) {
          throw new Error(`Could not find a spawn in room ${this.room.name}`);
        }
      }
      this._spawn = spawn;
      this._spawnTick = Game.time;
    }
    return this._spawn;
  }

  *_generator(): Generator {
    let response: ScreepsReturnCode | null = null;
    let creepName = null;
    while (response !== OK) {
      if (this.spawn.spawning == undefined) {
        creepName = nextAvailableName("Harvester");
        response = this.spawn.spawnCreep([WORK, CARRY, MOVE], creepName);
        info(
          `Spawning harvester in ${
            this.room.name
          } with response ${errorConstant(response)}`,
        );
      }
      yield;
    }

    if (creepName == undefined) {
      throw new Error(`Spawn error`);
    }
    const creep = Game.creeps[creepName];
    creep.memory.process = global.kernel.spawnProcess(new Harvester(creepName));
  }

  run(): ProcessReturnCode {
    const status = this.generator.next();
    info(`Spawning harvester with status ${JSON.stringify(status)}`);
    if (status.done) {
      return ProcessReturnCode.Done;
    }
    return ProcessReturnCode.OkContinue;
  }
}

export class ManageRoom implements Process {
  name = ProcessName.ManageRoom;
  id = -1;
  priority = 1;

  room: Room;

  constructor(room: Room) {
    this.room = room;
  }

  display(): string {
    return `${this.id} ${this.name} ${this.room.name}`;
  }

  run(): ProcessReturnCode {
    info(`Managing room ${this.room.name}`);

    if (!this.room.controller?.my) {
      info(`Not my room, stopping ${this.display()}`);
      return ProcessReturnCode.Stop;
    }

    const spawn = this.room
      .find<StructureSpawn>(FIND_MY_STRUCTURES)
      .filter((s) => s.structureType === STRUCTURE_SPAWN)[0];
    if (spawn == undefined) {
      throw new Error(`Could not find a spawn in room ${this.room.name}`);
    }

    //const sites = this.room.find(FIND_CONSTRUCTION_SITES);
    //if (
    //sites.length > 0 &&
    //spawn.spawning == undefined &&
    //spawn.store[RESOURCE_ENERGY] > 200
    //) {
    //global.kernel.spawnProcess(new SpawnBuilder(this.room));
    //}

    if (spawn.spawning == undefined && spawn.store[RESOURCE_ENERGY] > 200) {
      global.kernel.spawnProcess(new SpawnHarvester(this.room));
    }

    const creeps = this.room.find(FIND_MY_CREEPS);
    creeps.forEach((creep) => {
      if (
        creep.memory.process == undefined ||
        !global.kernel.hasProcess(creep.memory.process)
      ) {
        warn(`Creating process for to ${creep.name}`);
        creep.memory.process = global.kernel.spawnProcess(
          new Harvester(creep.name),
        );
      }
    });

    return ProcessReturnCode.OkContinue;
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

  display(): string {
    return `${this.id} ${this.name} ${this._creepName}`;
  }

  isValid(): boolean {
    return Game.creeps[this._creepName] != undefined;
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

        yield;
      }
    }
  }

  run(): ProcessReturnCode {
    if (!this.isValid()) {
      warn(`Creep ${this._creepName} no longer exists`);
      return ProcessReturnCode.Stop;
    }

    const status = this.generator.next();
    if (status.value != undefined) {
      return status.value;
    } else if (status.done) {
      throw new Error(
        `Process ${this.display()} generator unexpectedly done: ${status}`,
      );
    } else {
      return ProcessReturnCode.OkContinue;
    }
  }
}

class Builder implements Process {
  name = ProcessName.Builder;
  id = -1;
  priority = 0;

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

  display(): string {
    return `${this.id} ${this.name} ${this._creepName}`;
  }

  isValid(): boolean {
    return Game.creeps[this._creepName] != undefined;
  }

  *_generator(): Generator {
    let construction: ConstructionSite | null = null;
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

        yield;
      }
      while (this.creep.store[RESOURCE_ENERGY] > 0) {
        if (construction == undefined) {
          construction = this.creep.pos.findClosestByPath(
            FIND_CONSTRUCTION_SITES,
          );
        }
        if (construction == undefined) {
          throw new Error(`No construction site found`);
        }

        let response: ScreepsReturnCode = this.creep.build(construction);
        if (response === ERR_NOT_IN_RANGE) {
          response = this.creep.moveTo(construction);
        }

        yield;
      }
    }
  }

  run(): ProcessReturnCode {
    if (!this.isValid()) {
      warn(`Creep ${this._creepName} no longer exists`);
      return ProcessReturnCode.Stop;
    }

    const status = this.generator.next();
    if (status.value != undefined) {
      return status.value;
    } else if (status.done) {
      throw new Error(
        `Process ${this.display()} generator unexpectedly done: ${status}`,
      );
    } else {
      return ProcessReturnCode.OkContinue;
    }
  }
}

//export class Construct implements Process {
//name = ProcessName.Construct;
//id = -1;
//priority = 1;

//room: Room;
//builders: string[];

//constructor(room: Room) {
//this.room = room;
//this.builders = [];
//}

//display(): string {
//return `${this.id} ${this.name} ${this.room.name}`;
//}

//run(): ProcessReturnCode {
//if (!this.room.controller?.my) {
//info(`Not my room, stopping ${this.display()}`);
//return ProcessReturnCode.Stop;
//}

//const sites = this.room.find(FIND_CONSTRUCTION_SITES);

//if (this.sites > 0 && this.builders == 0) {
//global.kernel.spawnProcess(new SpawnBuilder(this.room));
//}

//if (spawn.spawning == undefined && spawn.store[RESOURCE_ENERGY] > 200) {
//global.kernel.spawnProcess(new SpawnHarvester(this.room));
//}

//const creeps = this.room.find(FIND_MY_CREEPS);
//creeps.forEach((creep) => {
//if (
//creep.memory.process == undefined ||
//!global.kernel.hasProcess(creep.memory.process)
//) {
//creep.memory.process = global.kernel.spawnProcess(
//new Harvester(creep.name),
//);
//}
//});

//return ProcessReturnCode.OkContinue;
//}
//}
