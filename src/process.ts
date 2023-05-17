import { info, errorConstant, warn } from "./utils/logger";
import { nextAvailableName } from "./utils";

export type ProcessId = number;

export interface IProcess {
	name: ProcessName;
	id: ProcessId;
	priority: number;
	display: () => string;
	run: () => { code: ProcessReturnCode };
}

enum ProcessName {
	ForgetDeadCreeps = "ForgetDeadCreeps",
	SpawnHarvester = "SpawnHarvester",
	SpawnBuilder = "SpawnBuilder",
	ManageRoom = "ManageRoom",
	Harvester = "Harvester",
	PlanRoom = "PlanRoom",
	Builder = "Builder",
	Construct = "Construct",
}

enum ProcessReturnCode {
	Stop = -1,
	Done = 0,
	OkContinue = 1,
}

interface ProcessReturn<Output> {
	code: ProcessReturnCode;
	output?: Output;
}

class Process<Output, Input> implements IProcess {
	name: ProcessName;
	id: ProcessId;
	priority = 0;
	generator: Generator<Output, Output, Input> | undefined;

	constructor(
		name: ProcessName,
		generator?: Generator<Output, Output, Input>,
		display?: () => string,
	) {
		this.name = name;
		this.id = global.kernel.getNextId();
		this.generator = generator;

		if (display != null) {
			this.display = display;
		}
	}

	display(): string {
		return `${this.id} ${this.name}`;
	}

	[Symbol.iterator]() {
		return this.generator;
	}

	run(): ProcessReturn<Output> {
		if (this.generator == null) {
			return { code: ProcessReturnCode.Done };
		}

		const status = this.generator.next();
		return {
			code: status.done ? ProcessReturnCode.Done : ProcessReturnCode.OkContinue,
			output: status.value,
		};
	}
}

declare global {
	interface CreepMemory {
		process?: ProcessId;
	}
}

function* sleep(duration: number) {
	let ticks = duration;
	while (ticks > 0) {
		ticks--;
		yield;
	}
}

function* forgetDeadCreeps(): Generator<void, never, never> {
	while (true) {
		for (const name in Memory.creeps) {
			if (!(name in Game.creeps)) {
				info(`Deleting creep ${name} memory`);
				delete Memory.creeps[name];
			}
		}

		yield;
	}
}

export class ForgetDeadCreeps extends Process<void, never> {
	constructor() {
		super(ProcessName.ForgetDeadCreeps, forgetDeadCreeps());
	}
}

function* spawnHarvester(room: Room): Generator<void, void, never> {
	let response: ScreepsReturnCode | null = null;
	let creepName = null;
	while (response !== OK) {
		const spawn = room.find(FIND_MY_SPAWNS)[0];
		if (spawn == null) {
			throw new Error(`Unable to find spawn in room ${room.name}`);
		}

		if (spawn.spawning == null) {
			creepName = nextAvailableName("Harvester");
			response = spawn.spawnCreep([WORK, CARRY, MOVE], creepName);
			info(
				`Spawning harvester in ${room.name} with response ${errorConstant(
					response,
				)}`,
			);
		}
		yield;
	}

	if (creepName == null) {
		throw new Error("Spawn error");
	}
	const creep = Game.creeps[creepName];
	creep.memory.process = global.kernel.spawnProcess(new Harvester(creepName));
}

export class SpawnHarvester extends Process<void, never> {
	room: Room;

	constructor(room: Room) {
		super(ProcessName.SpawnHarvester, spawnHarvester(room));
		this.room = room;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.room.name}`;
	}
}

function* manageRoom(this: ManageRoom): Generator<void, void, never> {
	while (true) {
		info(`Managing room ${this.room.name}`);

		if (!this.room.controller?.my) {
			info(`Not my room, stopping ${this.display()}`);
			return;
		}

		const spawn = this.room
			.find<StructureSpawn>(FIND_MY_STRUCTURES)
			.filter((s) => s.structureType === STRUCTURE_SPAWN)[0];
		if (spawn == null) {
			throw new Error(`Could not find a spawn in room ${this.room.name}`);
		}

		//const sites = this.room.find(FIND_CONSTRUCTION_SITES);
		//if (
		//sites.length > 0 &&
		//spawn.spawning == null &&
		//spawn.store[RESOURCE_ENERGY] > 200
		//) {
		//global.kernel.spawnProcess(new SpawnBuilder(this.room));
		//}

		if (spawn.spawning == null && spawn.store[RESOURCE_ENERGY] > 200) {
			global.kernel.spawnProcess(new SpawnHarvester(this.room));
		}

		const creeps = this.room.find(FIND_MY_CREEPS);
		creeps.forEach((creep) => {
			if (
				creep.memory.process == null ||
				!global.kernel.hasProcess(creep.memory.process)
			) {
				warn(`Creating process for to ${creep.name}`);
				creep.memory.process = global.kernel.spawnProcess(
					new Harvester(creep.name),
				);
			}
		});

		yield;
	}
}

export class ManageRoom extends Process<void, never> {
	room: Room;

	constructor(room: Room) {
		super(ProcessName.ManageRoom);
		this.generator = manageRoom.bind(this)();
		this.room = room;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.room.name}`;
	}
}

function* harvester(this: Harvester) {
	while (true) {
		while (this.creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
			const source = this.creep.pos.findClosestByPath(FIND_SOURCES);
			if (source == null) {
				throw new Error("No source");
			}

			let response: ScreepsReturnCode = this.creep.harvest(source);
			if (response === ERR_NOT_IN_RANGE) {
				response = this.creep.moveTo(source);
			}

			yield;
		}
		while (this.creep.store[RESOURCE_ENERGY] > 0) {
			const controller = this.creep.room.controller;
			if (controller == null) {
				throw new Error("No controller");
			}

			let response = this.creep.upgradeController(controller);
			if (response === ERR_NOT_IN_RANGE) {
				response = this.creep.moveTo(controller);
			}

			yield;
		}
	}
}

export class Harvester extends Process<void, never> {
	creepName: string;

	constructor(creepName: string) {
		super(ProcessName.Harvester);
		this.generator = harvester.bind(this)();
		this.creepName = creepName;
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

////export class Construct implements Process {
////name = ProcessName.Construct;
////id = -1;
////priority = 1;

////room: Room;
////builders: string[];

////generator: Generator;

////constructor(room: Room) {
////this.room = room;
////this.builders = [];
////this.generator = this._generator();
////}

////display(): string {
////return `${this.id} ${this.name} ${this.room.name}`;
////}

///[>_generator(): Generator {
////if (!this.room.controller?.my) {
////info(`Not my room, stopping ${this.display()}`);
////return ProcessReturnCode.Stop;
////}

////const sites = this.room.find(FIND_CONSTRUCTION_SITES);

////// If there are sites and *zero* builders, wait on spawning a builder
////if (sites.length > 0 && this.builders.length === 0) {
////const spawnBuilderId = global.kernel.spawnProcess(
////new SpawnBuilder(this.room),
////);
////while (global.kernel.hasProcess(spawnBuilderId)) {
////yield;
////}
////}

////// Some future logic about spawning extra builders, idk
//////if (spawn.spawning == null && spawn.store[RESOURCE_ENERGY] > 200) {
//////global.kernel.spawnProcess(new SpawnBuilder(this.room));
//////}

////const creeps = this.room.find(FIND_MY_CREEPS);
////creeps.forEach((creep) => {
////if (
////creep.memory.process == null ||
////!global.kernel.hasProcess(creep.memory.process)
////) {
////creep.memory.process = global.kernel.spawnProcess(
////new Harvester(creep.name),
////);
////}
////});

////return ProcessReturnCode.OkContinue;
////}

////run(): ProcessReturnCode {
////this.generator.next();
////return ProcessReturnCode.OkContinue;
////}
////}
