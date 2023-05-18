import { info, errorConstant, warn, error } from "./utils/logger";
import { nextAvailableName, bodyFromSegments } from "./utils";
import * as Iterators from "./utils/iterators";

export type ProcessId = number;
export type MessageId = number;

export interface IProcess {
	name: ProcessName;
	id: ProcessId;
	priority: number;
	display: () => string;
	receiveMessage: (message: IMessage) => void;
	run: () => { code: ProcessReturnCode };
}

export interface IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;
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
	Tender = "Tender",
	ManageSpawns = "ManageSpawns",
	Upgrader = "Upgrader",
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

	receiveMessage(message: IMessage): void {
		warn(`Process ${this.display()} received unhandled message:\n${message}`);
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

function tendRoom(this: ManageRoom): void {
	if (Game.creeps[this.tenderName || ""] == null) {
		if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "tender")) {
			this.requestSpawn(
				"Tender",
				"tender",
				genericBody(Math.max(this.room.energyAvailable, 300)),
				true,
			);
		}
		return;
	}
}

function upgradeRoom(this: ManageRoom): void {
	if (Game.creeps[this.upgraderName || ""] == null) {
		if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "upgrader")) {
			this.requestSpawn("Upgrader", "upgrader");
		}
		return;
	}
}

function* manageRoom(this: ManageRoom): Generator<void, void, never> {
	while (true) {
		info(`Managing room ${this.room.name}`);

		if (!this.room.controller?.my) {
			info(`Not my room, stopping ${this.display()}`);
			return;
		}

		tendRoom.bind(this)();
		upgradeRoom.bind(this)();

		const spawn = this.room
			.find<StructureSpawn>(FIND_MY_STRUCTURES)
			.filter((s) => s.structureType === STRUCTURE_SPAWN)[0];
		if (spawn == null) {
			throw new Error(`Could not find a spawn in room ${this.room.name}`);
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
	roomName: string;

	manageSpawnsId: ProcessId;
	constructId: ProcessId;

	spawnRequests: Map<MessageId, "harvester" | "tender" | "upgrader">;

	tenderName: string | null = null;
	upgraderName: string | null = null;

	get room(): Room {
		const room = Game.rooms[this.roomName];
		if (room == null) {
			throw new Error("Room not visible");
		}

		return room;
	}

	constructor(roomName: string) {
		super(ProcessName.ManageRoom);
		this.generator = manageRoom.bind(this)();
		this.roomName = roomName;

		if (this.room == null) {
			throw new Error("Room not visible");
		}

		this.spawnRequests = new Map();

		// Initial stuff
		this.manageSpawnsId = global.kernel.spawnProcess(
			new ManageSpawns(roomName),
		);
		this.constructId = global.kernel.spawnProcess(
			new Construct(roomName, this.id, this.manageSpawnsId),
		);
	}

	display(): string {
		return `${this.id} ${this.name} ${this.room.name}`;
	}

	receiveMessage(message: IMessage): void {
		if (message instanceof CreepSpawned) {
			const role = this.spawnRequests.get(message.requestId);
			if (role == null) {
				warn(
					`Unexpectedly received message about unrequested creep: ${JSON.stringify(
						message,
					)}`,
				);
			}

			if (message.creepName == null) {
				warn(`Creep request ${message.requestId} went awry`);
			} else if (role === "harvester") {
				reassignCreep(
					message.creepName,
					global.kernel.spawnProcess(new Harvester(message.creepName)),
				);
			} else if (role === "tender") {
				this.tenderName = message.creepName;
				reassignCreep(
					message.creepName,
					global.kernel.spawnProcess(new Tender(message.creepName)),
				);
			} else if (role === "upgrader") {
				this.upgraderName = message.creepName;
				reassignCreep(
					message.creepName,
					global.kernel.spawnProcess(new Upgrader(message.creepName)),
				);
			}

			this.spawnRequests.delete(message.requestId);
		} else {
			super.receiveMessage(message);
		}
	}

	requestSpawn(
		creepName: string,
		role: "harvester" | "tender" | "upgrader",
		body?: BodyPartConstant[],
		important?: boolean,
	): void {
		const request = new SpawnRequest(
			this.id,
			this.manageSpawnsId,
			creepName,
			body,
			important,
		);
		this.spawnRequests.set(request.id, role);
		global.kernel.sendMessage(request);
	}
}

function* harvest(this: { creep: Creep }) {
	while (this.creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
		const source = this.creep.pos.findClosestByPath(FIND_SOURCES, {
			filter: (source) => source.energy > 0,
		});
		if (source == null) {
			throw new Error("No source");
		}

		let response: ScreepsReturnCode = this.creep.harvest(source);
		if (response === ERR_NOT_IN_RANGE) {
			response = this.creep.moveTo(source);
		}

		yield;
	}
}

function* harvester(this: Harvester) {
	while (true) {
		yield* harvest.bind(this)();
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
		yield* harvest.bind(this)();
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
		yield* harvest.bind(this)();
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
	roomName: string;

	manageRoomId: ProcessId;
	manageSpawnsId: ProcessId;

	builders: Map<string, Id<ConstructionSite> | undefined>;
	repairers: Map<string, Id<Structure> | undefined>;
	spawnRequests: Map<MessageId, "builder" | "repairer">;

	get room(): Room {
		const room = Game.rooms[this.roomName];
		if (room == null) {
			throw new Error("Room not visible");
		}

		return room;
	}

	constructor(
		roomName: string,
		manageRoomId: ProcessId,
		manageSpawnsId: ProcessId,
	) {
		super(ProcessName.Construct);
		this.generator = this._generator();
		this.roomName = roomName;
		this.manageRoomId = manageRoomId;
		this.manageSpawnsId = manageSpawnsId;

		this.builders = new Map();
		this.repairers = new Map();
		this.spawnRequests = new Map();
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

			const repairs = this.room
				.find(FIND_STRUCTURES)
				.filter((s) => s.hits < s.hitsMax * 0.75);
			repairs.sort((a, b) => a.hits - b.hits);

			// If there are sites and *zero* repairer, wait on spawning a builder
			if (repairs.length > 0 && this.repairers.size === 0) {
				if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "repairer")) {
					this.requestSpawn("Repairer", "repairer");
				}
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
				}
				// If site fully repaired, cancel this repair
				if (site != null && site.hits === site.hitsMax) {
					site = null;
					global.kernel.stopProcess(Memory.creeps[repairer].process || -1);
				}
				// Find new assignment
				if (
					site != null &&
					site.hits > site.hitsMax * 0.8 &&
					repairs.length > 0
				) {
					site = repairs[0];
				}
				if (site == null && repairs.length > 0) {
					site = repairs[0];
				}
				this.repairers.set(repairer, site?.id);
				// Do something else
				if (site == null) {
					if (
						!global.kernel.hasProcess(Memory.creeps[repairer].process || -1) ||
						Memory.creeps[repairer].process === this.id
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

			const sites = this.room.find(FIND_CONSTRUCTION_SITES);
			const energy = sites.reduce(
				(energy, site) => energy + site.progressTotal - site.progress,
				0,
			);
			// Source: I made it up
			const desiredBuilders = Math.max(1, Math.min(5, energy / 10000));
			// Spawn more builders if below desired number
			if (sites.length > 0 && this.builders.size < desiredBuilders) {
				if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "builder")) {
					this.requestSpawn("Builder", "builder");
				}
			}

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

	receiveMessage(message: IMessage): void {
		if (message instanceof CreepSpawned) {
			const role = this.spawnRequests.get(message.requestId);
			if (role == null) {
				warn(
					`Unexpectedly received message about unrequested creep: ${JSON.stringify(
						message,
					)}`,
				);
			}

			if (message.creepName == null) {
				warn(`Creep request ${message.requestId} went awry`);
			} else if (role === "repairer") {
				this.repairers.set(message.creepName, undefined);
				Memory.creeps[message.creepName].process = this.id;
			} else if (role === "builder") {
				this.builders.set(message.creepName, undefined);
				Memory.creeps[message.creepName].process = this.id;
			}

			this.spawnRequests.delete(message.requestId);
		} else {
			super.receiveMessage(message);
		}
	}

	requestSpawn(creepName: string, role: "builder" | "repairer"): void {
		const request = new SpawnRequest(this.id, this.manageSpawnsId, creepName);
		this.spawnRequests.set(request.id, role);
		global.kernel.sendMessage(request);
	}
}

function* tender(this: Tender) {
	while (true) {
		yield* harvest.bind(this)();
		while (this.creep.store[RESOURCE_ENERGY] > 0) {
			const target = this.creep.room
				.find(FIND_MY_STRUCTURES)
				.filter(
					(s) =>
						(s.structureType === STRUCTURE_SPAWN ||
							s.structureType === STRUCTURE_EXTENSION) &&
						s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
				)[0];
			if (target == null) {
				yield;
			}

			let response = this.creep.transfer(target, RESOURCE_ENERGY);
			if (response === ERR_NOT_IN_RANGE) {
				response = this.creep.moveTo(target);
			}

			yield;
		}
	}
}

export class Tender extends Process<void, never> {
	creepName: string;

	constructor(creepName: string) {
		super(ProcessName.Tender);
		this.generator = tender.bind(this)();
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

function* manageSpawns(this: ManageSpawns): Generator<void, void, never> {
	while (true) {
		while (this.queue.length === 0) {
			yield;
		}
		const [creepName, body, message] = this.queue[0];

		let response: ScreepsReturnCode | null = null;
		let spawnedName = null;
		while (response !== OK) {
			const spawn = this.room.find(FIND_MY_SPAWNS)[0];
			if (spawn == null) {
				throw new Error(`Unable to find spawn in room ${this.room.name}`);
			}

			if (spawn.spawning == null) {
				spawnedName = nextAvailableName(creepName);
				response = spawn.spawnCreep(body, spawnedName);
				info(
					`Spawning ${creepName} in ${
						this.room.name
					} with response ${errorConstant(response)}`,
				);
			}

			yield;
		}
		this.queue.shift();

		if (Game.creeps[spawnedName || ""] == null) {
			error(`Error spawning ${spawnedName}`);
		}

		if (message != null) {
			global.kernel.sendMessage(
				new CreepSpawned(this.id, message.from, spawnedName, message.id),
			);
		}
	}
}

function genericBody(energy: number): BodyPartConstant[] {
	info(`Generating generic body with ${energy} energy`);
	return bodyFromSegments([MOVE, WORK, CARRY], energy);
}

export class CreepSpawned implements IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;

	creepName: string | null;
	requestId: MessageId;

	constructor(
		from: ProcessId,
		to: ProcessId,
		creepName: string | null,
		requestId: MessageId,
	) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;

		this.creepName = creepName;
		this.requestId = requestId;
	}
}

export class SpawnRequest implements IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;

	creepName: string;
	body: BodyPartConstant[] | null;
	important: boolean;

	constructor(
		from: ProcessId,
		to: ProcessId,
		creepName: string,
		body?: BodyPartConstant[],
		important?: boolean,
	) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;

		this.creepName = creepName;
		this.body = body || null;
		this.important = important || false;
	}
}

type ManageSpawnsQueueItem = [
	string,
	BodyPartConstant[],
	{ id: MessageId; from: ProcessId } | null,
];
export class ManageSpawns extends Process<void, never> {
	roomName: string;

	queue: ManageSpawnsQueueItem[];

	get room(): Room {
		const room = Game.rooms[this.roomName];
		if (room == null) {
			throw new Error("Room not visible");
		}

		return room;
	}

	constructor(roomName: string) {
		super(ProcessName.ManageSpawns);
		this.generator = manageSpawns.bind(this)();
		this.roomName = roomName;

		this.queue = [];

		if (this.room == null) {
			throw new Error("Room not visible");
		}
	}

	display(): string {
		return `${this.id} ${this.name} ${this.room.name}`;
	}

	receiveMessage(message: IMessage): void {
		if (message instanceof SpawnRequest) {
			info(`Received spawn request ${JSON.stringify(message)}`);
			let body = message.body;
			if (body == null) {
				body = genericBody(this.room.energyCapacityAvailable);
			}
			if (message.important) {
				this.queue.unshift([message.creepName, body, message]);
			} else {
				this.queue.push([message.creepName, body, message]);
			}
		} else {
			super.receiveMessage(message);
		}
	}
}

function* upgrader(this: Upgrader) {
	while (true) {
		yield* harvest.bind(this)();
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

export class Upgrader extends Process<void, never> {
	creepName: string;

	constructor(creepName: string) {
		super(ProcessName.Upgrader);
		this.generator = upgrader.bind(this)();
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
