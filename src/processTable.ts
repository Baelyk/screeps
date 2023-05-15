import { ProcessId, Process } from "./process";
import { ScriptError } from "./utils/errors";

export class ProcessTableError extends ScriptError {
  constructor(message: string) {
    let msg = `Process table error`;
    // If a message was supplied, add that to the end of the new message
    if (message != undefined) msg += "\n" + message;

    super(msg);
  }
}

export class ProcessTable {
  nextId = 0;
  processes: { [id: ProcessId]: Process } = {};

  getProcess(id: ProcessId): Process | undefined {
    return this.processes[id];
  }

  addProcess(process: Process): void {
    if (process.id in this.processes) {
      throw new Error("Process " + process.id + " already exists");
    }

    this.processes[process.id] = process;
  }

  removeProcess(id: ProcessId): boolean {
    return delete this.processes[id];
  }

  getNextId(): number {
    return this.nextId++;
  }

  getAllProcesses(): Process[] {
    const processArray = [];
    for (const id in this.processes) {
      const process = this.processes[id];
      processArray.push(process);
    }
    return processArray;
  }
}
