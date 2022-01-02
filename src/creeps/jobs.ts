import { ScriptError, wrapper } from "utils/errors";
import { Position } from "classes/position";
import { ICreepTask, CreepTask, Tasks } from "./tasks";
import {
  Return,
  ReturnType,
  Ok,
  Done,
  NeedResource,
  NotFound,
  UnhandledScreepsReturn,
} from "./returns";
import { CreepActor } from "./actor";

abstract class CreepJob {
  abstract name: string;
  abstract tasks: ICreepTask[];
  abstract initialTask: CreepTask;
  abstract isCompleted(): boolean;
  abstract _do(actor: CreepActor, currentTask: CreepTask): void;

  do(actor: CreepActor, currentTask: CreepTask): boolean {
    if (!this.isCompleted()) {
      wrapper(
        () => this._do(actor, currentTask),
        `Creep ${actor.name} failed to perform ${this.name}/${currentTask}`,
      );
      return false;
    } else {
      return true;
    }
  }

  getValidTasks(): string[] {
    return this.tasks.map((task) => task.name);
  }

  isValidTask(task: CreepTask): boolean {
    return this.tasks.map((task) => task.name).includes(task);
  }

  getTask(taskName: CreepTask): ICreepTask | undefined {
    return this.tasks.find((task) => task.name === taskName);
  }
}

class BuildJob extends CreepJob {
  name = "build";
  tasks = [Tasks[CreepTask.GetEnergy], Tasks[CreepTask.Build]];
  initialTask = CreepTask.Build;

  position: Position;
  _site?: ConstructionSite;
  _siteType?: StructureConstant;
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

  get site() {
    if (this._site == undefined) {
      const site = this.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0];
      if (site == undefined) {
        throw new ScriptError(
          `Unable to find construction site at ${this.position.toString()}`,
        );
      }
      this._site = site;
    }
    return this._site;
  }

  get rampart() {
    if (this._rampart == undefined) {
      const rampart = this.pos
        .lookFor(LOOK_STRUCTURES)
        .find((s) => s.structureType === STRUCTURE_RAMPART);
      if (rampart != undefined && rampart.hits < RAMPART_DECAY_AMOUNT * 10) {
        // Site is now a built rampart that needs to be built up a bit
        this._rampart = rampart as StructureRampart;
      }
    }
    if (this._rampart == undefined) {
      throw new ScriptError(
        `No newly built rampart at ${this.position.toString()}`,
      );
    }
    return this._rampart;
  }

  get siteType() {
    if (this._siteType == undefined) {
      try {
        this._siteType = this.site.structureType;
      } catch (error) {
        if (this.rampart != undefined) {
          this._siteType = STRUCTURE_RAMPART;
        } else {
          throw new ScriptError(
            `No site/new rampart found at ${this.position.toString()}`,
          );
        }
      }
    }
    return this._siteType;
  }

  isCompleted(): boolean {
    try {
      if (this.site != undefined) {
        return false;
      } else {
        return true;
      }
    } catch (error) {
      // The site is built, incomplete if building a rampart
      try {
        return this.rampart == undefined;
      } catch (error) {
        // No site, no rampart, so all done
        return true;
      }
    }
  }

  _do(actor: CreepActor, currentTask: CreepTask): void {
    const task = this.getTask(currentTask);
    if (task == undefined) {
      return;
    }
    let response: Return;
    if (task.name === CreepTask.Build) {
      response = task.do(actor, this.site);
    } else {
      response = task.do(actor);
    }

    switch (response.type) {
      // Current task is in progress
      case ReturnType.Ok:
        break;
      // Current task has succesfully finished, switch back to primary task
      case ReturnType.Done: {
        if (currentTask !== this.initialTask) {
          this.do(actor, this.initialTask);
        }
        break;
      }
      // Current task needs a resource to continue
      case ReturnType.NeedResource: {
        if (response.value !== RESOURCE_ENERGY) {
          throw new Error(`Unable to retrieve resource ${response.value}`);
        }
        this.do(actor, CreepTask.GetEnergy);
        break;
      }
      default:
        throw new Error(`Unable to handle response ${response.toString()}`);
    }
  }
}
