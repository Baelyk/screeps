import { Log } from "utils/log";
import { ScriptError } from "utils/errors";

export abstract class Job {
  static deserialize(serialized: string | undefined): Job | undefined {
    if (serialized == undefined || serialized == "") {
      return undefined;
    }
    if (serialized === "DummyJob") {
      return new DummyJob();
    }
    throw new ScriptError(`Unexpected job serialization "${serialized}"`);
  }

  abstract serialize(): string;
  abstract equals(other: Job): boolean;
}

export class DummyJob extends Job {
  serialize(): string {
    return `DummyJob`;
  }

  equals(other: Job): boolean {
    return other instanceof DummyJob;
  }
}

interface IJobEntry {
  job: Job;
  /** The names of creeps assigned to this job */
  creeps: string[];
}

class JobEntry implements IJobEntry {
  readonly job: Job;
  readonly creeps: string[];

  static deserialize(serialized: string): JobEntry | undefined {
    const [serJob, serCreeps] = serialized.split(":");
    const job = Job.deserialize(serJob);
    if (job == undefined) {
      return undefined;
    }
    const creeps = (serCreeps || "").split(",");
    return new JobEntry(job, creeps);
  }

  static equals(a: JobEntry, b: JobEntry): boolean {
    return a.job.equals(b.job);
  }

  constructor(job: Job, creeps: string[]) {
    this.job = job;
    this.creeps = creeps;
  }

  /**
   * Serialize a JobEntry as it's serialized Job, a `:`, then comma-separated
   * list of assigned creeps. E.g., `DummyJob:creep1,creep2`.
   */
  serialize(): string {
    return `${this.job.serialize()}:${this.creeps.join()}`;
  }

  equals(other: JobEntry | Job): boolean {
    if (other instanceof JobEntry) {
      other = other.job;
    }
    return this.job.equals(other);
  }
}

/**
 * A string in the form of serialized `JobEntry`s seperated by `;`s. Serialized
 * `JobEntry`s are the serialized `Job`, a `:`, then comma-separated creep names.
 */
export type JobsMemory = string;

export class JobManager {
  static parseMemory(memory: JobsMemory): JobEntry[] {
    return memory
      .split(";")
      .map(JobEntry.deserialize)
      .filter((entry): entry is JobEntry => entry != undefined);
  }

  static ensureValidMemory(memory: JobsMemory | undefined): JobsMemory {
    if (memory != undefined && typeof memory === "string") {
      return memory;
    }
    Log.warn(`Resetting jobs memory`);
    memory = "";
    return memory;
  }

  private readonly memoryPath: string;
  private jobs: JobEntry[];

  constructor(memoryPath: string) {
    this.memoryPath = memoryPath;
    this.jobs = JobManager.parseMemory(this.memory);
  }

  get memory(): JobsMemory {
    return (this.memoryPath
      .split(".")
      .reduce((prev, curr) => prev[curr], Memory) as unknown) as JobsMemory;
  }

  set memory(memory: JobsMemory) {
    const path = this.memoryPath.split(".");
    const tail = path.pop();
    if (tail == undefined) {
      throw new ScriptError(`Undefined tail on memory path ${this.memoryPath}`);
    }
    path.reduce((prev, curr) => prev[curr], Memory)[tail] = memory;
  }

  private newKey(): string {
    // https://stackoverflow.com/a/19964557
    const N = 5;
    const s = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array(N)
      .join()
      .split(",")
      .map(() => s.charAt(Math.floor(Math.random() * s.length)))
      .join("");
  }

  public add(job: Job): boolean {
    const sameJob = this.jobs.find((knownJob) => knownJob.equals(job));
    if (sameJob != undefined) {
      Log.warn(
        `Failed to add ${job.serialize()}: ${sameJob} ${sameJob.serialize()} ${JSON.stringify(
          sameJob,
        )}`,
      );
      return false;
    }
    const entry = new JobEntry(job, []);
    const serialized = entry.serialize();
    const prefix = this.jobs.length > 0 ? ";" : "";
    this.memory += `${prefix}${serialized}`;
    this.jobs.push(entry);
    return true;
  }

  public print(): void {
    Log.info(this.memory);
    Log.info(JSON.stringify(this.jobs));
  }
}
