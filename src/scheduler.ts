import { IProcess } from "./process";
import { ProcessTable } from "./processTable";

export class Scheduler {
	processTable: ProcessTable;
	processes: IProcess[];

	constructor(processTable: ProcessTable) {
		this.processTable = processTable;
		this.processes = processTable.getAllProcesses();
	}

	update(): void {
		this.processes = this.processTable.getAllProcesses();
	}

	addProcess(process: IProcess): void {
		this.processes.push(process);
	}

	next(): IProcess | undefined {
		return this.processes.shift();
	}
}
