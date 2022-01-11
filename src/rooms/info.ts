import { profile } from "utils/profiler";
import { RoomPlanner, RoomPlanExecuter } from "./planner";
import { JobsMemory, JobManager } from "./jobs";

declare global {
  const enum RoomType {
    expansion = "expansion",
    primary = "primary",
    remote = "remote",
  }

  interface RoomMemory {
    planner?: RoomPlannerMemory;
    jobs?: JobsMemory;
  }
}

@profile
export class RoomInfo {
  name: string;
  // No non-normal rooms for now
  roomType = RoomType.primary;
  private memoryPath: string;

  constructor(name: string) {
    this.name = name;
    this.memoryPath = `rooms.${name}`;
  }

  _memory?: RoomMemory;
  private get memory(): RoomMemory {
    if (this._memory == undefined) {
      if (Memory.rooms == undefined) {
        Memory.rooms = {};
      }
      if (Memory.rooms[this.name] == undefined) {
        Memory.rooms[this.name] = {};
      }
      this._memory = Memory.rooms[this.name];
    }
    return this._memory;
  }

  _planner?: RoomPlannerMemory;
  get planner(): RoomPlannerMemory {
    if (this._planner == undefined) {
      if (this.memory.planner != undefined) {
        this._planner = this.memory.planner;
      } else {
        this._planner = new RoomPlanner(this.name, this.roomType).planRoom();
      }
    }
    return this._planner;
  }

  _jobs?: JobManager;
  public get jobs(): JobManager {
    if (this._jobs == undefined) {
      this._jobs = new JobManager(`${this.memoryPath}.jobs`);
    }
    return this._jobs;
  }
}
