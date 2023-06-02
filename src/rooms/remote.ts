import { errorConstant } from "./../utils/logger";
import { IMessage, MessageId } from "./../messenger";
import { bodyFromSegments, genericBody, haulerBody } from "./../creeps/bodies";
import * as Iterators from "./../utils/iterators";
import {
	IBlueprint,
	blueprintToBuildingPlannerLink,
	RemotePlanner,
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

import { Harvester, Hauler, Tender, Upgrader } from "./../creeps";
import { Construct } from "./construct";
import {
	CreepSpawned,
	ManageSpawns,
	SpawnRequest,
	UpdateManageSpawnsId,
} from "./spawns";
import { Economy } from "./index";
import { coordToIndex, roomCoordToRoomPosition } from "utils/coord";
import { wrapper } from "utils/errors";

type RemoteRoomRole =
	| "claimer"
	| "scout"
	| "guard"
	| ["hauler", Id<StructureContainer>];
export class RemoteRoom extends RoomProcess {
	plannerId: ProcessId | null;
	constructId: ProcessId | null;
	economyId: ProcessId | null;
	manageSpawnsId: ProcessId;
	spawnRequests: Map<MessageId, RemoteRoomRole>;
	blueprint: IBlueprint | null;
	containers: Map<Id<StructureContainer>, [string | null, ProcessId | null]>;

	ownerName: string;
	scoutName: string | null;
	guardName: string | null;
	claimerName: string | null;

	constructor({
		plannerId,
		constructId,
		economyId,
		manageSpawnsId,
		ownerName,
		spawnRequests,
		blueprint,
		containers,
		scoutName,
		guardName,
		claimerName,
		...data
	}: Omit<ProcessData<typeof RoomProcess>, "name"> & {
		ownerName: string;
		manageSpawnsId: ProcessId;
	} & Partial<{
			plannerId: ProcessId | null;
			constructId: ProcessId | null;
			economyId: ProcessId | null;
			spawnRequests?: Iterable<[MessageId, RemoteRoomRole]>;
			blueprint: IBlueprint | null;
			containers: Iterable<
				[Id<StructureContainer>, [string, ProcessId | null]]
			>;
			scoutName?: string | null;
			guardName?: string | null;
			claimerName?: string | null;
		}>) {
		super({ name: "RemoteRoom", ...data });
		this.generator = this.remoteRoom();

		this.manageSpawnsId = manageSpawnsId;
		this.ownerName = ownerName;

		this.plannerId = plannerId ?? null;
		this.constructId = constructId ?? null;
		this.economyId = economyId ?? null;

		this.spawnRequests = new Map(spawnRequests);
		this.blueprint = blueprint ?? null;
		this.containers = new Map(containers);

		this.scoutName = scoutName ?? null;
		this.guardName = guardName ?? null;
		this.claimerName = claimerName ?? null;
	}

	display(): string {
		return `${this.id} ${this.name} ${this.roomName} by ${this.ownerName}`;
	}

	*scoutRoom() {
		while (true) {
			const scout = Game.creeps[this.scoutName ?? ""];
			// Spawn scout if it doesn't exist
			if (scout == null) {
				this.scoutName = null;
				if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "scout")) {
					this.requestSpawn("Scout", "scout");
				}
				yield;
				continue;
			}

			// Move to the room
			const dummyPosition = new RoomPosition(24, 24, this.roomName);
			scout.moveTo(dummyPosition, { range: 22 });

			yield;
		}
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

	*guardRoom() {
		while (true) {
			// Clear the destination of hostiles
			const hostile = this.hostiles[0];
			if (hostile != null) {
				const guard = Game.creeps[this.guardName ?? ""];
				if (guard == null) {
					this.guardName = null;
					if (!Iterators.some(this.spawnRequests, ([_, v]) => v === "guard")) {
						this.requestSpawn("Guard", "guard");
					}
					yield;
					continue;
				}
				if (guard.spawning) {
					yield;
					continue;
				}

				const response = guard.attack(hostile);
				if (response === ERR_NOT_IN_RANGE) {
					guard.moveTo(hostile);
				} else if (response !== OK) {
					this.warn(`Guard received response ${errorConstant(response)}`);
				}
			}

			yield;
		}
	}

	*claimRoom() {
		while (true) {
			if (this.room.controller == null) {
				throw new Error("Room lacks a controller");
			}
			if (this.room.controller.owner != null) {
				throw new Error(
					`Owned rooms should not be remotes (${this.room.controller.owner})`,
				);
			}
			// Wait for claimer
			const claimer = Game.creeps[this.claimerName ?? ""];
			if (claimer == null) {
				// But we actually only need one if its not over 20% reserved
				if (
					this.room.controller.reservation?.username !== global.USERNAME ||
					this.room.controller.reservation.ticksToEnd <
						CONTROLLER_RESERVE_MAX * 0.2
				) {
					this.claimerName = null;
					if (
						!Iterators.some(this.spawnRequests, ([_, v]) => v === "claimer")
					) {
						this.requestSpawn("Reserver", "claimer");
					}
				}
				yield;
				continue;
			}

			let response: ScreepsReturnCode | null;
			if (
				this.room.controller.reservation != null &&
				this.room.controller.reservation.username !== global.USERNAME
			) {
				// Attack foreign reserved controller
				response = claimer.attackController(this.room.controller);
			} else {
				response = claimer.reserveController(this.room.controller);
			}
			if (response === ERR_NOT_IN_RANGE) {
				claimer.moveTo(this.room.controller);
			} else if (response != null && response !== OK) {
				this.warn(`Claimer received response ${errorConstant(response)}`);
			}

			yield;
		}
	}

	*construct() {
		while (true) {
			// Wait for blueprint
			if (this.blueprint == null) {
				// Spawn planner if there is not one yet
				if (
					this.plannerId == null ||
					!global.kernel.hasProcess(this.plannerId)
				) {
					const planner = new RemotePlanner({
						roomName: this.roomName,
						ownerName: this.ownerName,
						remoteRoomId: this.id,
					});
					this.plannerId = global.kernel.spawnProcess(planner);
				}

				yield;
				continue;
			}

			if (
				this.constructId == null ||
				!global.kernel.hasProcess(this.constructId)
			) {
				const construct = new Construct({
					roomName: this.roomName,
					manageSpawnsId: this.manageSpawnsId,
				});
				this.constructId = global.kernel.spawnProcess(construct);
			}

			// Build the blueprint
			if (Game.time % 100 === 0) {
				this.info("Building");
				wrapper(
					(() => {
						// Build all containers right away (first to get miners going)
						(this.blueprint?.structures[STRUCTURE_CONTAINER] ?? []).forEach(
							(coord) =>
								roomCoordToRoomPosition(coord).createConstructionSite(
									STRUCTURE_CONTAINER,
								),
						);

						// Build all the roads right away
						(this.blueprint?.structures[STRUCTURE_ROAD] ?? []).forEach(
							(coord) =>
								roomCoordToRoomPosition(coord).createConstructionSite(
									STRUCTURE_ROAD,
								),
						);
					}).bind(this),
					"Error while building",
				);
			}

			yield;
		}
	}

	*mineSources() {
		while (true) {
			if (this.economyId == null || !global.kernel.hasProcess(this.economyId)) {
				const economy = new Economy({
					roomName: this.roomName,
					manageSpawnsId: this.manageSpawnsId,
				});
				this.economyId = global.kernel.spawnProcess(economy);
			}

			yield;
		}
	}

	*haulEnergy() {
		while (true) {
			// Update containers
			if (this.containers.size === 0 || Game.time % 100 === 0) {
				const containers: typeof this.containers = new Map();
				const containerIds = this.room
					.find(FIND_STRUCTURES)
					.filter(
						(s): s is StructureContainer =>
							s.structureType === STRUCTURE_CONTAINER,
					)
					.map((c) => c.id);

				for (const containerId of containerIds) {
					const [haulerName, processId] = this.containers.get(containerId) ?? [
						null,
						null,
					];
					containers.set(containerId, [haulerName, processId]);
				}

				this.containers = containers;
			}

			for (const [containerId, [haulerName, processId]] of this.containers) {
				const container = Game.getObjectById(containerId);
				if (container == null) {
					this.containers.delete(containerId);
					continue;
				}
				const hauler = Game.creeps[haulerName ?? ""];
				if (haulerName == null || hauler == null) {
					this.containers.set(containerId, [null, null]);
					if (
						!Iterators.some(
							this.spawnRequests,
							([_, v]) => v[0] === "hauler" && v[1] === container.id,
						)
					) {
						this.requestSpawn("Hauler", ["hauler", container.id]);
					}
					continue;
				}
				const storage = Game.rooms[this.ownerName]?.storage;
				if (storage == null) {
					throw new Error(`Owner room ${this.ownerName} lacks a storage`);
				}
				if (processId == null || !global.kernel.hasProcess(processId)) {
					const newProcessId = global.kernel.spawnProcess(
						new Hauler({
							creepName: haulerName,
							sink: storage.pos,
							source: container.pos,
						}),
					);
					this.containers.set(containerId, [haulerName, newProcessId]);
				}
			}
			yield;
		}
	}

	*remoteRoom() {
		const scoutRoom = this.scoutRoom();
		const guardRoom = this.guardRoom();
		const claimRoom = this.claimRoom();
		const construct = this.construct();
		const mineSources = this.mineSources();
		const haulEnergy = this.haulEnergy();
		while (true) {
			this.info(`Remote room ${this.roomName} for ${this.ownerName}`);
			scoutRoom.next();
			// Wait until room visible to continue
			if (!this.isVisible) {
				yield;
				continue;
			}
			guardRoom.next();
			// Don't spawn claimer if hostiles in room?
			claimRoom.next();
			// Wait until room reserved to continue
			if (this.room.controller?.reservation?.username !== global.USERNAME) {
				yield;
				continue;
			}
			construct.next();
			mineSources.next();
			haulEnergy.next();
			yield;
		}
	}

	requestSpawn(creepName: string, role: RemoteRoomRole): void {
		let body:
			| BodyPartConstant[]
			| ((energy: number) => BodyPartConstant[])
			| undefined;
		if (role === "claimer") {
			// Copied this from my previous bot, idk about the 9 segment max
			body = (energy) => bodyFromSegments([CLAIM, MOVE], energy, 9);
		} else if (role === "scout") {
			body = [MOVE];
		} else if (role === "guard") {
			body = (energy) => bodyFromSegments([ATTACK, MOVE], energy);
		} else if (role[0] === "hauler") {
			body = haulerBody;
		} else {
			this.error(`Unexpected role ${JSON.stringify(role)}`);
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

			if (message.creepName == null || role == null) {
				this.warn(`Creep request ${message.requestId} went awry`);
			} else if (role === "scout") {
				this.scoutName = message.creepName;
				reassignCreep(message.creepName, this.id);
			} else if (role === "guard") {
				this.guardName = message.creepName;
				reassignCreep(message.creepName, this.id);
			} else if (role === "claimer") {
				this.claimerName = message.creepName;
				reassignCreep(message.creepName, this.id);
			} else if (role[0] === "hauler") {
				this.containers.set(role[1], [message.creepName, null]);
				reassignCreep(message.creepName, this.id);
			}

			this.spawnRequests.delete(message.requestId);
		} else if (message instanceof SendBlueprint) {
			this.blueprint = message.blueprint;
		} else {
			super.receiveMessage(message);
		}
	}
}
ProcessConstructors.set("RemoteRoom", RemoteRoom);
