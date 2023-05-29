import { countBodyPart } from "./utils";
import { ProcessData, CreepProcess, ProcessConstructors } from "./process";

function* getEnergy(
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
		const target = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
			filter: (s) =>
				((s.structureType === STRUCTURE_STORAGE && options.allowStorage) ||
					s.structureType === STRUCTURE_CONTAINER ||
					(s.structureType === STRUCTURE_LINK &&
						(options.allowControllerLink ||
							s.pos.getRangeTo(this.creep.room.controller?.pos || s.pos) >
								2))) &&
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
