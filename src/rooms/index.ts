import { errorConstant } from "./../utils/logger";
import { IMessage, MessageId } from "./../messenger";
import { bodyFromSegments, genericBody, haulerBody } from "./../creeps/bodies";
import * as Iterators from "./../utils/iterators";
import {
	IBlueprint,
	blueprintToBuildingPlannerLink,
	RoomPlanner,
	SendBlueprint,
} from "./../planner";
import {
	reassignCreep,
	ProcessData,
	ProcessId,
	RoomProcess,
	ProcessConstructors,
} from "./../process";

import { Harvester, Tender, Upgrader } from "./../creeps";
import { Construct } from "./construct";
import {
	CreepSpawned,
	ManageSpawns,
	SpawnRequest,
	UpdateManageSpawnsId,
} from "./spawns";
import { RemoteRoom } from "./remote";
import { wrapper } from "./../utils/errors";
import { roomDescribe } from "./../utils";
import { RequestScoutingInfo, SendScoutingInfo } from "./../scouting";
import { Socket } from "./../process/socket";

export { ManageSpawns, Construct };

function tendRoom(this: ManageRoom): void {
	// No tender needed if the room lacks a spawn
	const spawn = this.room
		.find<StructureSpawn>(FIND_MY_STRUCTURES)
		.filter((s) => s.structureType === STRUCTURE_SPAWN)[0];
	if (spawn == null) {
		this.warn(`Room ${this.roomName} lacks a spawn`);
		return;
	}

	if (Game.creeps[this.tenderName || ""] == null) {
		this.tenderName = null;
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
		this.warn(`Pruning lost expand process ${this.expandId}`);
		this.expandId = null;
	}
	const ownedRooms = Object.values(Game.rooms).filter(
		(room) => room.controller?.my,
	).length;
	if (
		Game.time % 100 === 0 &&
		this.expandId == null &&
		ownedRooms < Game.gcl.level &&
		(this.room.controller?.level || 0) >= 6 &&
		(this.room.storage?.store[RESOURCE_ENERGY] || 0) > 100000
	) {
		this.info(`Room ${this.roomName} expanding!`);
		this.expandId = global.kernel.spawnProcess(
			new Expand({
				roomName: this.roomName,
				manageRoomId: this.id,
				manageSpawnsId: this.manageSpawnsId,
			}),
		);
	}
}

function build(this: ManageRoom): void {
	// If room has no blueprint and no room planner, start a new one
	if (
		this.blueprint == null &&
		!global.kernel.hasProcess(this.roomPlannerId || -1)
	) {
		this.roomPlannerId = global.kernel.spawnProcess(
			new RoomPlanner({ roomName: this.roomName, manageRoomId: this.id }),
		);
	}

	// Wait for blueprint to exist
	if (this.blueprint == null) {
		return;
	}
	// Only build every 100 ticks
	if (Game.time % 100 !== 0) {
		return;
	}
	// TODO: Temporary for my pre-existing manually planned rooms
	// Storage, extractor
	const doNotAutoBuild = Iterators.some(
		this.room.find(FIND_MY_STRUCTURES),
		(s) => s.structureType === STRUCTURE_EXTRACTOR,
	);
	if (doNotAutoBuild) {
		return;
	}
	this.debug(`Room ${this.roomName} building`);

	// Build all containers right away (first to get miners going)
	(this.blueprint.structures[STRUCTURE_CONTAINER] || []).forEach(({ x, y }) =>
		this.room.createConstructionSite(x, y, STRUCTURE_CONTAINER),
	);

	// Build all the roads right away
	(this.blueprint.structures[STRUCTURE_ROAD] || []).forEach(({ x, y }) =>
		this.room.createConstructionSite(x, y, STRUCTURE_ROAD),
	);

	const controller = this.room.controller;
	if (controller == null) {
		this.warn(`Room ${this.roomName} lacks a controller, not building further`);
		return;
	}

	// Build the maximum possible number of spawns
	(this.blueprint.structures[STRUCTURE_SPAWN] || [])
		.filter(
			(_, num) =>
				num < CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][controller.level],
		)
		.forEach(({ x, y }) =>
			this.room.createConstructionSite(x, y, STRUCTURE_SPAWN),
		);

	// Build the maximum possible number of extensions
	(this.blueprint.structures[STRUCTURE_EXTENSION] || [])
		.filter(
			(_, num) =>
				num < CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][controller.level],
		)
		.forEach(({ x, y }) =>
			this.room.createConstructionSite(x, y, STRUCTURE_EXTENSION),
		);

	// Build the maximum possible number of towers
	(this.blueprint.structures[STRUCTURE_TOWER] || [])
		.filter(
			(_, num) =>
				num < CONTROLLER_STRUCTURES[STRUCTURE_TOWER][controller.level],
		)
		.forEach(({ x, y }) =>
			this.room.createConstructionSite(x, y, STRUCTURE_TOWER),
		);

	// Build a storage, if possible
	(this.blueprint.structures[STRUCTURE_STORAGE] || [])
		.filter(
			(_, num) =>
				num < CONTROLLER_STRUCTURES[STRUCTURE_STORAGE][controller.level],
		)
		.forEach(({ x, y }) =>
			this.room.createConstructionSite(x, y, STRUCTURE_STORAGE),
		);

	// Build the maximum possible number of links
	(this.blueprint.structures[STRUCTURE_LINK] || [])
		.filter(
			(_, num) => num < CONTROLLER_STRUCTURES[STRUCTURE_LINK][controller.level],
		)
		.forEach(({ x, y }) =>
			this.room.createConstructionSite(x, y, STRUCTURE_LINK),
		);
}

function* manageRemotes(this: ManageRoom) {
	// Need a storage to have remotes
	if (this.room.storage == null) {
		return;
	}

	// Prune dead remotes
	for (const [remoteName, remoteId] of this.remoteRooms) {
		if (!global.kernel.hasProcess(remoteId)) {
			this.remoteRooms.delete(remoteName);
		}
	}

	// Look for new remotes
	if ((this.room.controller?.level ?? 0) >= 5 && Game.time % 1000 === 0) {
		this.info("Looking for new remote");
		let roomName;
		for (roomName of Object.values(Game.map.describeExits(this.roomName))) {
			// Room must be a standard room
			if (roomDescribe(roomName) !== global.ROOM_STANDARD) {
				this.debug(`Room ${roomName} is nonstandard ${roomDescribe(roomName)}`);
				continue;
			}

			// Send request for room scouting info and wait on it
			const request = new RequestScoutingInfo(this.id, roomName);
			const { info } = yield* Socket.send(request, SendScoutingInfo);

			// Assume unscouted rooms are expandable
			if (info == null) {
				this.debug(`Room ${roomName} unscouted`);
				break;
			}

			// Has controller
			const controller = info.structures[STRUCTURE_CONTROLLER]?.[0];
			if (controller == null) {
				this.debug(`Room ${roomName} lacks a controller`);
				continue;
			}

			// Not owned
			if (info.owner != null || info.reservation?.username != null) {
				this.debug(
					`Room ${roomName} owned/reserved by ${
						info.owner ?? info.reservation?.username
					}`,
				);
				continue;
			}

			// Can path from origin storage to destination controller
			const storage = this.room.storage?.pos;
			if (storage == null) {
				throw new Error("Origin lacks storage");
			}
			const destinationCostMatrix = new PathFinder.CostMatrix();
			info.structures[STRUCTURE_WALL]?.forEach(({ x, y }) =>
				destinationCostMatrix.set(x, y, 255),
			);
			const path = PathFinder.search(
				storage,
				{
					pos: new RoomPosition(controller.x, controller.y, roomName),
					range: 1,
				},
				{
					maxOps: 20000,
				},
			);
			if (path.incomplete) {
				this.debug(`Cannot path to room ${roomName} controller`);
				continue;
			}

			// Controller is not too far
			if (path.cost > 500) {
				this.debug(`Room ${roomName} controller too far: ${path.cost}`);
				continue;
			}

			// Checks out so far
			this.debug(`Room ${roomName} checks out`);
			break;
		}
		if (roomName != null) {
			this.info(`Creating remote room ${roomName}`);
			const remoteId = global.kernel.spawnProcess(
				new RemoteRoom({
					roomName,
					ownerName: this.roomName,
					manageSpawnsId: this.manageSpawnsId,
				}),
			);
			this.remoteRooms.set(roomName, remoteId);
		} else {
			this.debug("Failed to find new remote room");
		}
	}
}

function* manageRoom(this: ManageRoom): Generator<void, void, never> {
	while (true) {
		if (!this.room.controller?.my) {
			this.warn(`Not my room, stopping ${this.display()}`);
			return;
		}

		tendRoom.bind(this)();
		upgradeRoom.bind(this)();
		expand.bind(this)();
		wrapper(() => manageRemotes.bind(this)(), "Error managing remotes");
		wrapper(() => build.bind(this)(), "Error building");

		const creeps = this.room.find(FIND_MY_CREEPS);
		creeps.forEach((creep) => {
			if (
				creep.memory.process == null ||
				!global.kernel.hasProcess(creep.memory.process)
			) {
				if (creep.store.getCapacity(RESOURCE_ENERGY) == null) {
					this.warn(
						`Creep ${creep.name} unable to carry energy, has no process`,
					);
				} else {
					this.warn(`Creating process for to ${creep.name}`);
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
	roomPlannerId: ProcessId | null;
	defenceId: ProcessId | null;
	manageLinksId: ProcessId | null;
	remoteRooms: Map<string, ProcessId>;

	spawnRequests: Map<MessageId, "harvester" | "tender" | "upgrader">;
	blueprint: IBlueprint | null;

	tenderName: string | null;
	upgraderName: string | null;

	constructor(
		data: Omit<
			ProcessData<typeof RoomProcess> & {
				manageSpawnsId?: ProcessId;
				constructId?: ProcessId;
				economyId?: ProcessId;
				expandId?: ProcessId | null;
				roomPlannerId?: ProcessId | null;
				defenceId?: ProcessId | null;
				manageLinksId?: ProcessId | null;
				remoteRooms?: Map<string, ProcessId>;
				spawnRequests?: Iterable<
					[MessageId, "harvester" | "tender" | "upgrader"]
				>;
				blueprint?: IBlueprint | null;
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
		this.blueprint = data.blueprint || null;
		this.tenderName = data.tenderName || null;
		this.upgraderName = data.upgraderName || null;

		this.remoteRooms = new Map(data.remoteRooms);

		this.manageSpawnsId =
			data.manageSpawnsId ||
			global.kernel.spawnProcess(new ManageSpawns({ roomName: this.roomName }));
		this.constructId =
			data.constructId ||
			global.kernel.spawnProcess(
				new Construct({
					roomName: this.roomName,
					manageSpawnsId: this.manageSpawnsId,
				}),
			);
		this.economyId =
			data.economyId ||
			global.kernel.spawnProcess(
				new Economy({
					roomName: this.roomName,
					manageSpawnsId: this.manageSpawnsId,
				}),
			);
		this.roomPlannerId = data.roomPlannerId || null;
		this.defenceId =
			data.defenceId ||
			global.kernel.spawnProcess(
				new Defence({
					roomName: this.roomName,
					manageSpawnsId: this.manageSpawnsId,
				}),
			);
		this.manageLinksId =
			data.manageLinksId ||
			global.kernel.spawnProcess(new ManageLinks({ roomName: this.roomName }));

		this.expandId = data.expandId || null;
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
			this.info(`Updated spawn manager to ${this.manageSpawnsId}`);
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
		} else if (message instanceof SendBlueprint) {
			this.blueprint = message.blueprint;
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

	blueprintLink(): string {
		const link = blueprintToBuildingPlannerLink(
			this.blueprint || { structures: {} },
		);
		console.log(
			`<a href="${link}">Room ${this.roomName} Building Planner Link</a>`,
		);
		return link;
	}
}
ProcessConstructors.set("ManageRoom", ManageRoom);

export class Economy extends RoomProcess {
	manageSpawnsId: ProcessId;

	sources: Map<
		Id<StructureContainer>,
		[Id<Source>, string | null, Id<StructureLink> | null]
	>;
	upgraders: Map<string, ProcessId | null>;
	spawnRequests: Map<
		MessageId,
		["miner", Id<StructureContainer>] | "upgrader" | "tender"
	>;
	emergencyTenders: Map<string, ProcessId>;

	constructor({
		manageSpawnsId,
		sources,
		upgraders,
		spawnRequests,
		emergencyTenders,
		...data
	}: Omit<ProcessData<typeof RoomProcess>, "name"> & {
		manageSpawnsId: ProcessId;
		sources?: Iterable<
			[
				Id<StructureContainer>,
				[Id<Source>, string | null, Id<StructureLink> | null],
			]
		>;
		upgraders?: Iterable<[string, ProcessId | null]>;
		spawnRequests?: Iterable<
			[MessageId, ["miner", Id<StructureContainer>] | "upgrader" | "tender"]
		>;
		emergencyTenders?: Iterable<[string, ProcessId]>;
	}) {
		super({ name: "Economy", ...data });
		this.generator = this.economy();
		this.manageSpawnsId = manageSpawnsId;

		this.sources = new Map(sources);
		this.upgraders = new Map(upgraders);
		this.spawnRequests = new Map(spawnRequests);
		this.emergencyTenders = new Map(emergencyTenders);
	}

	*energyCrisis() {
		while (true) {
			this.warn(`Room ${this.roomName} energy crisis`);
			for (const [emergencyTenderName, processId] of this.emergencyTenders) {
				const emergencyTender = Game.creeps[emergencyTenderName];
				if (emergencyTender == null) {
					this.emergencyTenders.delete(emergencyTenderName);
					global.kernel.stopProcess(processId);
				}
			}
			if (this.emergencyTenders.size === 0) {
				if (
					this.room.energyAvailable >= 300 &&
					!Iterators.some(this.spawnRequests, ([_, role]) => role === "tender")
				) {
					this.requestSpawn("EmergencyTender", "tender");
				}
				yield;
				continue;
			}

			yield;
		}
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
							this.warn(
								`Sources ${oldSource} and ${sourceId} sharing container ${container.id}`,
							);
						}
						const linkId =
							s.pos
								.findInRange(FIND_MY_STRUCTURES, 2)
								.find(
									(s): s is StructureLink => s.structureType === STRUCTURE_LINK,
								)?.id || null;
						this.sources.set(container.id, [sourceId, minerName, linkId]);
					});
			}

			// Source mining
			for (const [containerId, [sourceId, minerName, linkId]] of this.sources) {
				const container = Game.getObjectById(containerId);
				if (container == null) {
					this.warn(`Missing container ${containerId}`);
					this.sources.delete(containerId);
					continue;
				}
				const source = Game.getObjectById(sourceId);
				if (source == null) {
					this.error(`Missing source for ${containerId}`);
					this.sources.delete(containerId);
					continue;
				}
				let link: StructureLink | null = null;
				if (linkId != null) {
					link = Game.getObjectById(linkId);
				}
				const miner = Game.creeps[minerName || ""];
				if (miner == null || minerName == null) {
					this.sources.set(containerId, [sourceId, null, linkId]);
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

				// Sit on top of the container
				if (!miner.pos.isEqualTo(container.pos)) {
					miner.moveTo(container.pos);
					continue;
				}

				// Harvest the source
				if (source.energy > 0) {
					const response = miner.harvest(source);
					if (response !== OK) {
						this.warn(`Miner harvesting with ${errorConstant(response)}`);
					}
				}

				// Transfer energy to the link or pickup dropped energy
				const pile = miner.pos
					.findInRange(FIND_DROPPED_RESOURCES, 1)
					.find((pile) => pile.resourceType === RESOURCE_ENERGY);
				if (link != null && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
					miner.withdraw(container, RESOURCE_ENERGY);
					miner.transfer(link, RESOURCE_ENERGY);
				} else {
					if (pile != null) {
						miner.transfer(container, RESOURCE_ENERGY);
						miner.pickup(pile);
					}
				}

				// Repair the container if the source is empty
				if (source.energy === 0 && container.hits < container.hitsMax) {
					if (miner.store[RESOURCE_ENERGY] > 0) {
						miner.repair(container);
					} else if (container.store[RESOURCE_ENERGY] > 0) {
						miner.withdraw(container, RESOURCE_ENERGY);
					}
				}

				// If miner has nothing to do
				if (
					source.energy === 0 &&
					pile == null &&
					// Link full or miner has no energy to fill
					((link?.store.getFreeCapacity(RESOURCE_ENERGY) ?? 0) === 0 ||
						(miner.store[RESOURCE_ENERGY] === 0 &&
							container.store[RESOURCE_ENERGY] === 0)) &&
					// Container full hits or miner has no energy to repair
					(container.hits === container.hitsMax ||
						(miner.store[RESOURCE_ENERGY] === 0 &&
							container.store[RESOURCE_ENERGY] === 0))
				) {
					if (
						(miner.ticksToLive ?? CREEP_LIFE_TIME) < source.ticksToRegeneration
					) {
						this.info(`Miner ${minerName} won't live to source regen, dying`);
						miner.suicide();
					}
				}
			}

			yield;
		}
	}

	*upgradeController() {
		if (this.room.controller == null || !this.room.controller.my) {
			this.warn(
				`Failed to fine controller owned by ${global.USERNAME} in ${this.roomName}`,
			);
			return;
		}

		while (true) {
			// Maintain desired number of upgraders
			const desiredUpgraders =
				this.room.controller.level === 8
					? Math.floor(this.energyAvailable / 200000)
					: Math.min(5, Math.max(1, Math.floor(this.energyAvailable / 55000)));
			if (this.upgraders.size < desiredUpgraders) {
				if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "upgrader")) {
					this.info(
						`Requesting more upgraders: ${this.upgraders.size} < ${desiredUpgraders} (${this.energyAvailable})`,
					);
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

	*economy() {
		const sourceMining = this.sourceMining();
		const upgradeController = this.upgradeController();
		const energyCrisis = this.energyCrisis();
		while (true) {
			// Energy crisis if no miners, no energy
			if (
				this.room.controller?.my &&
				this.energyAvailable === 0 &&
				this.room.energyCapacityAvailable > 0 &&
				Iterators.all(
					this.sources,
					([_, [__, minerName]]) => Game.creeps[minerName || ""] == null,
				)
			) {
				this.warn(`Energy crisis in ${this.roomName}`);
				energyCrisis.next();
			}
			sourceMining.next();
			upgradeController.next();
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
				return;
			}

			if (message.creepName == null) {
				this.warn(`Creep request ${message.requestId} went awry`);
			} else if (role === "upgrader") {
				this.upgraders.set(message.creepName, null);
				reassignCreep(message.creepName, this.id);
			} else if (role === "tender") {
				const processId = global.kernel.spawnProcess(
					new Tender({
						creepName: message.creepName,
						roomName: this.roomName,
					}),
				);
				this.emergencyTenders.set(message.creepName, processId);
				reassignCreep(message.creepName, processId);
			} else if (role[0] === "miner") {
				const containerId = role[1];
				const [sourceId] = this.sources.get(containerId) || [null];
				if (sourceId == null) {
					this.error(
						`Container ${containerId} doesn't have source for ${message.creepName}`,
					);
					return;
				}
				this.sources.set(containerId, [sourceId, message.creepName, null]);
				reassignCreep(message.creepName, this.id);
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
		} else {
			super.receiveMessage(message);
		}
	}

	requestSpawn(
		creepName: string,
		role: ["miner", Id<StructureContainer>] | "upgrader" | "tender",
	): void {
		let body = undefined;
		if (role === "tender") {
			body = genericBody(this.room.energyAvailable);
		} else if (Array.isArray(role)) {
			body = minerBody;
		}
		const request = new SpawnRequest(
			this.id,
			this.manageSpawnsId,
			creepName,
			body,
			role === "tender",
		);
		this.spawnRequests.set(request.id, role);
		global.kernel.sendMessage(request);
	}
}
ProcessConstructors.set("Economy", Economy);

export class Expand extends RoomProcess {
	manageRoomId: ProcessId;
	manageSpawnsId: ProcessId;
	destinationManagerId: ProcessId | null;
	destinationName: string | null;
	spawnRequests: Map<MessageId, "claimer" | "scout" | "attacker">;
	invalidDestinations: Set<string>;

	scoutName: string | null;
	attackerName: string | null;
	claimerName: string | null;

	constructor({
		manageRoomId,
		manageSpawnsId,
		destinationManagerId,
		destinationName,
		spawnRequests,
		invalidDestinations,
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
		invalidDestinations?: Iterable<string>;
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
		this.invalidDestinations = new Set(invalidDestinations);

		this.scoutName = scoutName || null;
		this.attackerName = attackerName || null;
		this.claimerName = claimerName || null;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.roomName} -> ${
			this.destinationName || "??"
		}`;
	}

	*isValidDestination(roomName: string) {
		this.debug(`Checking expansion validity of ${roomName}`);
		// Already tried this one
		if (this.invalidDestinations.has(roomName)) {
			this.debug(`Room ${roomName} already tried`);
			return false;
		}

		// Room must be a standard room
		if (roomDescribe(roomName) !== global.ROOM_STANDARD) {
			this.debug(`Room ${roomName} is nonstandard ${roomDescribe(roomName)}`);
			return false;
		}

		// Send request for room scouting info and wait on it
		const request = new RequestScoutingInfo(this.id, roomName);
		const { info } = yield* Socket.send(request, SendScoutingInfo);

		// Assume unscouted rooms are expandable
		if (info == null) {
			this.debug(`Room ${roomName} unscouted`);
			return true;
		}

		// Has controller
		const controller = info.structures[STRUCTURE_CONTROLLER]?.[0];
		if (controller == null) {
			this.debug(`Room ${roomName} lacks a controller`);
			return false;
		}

		// Not owned
		if (info.owner != null || info.reservation?.username != null) {
			this.debug(
				`Room ${roomName} owned/reserved by ${
					info.owner ?? info.reservation?.username
				}`,
			);
			return false;
		}

		// Has two sources
		if (info.sources.length !== 2) {
			this.debug(`Room ${roomName} has ${info.sources.length} sources`);
			return false;
		}

		// Can path from origin storage to destination controller
		const storage = this.room.storage?.pos;
		if (storage == null) {
			throw new Error("Origin lacks storage");
		}
		const destinationCostMatrix = new PathFinder.CostMatrix();
		info.structures[STRUCTURE_WALL]?.forEach(({ x, y }) =>
			destinationCostMatrix.set(x, y, 255),
		);
		const path = PathFinder.search(
			storage,
			{
				pos: new RoomPosition(controller.x, controller.y, roomName),
				range: 1,
			},
			{
				maxOps: 20000,
			},
		);
		if (path.incomplete) {
			this.debug(`Cannot path to room ${roomName} controller`);
			return false;
		}

		// Controller is not too far
		if (path.cost > 500) {
			this.debug(`Room ${roomName} controller too far: ${path.cost}`);
			return false;
		}

		// Checks out so far
		this.debug(`Room ${roomName} checks out`);
		return true;
	}

	shouldSearchThrough(roomName: string): boolean {
		// Don't search through the central invader-filled rooms
		return (
			roomDescribe(roomName) !== global.ROOM_SOURCE_KEEPER &&
			roomDescribe(roomName) !== global.ROOM_CENTER
		);
	}

	*findDestination() {
		this.info("Finding destination");
		// BFS
		const maxSearches = 50;
		const queue = [this.roomName];
		const visited = new Set();
		let destination;
		let searches = 0;

		while (searches < maxSearches) {
			searches++;
			const current = queue.shift();
			visited.add(current);
			if (current == null) {
				this.warn("Exhausted queue");
				break;
			}
			this.debug(`Searching ${searches} ${current} ${roomDescribe(current)}`);

			const isValid = yield* this.isValidDestination(current);
			if (isValid) {
				this.debug(`Found destination ${current}`);
				destination = current;
				break;
			} else {
				this.debug(`Room ${current} is not a valid destination`);
				this.invalidDestinations.add(current);
			}

			if (this.shouldSearchThrough(current)) {
				this.debug(`Searching through ${current}`);
				Object.values(Game.map.describeExits(current))
					.filter((roomName) => !visited.has(roomName))
					.forEach((roomName) => queue.push(roomName));
			} else {
				this.debug(`Not searching through ${current}`);
			}
		}

		if (destination == null) {
			throw new Error(
				`Unable to find expansion target from ${this.roomName} : (`,
			);
		}

		return destination;
	}

	*expand() {
		while (true) {
			this.info(`Room ${this.roomName} expanding to ${this.destinationName}`);
			// Pick a destination
			if (this.destinationName == null) {
				this.destinationName = yield* this.findDestination();
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
			const numSources = destination.find(FIND_SOURCES).length;
			if (numSources !== 2) {
				this.warn(
					`Abandoning expansion target ${this.destinationName}, lacks two sources`,
				);
				this.invalidDestinations.add(this.destinationName);
				this.destinationName = null;
				continue;
			}
			const controller = destination.controller;
			if (controller == null) {
				this.warn(
					`Abandoning expansion target ${this.destinationName}, lacks controller`,
				);
				this.invalidDestinations.add(this.destinationName);
				this.destinationName = null;
				continue;
			}
			if (
				(controller.owner !== undefined &&
					controller.owner.username !== global.USERNAME) ||
				controller.reservation?.username !== undefined
			) {
				this.warn(
					`Abandoning expansion target ${
						this.destinationName
					}, owned / reserved by ${
						controller.owner ?? controller.reservation?.username
					}`,
				);
				this.invalidDestinations.add(this.destinationName);
				this.destinationName = null;
				continue;
			}
			if (
				scout.room.name === this.destinationName &&
				// If the scout is actually next to the controller, moveTo returns
				// ERR_NO_PATH, also, not letting it get closer than two should help
				// prevent it blocking the controller.
				scout.pos.getRangeTo(controller.pos) > 2
			) {
				const response = scout.moveTo(controller, { range: 1 });
				if (response === ERR_NO_PATH) {
					this.warn(
						`Abandoning expansion target ${this.destinationName}, cannot path to controller`,
					);
					this.invalidDestinations.add(this.destinationName);
					this.destinationName = null;
					continue;
				}
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
					this.warn(`Attacker received response ${errorConstant(response)}`);
				}

				yield;
				continue;
			}

			// Claim the destination
			if (!controller.my) {
				if (
					Object.values(Game.rooms).filter((r) => r.controller?.my).length >=
					Game.gcl.level
				) {
					this.warn("Too many owned rooms");
					return;
				}

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
					this.warn(`Claimer received response ${errorConstant(response)}`);
				}

				yield;
				continue;
			}

			// Spawn a ManageRoom process for the new room
			if (
				this.destinationManagerId == null ||
				!global.kernel.hasProcess(this.destinationManagerId)
			) {
				this.destinationManagerId =
					destination.memory.processes?.["ManageRoom"] ?? null;
				// No saved ManageRoom id or outdated ManageRoom id
				if (
					this.destinationManagerId == null ||
					!global.kernel.hasProcess(this.destinationManagerId)
				) {
					this.info(`Spawning new ManageRoom ${this.destinationManagerId}`);
					this.destinationManagerId = global.kernel.spawnProcess(
						new ManageRoom({
							roomName: this.destinationName,
							manageSpawnsId: this.manageSpawnsId,
						}),
					);
				} else {
					// Adopt existing ManageRoom
					this.info(`Adopting ManageRoom ${this.destinationManagerId}`);
					const adopt = new UpdateManageSpawnsId(
						this.id,
						this.destinationManagerId,
						this.id,
					);
					global.kernel.sendMessage(adopt);
				}
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
			this.info(
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
				this.warn(
					`Unexpectedly received message about unrequested creep: ${JSON.stringify(
						message,
					)}`,
				);
			}

			if (message.creepName == null) {
				this.warn(`Creep request ${message.requestId} went awry`);
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

function minerBody(energyAvailable: number): BodyPartConstant[] {
	// 1050 energy is enough to drain a source in 188t (8W 4M 1C)
	let energy = Math.min(energyAvailable, 1050);
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

export class Defence extends RoomProcess {
	manageSpawnsId: ProcessId;
	spawnRequests: Map<MessageId, "defender">;

	defenders: Map<string, null>;
	trackedHostiles: Map<Id<Creep | AnyOwnedStructure>, number>;

	constructor({
		manageSpawnsId,
		spawnRequests,
		defenders,
		trackedHostiles,
		...data
	}: Omit<ProcessData<typeof RoomProcess>, "name"> & {
		manageSpawnsId: ProcessId;
		spawnRequests?: Iterable<[MessageId, "defender"]>;
		defenders?: Iterable<[string, null]>;
		trackedHostiles?: Iterable<[Id<Creep | AnyOwnedStructure>, number]>;
	}) {
		super({ name: "Defence", ...data });
		this.generator = this.defence();

		this.manageSpawnsId = manageSpawnsId;
		this.spawnRequests = new Map(spawnRequests);
		this.defenders = new Map(defenders);
		this.trackedHostiles = new Map(trackedHostiles);
	}

	_hostiles: (Creep | AnyOwnedStructure)[] = [];
	_hostilesTick: number | null = null;
	get hostiles(): (Creep | AnyOwnedStructure)[] {
		if (this._hostilesTick !== Game.time) {
			this._hostiles = (
				this.room.find(FIND_HOSTILE_CREEPS) as (Creep | AnyOwnedStructure)[]
			).concat(this.room.find(FIND_HOSTILE_STRUCTURES));
			this._hostilesTick = Game.time;
		}

		return this._hostiles;
	}

	init(): void {
		if (this.room.controller == null || !this.room.controller.my) {
			throw new Error(`Room ${this.roomName} is not my room, will not defend`);
		}
	}

	*manageTowers() {
		while (true) {
			const towers = this.room
				.find(FIND_MY_STRUCTURES)
				.filter(
					(s): s is StructureTower => s.structureType === STRUCTURE_TOWER,
				);
			if (towers.length === 0) {
				yield;
				continue;
			}

			// Attack hostiles
			if (this.hostiles.length > 0) {
				for (const tower of towers) {
					// For now, all attack the same one
					tower.attack(this.hostiles[0]);
				}

				yield;
				continue;
			}

			// If no hostiles, heal friendlies
			const injured = this.room
				.find(FIND_MY_CREEPS)
				.find((c) => c.hits < c.hitsMax);
			if (injured != null) {
				for (const tower of towers) {
					tower.heal(injured);
				}

				yield;
				continue;
			}

			yield;
		}
	}

	*manageDefenders() {
		while (true) {
			if (this.hostiles.length === 0) {
				yield;
				continue;
			}

			const towers = this.room
				.find(FIND_MY_STRUCTURES)
				.filter(
					(s): s is StructureTower => s.structureType === STRUCTURE_TOWER,
				);
			// Only check damage to previously tracked hostiles
			const hostileHits = Iterators.sum(
				this.hostiles
					.filter((h) => this.trackedHostiles.has(h.id))
					.map((h) => h.hits),
			);
			const trackedHits = Iterators.sum(this.trackedHostiles.values());

			this.info(
				`Hostile hits: ${hostileHits} tracked: ${trackedHits}!!${
					trackedHits - hostileHits
				} !!`,
			);

			// If there are no operational towers or we are not doing at least 100
			// damage per tick, spawn a defender
			if (
				this.defenders.size === 0 &&
				(towers.filter((s) => s.store[RESOURCE_ENERGY] > 0).length === 0 ||
					(trackedHits > 0 && trackedHits - hostileHits < 100))
			) {
				if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "defender")) {
					this.requestSpawn("Defender", "defender");
				}
			}

			for (const [defenderName, _] of this.defenders) {
				const defender = Game.creeps[defenderName];
				if (defender == null) {
					this.defenders.delete(defenderName);
					continue;
				}
				const target = defender.pos.findClosestByPath(this.hostiles);
				if (target == null) {
					this.error(`Creep ${defenderName} unable to find closest hostile`);
					continue;
				}

				const response = defender.attack(target);
				if (response === ERR_NOT_IN_RANGE) {
					defender.moveTo(target);
				} else if (response !== OK) {
					this.info(
						`Creep ${defenderName} attacking ${
							target.pos
						} with response ${errorConstant(response)} `,
					);
				}
			}

			yield;
		}
	}

	*trackHostiles() {
		while (true) {
			this.trackedHostiles.clear();
			for (const hostile of this.hostiles) {
				this.trackedHostiles.set(hostile.id, hostile.hits);
			}

			yield;
		}
	}

	*defence() {
		const manageTowers = this.manageTowers();
		const manageDefenders = this.manageDefenders();
		const trackHostiles = this.trackHostiles();
		while (true) {
			manageTowers.next();
			manageDefenders.next();

			trackHostiles.next();
			yield;
		}
	}

	requestSpawn(creepName: string, role: "defender"): void {
		let body: BodyPartConstant[] = [];
		if (role === "defender") {
			body = bodyFromSegments([ATTACK, MOVE], this.room.energyAvailable);
		}
		const request = new SpawnRequest(
			this.id,
			this.manageSpawnsId,
			creepName,
			body,
			role === "defender",
		);
		this.spawnRequests.set(request.id, role);
		global.kernel.sendMessage(request);
	}

	receiveMessage(message: IMessage): void {
		if (message instanceof CreepSpawned) {
			const role = this.spawnRequests.get(message.requestId);
			if (role == null) {
				this.warn(
					`Unexpectedly received message about unrequested creep: ${JSON.stringify(
						message,
					)} `,
				);
			}

			if (message.creepName == null) {
				this.warn(`Creep request ${message.requestId} went awry`);
			} else if (role === "defender") {
				this.defenders.set(message.creepName, null);
				reassignCreep(message.creepName, this.id);
			}

			this.spawnRequests.delete(message.requestId);
		} else {
			super.receiveMessage(message);
		}
	}
}
ProcessConstructors.set("Defence", Defence);

export class ManageLinks extends RoomProcess {
	storageLinkId: Id<StructureLink> | null;
	controllerLinkId: Id<StructureLink> | null;
	sourceLinkIds: Set<Id<StructureLink>>;

	constructor({
		storageLinkId,
		controllerLinkId,
		sourceLinkIds,
		...data
	}: Omit<ProcessData<typeof RoomProcess>, "name"> & {
		storageLinkId?: Id<StructureLink> | null;
		controllerLinkId?: Id<StructureLink> | null;
		sourceLinkIds?: Iterable<Id<StructureLink>>;
	}) {
		super({ name: "ManageLinks", ...data });
		this.generator = this.manageLinks();

		this.storageLinkId = storageLinkId || null;
		this.controllerLinkId = controllerLinkId || null;
		this.sourceLinkIds = new Set(sourceLinkIds);
	}

	/** Reaquires link IDs */
	searchForLinks() {
		// Find a link within 2 of the storage
		let storageLink: StructureLink | null = null;
		if (this.storageLinkId != null) {
			storageLink = Game.getObjectById(this.storageLinkId);
		}
		if (this.storageLinkId == null || storageLink == null) {
			this.storageLinkId = null;
			if (this.room.storage != null) {
				storageLink =
					this.room.storage.pos
						.findInRange(FIND_MY_STRUCTURES, 2)
						.find(
							(s): s is StructureLink => s.structureType === STRUCTURE_LINK,
						) || null;
				if (storageLink != null) {
					this.storageLinkId = storageLink.id;
				}
			}
		}

		// Find a link within 2 of the controller
		let controllerLink: StructureLink | null = null;
		if (this.controllerLinkId != null) {
			controllerLink = Game.getObjectById(this.controllerLinkId);
		}
		if (this.controllerLinkId == null || controllerLink == null) {
			this.controllerLinkId = null;
			if (this.room.controller != null) {
				controllerLink =
					this.room.controller.pos
						.findInRange(FIND_MY_STRUCTURES, 2)
						.find(
							(s): s is StructureLink => s.structureType === STRUCTURE_LINK,
						) || null;
				if (controllerLink != null) {
					this.controllerLinkId = controllerLink.id;
				}
			}
		}

		// Find a link within 2 of each source
		this.sourceLinkIds = new Set(
			this.room
				.find(FIND_SOURCES)
				.map(
					(source) =>
						source.pos
							.findInRange(FIND_MY_STRUCTURES, 2)
							.find(
								(s): s is StructureLink => s.structureType === STRUCTURE_LINK,
							) || null,
				)
				.filter((link): link is StructureLink => link != null)
				.map((link) => link.id),
		);
	}

	emptySourceLinks() {
		/** Link and current store */
		const sourceLinks: [StructureLink, number][] = [];
		this.sourceLinkIds.forEach((linkId) => {
			const link = Game.getObjectById(linkId);
			if (link != null) sourceLinks.push([link, link.store[RESOURCE_ENERGY]]);
		});
		// Sort by energy
		sourceLinks.sort(([_, a], [__, b]) => b - a);

		// Controller link
		let controllerLink: StructureLink | null = null;
		let controllerLinkEnergy = 0;
		if (this.controllerLinkId != null) {
			controllerLink = Game.getObjectById(this.controllerLinkId);
			controllerLinkEnergy = controllerLink?.store[RESOURCE_ENERGY] || 0;
		}

		// Storage link
		let storageLink: StructureLink | null = null;
		let storageLinkEnergy = 0;
		if (this.storageLinkId != null) {
			storageLink = Game.getObjectById(this.storageLinkId);
			storageLinkEnergy = storageLink?.store[RESOURCE_ENERGY] || 0;
		}

		const targets: [
			[0, StructureLink | null, number],
			[1, StructureLink | null, number],
		] = [
			[0, controllerLink, controllerLinkEnergy],
			[1, storageLink, storageLinkEnergy],
		];

		// Iterate through source links
		for (const [link, linkEnergy] of sourceLinks) {
			if (link.cooldown > 0 || linkEnergy < LINK_CAPACITY * 0.25) {
				continue;
			}
			const [targetIndex, target, targetEnergy] = targets.find(
				([_, l, e]) => l != null && e < LINK_CAPACITY * 0.75,
			) || [-1, null, 0];
			if (target == null) {
				break;
			}

			const transferEnergy = Math.min(LINK_CAPACITY - targetEnergy, linkEnergy);
			const response = link.transferEnergy(target, transferEnergy);
			this.debug(
				`Link ${link.id.slice(
					-4,
				)} transfering ${transferEnergy} to ${target.id.slice(
					-4,
				)} with ${errorConstant(response)} `,
			);
			targets[targetIndex][2] += transferEnergy;
		}
	}

	*manageLinks() {
		while (true) {
			if (Game.time % 100 === 0) {
				this.searchForLinks();
			}

			this.emptySourceLinks();
			yield;
		}
	}
}
ProcessConstructors.set("ManageLinks", ManageLinks);
