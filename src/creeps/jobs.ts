import { ScriptError, GetByIdError, wrapper } from "utils/errors";
import { Position } from "classes/position";
import { ICreepTask, CreepTask, Tasks } from "./tasks";
import {
  Return,
  ReturnType,
  InProgress,
  Done,
  NeedResource,
  NotFound,
  UnhandledScreepsReturn,
} from "./returns";
import { CreepActor } from "./actor";
import { RoomInfo } from "roomMemory";

const enum CreepJob {
  Build = "build",
  MineSource = "mine_source",
  Repair = "repair",
  Upgrade = "upgrade",
}

abstract class Job {
  abstract name: string;
  abstract initialTask: CreepTask;
  abstract isCompleted(): boolean;
  abstract _do(actor: CreepActor): void;
  abstract serialize(): string;

  do(actor: CreepActor): boolean {
    if (!this.isCompleted()) {
      wrapper(
        () => this._do(actor),
        `Creep ${actor.name} failed to perform ${this.name}`,
      );
      return false;
    } else {
      return true;
    }
  }

  getTask(taskName: CreepTask): ICreepTask {
    const task = Tasks[taskName];
    if (task == undefined) {
      throw new ScriptError(
        `Job ${this.name} encounted unexpected undefined task for ${taskName}`,
      );
    }
    return task;
  }

  unexpectedResponse(task: CreepTask, response: Return): void {
    throw new ScriptError(
      `Job ${this.name} encountered unexpected response ${response.toString} during task ${task}`,
    );
  }

  unexpectedTask(task: CreepTask): void {
    throw new ScriptError(
      `Job ${this.name} encountered unexpected task ${task}`,
    );
  }
}

class BuildJob extends Job {
  static jobName = CreepJob.Build;
  name: string;
  initialTask = CreepTask.Build;

  position: Position;
  _site?: ConstructionSite;
  _rampart?: StructureRampart;
  _pos?: RoomPosition;

  static deserialize(parts: string[]): BuildJob {
    const position = Position.fromSerialized(parts[0]);
    return new BuildJob(position);
  }

  constructor(position: Position) {
    super();
    this.name = BuildJob.jobName;

    this.position = new Position(position);
  }

  serialize(): string {
    return `${this.name},${this.position.toString()}`;
  }

  get pos() {
    if (this._pos == undefined) {
      this._pos = this.position.intoRoomPosition();
    }
    return this._pos;
  }

  get site(): ConstructionSite | undefined {
    if (this._site == undefined) {
      const site = this.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0] || undefined;
      this._site = site;
    }
    return this._site;
  }

  get rampart(): StructureRampart | undefined {
    // If the site still exists, the rampart definitely doesn't
    if (this.site != undefined) {
      return undefined;
    }

    if (this._rampart == undefined) {
      const rampart = this.pos
        .lookFor(LOOK_STRUCTURES)
        .find((s) => s.structureType === STRUCTURE_RAMPART);
      if (rampart != undefined && rampart.hits < RAMPART_DECAY_AMOUNT * 10) {
        // Site is now a built rampart that needs to be built up a bit
        this._rampart = rampart as StructureRampart;
      }
    }
    return this._rampart;
  }

  isCompleted(): boolean {
    return this.site == undefined && this.rampart == undefined;
  }

  _do(actor: CreepActor): void {
    const currentTask = actor.info.task;
    const task = this.getTask(currentTask);

    // Do the task
    let response: Return;
    if (task.name === CreepTask.Build) {
      if (this.site != undefined) {
        response = task.do(actor, this.site);
      } else if (this.rampart == undefined) {
        actor.info.task = CreepTask.Repair;
        this.do(actor);
        return;
      } else {
        // We should be done
        return;
      }
    } else if (task.name === CreepTask.GetEnergy) {
      response = task.do(actor);
    } else if (task.name === CreepTask.Repair) {
      response = task.do(actor, this.rampart);
    } else {
      this.unexpectedTask(task.name);
      return;
    }

    // Resond to the task outcome
    if (response instanceof InProgress) {
      return;
    } else if (response instanceof Done) {
      actor.info.task = CreepTask.Build;
      this.do(actor);
      return;
    } else if (response instanceof NeedResource) {
      if (response.value !== RESOURCE_ENERGY) {
        throw new ScriptError(`Unable to retrieve resource ${response.value}`);
      }
      actor.info.task = CreepTask.GetEnergy;
      this.do(actor);
      return;
    } else {
      this.unexpectedResponse(task.name, response);
      return;
    }
  }
}

class MineSourceJob extends Job {
  static jobName = CreepJob.MineSource;

  static deserialize(parts: string[]): MineSourceJob {
    const position = Position.fromSerialized(parts[0]);
    return new MineSourceJob(position);
  }

  name: string;
  initialTask = CreepTask.MineSource;

  position: Position;
  _pos?: RoomPosition;
  _source?: Source;
  _container?: StructureContainer;
  _link?: StructureLink;

  constructor(position: Position) {
    super();
    this.name = MineSourceJob.jobName;

    this.position = position;
  }

  serialize(): string {
    return `${this.name},${this.position.toString()}`;
  }

  get pos(): RoomPosition {
    if (this._pos == undefined) {
      this._pos = this.position.intoRoomPosition();
    }
    return this._pos;
  }

  get source(): Source {
    if (this._source == undefined) {
      const source = this.pos.findInRange(FIND_SOURCES, 1)[0];
      if (source == undefined) {
        throw new ScriptError(`No source near ${this.position.toString()}`);
      }
      this._source = source;
    }
    return this._source;
  }

  get container(): StructureContainer | undefined {
    if (this._container == undefined) {
      const container = this.pos
        .findInRange(FIND_STRUCTURES, 1)
        .find((s) => s.structureType === STRUCTURE_CONTAINER);
      if (container == undefined) {
        return undefined;
      }
      this._container = container as StructureContainer;
    }
    return this._container;
  }

  get link(): StructureLink | undefined {
    if (this._link == undefined) {
      const link = this.pos
        .findInRange(FIND_STRUCTURES, 1)
        .find((s) => s.structureType === STRUCTURE_LINK);
      if (link == undefined) {
        return undefined;
      }
      this._link = link as StructureLink;
    }
    return this._link;
  }

  isCompleted(): boolean {
    // Okay I could come up with some logic of if the source on cooldown and
    // there is no energy in the container/ground to put in the link then the
    // job is completed, but I'm not sure I see the use case?
    return false;
  }

  _do(actor: CreepActor): void {
    const currentTask = actor.info.task;
    const task = this.getTask(currentTask);

    if (task.name !== CreepTask.MineSource) {
      this.unexpectedTask(task.name);
      return;
    }
    const response = (task as typeof Tasks[CreepTask.MineSource]).do(
      actor,
      this.container,
      this.link,
    );

    if (response instanceof InProgress) {
      return;
    } else {
      this.unexpectedResponse(task.name, response);
      return;
    }
  }
}

class RepairJob extends Job {
  static jobName = CreepJob.Repair;
  name: string;
  initialTask = CreepTask.Repair;

  structure: Structure;

  static deserialize(parts: string[]): RepairJob {
    const structure = Game.getObjectById(parts[0]);
    if (structure == undefined) {
      throw new GetByIdError(parts[0]);
    } else if (
      (structure as { structureType?: StructureConstant }).structureType ==
      undefined
    ) {
      throw new ScriptError(
        `Expected structure not ${JSON.stringify(structure)}`,
      );
    }
    return new RepairJob(structure as Structure);
  }

  constructor(structure: Structure) {
    super();
    this.name = RepairJob.jobName;

    this.structure = structure;
  }

  serialize(): string {
    return `${this.name},${this.structure.id}`;
  }

  isCompleted(): boolean {
    return this.structure.hits === this.structure.hitsMax;
  }

  _do(actor: CreepActor): void {
    const currentTask = actor.info.task;
    const task = this.getTask(currentTask);

    // Do the task
    let response: Return;
    if (task.name === CreepTask.Repair) {
      response = (task as typeof Tasks[CreepTask.Repair]).do(
        actor,
        this.structure,
      );
    } else if (task.name === CreepTask.GetEnergy) {
      response = (task as typeof Tasks[CreepTask.GetEnergy]).do(actor);
    } else {
      this.unexpectedTask(task.name);
      return;
    }

    // Response to task outcome
    if (response instanceof InProgress) {
      return;
    } else if (response instanceof Done) {
      actor.info.task = CreepTask.Repair;
      this.do(actor);
      return;
    } else if (response instanceof NeedResource) {
      if (response.value !== RESOURCE_ENERGY) {
        throw new ScriptError(`Unable to retrieve resource ${response.value}`);
      }
      actor.info.task = CreepTask.GetEnergy;
      this.do(actor);
      return;
    } else {
      this.unexpectedResponse(task.name, response);
      return;
    }
  }
}

class UpgradeJob extends Job {
  static jobName = CreepJob.Upgrade;
  name: string;
  initialTask = CreepTask.Upgrade;

  roomInfo: RoomInfo;
  _room?: Room;
  _controller?: StructureController;

  static deserialize(parts: string[]): UpgradeJob {
    const roomInfo = new RoomInfo(parts[0]);
    return new UpgradeJob(roomInfo);
  }

  constructor(roomInfo: RoomInfo) {
    super();
    this.name = UpgradeJob.jobName;

    this.roomInfo = roomInfo;
  }

  serialize(): string {
    return `${this.name},${this.roomInfo.name}`;
  }

  get room() {
    if (this._room == undefined) {
      this._room = Game.rooms[this.roomInfo.name] || undefined;
    }
    return this._room;
  }

  get controller() {
    if (this.room == undefined) {
      return undefined;
    }
    if (this._controller == undefined) {
      this._controller = this.room.controller || undefined;
    }
    return this._controller;
  }

  isCompleted(): boolean {
    return this.controller == undefined || this.controller.level < 8;
  }

  _do(actor: CreepActor): void {
    const currentTask = actor.info.task;
    const task = this.getTask(currentTask);

    let response: Return;
    if (task.name === CreepTask.Upgrade) {
      response = (task as typeof Tasks[CreepTask.Upgrade]).do(
        actor,
        this.roomInfo,
        this.controller,
      );
    } else if (task.name === CreepTask.GetEnergy) {
      response = (task as typeof Tasks[CreepTask.GetEnergy]).do(actor);
    } else {
      this.unexpectedTask(task.name);
      return;
    }

    // Resond to the task outcome
    if (response instanceof InProgress) {
      return;
    } else if (response instanceof Done) {
      actor.info.task = CreepTask.Upgrade;
      this.do(actor);
      return;
    } else if (response instanceof NeedResource) {
      if (response.value !== RESOURCE_ENERGY) {
        throw new ScriptError(`Unable to retrieve resource ${response.value}`);
      }
      actor.info.task = CreepTask.GetEnergy;
      this.do(actor);
      return;
    } else {
      this.unexpectedResponse(task.name, response);
      return;
    }
  }
}

const Jobs = {
  [CreepJob.Build]: BuildJob,
  [CreepJob.Repair]: BuildJob,
  [CreepJob.MineSource]: MineSourceJob,
  [CreepJob.Upgrade]: UpgradeJob,
};
