import { info, error, tick as logTick } from "./utils/logger";
import { ProcessTable } from "./processTable";
import { IProcess, ProcessId, ForgetDeadCreeps, ManageRoom } from "./process";
import { Scheduler } from "./scheduler";

export class Kernel {
	processTable = new ProcessTable();
	scheduler = new Scheduler(this.processTable);

	constructor() {
		info("Rebuilding kernel");
	}

	static init(): Kernel {
		const kernel = new Kernel();
		global.kernel = kernel;

		kernel.spawnProcess(new ForgetDeadCreeps());

		for (const name in Game.rooms) {
			kernel.spawnProcess(new ManageRoom(name));
		}

		return kernel;
	}

	tick(): void {
		logTick();

		this.scheduler.update();

		while (true) {
			const process = this.scheduler.next();
			if (process == null) {
				info("All done");
				break;
			}

			try {
				info(`Running process ${process.display()}`);
				const { code } = process.run();
				if (code <= 0) {
					info(`Process ${process.display()} has stopped with ${code}`);
					this.stopProcess(process.id);
				}
			} catch (err) {
				error(`Error while running process:\n${err}`);
				this.stopProcess(process.id);
			}
		}
	}

	getNextId(): ProcessId {
		return this.processTable.getNextId();
	}

	spawnProcess(process: IProcess): ProcessId {
		const id = process.id < 0 ? this.getNextId() : process.id;
		process.id = id;
		this.processTable.addProcess(process);
		this.scheduler.addProcess(process);
		return id;
	}

	stopProcess(processId: ProcessId): void {
		this.processTable.removeProcess(processId);
	}

	hasProcess(id: ProcessId): boolean {
		return this.processTable.getProcess(id) != null;
	}
}

declare global {
	namespace NodeJS {
		interface Global {
			kernel: Kernel;
		}
	}
}
