import { Process } from "./process";
import { ProcessTable } from "./processTable";

export class Scheduler {
  processTable: ProcessTable;
  processes: Process[];

  constructor(processTable: ProcessTable) {
    this.processTable = processTable;
    this.processes = processTable.getAllProcesses();
  }

  update(): void {
    this.processes = this.processTable.getAllProcesses();
  }

  next(): Process | undefined {
    return this.processes.shift();
  }
}
