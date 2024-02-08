import { info, warn, error, tick as logTick, debug } from "./utils/logger";
import { wrapper } from "./utils/errors";
import { ProcessTable } from "./processTable";
import { IProcess, ProcessId, deserializeProcess } from "./process";
import { ForgetDeadCreeps } from "./misc";
import { ManageRoom } from "./rooms";
import { IMessage, IPublicMessage, MessageId, Messenger } from "./messenger";
import { Scheduler } from "./scheduler";
import { Visualizer } from "./visuals/visualizer";
import { Scouting } from "./scouting";

declare global {
	interface Memory {
		/** Next ProcessId, Serialized Messenger, Serialized Process Array */
		processes?: [ProcessId, string, string[]];
		processesBackup?: [ProcessId, string, string[]];
		/** Various settings useful for debugging and visualization */
		settings?: SettingsMemory;
	}
}

export class Kernel {
	bootTick = Game.time;
	messenger: Messenger;
	processTable = new ProcessTable();
	scheduler = new Scheduler(this.processTable);

	constructor() {
		info("Rebuilding kernel");
		global.kernel = this;

		const serializedProcesses = Memory.processes;
		if (serializedProcesses == null) {
			warn("Starting from scratch");

			if (Memory.rooms == null) {
				warn("Initialized rooms memory");
				Memory.rooms = {};
			}
			if (Memory.creeps == null) {
				warn("Initialized creeps memory");
				Memory.creeps = {};
			}

			this.messenger = new Messenger({});
			this.spawnProcess(new ForgetDeadCreeps({}));

			for (const name in Game.rooms) {
				this.spawnProcess(new ManageRoom({ roomName: name }));
			}

			this.spawnProcess(new Scouting({}));
			this.spawnProcess(new Visualizer({}));
			return;
		}

		info("Loading processes from Memory");
		this.processTable.nextId = serializedProcesses[0];
		this.messenger = Messenger.fromSerialized(serializedProcesses[1]);
		wrapper(
			() =>
				serializedProcesses[2].map(deserializeProcess).forEach((process) => {
					if (process != null) {
						this.spawnProcess(process);
					}
				}),
			"Error deserializing processes",
			() => {
				Memory.processesBackup = Memory.processes;
			},
		);

		// Ensure owned rooms have a ManageRoom
		for (const roomName in Game.rooms) {
			const room = Game.rooms[roomName];
			const processes = Memory.rooms[roomName]?.processes;
			if (room.controller == null || !room.controller.my || processes == null) {
				continue;
			}

			const manageRoomId = processes?.["ManageRoom"];
			if (!this.hasProcess(manageRoomId || -1)) {
				warn(`Spawning new ManageRoom for ${roomName}`);
				// Will recreate ManageRoom, kill other room processes for recreation
				for (const processName in processes) {
					const processId = processes[processName];
					this.stopProcess(processId || -1);
				}
				this.spawnProcess(new ManageRoom({ roomName }));
			}
		}
	}

	static init(): Kernel {
		return new Kernel();
	}

	tick(): void {
		const start = Game.cpu.getUsed();
		logTick();
		info(`${Game.time - this.bootTick} ticks since last restart`);

		this.scheduler.update();

		while (true) {
			const process = this.scheduler.next();
			if (process == null) {
				break;
			}

			// Process was stopped this tick, after scheduler update
			if (!this.hasProcess(process.id)) {
				continue;
			}

			let errorMessage: string;
			try {
				errorMessage = `Error running process ${process.display()}`;
			} catch (_) {
				errorMessage = "Error running process";
			}
			wrapper(
				() => {
					debug(`Running process ${process.display()}`);
					const { code } = process.run();
					if (code <= 0) {
						debug(`Process ${process.display()} has stopped with ${code}`);
						this.stopProcess(process.id);
					}
				},
				errorMessage,
				() => {
					this.stopProcess(process.id);
				},
			);
		}

		if (Game.time % 10 === 0) {
			info("Serializing processes...");
			this.serializeProcesses();
		}

		const elapsed = Game.cpu.getUsed() - start;
		info(`Used ${Math.floor(elapsed * 100) / 100} CPU`);
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

	removePublicMessage(messageId: MessageId): void {
		this.messenger.removePublicMessage(messageId);
	}

	getPublicMessages(): IPublicMessage[] {
		return this.messenger.getPublicMessages();
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
		const process = this.processTable.getProcess(processId);
		if (process == null) {
			warn("Received request to stop nonexistant process");
			return;
		}
		try {
			warn(`Stopping ${process.display()}`);
		} catch (error) {
			warn(`Stopping ${process.id}`);
		}
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
