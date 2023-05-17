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
	Repairer = "Repairer",
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

	[Symbol.iterator](): Generator<Output, Output, Input> {
		if (this.generator == null) {
			throw new Error("Iterating through Generatorless Process");
		}
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

function reassignCreep(
	creepName: string,
	processId: ProcessId,
): ProcessId | undefined {
	const oldId = Memory.creeps[creepName].process;
	info(`Reassigning ${creepName} from ${oldId || "none"} to ${processId}`);
	Memory.creeps[creepName].process = processId;
	return oldId;
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

function* spawnCreep(
	room: Room,
	creepNameBase: string,
	body: BodyPartConstant[],
): Generator<void, string, never> {
	let response: ScreepsReturnCode | null = null;
	let creepName = null;
	while (response !== OK) {
		const spawn = room.find(FIND_MY_SPAWNS)[0];
		if (spawn == null) {
			throw new Error(`Unable to find spawn in room ${room.name}`);
		}

		if (spawn.spawning == null) {
			creepName = nextAvailableName(creepNameBase);
			response = spawn.spawnCreep(body, creepName);
			info(
				`Spawning ${creepNameBase} in ${
					room.name
				} with response ${errorConstant(response)}`,
			);
		}
		yield;
	}

	if (creepName == null) {
		throw new Error("Spawn error");
	}

	return creepName;
}

function* spawnHarvester(room: Room): Generator<void, void, never> {
	const creepName = yield* spawnCreep(room, "Harvester", [WORK, MOVE, CARRY]);
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
				reassignCreep(
					creep.name,
					global.kernel.spawnProcess(new Harvester(creep.name)),
				);
			}
		});

		yield;
	}
}

export class ManageRoom extends Process<void, never> {
	room: Room;

	constructor(roomName: string) {
		super(ProcessName.ManageRoom);
		this.generator = manageRoom.bind(this)();
		this.room = Game.rooms[roomName];

		if (this.room == null) {
			throw new Error("Room not visible");
		}

		// Initial stuff
		global.kernel.spawnProcess(new Construct(roomName));
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

function* builder(this: Builder) {
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
			const site = Game.getObjectById(this.siteId);
			if (site == null) {
				throw new Error("No site");
			}

			let response: ScreepsReturnCode = this.creep.build(site);
			if (response === ERR_NOT_IN_RANGE) {
				response = this.creep.moveTo(site);
			}

			yield;
		}
	}
}

export class Builder extends Process<void, never> {
	creepName: string;
	siteId: Id<ConstructionSite>;

	constructor(creepName: string, siteId: Id<ConstructionSite>) {
		super(ProcessName.Builder);
		this.generator = builder.bind(this)();
		this.creepName = creepName;
		this.siteId = siteId;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.creepName} ${this.siteId.slice(-4)}`;
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

function* repairer(this: Repairer) {
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
			const site = Game.getObjectById(this.siteId);
			if (site == null) {
				throw new Error("No site");
			} else if (site.hits === site.hitsMax) {
				warn(`Site ${this.siteId.slice(-4)} fully repaired`);
			}

			let response: ScreepsReturnCode = this.creep.repair(site);
			if (response === ERR_NOT_IN_RANGE) {
				response = this.creep.moveTo(site);
			}

			yield;
		}
	}
}

export class Repairer extends Process<void, never> {
	creepName: string;
	siteId: Id<Structure>;

	constructor(creepName: string, siteId: Id<Structure>) {
		super(ProcessName.Repairer);
		this.generator = repairer.bind(this)();
		this.creepName = creepName;
		this.siteId = siteId;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.creepName} ${this.siteId.slice(-4)}`;
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

export class Construct extends Process<void, never> {
	room: Room;
	builders: Map<string, Id<ConstructionSite> | undefined>;
	repairers: Map<string, Id<Structure> | undefined>;

	constructor(roomName: string) {
		super(ProcessName.Construct);
		this.generator = this._generator();
		this.room = Game.rooms[roomName];
		this.builders = new Map();
		this.repairers = new Map();
	}

	display(): string {
		return `${this.id} ${this.name} ${this.room.name}`;
	}

	*_generator(): Generator<void, void, never> {
		while (true) {
			if (!this.room.controller?.my) {
				info(`Not my room, stopping ${this.display()}`);
				return;
			}

			const sites = this.room.find(FIND_CONSTRUCTION_SITES);
			const repairs = this.room
				.find(FIND_STRUCTURES)
				.filter((s) => s.hits < s.hitsMax * 0.75);
			repairs.sort((a, b) => a.hits - b.hits);

			// If there are sites and *zero* repairer, wait on spawning a builder
			if (repairs.length > 0 && this.repairers.size === 0) {
				const repairer = yield* spawnCreep(this.room, "Repairer", [
					WORK,
					CARRY,
					MOVE,
				]);
				this.repairers.set(repairer, undefined);
				Memory.creeps[repairer].process = this.id;
			}

			// Manage repairs
			for (const [repairer, assignment] of this.repairers) {
				if (Game.creeps[repairer] == null) {
					this.repairers.delete(repairer);
					continue;
				}
				let site: Structure | null = null;
				// Get current assignment
				if (assignment != null) {
					site = Game.getObjectById(assignment);
					if (
						site != null &&
						site.hits > site.hitsMax * 0.8 &&
						repairs.length > 0
					) {
						site = repairs[0];
					}
				}
				// Find new assignment
				if (site == null && repairs.length > 0) {
					site = repairs[0];
				}
				this.repairers.set(repairer, site?.id);
				// Do something else
				if (site == null) {
					if (
						!global.kernel.hasProcess(Memory.creeps[repairer].process || -1)
					) {
						const oldProcessId = reassignCreep(
							repairer,
							global.kernel.spawnProcess(new Harvester(repairer)),
						);
						if (oldProcessId != null && oldProcessId !== this.id) {
							global.kernel.stopProcess(oldProcessId);
						}
					}
					continue;
				}

				if (site.id !== assignment) {
					const oldProcessId = reassignCreep(
						repairer,
						global.kernel.spawnProcess(new Repairer(repairer, site.id)),
					);
					if (oldProcessId != null && oldProcessId !== this.id) {
						global.kernel.stopProcess(oldProcessId);
					}
				}
			}

			// If there are sites and *zero* builders, wait on spawning a builder
			if (sites.length > 0 && this.builders.size === 0) {
				const builder = yield* spawnCreep(this.room, "Builder", [
					WORK,
					CARRY,
					MOVE,
				]);
				this.builders.set(builder, undefined);
				Memory.creeps[builder].process = this.id;
			}

			// Some future logic about spawning extra builders, idk
			//if (spawn.spawning == null && spawn.store[RESOURCE_ENERGY] > 200) {
			//global.kernel.spawnProcess(new SpawnBuilder(this.room));
			//}

			// Manage building projects
			for (const [builder, assignment] of this.builders) {
				if (Game.creeps[builder] == null) {
					this.builders.delete(builder);
					continue;
				}
				let site: ConstructionSite | null = null;
				// Get current assignment
				if (assignment != null) {
					site = Game.getObjectById(assignment);
				}
				// Find new assignment
				if (site == null && sites.length > 0) {
					site = sites[0];
				}
				this.builders.set(builder, site?.id);
				// Do something else
				if (site == null) {
					if (!global.kernel.hasProcess(Memory.creeps[builder].process || -1)) {
						const oldProcessId = reassignCreep(
							builder,
							global.kernel.spawnProcess(new Harvester(builder)),
						);
						if (oldProcessId != null && oldProcessId !== this.id) {
							global.kernel.stopProcess(oldProcessId);
						}
					}
					continue;
				}

				if (site.id !== assignment) {
					const oldProcessId = reassignCreep(
						builder,
						global.kernel.spawnProcess(new Builder(builder, site.id)),
					);
					if (oldProcessId != null && oldProcessId !== this.id) {
						global.kernel.stopProcess(oldProcessId);
					}
				}
			}

			yield;
		}
	}
}
