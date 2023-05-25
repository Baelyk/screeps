import { info, warn, error, tick as logTick } from "./utils/logger";
import { wrapper } from "./utils/errors";
import { ProcessTable } from "./processTable";
import {
	IProcess,
	ProcessId,
	ForgetDeadCreeps,
	ManageRoom,
	deserializeProcess,
} from "./process";
import { IMessage, MessageId, Messenger } from "./messenger";
import { Scheduler } from "./scheduler";
import { Visualizer } from "./visuals/visualizer";

declare global {
	interface Memory {
		/** Next ProcessId, Serialized Messenger, Serialized Process Array */
		processes?: [ProcessId, string, string[]];
	}
}

export class Kernel {
	messenger: Messenger;
	processTable = new ProcessTable();
	scheduler = new Scheduler(this.processTable);

	constructor() {
		info("Rebuilding kernel");
		global.kernel = this;

		const serializedProcesses = Memory.processes;
		if (serializedProcesses == null) {
			warn("Starting from scratch");
			this.messenger = new Messenger({});
			this.spawnProcess(new ForgetDeadCreeps({}));

			for (const name in Game.rooms) {
				this.spawnProcess(new ManageRoom({ roomName: name }));
			}

			this.spawnProcess(new Visualizer({}));
			return;
		}

		info("Loading processes from Memory");
		this.processTable.nextId = serializedProcesses[0];
		this.messenger = Messenger.fromSerialized(serializedProcesses[1]);
		serializedProcesses[2].map(deserializeProcess).forEach((process) => {
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

			// Process was stopped this tick, after scheduler update
			if (!this.hasProcess(process.id)) {
				continue;
			}

			wrapper(
				() => {
					info(`Running process ${process.display()}`);
					const { code } = process.run();
					if (code <= 0) {
						info(`Process ${process.display()} has stopped with ${code}`);
						this.stopProcess(process.id);
					}
				},
				`Error running process ${process.display()}`,
				() => {
					this.stopProcess(process.id);
				},
			);
		}

		if (Game.time % 10 === 0) {
			info("Serializing processes...");
			this.serializeProcesses();
		}
	}

	getNextMessageId(): MessageId {
		return this.messenger.getNextMessageId();
	}

	pollMessages(recipient: ProcessId): IMessage[] | null {
		return this.messenger.poll(recipient);
	}

	sendMessage(message: IMessage): void {
		this.messenger.send(message);
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
		warn(`Stopping ${processId}`);
		this.processTable.removeProcess(processId);
	}

	hasProcess(id: ProcessId): boolean {
		return this.processTable.getProcess(id) != null;
	}

	serializeProcesses(): void {
		const serialized = this.processTable
			.getAllProcesses()
			.map((process) => process.serialize());
		Memory.processes = [
			this.processTable.nextId,
			this.messenger.serialize(),
			serialized,
		];
	}
}

declare global {
	namespace NodeJS {
		interface Global {
			kernel: Kernel;
		}
	}
}
