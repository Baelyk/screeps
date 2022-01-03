import { ScriptError, GetByIdError, wrapper } from "utils/errors";
import { Position } from "classes/position";
import { ICreepTask, CreepTask, Tasks, AssertControlType } from "./tasks";
import {
  Return,
  ReturnType,
  InProgress,
  Done,
  NeedResource,
  NoCapacity,
  NotFound,
  UnhandledScreepsReturn,
} from "./returns";
import { CreepActor } from "./actor";
import { RoomInfo, VisibleRoom } from "roomMemory";
import { LogisticsInfo, LogisticsRequest } from "logistics";

const enum CreepJob {
  Build = "build",
  MineSource = "mine_source",
  Repair = "repair",
  Upgrade = "upgrade",
  SupplySpawn = "supply_spawn",
  Harvest = "harvest",
  AssertControl = "assert_control",
  Protect = "protect",
  Logistics = "logistics",
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

class SupplySpawnJob extends Job {
  static jobName = CreepJob.SupplySpawn;
  name: string;
  initialTask = CreepTask.Store;

  roomInfo: VisibleRoom;
  _room?: Room;
  _structure?: StructureSpawn | StructureExtension;

  static deserialize(parts: string[]): SupplySpawnJob {
    const roomInfo = new VisibleRoom(parts[0]);
    return new SupplySpawnJob(roomInfo);
  }

  constructor(roomInfo: VisibleRoom) {
    super();
    this.name = SupplySpawnJob.jobName;

    this.roomInfo = roomInfo;
  }

  serialize(): string {
    return `${this.name},${this.roomInfo.name}`;
  }

  get room(): Room {
    if (this._room == undefined) {
      this._room = this.roomInfo.getRoom();
    }
    return this._room;
  }

  get structure(): StructureSpawn | StructureExtension {
    if (
      this._structure == undefined ||
      this._structure.store.getFreeCapacity(RESOURCE_ENERGY) === 0
    ) {
      // Erase existing structure (if it exists)
      this._structure == undefined;

      // TODO: This will be silly with multiple creeps performing this job
      const extension = this.roomInfo.getNextExtension();
      if (extension != undefined) {
        this._structure = extension;
        return this._structure;
      }
      // TODO: Support multiple spawns
      const spawn = this.roomInfo.getPrimarySpawn();
      if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) !== 0) {
        this._structure = spawn;
        return this._structure;
      }
    }

    if (this._structure == undefined) {
      throw new ScriptError(
        `Unable to find fillable extension/spawn in room ${this.roomInfo.name}`,
      );
    }

    return this._structure;
  }

  isCompleted(): boolean {
    return this.room.energyAvailable === this.room.energyCapacityAvailable;
  }

  _do(actor: CreepActor): void {
    const currentTask = actor.info.task;
    const task = this.getTask(currentTask);

    // Do the task
    let response: Return;
    if (task.name === CreepTask.Store) {
      response = task.do(actor, this.structure, RESOURCE_ENERGY);
    } else if (task.name === CreepTask.GetEnergy) {
      response = task.do(actor);
    } else {
      this.unexpectedTask(task.name);
      return;
    }

    // Respond to task outcome
    if (response instanceof InProgress) {
      return;
    } else if (response instanceof Done) {
      actor.info.task = CreepTask.Store;
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

class HarvestJob extends Job {
  static jobName = CreepJob.Harvest;
  name: string;
  initialTask = CreepTask.Harvest;

  position: Position;
  _target?: Source | Mineral | Deposit;

  static deserialize(parts: string[]): HarvestJob {
    const position = Position.fromSerialized(parts[0]);
    return new HarvestJob(position);
  }

  constructor(position: Position) {
    super();
    this.name = HarvestJob.jobName;

    this.position = position;
  }

  serialize(): string {
    return `${this.name},${this.position.toString()}`;
  }

  get target(): Source | Mineral | Deposit | undefined {
    if (Game.rooms[this.position.roomName] == undefined) {
      return undefined;
    }
    if (this._target == undefined) {
      const pos = this.position.intoRoomPosition();
      const target = pos
        .look()
        .map((x) => {
          if (x.type === LOOK_SOURCES) {
            return x.source;
          } else if (x.type === LOOK_MINERALS) {
            return x.mineral;
          } else if (x.type === LOOK_DEPOSITS) {
            return x.deposit;
          } else {
            return undefined;
          }
        })
        .find((x) => x != undefined);
      if (target == undefined) {
        throw new ScriptError(`No harvestable at ${this.position.toString()}`);
      }
      this._target = target;
    }
    return this._target;
  }

  isCompleted(): boolean {
    if (this.target != undefined) {
      if ((this.target as Source).energy === 0) {
        return true;
      } else if ((this.target as Mineral).mineralAmount === 0) {
        return true;
      }
    }
    // If target not visible, target is a deposit, or target still has
    // energy/mineral remaining, not complete
    return false;
  }

  _do(actor: CreepActor): void {
    const currentTask = actor.info.task;
    const task = this.getTask(currentTask);

    // Do the task
    let response: Return;
    if (task.name === CreepTask.Harvest) {
      response = task.do(actor, this.target, this.position.roomName);
    } else if (task.name === CreepTask.Store) {
      response = task.do(actor);
    } else {
      this.unexpectedTask(task.name);
      return;
    }

    // Respond to task outcome
    if (response instanceof InProgress) {
      if (task.name === CreepTask.Harvest && !actor.hasFreeCapacity()) {
        actor.info.task = CreepTask.Store;
        this.do(actor);
        return;
      } else if (task.name === CreepTask.Store && !actor.hasResource()) {
        actor.info.task = CreepTask.Harvest;
        this.do(actor);
        return;
      }
      return;
    } else {
      this.unexpectedResponse(task.name, response);
      return;
    }
  }
}

class AssertControlJob extends Job {
  static jobName = CreepJob.AssertControl;
  name: string;
  initialTask = CreepTask.AssertControl;

  roomName: string;
  type: AssertControlType;
  _controller?: StructureController;

  static deserialize(parts: string[]): AssertControlJob {
    return new AssertControlJob(parts[0], parts[1] as AssertControlType);
  }

  constructor(roomName: string, type: AssertControlType) {
    super();
    this.name = AssertControlJob.jobName;

    this.roomName = roomName;
    this.type = type;
  }

  serialize(): string {
    return `${this.name},${this.roomName},${this.type}`;
  }

  get controller(): StructureController | undefined {
    if (this._controller == undefined) {
      const room = Game.rooms[this.roomName];
      if (room == undefined) {
        return undefined;
      }
      const controller = room.controller;
      if (controller == undefined) {
        throw new ScriptError(
          `Cannot assert control of room ${this.roomName} lacking a controller`,
        );
      }
      this._controller = controller;
    }
    return this._controller;
  }

  isCompleted(): boolean {
    // Controller not visible yet
    if (this.controller == undefined) {
      return false;
    }
    if (this.type === AssertControlType.Claim) {
      return this.controller.my;
    } else if (this.type === AssertControlType.Attack) {
      return (
        this.controller.reservation == undefined ||
        this.controller.reservation.username != "Baelyk"
      );
    }
    // Never done reserving
    return false;
  }

  _do(actor: CreepActor): void {
    const currentTask = actor.info.task;
    const task = this.getTask(currentTask);

    if (task.name !== CreepTask.AssertControl) {
      this.unexpectedTask(task.name);
      return;
    }
    const response = task.do(actor, this.controller, this.roomName, this.type);
    if (response instanceof InProgress) {
      return;
    } else {
      this.unexpectedResponse(task.name, response);
      return;
    }
  }
}

class ProtectJob extends Job {
  static jobName = CreepJob.Protect;
  name: string;
  initialTask = CreepTask.Protect;

  protectee: CreepActor;

  static deserialize(parts: string[]): ProtectJob {
    const protectee = Game.creeps[parts[0]];
    if (protectee == undefined) {
      throw new ScriptError(`Creep ${parts[0]} doesn't exist`);
    }
    return new ProtectJob(new CreepActor(protectee));
  }

  constructor(protectee: CreepActor) {
    super();
    this.name = ProtectJob.jobName;

    this.protectee = protectee;
  }

  serialize(): string {
    return `${this.name},${this.protectee.name}`;
  }

  isCompleted(): boolean {
    // The protectee is still alive so we must protec
    return false;
  }

  _do(actor: CreepActor): void {
    const currentTask = actor.info.task;
    const task = this.getTask(currentTask);

    if (task.name !== CreepTask.Protect) {
      this.unexpectedTask(task.name);
      return;
    }
    const response = task.do(actor, this.protectee);
    if (response instanceof InProgress) {
      return;
    } else {
      this.unexpectedResponse(task.name, response);
      return;
    }
  }
}

class LogisticsJob extends Job {
  static jobName = CreepJob.Logistics;
  name: string;
  initialTask = CreepTask.GetResource;

  roomName: string;
  requestKey: string;
  request: LogisticsRequest;
  _source?: AnyStoreStructure;

  static deserialize(parts: string[]): LogisticsJob {
    return new LogisticsJob(parts[0], parts[1]);
  }

  constructor(roomName: string, requestKey: string) {
    super();
    this.name = LogisticsJob.jobName;

    this.roomName = roomName;
    this.requestKey = requestKey;
    const logistics = new LogisticsInfo(roomName);
    this.request = logistics.get(requestKey);
  }

  get source(): AnyStoreStructure {
    if (this._source == undefined) {
      this._source = this.request.getSource();
    }
    return this._source;
  }

  serialize(): string {
    return `${this.name},${this.roomName},${this.requestKey}`;
  }

  isCompleted(): boolean {
    return this.request.amount - this.source.store[this.request.resource] !== 0;
  }

  _do(actor: CreepActor): void {
    const currentTask = actor.info.task;
    const task = this.getTask(currentTask);

    const amount =
      this.request.amount - this.source.store[this.request.resource];

    if (amount === 0) {
      throw new ScriptError(`Unexpected satisfied request ${this.requestKey}`);
    }

    let response: Return;
    if (task.name === CreepTask.GetResource) {
      if (amount > 0) {
        // Get resource from the sink, if specified, otherwise the assigned
        // storage
        response = task.do(
          actor,
          this.request.resource,
          amount,
          this.request.getSink(),
        );
      } else {
        // Get resource from the source
        response = task.do(actor, this.request.resource, -amount, this.source);
      }
    } else if (task.name === CreepTask.Store) {
      if (amount > 0) {
        // Store the resource in the requesting structure
        response = task.do(
          actor,
          this.request.resource,
          this.request.getSource(),
          amount,
        );
      } else {
        // Store the resource in the sink if specified, or the assigned storage
        response = task.do(
          actor,
          this.request.resource,
          this.request.getSink(),
          amount,
        );
      }
    } else if (task.name === CreepTask.Unload) {
      // Unload extraneous resources
      response = task.do(actor, [this.request.resource]);
    } else {
      this.unexpectedTask(task.name);
      return;
    }

    if (response instanceof InProgress) {
      return;
    } else if (response instanceof NeedResource) {
      actor.info.task = CreepTask.GetResource;
      this.do(actor);
      return;
    } else if (response instanceof Done) {
      if (task.name === CreepTask.GetResource) {
        actor.info.task = CreepTask.Store;
      } else if (task.name === CreepTask.Unload) {
        actor.info.task = CreepTask.GetResource;
      } else {
        this.unexpectedResponse(task.name, response);
        return;
      }
      this.do(actor);
      return;
    } else if (response instanceof NoCapacity) {
      if (task.name === CreepTask.GetResource) {
        // Unload unnecessary resources
        actor.info.task = CreepTask.Unload;
        this.do(actor);
      } else {
        this.unexpectedResponse(task.name, response);
      }
      return;
    } else {
      this.unexpectedResponse(task.name, response);
      return;
    }
  }
}

const Jobs = {
  [CreepJob.Build]: BuildJob,
  [CreepJob.Repair]: RepairJob,
  [CreepJob.MineSource]: MineSourceJob,
  [CreepJob.Upgrade]: UpgradeJob,
  [CreepJob.SupplySpawn]: SupplySpawnJob,
  [CreepJob.Harvest]: HarvestJob,
  [CreepJob.AssertControl]: AssertControlJob,
  [CreepJob.Protect]: ProtectJob,
  [CreepJob.Logistics]: LogisticsJob,
};
