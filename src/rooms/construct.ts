import { IMessage, MessageId } from "./../messenger";
import * as Iterators from "./../utils/iterators";
import {
	reassignCreep,
	ProcessData,
	ProcessId,
	RoomProcess,
	ProcessConstructors,
	CreepProcess,
} from "./../process";

import { getEnergy, upgrader } from "./../creeps";
import { CreepSpawned, SpawnRequest, UpdateManageSpawnsId } from "./spawns";

export type ConstructTarget = Id<ConstructionSite> | Id<Structure>;

export class RequestConstructTarget implements IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;

	creepName: string;

	constructor(from: ProcessId, to: ProcessId, creepName: string) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;

		this.creepName = creepName;
	}
}

export class AssignConstructTarget implements IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;

	target: ConstructTarget | null;

	constructor(from: ProcessId, to: ProcessId, target: ConstructTarget | null) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;

		this.target = target;
	}
}

const REPAIR_WALLS_TO = 100000;
export class Construct extends RoomProcess {
	manageRoomId: ProcessId;
	manageSpawnsId: ProcessId;

	constructors: Map<string, [ConstructTarget | null, ProcessId | null]>;
	static _roles: "constructor" = "constructor";
	spawnRequests: Map<MessageId, typeof Construct._roles>;

	constructor({
		manageRoomId,
		manageSpawnsId,
		constructors,
		spawnRequests,
		...data
	}: Omit<ProcessData<typeof RoomProcess>, "name"> & {
		manageRoomId: ProcessId;
		manageSpawnsId: ProcessId;
		constructors?: Iterable<
			[string, [ConstructTarget | null, ProcessId | null]]
		>;
		spawnRequests?: Iterable<[MessageId, typeof Construct._roles]>;
	}) {
		super({ name: "Construct", ...data });
		this.generator = this.construct();
		this.manageRoomId = manageRoomId;
		this.manageSpawnsId = manageSpawnsId;

		this.constructors = new Map(constructors);
		this.spawnRequests = new Map(spawnRequests);
	}

	_repairables: AnyStructure[] | null = null;
	_repairablesTick: number | null = null;
	get repairables(): AnyStructure[] {
		if (this._repairables == null || this._repairablesTick !== Game.time) {
			this._repairablesTick = Game.time;
			this._repairables = this.room.find(FIND_STRUCTURES).filter(
				(s) =>
					// Heal normal structures below 75%
					(s.structureType !== STRUCTURE_WALL &&
						s.structureType !== STRUCTURE_RAMPART &&
						s.hits < s.hitsMax * 0.75) ||
					// Heal walls and ramparts below 100k hits
					((s.structureType === STRUCTURE_WALL ||
						s.structureType === STRUCTURE_RAMPART) &&
						s.hits < REPAIR_WALLS_TO),
			);
			this._repairables.sort((a, b) => a.hits - b.hits);
		}
		return this._repairables;
	}

	_urgentRepairs: AnyStructure[] | null = null;
	_urgentRepairsTick: number | null = null;
	get urgentRepairs(): AnyStructure[] {
		if (this._urgentRepairs == null || this._urgentRepairsTick !== Game.time) {
			this._urgentRepairsTick = Game.time;
			// Repairables is sorted, so no need to sort this
			this._urgentRepairs = this.repairables.filter(
				(s) => s.hits < s.hitsMax * 0.25,
			);
		}

		return this._urgentRepairs;
	}

	get sites(): ConstructionSite[] {
		// room.find caches its results already
		return this.room.find(FIND_CONSTRUCTION_SITES);
	}

	*spawner(): Generator<void, void, never> {
		while (true) {
			if (!this.room.controller?.my) {
				this.warn(`Not my room, stopping ${this.display()}`);
				return;
			}

			const siteEnergy = this.sites.reduce(
				(energy, site) => energy + site.progressTotal - site.progress,
				0,
			);
			// Source: I made it up
			const desiredConstructors = Math.max(
				// If there are urgent repairs or construction sites, desire at least 1
				this.urgentRepairs.length > 0 ? 1 : this.sites.length > 0 ? 1 : 0,
				// No more than three constructors
				Math.min(3, Math.floor(siteEnergy / 50000)),
			);

			// Spawn more constructors
			if (this.constructors.size < desiredConstructors) {
				if (
					!Iterators.some(this.spawnRequests, ([_, v]) => v === "constructor")
				) {
					this.requestSpawn("Constructor", "constructor");
				}
			}

			yield;
		}
	}

	*manageConstructors() {
		while (true) {
			for (const [creepName, [siteId, processId]] of this.constructors) {
				const creep = Game.creeps[creepName];
				if (creep == null) {
					this.constructors.delete(creepName);
					continue;
				}
				if (
					processId == null ||
					processId === this.id ||
					!global.kernel.hasProcess(processId)
				) {
					const constructorProcess = new Constructor({
						creepName,
						siteId,
						constructId: this.id,
					});
					const newProcessId = global.kernel.spawnProcess(constructorProcess);
					this.info(`Creating process ${newProcessId} for ${creepName}`);
					this.constructors.set(creepName, [siteId, newProcessId]);
				}
			}

			yield;
		}
	}

	getConstructTarget(creepName: string): ConstructTarget | null {
		// Repair urgent repairs
		if (this.urgentRepairs.length > 0) {
			return this.urgentRepairs[0].id;
		}

		// Build construction sites
		if (this.sites.length > 0) {
			return this.sites[0].id;
		}

		// Repair repairables
		if (this.repairables.length > 0) {
			const creep = Game.creeps[creepName];
			if (creep == null) {
				this.error(`Unable to find creep ${creepName}`);
				return null;
			}
			return creep.pos.findClosestByPath(this.repairables)?.id ?? null;
		}

		// No construct target found
		return null;
	}

	*construct() {
		const spawner = this.spawner();
		const manageConstructors = this.manageConstructors();
		while (true) {
			spawner.next();
			manageConstructors.next();
			yield;
		}
	}

	receiveMessage(message: IMessage): void {
		if (message instanceof CreepSpawned) {
			const role = this.spawnRequests.get(message.requestId);
			if (role == null) {
				this.warn(
					`Unexpectedly received message about unrequested creep: ${JSON.stringify(
						message,
					)}`,
				);
			}

			if (message.creepName == null) {
				this.warn(`Creep request ${message.requestId} went awry`);
			} else if (role === "constructor") {
				this.constructors.set(message.creepName, [null, null]);
				Memory.creeps[message.creepName].process = this.id;
			}

			this.spawnRequests.delete(message.requestId);
		} else if (message instanceof UpdateManageSpawnsId) {
			if (message.manageSpawnsId == null) {
				this.error(
					"Received message to recreate ManageSpawns, but is not ManageRoom",
				);
				return;
			}
			// Update this' manageSpawnsId
			this.manageSpawnsId = message.manageSpawnsId;
			this.info(`Updated spawn manager to ${this.manageSpawnsId}`);
		} else if (message instanceof RequestConstructTarget) {
			const target = this.getConstructTarget(message.creepName);
			const response = new AssignConstructTarget(this.id, message.from, target);
			global.kernel.sendMessage(response);
		} else {
			super.receiveMessage(message);
		}
	}

	requestSpawn(creepName: string, role: typeof Construct._roles): void {
		const request = new SpawnRequest(this.id, this.manageSpawnsId, creepName);
		this.spawnRequests.set(request.id, role);
		global.kernel.sendMessage(request);
	}
}
ProcessConstructors.set("Construct", Construct);

export class Constructor extends CreepProcess {
	constructId: ProcessId;
	siteId: ConstructTarget | null;

	constructor({
		constructId,
		siteId,
		...data
	}: Omit<ProcessData<typeof CreepProcess>, "name"> & {
		constructId: ProcessId;
		siteId: ConstructTarget | null;
	}) {
		super({ name: "Constructor", ...data });
		this.constructId = constructId;
		this.siteId = siteId;
		this.generator = this._generator();
	}

	display(): string {
		return `${this.id} ${this.name} ${this.creepName} ${(
			this.siteId ?? "null"
		).slice(-4)}`;
	}

	*idle() {
		const idle = upgrader.bind(this)();
		while (true) {
			// Upgrade, but ask for a new target every 10 ticks
			if (Game.time % 10 === 0) {
				const request = new RequestConstructTarget(
					this.id,
					this.constructId,
					this.creepName,
				);
				global.kernel.sendMessage(request);
			}
			yield idle.next();
		}
	}

	*_generator() {
		this.debug(`Restarting construct with target ${this.siteId}`);

		while (true) {
			while (this.creep.store[RESOURCE_ENERGY] > 0) {
				// Assignment expired, upgrade in the mean time
				if (this.siteId == null) {
					this.info("Idly upgrading");
					yield* this.idle();
					this.warn("Upgrader subprocess unexpectedly stopped");
					continue;
				}
				// Get the site
				const site = Game.getObjectById(this.siteId);
				// Site is newly null, request a new site
				if (site == null) {
					this.siteId = null;
					const request = new RequestConstructTarget(
						this.id,
						this.constructId,
						this.creepName,
					);
					global.kernel.sendMessage(request);
					this.info("Sent target request");
					// Wait one tick before upgrading
					yield;
					continue;
				}

				let response: ScreepsReturnCode;
				if (site instanceof ConstructionSite) {
					this.info("Building");
					response = this.creep.build(site);
				} else {
					// Check if repaired enough, if so, do something else
					if (
						site.structureType !== STRUCTURE_WALL &&
						site.structureType !== STRUCTURE_RAMPART
					) {
						if (site.hits >= site.hitsMax * 0.8) {
							this.info("site hits enough");
							this.siteId = null;
							continue;
						}
					} else {
						this.info("wall hits enough");
						if (site.hits >= REPAIR_WALLS_TO) {
							this.siteId = null;
							continue;
						}
					}

					this.info("Repairing");
					response = this.creep.repair(site);
				}

				if (response === ERR_NOT_IN_RANGE) {
					this.info("moving");
					this.creep.moveTo(site);
				}

				yield;
			}
			this.info("time to get energy");
			yield* getEnergy.bind(this)();
		}
	}

	receiveMessage(message: IMessage): void {
		if (message instanceof AssignConstructTarget) {
			this.siteId = message.target;
			this.info("Received construciton target");
			// Restart process with new target
			this.generator = this._generator();
		} else {
			super.receiveMessage(message);
		}
	}
}
ProcessConstructors.set("Constructor", Constructor);
