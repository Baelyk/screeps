import { CreepTask } from "./tasks";
import { CreepJob as CreepJobName, Jobs, Job } from "./jobs";
import { JobManager } from "jobsManager";

// Keep the generic CreepMemory in global
declare global {
  interface CreepMemory {
    task: CreepTask;
    role?: CreepRole;
    room: string;
    /** Whether to prevent this creep from being renewed */
    noRenew?: boolean;
    /** Whether this creep should have attack notifications enabled */
    attackNotifications?: boolean;
    job?: string;
  }

  const enum CreepRole {
    Scout = "scout",
    Guard = "guard",
    Hauler = "hauler",
    None = "none",
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

  get role(): CreepRole {
    return this.memory.role || CreepRole.None;
  }
  set role(role: CreepRole) {
    this.memory.role = role;
  }

  get assignedRoomName(): string {
    return this.memory.room;
  }

  get noRenew(): boolean {
    return this.memory.noRenew || false;
  }
  set noRenew(noRenew: boolean) {
    this.memory.noRenew = noRenew;
  }

  get attackNotifications(): boolean | undefined {
    return this.memory.attackNotifications;
  }
  set attackNotifications(attackNotifications: boolean | undefined) {
    this.memory.attackNotifications = attackNotifications;
  }

  _job: Job | undefined;
  get job(): Job | undefined {
    if (this._job == undefined) {
      const serialized = this.memory.job;
      if (serialized == undefined) {
        return undefined;
      }
      this._job = JobManager.deserialize(serialized);
    }
    return this._job;
  }
  set job(job: Job | undefined) {
    if (job == undefined) {
      delete this._job;
      delete this.memory.job;
      return;
    }
    this._job = job;
    this.memory.job = job.serialize();
  }
}
