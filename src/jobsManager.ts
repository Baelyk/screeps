import { RoomInfo } from "roomMemory";
import { CreepJob as CreepJobName, Jobs, Job } from "creeps/jobs";
import { Position } from "classes/position";
import { warn } from "utils/logger";

export class JobManager {
  roomName: string;
  roomInfo: RoomInfo;
  queue: JobQueue;

  constructor(roomName: string) {
    this.roomName = roomName;

    this.roomInfo = new RoomInfo(roomName);
    this.queue = this.roomInfo.getJobQueue();
    this.prune();
  }

  updateMemory(): void {
    this.roomInfo.updateJobQueue(this.queue);
  }

  static deserialize(serializedJob: string): Job {
    const parts = serializedJob.split(",");
    const name = parts.shift() as CreepJobName;
    return Jobs[name].deserialize(parts);
  }

  add(serializedJob: string): void {
    this.queue.push(serializedJob);
    this.updateMemory();
  }

  newBuildJob(position: Position): void {
    const job = new Jobs[CreepJobName.Build](position);
    this.add(job.serialize());
  }

  newRepairJob(structure: Structure): void {
    const job = new Jobs[CreepJobName.Repair](structure);
    this.add(job.serialize());
  }

  newLogisticsJob(requestKey: string): void {
    const job = new Jobs[CreepJobName.Logistics](this.roomName, requestKey);
    this.add(job.serialize());
  }

  prune(): void {
    // Remove completed or error-throwing jobs
    this.queue = this.queue.filter((serializedJob) => {
      try {
        const job = JobManager.deserialize(serializedJob);
        return !job.isCompleted();
      } catch (error) {
        warn(`Removing job ${serializedJob} due to error: ${error.toString()}`);
        return false;
      }
    });
    this.updateMemory();
  }

  getNext(avoid?: string[], jobTypes?: CreepJobName[]): Job | undefined {
    if (avoid == undefined && jobTypes == undefined) {
      return JobManager.deserialize(this.queue[0]);
    }
    const serializedJob = this.queue.find((serializedJob) => {
      // Make sur job not marked to avoid
      if (avoid != undefined && avoid.indexOf(serializedJob) !== -1) {
        return false;
      }
      // Make sure job is acceptable type
      if (
        jobTypes != undefined &&
        jobTypes.indexOf(serializedJob.split(",")[0] as CreepJobName) === -1
      ) {
        return false;
      }
      return true;
    });
    if (serializedJob == undefined) {
      return undefined;
    }
    return JobManager.deserialize(serializedJob);
  }
}
