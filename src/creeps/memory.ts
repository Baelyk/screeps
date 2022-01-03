import { CreepTask } from "./tasks";

// Keep the generic CreepMemory in global
declare global {
  interface CreepMemory {
    task: CreepTask;
    room: string;
    /** Whether to prevent this creep from being renewed */
    noRenew?: boolean;
    /** Whether this creep should have attack notifications enabled */
    attackNotifications?: boolean;
  }
}

export class CreepInfo {
  creepName: string;
  memory: CreepMemory;

  constructor(creepName: string) {
    this.creepName = creepName;
    this.memory = Memory.creeps[creepName];
  }

  get task(): CreepTask {
    return this.memory.task || CreepTask.None;
  }

  set task(task: CreepTask) {
    this.memory.task = task;
  }

  get assignedRoomName(): string {
    return this.memory.room;
  }
}
