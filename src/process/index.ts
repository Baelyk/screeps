import { info, warn, error, debug } from "./../utils/logger";
import { IMessage } from "./../messenger";
import { RequestVisualConnection } from "./../visuals/connection";
import { ScriptError, wrapper } from "utils/errors";

export type ProcessId = number;
export type ProcessName = string;
// rome-ignore lint/suspicious/noExplicitAny: Idk leave me alone
export type ProcessConstructor = new (data: any) => Process;

export const ProcessConstructors: Map<ProcessName, ProcessConstructor> =
	new Map();

export interface IProcess {
	name: ProcessName;
	id: ProcessId;
	display: () => string;
	receiveMessage: (message: IMessage) => void;
	serialize: () => string;
	run: () => { code: ProcessReturnCode };
}

enum ProcessReturnCode {
	Stop = -1,
	Done = 0,
	OkContinue = 1,
}

interface ProcessReturn {
	code: ProcessReturnCode;
}

// rome-ignore lint/suspicious/noExplicitAny: This is how TypeScript defines it
export type ProcessData<T extends abstract new (...args: any) => any> =
	ConstructorParameters<T>[0];

export abstract class Process implements IProcess {
	name: ProcessName;
	id: ProcessId;
	generator: Generator | undefined;

	serialize(): string {
		// Get the process' data
		// rome-ignore lint/suspicious/noExplicitAny: babes its a mess anyway
		const data: any = Object.assign({}, this);
		// Turn Maps into [key, value] tuple arrays
		for (const prop in data) {
			if (data[prop] instanceof Map || data[prop] instanceof Set) {
				data[prop] = Array.from(data[prop]);
			}
		}
		// Use JSON serialization
		return JSON.stringify(data);
	}

	constructor({
		name,
		id,
		generator,
	}: {
		name: ProcessName;
		id?: ProcessId;
		generator?: Generator;
	}) {
		this.name = name;
		this.id = id || global.kernel.getNextId();
		this.generator = generator;
	}

	display(): string {
		return `${this.id} ${this.name}`;
	}

	// TODO: Figure out how to type this wrt an instance's Generator without just
	// overriding this in the instance
	[Symbol.iterator](): Generator {
		if (this.generator == null) {
			throw new Error("Iterating through Generatorless Process");
		}
		return this.generator;
	}

	receiveMessage(message: IMessage): void {
		if (message instanceof RequestVisualConnection) {
			try {
				message.accept(this);
			} catch (err) {
				error(
					`Failed to accept RequestVisualConnection ${message.id} from ${message.from} to ${this.id}`,
				);
			}
			return;
		}
		this.warn(
			`Process ${this.display()} received unhandled message:\n${message}`,
		);
	}

	_initialized = false;
	init(): void { }

	errorHandler(error: Error): ProcessReturn {
		throw error;
	}

	run(): ProcessReturn {
		const start = Game.cpu.getUsed();
		if (!this._initialized) {
			this.init();
		}
		this._initialized = true;

		if (this.generator == null) {
			this.error(`Process ${this.display()} has null generator`);
			return { code: ProcessReturnCode.Done };
		}

		const messages = global.kernel.pollMessages(this.id);
		if (messages != null) {
			for (const message of messages) {
				this.receiveMessage(message);
			}
		}

		try {
			const status = this.generator.next();

			const elapsed = Game.cpu.getUsed() - start;
			if (elapsed >= 1) {
				this.warn(`Used ${Math.floor(elapsed * 100) / 100} CPU`);
			} else {
				this.debug(`Used ${Math.floor(elapsed * 100) / 100} CPU`);
			}

			return {
				code: status.done
					? ProcessReturnCode.Done
					: ProcessReturnCode.OkContinue,
			};
		} catch (err) {
			if (err instanceof Error) {
				return this.errorHandler(err);
			}
			throw err;
		}
	}

	// rome-ignore lint/suspicious/noExplicitAny: for logging
	info(msg: any): void {
		info(`[${this.display()}] ${msg}`);
	}

	// rome-ignore lint/suspicious/noExplicitAny: for logging
	debug(msg: any): void {
		debug(`[${this.display()}] ${msg}`);
	}

	// rome-ignore lint/suspicious/noExplicitAny: for logging
	warn(msg: any): void {
		warn(`[${this.display()}] ${msg}`);
	}

	// rome-ignore lint/suspicious/noExplicitAny: for logging
	error(msg: any): void {
		error(`[${this.display()}] ${msg}`);
	}
}

declare global {
	interface CreepMemory {
		process?: ProcessId;
	}
}

class CreepMissingError extends ScriptError {
	constructor(creepName: string, message?: string) {
		let msg = `Creep ${creepName} does not exist`;
		// If a message was supplied, add that to the end of the new message
		if (message != null) msg += "\n" + message;

		super(msg);
	}
}

export class CreepProcess extends Process {
	creepName: string;

	constructor(
		data: ProcessData<typeof Process> & {
			creepName: string;
		},
	) {
		super(data);
		this.creepName = data.creepName;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.creepName}`;
	}

	_creep?: Creep;
	_creepTick?: number;
	get creep(): Creep {
		if (this._creep == null || this._creepTick !== Game.time) {
			this._creep = Game.creeps[this.creepName];
			this._creepTick = Game.time;
		}
		if (this._creep == null) {
			throw new CreepMissingError(`${this.creepName}`, this.display());
		}
		return this._creep;
	}

	errorHandler(error: Error): ProcessReturn {
		if (error instanceof CreepMissingError) {
			this.warn(`Creep ${this.creepName} missing, stopping`);
			return { code: ProcessReturnCode.Done };
		}

		return super.errorHandler(error);
	}
}

declare global {
	interface RoomMemory {
		processes?: { [processName: string]: ProcessId | undefined };
	}
}

export class RoomProcess extends Process {
	roomName: string;

	constructor(
		data: ProcessData<typeof Process> & {
			roomName: string;
		},
	) {
		super(data);
		this.roomName = data.roomName;

		if (Memory.rooms == null) {
			Memory.rooms = {};
			this.warn("Initialized rooms memory");
		}

		// TODO: This seems silly
		const memory = Memory.rooms[this.roomName] ?? {};
		if (memory.processes == null) {
			memory.processes = {};
		}
		memory.processes[this.name] = this.id;
		Memory.rooms[this.roomName] = memory;
	}

	get room(): Room {
		const room = Game.rooms[this.roomName];
		if (room == null) {
			throw new Error("Room not visible");
		}

		return room;
	}

	_energyAvailable: number | null = 0;
	_energyAvailableTick: number | null = 0;
	get energyAvailable(): number {
		if (
			this._energyAvailable == null ||
			this._energyAvailableTick !== Game.time
		) {
			this._energyAvailableTick = Game.time;
			this._energyAvailable = this.room
				.find(FIND_STRUCTURES)
				.filter(
					(s) =>
						s.structureType === STRUCTURE_CONTAINER ||
						s.structureType === STRUCTURE_STORAGE,
				)
				.reduce(
					(energy, s) =>
						energy +
						(s as StructureContainer | StructureStorage).store[RESOURCE_ENERGY],
					0,
				);
		}
		return this._energyAvailable;
	}

	_energyCapacityAvailable: number | null = 0;
	_energyCapacityAvailableTick: number | null = 0;
	get energyCapacityAvailable(): number {
		if (
			this._energyCapacityAvailable == null ||
			this._energyCapacityAvailableTick !== Game.time
		) {
			this._energyCapacityAvailableTick = Game.time;
			this._energyCapacityAvailable = this.room
				.find(FIND_STRUCTURES)
				.filter(
					(s) =>
						s.structureType === STRUCTURE_CONTAINER ||
						s.structureType === STRUCTURE_STORAGE,
				)
				.reduce(
					(energyCapacity, s) =>
						energyCapacity +
						(s as StructureContainer | StructureStorage).store.getCapacity(
							RESOURCE_ENERGY,
						),
					0,
				);
		}
		return this._energyCapacityAvailable;
	}

	get isVisible(): boolean {
		return this.roomName in Game.rooms;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.roomName}`;
	}
}

export function reassignCreep(
	creepName: string,
	processId: ProcessId,
): ProcessId | undefined {
	return (
		wrapper(() => {
			const oldId = Memory.creeps[creepName].process;
			debug(`Reassigning ${creepName} from ${oldId || "none"} to ${processId}`);
			Memory.creeps[creepName].process = processId;
			return oldId;
		}, `Error reassign ${creepName} to ${processId}`) ?? undefined
	);
}

export function deserializeProcess(serialized: string): Process | undefined {
	const data = JSON.parse(serialized);
	const processName = data.name as ProcessName;
	const process = ProcessConstructors.get(processName);
	if (process == null) {
		error(
			`Unable to get Process constructor for Process ${processName} from serialization ${serialized}`,
		);
		return;
	}
	return (
		wrapper(
			() => new process(data),
			`Error deserializing Process ${data.id} ${data.name}`,
		) || undefined
	);
}
