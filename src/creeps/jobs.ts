import { ScriptError, wrapper } from "utils/errors";
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

abstract class CreepJob {
  abstract name: string;
  abstract initialTask: CreepTask;
  abstract isCompleted(): boolean;
  abstract _do(actor: CreepActor): void;

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

class BuildJob extends CreepJob {
  name = "build";
  initialTask = CreepTask.Build;

  position: Position;
  _site?: ConstructionSite;
  _rampart?: StructureRampart;
  _pos?: RoomPosition;

  constructor(pos: string) {
    super();

    this.position = Position.fromSerialized(pos);
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
