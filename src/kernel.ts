import { info, warn, error, tick as logTick } from "./utils/logger";
import { ProcessTable } from "./processTable";
import {
	ProcessConstructor,
	ProcessName,
	IProcess,
	ProcessId,
	IMessage,
	MessageId,
	ForgetDeadCreeps,
	ManageRoom,
	deserializeProcess,
} from "./process";
import { Scheduler } from "./scheduler";

declare global {
	interface Memory {
		processes?: [ProcessId, string[]];
	}
}

export class Kernel {
	nextMessageId = 0;
	processTable = new ProcessTable();
	scheduler = new Scheduler(this.processTable);

	constructor() {
		info("Rebuilding kernel");
		global.kernel = this;

		const serializedProcesses = Memory.processes;
		if (serializedProcesses == null) {
			warn("Starting from scratch");
			this.spawnProcess(new ForgetDeadCreeps());

			for (const name in Game.rooms) {
				this.spawnProcess(new ManageRoom({ roomName: name }));
			}
			return;
		}

		info("Loading processes from Memory");
		this.processTable.nextId = serializedProcesses[0];
		serializedProcesses[1].map(deserializeProcess).forEach((process) => {
			if (process != null) {
				this.spawnProcess(process);
			}
		});
	}

	static init(): Kernel {
		return new Kernel();
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

		if (Game.time % 10 === 0) {
			info(`Serializing processes...`);
			this.serializeProcesses();
		}
	}

	getNextId(): ProcessId {
		return this.processTable.getNextId();
	}

	getNextMessageId(): MessageId {
		return this.nextMessageId++;
	}

	sendMessage(message: IMessage): void {
		const recipient = this.processTable.getProcess(message.to);
		if (recipient == null) {
			error(`Unable to send message to ${message.to}`);
			return;
		}

		recipient.receiveMessage(message);
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

	serializeProcesses(): void {
		const serialized = this.processTable
			.getAllProcesses()
			.map((process) => process.serialize());
		Memory.processes = [this.processTable.nextId, serialized];
	}
}

declare global {
	namespace NodeJS {
		interface Global {
			kernel: Kernel;
		}
	}
}
