import { info, errorConstant, warn, error } from "./../utils/logger";
import { IMessage, MessageId } from "./../messenger";
import {
	nextAvailableName,
	bodyFromSegments,
	haulerBody,
	countBodyPart,
} from "./../utils";
import { RequestVisualConnection } from "./../visuals/connection";
import * as Iterators from "./../utils/iterators";

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
			if (data[prop] instanceof Map) {
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
		warn(`Process ${this.display()} received unhandled message:\n${message}`);
	}

	run(): ProcessReturn {
		if (this.generator == null) {
			warn(`Process ${this.display()} has null generator`);
			return { code: ProcessReturnCode.Done };
		}

		const messages = global.kernel.pollMessages(this.id);
		if (messages != null) {
			for (const message of messages) {
				this.receiveMessage(message);
			}
		}

		const status = this.generator.next();
		return {
			code: status.done ? ProcessReturnCode.Done : ProcessReturnCode.OkContinue,
		};
	}
}

declare global {
	interface CreepMemory {
		process?: ProcessId;
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
			throw new Error(`Unable to get creep ${this.creepName}`);
		}
		return this._creep;
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

		if (this.room.memory.processes == null) {
			this.room.memory.processes = {};
		}
		this.room.memory.processes[this.name] = this.id;
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

	display(): string {
		return `${this.id} ${this.name} ${this.room.name}`;
	}
}

export function reassignCreep(
	creepName: string,
	processId: ProcessId,
): ProcessId | undefined {
	const oldId = Memory.creeps[creepName].process;
	info(`Reassigning ${creepName} from ${oldId || "none"} to ${processId}`);
	Memory.creeps[creepName].process = processId;
	return oldId;
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
	return new process(data);
}
