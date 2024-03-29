import { countBodyPart } from "./bodies";
import {
	ProcessData,
	CreepProcess,
	ProcessConstructors,
	ProcessId,
} from "./../process";
import { ConstructTarget, RequestConstructTarget } from "./../rooms/construct";
import { RoomCoord } from "./../utils/coord";

export function* getEnergy(
	this: CreepProcess,
	opts?: Partial<{
		allowStorage: boolean;
		allowControllerLink: boolean;
		amount: number;
	}>,
) {
	const options = {
		allowStorage: true,
		allowControllerLink: true,
		amount: this.creep.store.getCapacity(RESOURCE_ENERGY),
	};
	Object.assign(options, opts);

	if (this.creep.store.getCapacity(RESOURCE_ENERGY) == null) {
		throw new Error(`Creep ${this.creep.name} unable to carry energy`);
	}
	while (this.creep.store[RESOURCE_ENERGY] < options.amount) {
		const targets: Array<
			| StructureStorage
			| StructureContainer
			| StructureLink
			| Resource<RESOURCE_ENERGY>
			| Tombstone
		> = [
				// Find storage structures
				...this.creep.room
					.find(FIND_STRUCTURES)
					.filter(
						(s): s is StructureStorage | StructureContainer | StructureLink =>
							((s.structureType === STRUCTURE_STORAGE && options.allowStorage) ||
								s.structureType === STRUCTURE_CONTAINER ||
								(s.structureType === STRUCTURE_LINK &&
									(options.allowControllerLink ||
										s.pos.getRangeTo(this.creep.room.controller?.pos || s.pos) >
										2))) &&
							s.store[RESOURCE_ENERGY] > 0,
					),
				// Find dropped resources
				...this.creep.room
					.find(FIND_DROPPED_RESOURCES)
					.filter(
						(r): r is Resource<RESOURCE_ENERGY> =>
							r.resourceType === RESOURCE_ENERGY,
					),
				// Find tombstones
				...this.creep.room
					.find(FIND_TOMBSTONES)
					.filter((t) => t.store[RESOURCE_ENERGY] > 0)
			];

		// Sort the targets lowest energy to highest energy, so that if there is a
		// tie, always choose the target with more energy.
		// findClosestByPath will prefer the element closest to the end in case of
		// a tie.
		targets.sort((a, b) => {
			let aAmount = 0;
			let bAmount = 0;
			if (a instanceof Resource) {
				aAmount = a.amount;
			} else {
				aAmount = a.store[RESOURCE_ENERGY];
			}
			if (b instanceof Resource) {
				bAmount = b.amount;
			} else {
				bAmount = b.store[RESOURCE_ENERGY];
			}

			return aAmount - bAmount;
		});

		const target = this.creep.pos.findClosestByPath(targets, { range: 1 });
		if (target == null) {
			// If creep can harvest, do it. Otherwise, stop.
			if (countBodyPart(this.creep.body, WORK) > 0) {
				yield* harvest.bind(this)();
				return;
			}
			yield;
			return;
		}

		let response: ScreepsReturnCode | undefined;
		if (target instanceof Structure || target instanceof Tombstone) {
			response = this.creep.withdraw(target, RESOURCE_ENERGY);
		} else if (target instanceof Resource) {
			response = this.creep.pickup(target);
		}
		if (response === ERR_NOT_IN_RANGE) {
			response = this.creep.moveTo(target);
		}

		yield;
	}
}

function* harvest(this: CreepProcess) {
	if (countBodyPart(this.creep.body, WORK) === 0) {
		this.warn(`Creep ${this.creep.name} has no work parts, cannot harvest`);
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

function* harvester(this: Harvester, roomName?: string) {
	if (roomName != null) {
		yield* moveToRoom.bind(this)(roomName);
	}
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
	constructor({
		roomName,
		...data
	}: Omit<ProcessData<typeof CreepProcess>, "name"> & { roomName?: string }) {
		super({ name: "Harvester", ...data });
		this.generator = harvester.bind(this)(roomName);
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
				this.warn(`Site ${this.siteId.slice(-4)} fully repaired`);
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

function* tender(this: Tender, roomName?: string) {
	if (roomName != null) {
		yield* moveToRoom.bind(this)(roomName);
	}
	let allowTakeFromStorage = true;
	while (true) {
		yield* getEnergy.bind(this)({
			allowStorage: allowTakeFromStorage,
			allowControllerLink: false,
		});
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
							s.structureType === STRUCTURE_TOWER &&
							s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
					);
				target =
					this.creep.pos.findClosestByPath(secondaryTargets) ||
					this.creep.room.storage ||
					null;
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

export function* moveToRoom(this: CreepProcess, roomName: string) {
	while (this.creep.room.name !== roomName) {
		const dummyPosition = new RoomPosition(24, 24, roomName);
		this.creep.moveTo(dummyPosition, { range: 22 });
		yield;
	}
}

export function* upgrader(this: CreepProcess, roomName?: string) {
	if (roomName != null) {
		yield* moveToRoom.bind(this)(roomName);
	}
	let nextToController = false;
	while (true) {
		yield* getEnergy.bind(this)({
			amount: nextToController
				? 1
				: this.creep.store.getFreeCapacity(RESOURCE_ENERGY),
		});
		while (this.creep.store[RESOURCE_ENERGY] > 0) {
			const controller = this.creep.room.controller;
			if (controller == null) {
				throw new Error("No controller");
			}

			let response = this.creep.upgradeController(controller);
			if (response === ERR_NOT_IN_RANGE) {
				nextToController = false;
				response = this.creep.moveTo(controller);
			} else {
				nextToController = true;
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

export function* hauler(this: Hauler) {
	while (true) {
		while (this.creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
			// If not next to the source
			if (!this.creep.pos.inRangeTo(this.source, 1)) {
				this.creep.moveTo(this.source, { range: 1 });
				yield;
				continue;
			}

			const targets: Array<Resource<RESOURCE_ENERGY> | AnyStoreStructure> = [];
			this.source
				.lookFor(LOOK_RESOURCES)
				.filter(
					(t): t is Resource<RESOURCE_ENERGY> =>
						t.resourceType === RESOURCE_ENERGY,
				)
				.forEach((t) => targets.push(t));
			this.source
				.lookFor(LOOK_STRUCTURES)
				.filter(
					(t): t is AnyStoreStructure => (t as AnyStoreStructure).store != null,
				)
				.filter((t) => (t.store[RESOURCE_ENERGY] ?? 0) > 0)
				.forEach((t) => targets.push(t));

			const target = targets[0];
			if (target == null) {
				yield;
				break;
			}

			let response: ScreepsReturnCode | undefined;
			if (target instanceof Structure || target instanceof Tombstone) {
				response = this.creep.withdraw(target, RESOURCE_ENERGY);
			} else if (target instanceof Resource) {
				response = this.creep.pickup(target);
			}

			yield;
		}
		while (this.creep.store[RESOURCE_ENERGY] > 0) {
			// If not next to the sink
			if (!this.creep.pos.inRangeTo(this.sink, 1)) {
				this.creep.moveTo(this.sink, { range: 1 });
				yield;
				continue;
			}

			const target = this.sink
				.lookFor(LOOK_STRUCTURES)
				.find(
					(t) =>
						(t as AnyStoreStructure).store != null &&
						((t as AnyStoreStructure).store.getFreeCapacity(RESOURCE_ENERGY) ??
							0) > 0,
				);

			let response: ScreepsReturnCode | undefined;
			if (target instanceof Structure) {
				response = this.creep.transfer(target, RESOURCE_ENERGY);
			} else if (target == null) {
				response = this.creep.drop(RESOURCE_ENERGY);
			}

			yield;
		}
	}
}

export class Hauler extends CreepProcess {
	_source: RoomCoord;
	get source(): RoomPosition {
		return new RoomPosition(
			this._source.x,
			this._source.y,
			this._source.roomName,
		);
	}

	_sink: RoomCoord;
	get sink(): RoomPosition {
		return new RoomPosition(this._sink.x, this._sink.y, this._sink.roomName);
	}

	constructor({
		_source,
		_sink,
		...data
	}: Omit<ProcessData<typeof CreepProcess>, "name"> & {
		_source: RoomCoord;
		_sink: RoomCoord;
	}) {
		super({ name: "Hauler", ...data });
		this._source = _source;
		this._sink = _sink;
		this.generator = hauler.bind(this)();
	}
}
ProcessConstructors.set("Hauler", Hauler);
