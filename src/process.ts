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
	Economy = "Economy",
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

export class CreepProcess<Output, Input> extends Process<Output, Input> {
	creepName: string;

	constructor(name: ProcessName, creepName: string) {
		super(name);
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

export class RoomProcess<Output, Input> extends Process<Output, Input> {
	roomName: string;

	constructor(name: ProcessName, roomName: string) {
		super(name);
		this.roomName = roomName;
	}

	get room(): Room {
		const room = Game.rooms[this.roomName];
		if (room == null) {
			throw new Error("Room not visible");
		}

		return room;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.room.name}`;
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
					global.kernel.spawnProcess(new Tender(creep.name)),
				);
			}
		});

		yield;
	}
}

export class ManageRoom extends RoomProcess<void, never> {
	manageSpawnsId: ProcessId;
	constructId: ProcessId;

	spawnRequests: Map<MessageId, "harvester" | "tender" | "upgrader">;

	tenderName: string | null = null;
	upgraderName: string | null = null;

	constructor(roomName: string) {
		super(ProcessName.ManageRoom, roomName);
		this.generator = manageRoom.bind(this)();

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
		this.constructId = global.kernel.spawnProcess(
			new Economy(roomName, this.id, this.manageSpawnsId),
		);
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

function* getEnergy(this: { creep: Creep }, allowStorage = true) {
	while (this.creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
		const target = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
			filter: (s) =>
				((s.structureType === STRUCTURE_STORAGE && allowStorage) ||
					s.structureType === STRUCTURE_CONTAINER) &&
				s.store[RESOURCE_ENERGY] > 0,
		});
		if (target == null) {
			yield* harvest.bind(this)();
			return;
		}

		let response: ScreepsReturnCode = this.creep.withdraw(
			target,
			RESOURCE_ENERGY,
		);
		if (response === ERR_NOT_IN_RANGE) {
			response = this.creep.moveTo(target);
		}

		yield;
	}
}

function* harvest(this: { creep: Creep }) {
	while (this.creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
		const source = this.creep.pos.findClosestByPath(FIND_SOURCES, {
			filter: (source) => source.energy > 0,
		});
		if (source == null) {
			// Not sure what the best way to handle being unable to get energy is.
			yield;
			return;
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

export class Harvester extends CreepProcess<void, never> {
	constructor(creepName: string) {
		super(ProcessName.Harvester, creepName);
		this.generator = harvester.bind(this)();
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
		yield* getEnergy.bind(this)();
	}
}

export class Builder extends CreepProcess<void, never> {
	siteId: Id<ConstructionSite>;

	constructor(creepName: string, siteId: Id<ConstructionSite>) {
		super(ProcessName.Builder, creepName);
		this.generator = builder.bind(this)();
		this.siteId = siteId;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.creepName} ${this.siteId.slice(-4)}`;
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
		yield* getEnergy.bind(this)();
	}
}

export class Repairer extends CreepProcess<void, never> {
	siteId: Id<Structure>;

	constructor(creepName: string, siteId: Id<Structure>) {
		super(ProcessName.Repairer, creepName);
		this.generator = repairer.bind(this)();
		this.siteId = siteId;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.creepName} ${this.siteId.slice(-4)}`;
	}
}

export class Construct extends RoomProcess<void, never> {
	manageRoomId: ProcessId;
	manageSpawnsId: ProcessId;

	builders: Map<string, Id<ConstructionSite> | undefined>;
	repairers: Map<string, Id<Structure> | undefined>;
	spawnRequests: Map<MessageId, "builder" | "repairer">;

	constructor(
		roomName: string,
		manageRoomId: ProcessId,
		manageSpawnsId: ProcessId,
	) {
		super(ProcessName.Construct, roomName);
		this.generator = this._generator();
		this.manageRoomId = manageRoomId;
		this.manageSpawnsId = manageSpawnsId;

		this.builders = new Map();
		this.repairers = new Map();
		this.spawnRequests = new Map();
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
		yield* getEnergy.bind(this)(false);
		while (this.creep.store[RESOURCE_ENERGY] > 0) {
			let target =
				this.creep.room
					.find(FIND_MY_STRUCTURES)
					.filter(
						(s) =>
							(s.structureType === STRUCTURE_SPAWN ||
								s.structureType === STRUCTURE_EXTENSION) &&
							s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
					)[0] || this.creep.room.storage;
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

export class Tender extends CreepProcess<void, never> {
	constructor(creepName: string) {
		super(ProcessName.Tender, creepName);
		this.generator = tender.bind(this)();
		this.creepName = creepName;
	}
}

function* manageSpawns(this: ManageSpawns): Generator<void, void, never> {
	while (true) {
		while (this.queue.length === 0) {
			yield;
		}
		let response: ScreepsReturnCode | null = null;
		let spawnedName = null;
		let message = null;
		while (response !== OK) {
			const [creepName, body, queueMessage] = this.queue[0];
			message = queueMessage;

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
export class ManageSpawns extends RoomProcess<void, never> {
	roomName: string;

	queue: ManageSpawnsQueueItem[];

	constructor(roomName: string) {
		super(ProcessName.ManageSpawns, roomName);
		this.generator = manageSpawns.bind(this)();
		this.roomName = roomName;

		this.queue = [];

		if (this.room == null) {
			throw new Error("Room not visible");
		}
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
		yield* getEnergy.bind(this)();
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

export class Upgrader extends CreepProcess<void, never> {
	constructor(creepName: string) {
		super(ProcessName.Upgrader, creepName);
		this.generator = upgrader.bind(this)();
	}
}

class Economy extends RoomProcess<void, never> {
	manageRoomId: ProcessId;
	manageSpawnsId: ProcessId;

	sources: Map<Id<StructureContainer>, [Id<Source>, string | null]>;
	spawnRequests: Map<MessageId, Id<StructureContainer>>;

	constructor(
		roomName: string,
		manageRoomId: ProcessId,
		manageSpawnsId: ProcessId,
	) {
		super(ProcessName.Economy, roomName);
		this.generator = this.economy();
		this.manageRoomId = manageRoomId;
		this.manageSpawnsId = manageSpawnsId;

		this.sources = new Map();
		this.spawnRequests = new Map();
	}

	*economy() {
		while (true) {
			// Find source containers
			if (this.sources.size === 0 || Game.time % 100 === 0) {
				this.room
					.find(FIND_SOURCES)
					.map((source) => {
						const container = source.pos
							.findInRange(FIND_STRUCTURES, 1)
							.find((s) => s.structureType === STRUCTURE_CONTAINER) as
							| StructureContainer
							| undefined;
						return [source, container];
					})
					.filter(([_, c]) => c != null)
					.forEach(([s, c]) => {
						const sourceId = s!.id as Id<Source>;
						const container = c as StructureContainer;
						const oldSourceMiner = this.sources.get(container.id);
						const [oldSource, minerName] =
							oldSourceMiner != null ? oldSourceMiner : [null, null];
						if (oldSourceMiner != null && oldSource !== sourceId) {
							warn(
								`Sources ${oldSource} and ${sourceId} sharing container ${container.id}`,
							);
						}
						this.sources.set(container.id, [sourceId, minerName]);
					});
			}

			// Source mining
			for (const [containerId, [sourceId, minerName]] of this.sources) {
				const container = Game.getObjectById(containerId);
				if (container == null) {
					warn(`Missing container ${containerId}`);
					this.sources.delete(containerId);
					continue;
				}

				const miner = Game.creeps[minerName || ""];
				if (miner == null || minerName == null) {
					if (
						!Iterators.some(this.spawnRequests, ([_, v]) => v === containerId)
					) {
						this.requestSpawn("Miner", containerId);
					}
					continue;
				}

				if (!miner.pos.isEqualTo(container.pos)) {
					miner.moveTo(container.pos);
					continue;
				}

				// Mine the source or, if the source is empty, repair the container
				const source = Game.getObjectById(sourceId);
				if (source == null) {
					error(`Missing source for ${containerId}`);
					this.sources.delete(containerId);
					continue;
				}
				if (source.energy > 0 && container.store.getFreeCapacity() > 0) {
					const response = miner.harvest(source);
					if (response !== OK) {
						warn(`Miner harvesting with ${errorConstant(response)}`);
					}
					continue;
				}

				if (container.hits < container.hitsMax) {
					if (miner.store[RESOURCE_ENERGY] > 0) {
						miner.repair(container);
						continue;
					} else if (container.store[RESOURCE_ENERGY] > 0) {
						miner.withdraw(container, RESOURCE_ENERGY);
						continue;
					}
				}

				const pile = miner.pos
					.lookFor(LOOK_RESOURCES)
					.find((pile) => pile.resourceType === RESOURCE_ENERGY);
				if (pile != null) {
					if (miner.store.getFreeCapacity() > 0) {
						miner.pickup(pile);
						continue;
					} else if (container.store.getFreeCapacity() > 0) {
						miner.transfer(container, RESOURCE_ENERGY);
						continue;
					}
				}
			}

			yield;
		}
	}
	receiveMessage(message: IMessage): void {
		if (message instanceof CreepSpawned) {
			const containerId = this.spawnRequests.get(message.requestId);
			if (containerId == null) {
				warn(
					`Unexpectedly received message about unrequested creep: ${JSON.stringify(
						message,
					)}`,
				);
			}

			if (message.creepName == null) {
				warn(`Creep request ${message.requestId} went awry`);
			} else if (containerId != null) {
				const [sourceId] = this.sources.get(containerId) || [null];
				if (sourceId == null) {
					error(
						`Container ${containerId} doesn't have source for ${message.creepName}`,
					);
					return;
				}
				this.sources.set(containerId, [sourceId, message.creepName]);
				reassignCreep(message.creepName, this.id);
			}

			this.spawnRequests.delete(message.requestId);
		} else {
			super.receiveMessage(message);
		}
	}

	requestSpawn(creepName: string, containerId: Id<StructureContainer>): void {
		const request = new SpawnRequest(
			this.id,
			this.manageSpawnsId,
			creepName,
			this.minerBody(),
		);
		this.spawnRequests.set(request.id, containerId);
		global.kernel.sendMessage(request);
	}

	minerBody(): BodyPartConstant[] {
		let energy = this.room.energyCapacityAvailable;
		if (
			energy >
			BODYPART_COST[CARRY] + 4 * (BODYPART_COST[WORK] + BODYPART_COST[MOVE])
		) {
			// Enough energy to use segmented miner
			return ([CARRY] as BodyPartConstant[]).concat(
				bodyFromSegments([MOVE, WORK, WORK], energy - BODYPART_COST[CARRY]),
			);
		} else {
			// Prioritize work parts over move parts
			energy -= BODYPART_COST[MOVE] + BODYPART_COST[CARRY];
			const body: BodyPartConstant[] = [CARRY, MOVE];
			// The capacity minus the carry and move part cost divided by the work part cost
			const workParts = Math.min(7, Math.floor(energy / BODYPART_COST[WORK]));
			energy -= workParts * BODYPART_COST[WORK];
			const additionalMoves = Math.floor(energy / BODYPART_COST[MOVE]);
			info(
				`${this.room.energyCapacityAvailable} ${workParts} ${additionalMoves} ${energy}`,
			);
			for (let i = 0; i < additionalMoves; i++) {
				body.push(MOVE);
			}
			for (let i = 0; i < workParts; i++) {
				body.push(WORK);
			}
			return body;
		}
	}
}
