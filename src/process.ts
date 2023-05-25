import { info, errorConstant, warn, error } from "./utils/logger";
import { IMessage, MessageId } from "./messenger";
import {
	nextAvailableName,
	bodyFromSegments,
	haulerBody,
	countBodyPart,
} from "./utils";
import { RequestVisualConnection } from "./visuals/connection";
import * as Iterators from "./utils/iterators";

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

export class ForgetDeadCreeps extends Process {
	constructor(data: Omit<ProcessData<typeof Process>, "name">) {
		super({
			name: "ForgetDeadCreeps",
			...data,
			generator: forgetDeadCreeps(),
		});
	}
}
ProcessConstructors.set("ForgetDeadCreeps", ForgetDeadCreeps);

function tendRoom(this: ManageRoom): void {
	// No tender needed if the room lacks a spawn
	const spawn = this.room
		.find<StructureSpawn>(FIND_MY_STRUCTURES)
		.filter((s) => s.structureType === STRUCTURE_SPAWN)[0];
	if (spawn == null) {
		warn(`Room ${this.roomName} lacks a spawn`);
		return;
	}

	if (Game.creeps[this.tenderName || ""] == null) {
		if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "tender")) {
			const energy = Math.max(this.room.energyAvailable, 300);
			let body: BodyPartConstant[];
			if (this.energyAvailable === 0 && this.room.energyAvailable <= 300) {
				body = genericBody(energy);
			} else {
				body = haulerBody(energy);
			}
			this.requestSpawn("Tender", "tender", body, true);
		}
		return;
	}
}

function upgradeRoom(this: ManageRoom): void {
	const controller = this.room.controller;
	if (controller == null) {
		return;
	}
	// Only upgrade when necessary
	if (
		controller.ticksToDowngrade >
		CONTROLLER_DOWNGRADE[controller.level] * 0.5
	) {
		return;
	}
	if (Game.creeps[this.upgraderName || ""] == null) {
		if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "upgrader")) {
			this.requestSpawn("Upgrader", "upgrader");
		}
		return;
	}
}

function expand(this: ManageRoom): void {
	if (this.expandId != null && !global.kernel.hasProcess(this.expandId)) {
		warn(`Pruning lost expand process ${this.expandId}`);
		this.expandId = null;
	}
	const ownedRooms = Object.values(Game.rooms).filter(
		(room) => room.controller?.my,
	).length;
	if (
		this.expandId == null &&
		ownedRooms < Game.gcl.level &&
		(this.room.controller?.level || 0) >= 6 &&
		(this.room.storage?.store[RESOURCE_ENERGY] || 0) > 100000
	) {
		info("Expanding!");
		this.expandId = global.kernel.spawnProcess(
			new Expand({
				roomName: this.roomName,
				manageRoomId: this.id,
				manageSpawnsId: this.manageSpawnsId,
			}),
		);
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
		expand.bind(this)();

		const creeps = this.room.find(FIND_MY_CREEPS);
		creeps.forEach((creep) => {
			if (
				creep.memory.process == null ||
				!global.kernel.hasProcess(creep.memory.process)
			) {
				if (creep.store.getCapacity(RESOURCE_ENERGY) == null) {
					warn(`Creep ${creep.name} unable to carry energy, has no process`);
				} else {
					warn(`Creating process for to ${creep.name}`);
					reassignCreep(
						creep.name,
						global.kernel.spawnProcess(new Tender({ creepName: creep.name })),
					);
				}
			}
		});

		yield;
	}
}

export class ManageRoom extends RoomProcess {
	manageSpawnsId: ProcessId;
	constructId: ProcessId;
	economyId: ProcessId;
	expandId: ProcessId | null;

	spawnRequests: Map<MessageId, "harvester" | "tender" | "upgrader">;

	tenderName: string | null;
	upgraderName: string | null;

	constructor(
		data: Omit<
			ProcessData<typeof RoomProcess> & {
				manageSpawnsId?: ProcessId;
				constructId?: ProcessId;
				economyId?: ProcessId;
				expandId?: ProcessId | null;
				spawnRequests?: Iterable<
					[MessageId, "harvester" | "tender" | "upgrader"]
				>;
				tenderName?: string | null;
				upgraderName?: string | null;
			},
			"name"
		>,
	) {
		super({ name: "ManageRoom", ...data });
		this.generator = manageRoom.bind(this)();

		if (this.room == null) {
			throw new Error("Room not visible");
		}

		this.spawnRequests = new Map(data.spawnRequests);
		this.tenderName = data.tenderName || null;
		this.upgraderName = data.upgraderName || null;

		this.manageSpawnsId =
			data.manageSpawnsId ||
			global.kernel.spawnProcess(new ManageSpawns({ roomName: this.roomName }));
		this.constructId =
			data.constructId ||
			global.kernel.spawnProcess(
				new Construct({
					roomName: this.roomName,
					manageRoomId: this.id,
					manageSpawnsId: this.manageSpawnsId,
				}),
			);
		this.economyId =
			data.economyId ||
			global.kernel.spawnProcess(
				new Economy({
					roomName: this.roomName,
					manageRoomId: this.id,
					manageSpawnsId: this.manageSpawnsId,
				}),
			);

		this.expandId = data.expandId || null;
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
					global.kernel.spawnProcess(
						new Harvester({ creepName: message.creepName }),
					),
				);
			} else if (role === "tender") {
				this.tenderName = message.creepName;
				reassignCreep(
					message.creepName,
					global.kernel.spawnProcess(
						new Tender({
							creepName: message.creepName,
							roomName: this.roomName,
						}),
					),
				);
			} else if (role === "upgrader") {
				this.upgraderName = message.creepName;
				reassignCreep(
					message.creepName,
					global.kernel.spawnProcess(
						new Upgrader({
							creepName: message.creepName,
							roomName: this.roomName,
						}),
					),
				);
			}

			this.spawnRequests.delete(message.requestId);
		} else if (message instanceof UpdateManageSpawnsId) {
			// Update this' manageSpawnsId
			this.manageSpawnsId =
				message.manageSpawnsId ||
				global.kernel.spawnProcess(
					new ManageSpawns({ roomName: this.roomName }),
				);
			info(`Updated spawn manager to ${this.manageSpawnsId}`);
			// Propogate to child processes
			const updateConstruct = new UpdateManageSpawnsId(
				this.id,
				this.constructId,
				this.manageSpawnsId,
			);
			global.kernel.sendMessage(updateConstruct);
			const updateEconomy = new UpdateManageSpawnsId(
				this.id,
				this.economyId,
				this.manageSpawnsId,
			);
			global.kernel.sendMessage(updateEconomy);
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
ProcessConstructors.set("ManageRoom", ManageRoom);

function* getEnergy(this: { creep: Creep }, allowStorage = true) {
	if (this.creep.store.getCapacity(RESOURCE_ENERGY) == null) {
		throw new Error(`Creep ${this.creep.name} unable to carry energy`);
	}
	while (this.creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
		const target = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
			filter: (s) =>
				((s.structureType === STRUCTURE_STORAGE && allowStorage) ||
					s.structureType === STRUCTURE_CONTAINER) &&
				s.store[RESOURCE_ENERGY] > 0,
		});
		if (target == null) {
			// If creep can harvest, do it. Otherwise, stop.
			if (countBodyPart(this.creep.body, WORK) > 0) {
				yield* harvest.bind(this)();
				return;
			}
			yield;
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
	if (countBodyPart(this.creep.body, WORK) === 0) {
		warn(`Creep ${this.creep.name} has no work parts, cannot harvest`);
		return;
	}
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

export class Harvester extends CreepProcess {
	constructor(data: Omit<ProcessData<typeof CreepProcess>, "name">) {
		super({ name: "Harvester", ...data });
		this.generator = harvester.bind(this)();
	}
}
ProcessConstructors.set("Harvester", Harvester);

function* builder(this: Builder) {
	while (true) {
		while (this.creep.store[RESOURCE_ENERGY] > 0) {
			const site = Game.getObjectById(this.siteId);
			if (site == null) {
				return;
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

export class Builder extends CreepProcess {
	siteId: Id<ConstructionSite>;

	constructor({
		siteId,
		...data
	}: Omit<ProcessData<typeof CreepProcess>, "name"> & {
		siteId: Id<ConstructionSite>;
	}) {
		super({ name: "Builder", ...data });
		this.generator = builder.bind(this)();
		this.siteId = siteId;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.creepName} ${this.siteId.slice(-4)}`;
	}
}
ProcessConstructors.set("Builder", Builder);

function* repairer(this: Repairer) {
	while (true) {
		while (this.creep.store[RESOURCE_ENERGY] > 0) {
			const site = Game.getObjectById(this.siteId);
			if (site == null) {
				throw new Error("No site");
			} else if (site.hits === site.hitsMax) {
				warn(`Site ${this.siteId.slice(-4)} fully repaired`);
				return;
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

export class Repairer extends CreepProcess {
	siteId: Id<Structure>;

	constructor({
		siteId,
		...data
	}: Omit<ProcessData<typeof CreepProcess>, "name"> & {
		siteId: Id<Structure>;
	}) {
		super({ name: "Repairer", ...data });
		this.generator = repairer.bind(this)();
		this.siteId = siteId;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.creepName} ${this.siteId.slice(-4)}`;
	}
}
ProcessConstructors.set("Repairer", Repairer);

export class Construct extends RoomProcess {
	manageRoomId: ProcessId;
	manageSpawnsId: ProcessId;

	builders: Map<string, [Id<ConstructionSite> | null, ProcessId | null]>;
	repairers: Map<string, [Id<Structure> | null, ProcessId | null]>;
	spawnRequests: Map<MessageId, "builder" | "repairer">;

	constructor({
		manageRoomId,
		manageSpawnsId,
		builders,
		repairers,
		spawnRequests,
		...data
	}: Omit<ProcessData<typeof RoomProcess>, "name"> & {
		manageRoomId: ProcessId;
		manageSpawnsId: ProcessId;
		builders?: Iterable<
			[string, [Id<ConstructionSite> | null, ProcessId | null]]
		>;
		repairers?: Iterable<[string, [Id<Structure> | null, ProcessId | null]]>;
		spawnRequests?: Iterable<[MessageId, "builder" | "repairer"]>;
	}) {
		super({ name: "Construct", ...data });
		this.generator = this._generator();
		this.manageRoomId = manageRoomId;
		this.manageSpawnsId = manageSpawnsId;

		this.builders = new Map(builders);
		this.repairers = new Map(repairers);
		this.spawnRequests = new Map(spawnRequests);
	}

	_repairables: AnyStructure[] | null = null;
	_repairablesTick: number | null = null;
	get repairables(): AnyStructure[] {
		if (this._repairables == null || this._repairablesTick !== Game.time) {
			this._repairablesTick = Game.time;
			this._repairables = this.room
				.find(FIND_STRUCTURES)
				.filter((s) => s.hits < s.hitsMax * 0.75);
			this._repairables.sort((a, b) => a.hits - b.hits);
		}
		return this._repairables;
	}

	*_generator(): Generator<void, void, never> {
		while (true) {
			if (!this.room.controller?.my) {
				info(`Not my room, stopping ${this.display()}`);
				return;
			}

			const urgentRepairs = this.repairables.filter(
				(s) => s.hits < s.hitsMax * 0.25,
			);
			urgentRepairs.sort((a, b) => a.hits - b.hits);
			const repairHits = this.repairables.reduce(
				(hits, s) => hits + s.hitsMax - s.hits,
				0,
			);

			// If there are sites and *zero* repairer, wait on spawning a builder
			if (
				this.repairers.size === 0 &&
				// Assume repairs actually repair for half their life, and repair with
				// 10 WORK parts
				(urgentRepairs.length > 0 ||
					repairHits > (CREEP_LIFE_TIME / 2) * REPAIR_POWER * 10)
			) {
				if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "repairer")) {
					this.requestSpawn("Repairer", "repairer");
				}
			}

			// Manage repairs
			for (let [repairerName, [siteId, processId]] of this.repairers) {
				const repairer = Game.creeps[repairerName || ""];
				if (repairer == null) {
					this.repairers.delete(repairerName);
					continue;
				}
				let site: Structure | null = null;
				// Get current assignment
				if (siteId != null) {
					site = Game.getObjectById(siteId);
				}
				// If site fully repaired, cancel this repair
				if (site != null && site.hits === site.hitsMax) {
					site = null;
					global.kernel.stopProcess(processId || -1);
				}
				// Find new assignment, either targeting the lowest hit point urgent
				// repair, or the closest repairable
				if (site == null || site.hits > site.hitsMax * 0.8) {
					site = urgentRepairs[0];
				}
				if (site == null) {
					site = repairer.pos.findClosestByPath(this.repairables);
				}
				// Repair found site
				if (site != null) {
					// This is a new site
					if (site.id !== siteId) {
						if (processId != null) {
							global.kernel.stopProcess(processId);
						}
						processId = global.kernel.spawnProcess(
							new Repairer({ creepName: repairerName, siteId: site.id }),
						);
						this.repairers.set(repairerName, [site.id, processId]);
					}
					continue;
				}

				// No site found, do something else (upgrade)
				if (this.room.controller == null || !this.room.controller.my) {
					warn(`Creep ${repairerName} has nothing to construct or upgrade`);
					this.repairers.set(repairerName, [null, null]);
					continue;
				}
				if (!global.kernel.hasProcess(processId || -1)) {
					if (processId != null) {
						global.kernel.stopProcess(processId);
					}
					processId = global.kernel.spawnProcess(
						new Upgrader({ creepName: repairerName }),
					);
					this.repairers.set(repairerName, [null, processId]);
				}
			}

			const sites = this.room.find(FIND_CONSTRUCTION_SITES);
			const energy = sites.reduce(
				(energy, site) => energy + site.progressTotal - site.progress,
				0,
			);
			// Source: I made it up
			const desiredBuilders = Math.max(1, Math.min(3, energy / 50000));
			// Spawn more builders if below desired number
			if (sites.length > 0 && this.builders.size < desiredBuilders) {
				if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "builder")) {
					this.requestSpawn("Builder", "builder");
				}
			}

			// Manage building projects
			for (let [builderName, [siteId, processId]] of this.builders) {
				const builder = Game.creeps[builderName];
				if (builder == null) {
					this.builders.delete(builderName);
					continue;
				}
				let site: ConstructionSite | null = null;
				// Get current assignment
				if (siteId != null) {
					site = Game.getObjectById(siteId);
				}
				// Find new assignment
				if (site == null && sites.length > 0) {
					site = sites[0];
				}
				// Repair found site
				if (site != null) {
					// This is a new site
					if (site.id !== siteId) {
						if (processId != null) {
							global.kernel.stopProcess(processId);
						}
						processId = global.kernel.spawnProcess(
							new Builder({ creepName: builderName, siteId: site.id }),
						);
						this.builders.set(builderName, [site.id, processId]);
					}
					continue;
				}

				// No site found, do something else (upgrade)
				if (this.room.controller == null || !this.room.controller.my) {
					warn(`Creep ${builderName} has nothing to construct or upgrade`);
					this.repairers.set(builderName, [null, null]);
					continue;
				}
				if (!global.kernel.hasProcess(processId || -1)) {
					if (processId != null) {
						global.kernel.stopProcess(processId);
					}
					processId = global.kernel.spawnProcess(
						new Upgrader({ creepName: builderName }),
					);
					this.builders.set(builderName, [null, processId]);
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
				this.repairers.set(message.creepName, [null, null]);
				Memory.creeps[message.creepName].process = this.id;
			} else if (role === "builder") {
				this.builders.set(message.creepName, [null, null]);
				Memory.creeps[message.creepName].process = this.id;
			}

			this.spawnRequests.delete(message.requestId);
		} else if (message instanceof UpdateManageSpawnsId) {
			if (message.manageSpawnsId == null) {
				error(
					"Received message to recreate ManageSpawns, but is not ManageRoom",
				);
				return;
			}
			// Update this' manageSpawnsId
			this.manageSpawnsId = message.manageSpawnsId;
			info(`Updated spawn manager to ${this.manageSpawnsId}`);
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
ProcessConstructors.set("Construct", Construct);

function* tender(this: Tender, roomName?: string) {
	if (roomName != null) {
		yield* moveToRoom.bind(this)(roomName);
	}
	let allowTakeFromStorage = true;
	while (true) {
		yield* getEnergy.bind(this)(allowTakeFromStorage);
		while (this.creep.store[RESOURCE_ENERGY] > 0) {
			const primaryTargets = this.creep.room
				.find(FIND_MY_STRUCTURES)
				.filter(
					(s) =>
						(s.structureType === STRUCTURE_SPAWN ||
							s.structureType === STRUCTURE_EXTENSION) &&
						s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
				);
			let target = this.creep.pos.findClosestByPath(primaryTargets);
			if (target == null) {
				const secondaryTargets = this.creep.room
					.find(FIND_MY_STRUCTURES)
					.filter(
						(s) =>
							(s.structureType === STRUCTURE_TOWER ||
								s.structureType === STRUCTURE_STORAGE) &&
							s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
					);
				target = this.creep.pos.findClosestByPath(secondaryTargets);
			}
			if (target == null) {
				yield;
				continue;
			}
			allowTakeFromStorage = target.structureType !== STRUCTURE_STORAGE;

			let response = this.creep.transfer(target, RESOURCE_ENERGY);
			if (response === ERR_NOT_IN_RANGE) {
				response = this.creep.moveTo(target);
			}

			yield;
		}
	}
}

export class Tender extends CreepProcess {
	roomName: string | null;
	constructor({
		roomName,
		...data
	}: Omit<ProcessData<typeof CreepProcess>, "name"> & { roomName?: string }) {
		super({ name: "Tender", ...data });
		this.roomName = roomName || null;
		this.generator = tender.bind(this)(roomName);
	}
}
ProcessConstructors.set("Tender", Tender);

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
	body: BodyPartConstant[] | ((energy: number) => BodyPartConstant[]) | null;
	important: boolean;

	constructor(
		from: ProcessId,
		to: ProcessId,
		creepName: string,
		body?: BodyPartConstant[] | ((energy: number) => BodyPartConstant[]),
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
export class ManageSpawns extends RoomProcess {
	queue: ManageSpawnsQueueItem[];

	constructor({
		queue,
		...data
	}: Omit<ProcessData<typeof RoomProcess>, "name"> & {
		queue?: ManageSpawnsQueueItem[];
	}) {
		super({ name: "ManageSpawns", ...data });
		this.generator = manageSpawns.bind(this)();

		this.queue = queue || [];

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
			} else if (typeof body === "function") {
				body = body(this.room.energyCapacityAvailable);
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
ProcessConstructors.set("ManageSpawns", ManageSpawns);

function* moveToRoom(this: CreepProcess, roomName: string) {
	while (this.creep.room.name !== roomName) {
		const dummyPosition = new RoomPosition(24, 24, roomName);
		this.creep.moveTo(dummyPosition, { range: 22 });
		yield;
	}
}

function* upgrader(this: Upgrader, roomName?: string) {
	if (roomName != null) {
		yield* moveToRoom.bind(this)(roomName);
	}
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

export class Upgrader extends CreepProcess {
	roomName: string | null;
	constructor({
		roomName,
		...data
	}: Omit<ProcessData<typeof CreepProcess>, "name"> & { roomName?: string }) {
		super({ name: "Upgrader", ...data });
		this.roomName = roomName || null;
		this.generator = upgrader.bind(this)(roomName);
	}
}
ProcessConstructors.set("Upgrader", Upgrader);

export class Economy extends RoomProcess {
	manageRoomId: ProcessId;
	manageSpawnsId: ProcessId;

	sources: Map<Id<StructureContainer>, [Id<Source>, string | null]>;
	upgraders: Map<string, ProcessId | null>;
	spawnRequests: Map<MessageId, ["miner", Id<StructureContainer>] | "upgrader">;

	constructor({
		manageRoomId,
		manageSpawnsId,
		sources,
		upgraders,
		spawnRequests,
		...data
	}: Omit<ProcessData<typeof RoomProcess>, "name"> & {
		manageRoomId: ProcessId;
		manageSpawnsId: ProcessId;
		sources?: Iterable<[Id<StructureContainer>, [Id<Source>, string | null]]>;
		upgraders?: Iterable<[string, ProcessId | null]>;
		spawnRequests?: Iterable<
			[MessageId, ["miner", Id<StructureContainer>] | "upgrader"]
		>;
	}) {
		super({ name: "Economy", ...data });
		this.generator = this.economy();
		this.manageRoomId = manageRoomId;
		this.manageSpawnsId = manageSpawnsId;

		this.sources = new Map(sources);
		this.upgraders = new Map(upgraders);
		this.spawnRequests = new Map(spawnRequests);
	}

	*sourceMining() {
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
						if (s == null) {
							return;
						}
						const sourceId = s.id as Id<Source>;
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
						!Iterators.some(
							this.spawnRequests,
							([_, v]) => v[0] === "miner" && v[1] === containerId,
						)
					) {
						this.requestSpawn("Miner", ["miner", containerId]);
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
				if (source.energy > 0) {
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
					.findInRange(FIND_DROPPED_RESOURCES, 1)
					.find((pile) => pile.resourceType === RESOURCE_ENERGY);
				if (pile != null) {
					if (miner.store.getFreeCapacity() > 0) {
						miner.pickup(pile);
					} else if (container.store.getFreeCapacity() > 0) {
						miner.transfer(container, RESOURCE_ENERGY);
					}
				}
			}

			yield;
		}
	}

	*upgradeController() {
		if (this.room.controller == null || !this.room.controller.my) {
			warn(
				`Failed to fine controller owned by ${global.USERNAME} in ${this.roomName}`,
			);
			while (true) {
				yield;
			}
		}

		while (true) {
			// Maintain desired number of upgraders
			const desiredUpgraders = Math.min(
				3,
				Math.max(1, Math.floor(this.energyAvailable / 50000)),
			);
			if (this.upgraders.size < desiredUpgraders) {
				if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "upgrader")) {
					this.requestSpawn("Upgrader", "upgrader");
				}
			}

			// Manage upgraders
			for (let [upgraderName, processId] of this.upgraders) {
				const upgrader = Game.creeps[upgraderName];
				if (upgrader == null) {
					this.upgraders.delete(upgraderName);
					continue;
				}

				// Ensure upgrader has an Upgrader process
				if (processId == null || !global.kernel.hasProcess(processId)) {
					processId = global.kernel.spawnProcess(
						new Upgrader({ creepName: upgraderName, roomName: this.roomName }),
					);
					reassignCreep(upgraderName, processId);
					this.upgraders.set(upgraderName, processId);
				}
			}

			yield;
		}
	}

	harvestEfficiency = 0;
	upgradeEfficiency = 0;
	useEfficiency = 0;
	*efficiencyTracking() {
		const historyLength = CREEP_LIFE_TIME * 10;
		const built: number[] = [];
		const repaired: number[] = [];
		const spawned: number[] = [];
		const upgraded: number[] = [];
		const harvested: number[] = [];

		while (true) {
			const start = Game.cpu.getUsed();
			const events = this.room.getEventLog();

			let builtNow = 0;
			let repairedNow = 0;
			let spawnedNow = 0;
			let upgradedNow = 0;
			let harvestedNow = 0;
			for (const { event, data } of events) {
				if (event === EVENT_BUILD) {
					// At least this one is actually sometimes undefined
					builtNow += data.energySpent || 0;
				} else if (event === EVENT_REPAIR) {
					repairedNow += data.energySpent || 0;
				} else if (
					event === EVENT_TRANSFER &&
					data.resourceType === RESOURCE_ENERGY
				) {
					const target = Game.getObjectById(
						data.targetId as Id<AnyStoreStructure>,
					);
					if (
						target != null &&
						(target.structureType === STRUCTURE_SPAWN ||
							target.structureType === STRUCTURE_EXTENSION)
					) {
						spawnedNow += data.amount || 0;
					}
				} else if (event === EVENT_UPGRADE_CONTROLLER) {
					upgradedNow += data.energySpent || 0;
				} else if (
					event === EVENT_HARVEST &&
					Game.getObjectById(
						data.targetId as Id<Source | Mineral | Deposit>,
					) instanceof Source
				) {
					harvestedNow += data.amount || 0;
				}
			}

			if (built.unshift(builtNow) > historyLength) {
				built.pop();
			}
			if (repaired.unshift(repairedNow) > historyLength) {
				repaired.pop();
			}
			if (spawned.unshift(spawnedNow) > historyLength) {
				spawned.pop();
			}
			if (upgraded.unshift(upgradedNow) > historyLength) {
				upgraded.pop();
			}
			if (harvested.unshift(harvestedNow) > historyLength) {
				harvested.pop();
			}

			// Sources provied 10 energy/tick each
			this.harvestEfficiency =
				Iterators.sum(harvested) / (20 * harvested.length);
			this.upgradeEfficiency =
				Iterators.sum(upgraded) / Iterators.sum(harvested);
			this.useEfficiency =
				(Iterators.sum(built) +
					Iterators.sum(repaired) +
					Iterators.sum(spawned) +
					Iterators.sum(upgraded)) /
				Iterators.sum(harvested);

			const elapsed = Game.cpu.getUsed() - start;
			info(
				`Used ${
					Math.round(100 * elapsed) / 100
				} CPU calculating efficiencies (over ${harvested.length})`,
			);
			yield;
		}
	}

	*economy() {
		const sourceMining = this.sourceMining();
		const upgradeController = this.upgradeController();
		const efficiencyTracking = this.efficiencyTracking();
		while (true) {
			sourceMining.next();
			upgradeController.next();
			efficiencyTracking.next();
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
				return;
			}

			if (message.creepName == null) {
				warn(`Creep request ${message.requestId} went awry`);
			} else if (role === "upgrader") {
				this.upgraders.set(message.creepName, null);
				reassignCreep(message.creepName, this.id);
			} else if (role[0] === "miner") {
				const containerId = role[1];
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
		} else if (message instanceof UpdateManageSpawnsId) {
			if (message.manageSpawnsId == null) {
				error(
					"Received message to recreate ManageSpawns, but is not ManageRoom",
				);
				return;
			}
			// Update this' manageSpawnsId
			this.manageSpawnsId = message.manageSpawnsId;
			info(`Updated spawn manager to ${this.manageSpawnsId}`);
		} else {
			super.receiveMessage(message);
		}
	}

	requestSpawn(
		creepName: string,
		role: ["miner", Id<StructureContainer>] | "upgrader",
	): void {
		const body = role === "upgrader" ? undefined : minerBody;
		const request = new SpawnRequest(
			this.id,
			this.manageSpawnsId,
			creepName,
			body,
		);
		this.spawnRequests.set(request.id, role);
		global.kernel.sendMessage(request);
	}
}
ProcessConstructors.set("Economy", Economy);

function minerBody(energyAvailable: number): BodyPartConstant[] {
	let energy = energyAvailable;
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
		for (let i = 0; i < additionalMoves; i++) {
			body.push(MOVE);
		}
		for (let i = 0; i < workParts; i++) {
			body.push(WORK);
		}
		return body;
	}
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

export class Expand extends RoomProcess {
	manageRoomId: ProcessId;
	manageSpawnsId: ProcessId;
	destinationManagerId: ProcessId | null;
	destinationName: string | null;
	spawnRequests: Map<MessageId, "claimer" | "scout" | "attacker">;

	scoutName: string | null;
	attackerName: string | null;
	claimerName: string | null;

	constructor({
		manageRoomId,
		manageSpawnsId,
		destinationManagerId,
		destinationName,
		spawnRequests,
		scoutName,
		attackerName,
		claimerName,
		...data
	}: Omit<ProcessData<typeof RoomProcess>, "name"> & {
		manageRoomId: ProcessId;
		manageSpawnsId: ProcessId;
		destinationManagerId?: ProcessId | null;
		destinationName?: string;
		spawnRequests?: Iterable<[MessageId, "claimer" | "scout" | "attacker"]>;
		scoutName?: string | null;
		attackerName?: string | null;
		claimerName?: string | null;
	}) {
		super({ name: "Expand", ...data });
		this.generator = this.expand();

		this.manageRoomId = manageRoomId;
		this.manageSpawnsId = manageSpawnsId;
		this.destinationManagerId = destinationManagerId || null;
		this.destinationName = destinationName || null;
		this.spawnRequests = new Map(spawnRequests);
		this.scoutName = scoutName || null;
		this.attackerName = attackerName || null;
		this.claimerName = claimerName || null;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.roomName} -> ${
			this.destinationName || "??"
		}`;
	}

	*expand() {
		while (true) {
			// Pick a destination
			if (this.destinationName == null) {
				const destination = Object.values(
					Game.map.describeExits(this.roomName),
				).find((roomName) => {
					// Assume invisible rooms are expandable
					const room = Game.rooms[roomName];
					if (room == null) {
						return true;
					}

					const controller = room.controller;
					if (controller == null) {
						return false;
					}

					return !controller.my;
				});

				if (destination == null) {
					warn(`Unable to find expansion target from ${this.roomName} :(`);
					return;
				}

				this.destinationName = destination;
			}

			// Scout the destination
			const scout = Game.creeps[this.scoutName || ""];
			if (scout == null) {
				if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "scout")) {
					this.requestSpawn("Scout", "scout");
				}
				yield;
				continue;
			}
			const dummyPosition = new RoomPosition(24, 24, this.destinationName);
			scout.moveTo(dummyPosition, { range: 22 });

			const destination = Game.rooms[this.destinationName];
			if (destination == null) {
				yield;
				continue;
			}
			const controller = destination.controller;
			if (controller == null) {
				throw new Error(
					`Expansion destination ${this.destinationName} lacks controller`,
				);
			}

			// Clear the destination of hostiles
			const hostile = (
				destination.find(FIND_HOSTILE_CREEPS) as (Creep | AnyOwnedStructure)[]
			).concat(destination.find(FIND_HOSTILE_STRUCTURES))[0];
			if (hostile != null) {
				const attacker = Game.creeps[this.attackerName || ""];
				if (attacker == null) {
					if (
						!Iterators.some(this.spawnRequests, ([_, v]) => v === "attacker")
					) {
						this.requestSpawn("Attacker", "attacker");
					}
					yield;
					continue;
				}
				if (attacker.spawning) {
					yield;
					continue;
				}

				const response = attacker.attack(hostile);
				if (response === ERR_NOT_IN_RANGE) {
					attacker.moveTo(hostile);
				} else if (response !== OK) {
					warn(`Attacker received response ${errorConstant(response)}`);
				}

				yield;
				continue;
			}

			// Claim the destination
			if (!controller.my) {
				const claimer = Game.creeps[this.claimerName || ""];
				if (claimer == null) {
					if (
						!Iterators.some(this.spawnRequests, ([_, v]) => v === "claimer")
					) {
						this.requestSpawn("Claimer", "claimer");
					}
					yield;
					continue;
				}
				if (claimer.spawning) {
					yield;
					continue;
				}
				let response: ScreepsReturnCode;
				// Attack or claim the controller as necessary
				if (
					controller.reservation != null &&
					controller.reservation.username !== global.USERNAME
				) {
					response = claimer.attackController(controller);
				} else {
					response = claimer.claimController(controller);
				}
				if (response === ERR_NOT_IN_RANGE) {
					claimer.moveTo(controller);
				} else if (response !== OK) {
					warn(`Claimer received response ${errorConstant(response)}`);
				}

				yield;
				continue;
			}

			// Spawn a ManageRoom process for the new room
			if (this.destinationManagerId == null) {
				this.destinationManagerId = global.kernel.spawnProcess(
					new ManageRoom({
						roomName: this.destinationName,
						manageSpawnsId: this.manageSpawnsId,
					}),
				);
			}

			// Wait until the room has a storage and spawn to detach
			if (destination.storage == null) {
				yield;
				continue;
			}
			const spawn = destination
				.find<StructureSpawn>(FIND_MY_STRUCTURES)
				.filter((s) => s.structureType === STRUCTURE_SPAWN)[0];
			if (spawn == null) {
				yield;
				continue;
			}

			// The destination is now self-sufficient
			info(
				`Expansion destination ${this.destinationName} is now independent of ${this.roomName}`,
			);
			const getYourOwnManageSpawns = new UpdateManageSpawnsId(
				this.id,
				this.destinationManagerId,
				null,
			);
			global.kernel.sendMessage(getYourOwnManageSpawns);

			return;
		}
	}

	requestSpawn(
		creepName: string,
		role: "claimer" | "scout" | "attacker",
	): void {
		let body: BodyPartConstant[] = [];
		if (role === "claimer") {
			// Copied this from my previous bot, idk about the 9 segment max
			body = bodyFromSegments(
				[CLAIM, MOVE],
				this.room.energyCapacityAvailable,
				9,
			);
		} else if (role === "scout") {
			body = [MOVE];
		} else if (role === "attacker") {
			body = bodyFromSegments(
				[ATTACK, MOVE],
				this.room.energyCapacityAvailable,
			);
		}
		const request = new SpawnRequest(
			this.id,
			this.manageSpawnsId,
			creepName,
			body,
		);
		this.spawnRequests.set(request.id, role);
		global.kernel.sendMessage(request);
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
			} else if (role === "scout") {
				this.scoutName = message.creepName;
				reassignCreep(message.creepName, this.id);
			} else if (role === "attacker") {
				this.attackerName = message.creepName;
				reassignCreep(message.creepName, this.id);
			} else if (role === "claimer") {
				this.claimerName = message.creepName;
				reassignCreep(message.creepName, this.id);
			}

			this.spawnRequests.delete(message.requestId);
		} else {
			super.receiveMessage(message);
		}
	}
}
ProcessConstructors.set("Expand", Expand);

export class UpdateManageSpawnsId implements IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;

	manageSpawnsId: ProcessId | null;

	constructor(
		from: ProcessId,
		to: ProcessId,
		manageSpawnsId: ProcessId | null,
	) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;

		this.manageSpawnsId = manageSpawnsId;
	}
}
