import { bareCoord, Coord } from "./utils/coord";
import {
	Process,
	ProcessConstructors,
	ProcessData,
	ProcessId,
} from "./process";
import { IMessage, IPublicMessage, MessageId } from "./messenger";

declare global {
	interface Memory {
		scouting?: ScoutingMemory;
	}
	interface SettingsMemory {
		scoutingUpdateInterval?: number;
	}
}

type ScoutingMemory = Partial<Record<string, RoomScoutingInfo>>; // { [roomName: string]: RoomScoutingMemory };
interface RoomScoutingInfo {
	time: number;
	sources: Coord[];
	mineral?: { mineralType: ResourceConstant; pos: Coord };
	owner?: string;
	reservation?: { username: string; ticksToEnd: number };
	structures: Partial<Record<StructureConstant, Coord[]>>;
}

export class Scouting extends Process {
	constructor(data: Omit<ProcessData<typeof Process>, "name">) {
		super({
			name: "Scouting",
			...data,
		});
		this.generator = this.scouting();
	}

	getScoutingInfo(roomName: string): RoomScoutingInfo | null {
		const info = Memory.scouting?.[roomName] ?? null;
		return info;
	}

	shouldUpdate(room: Room): boolean {
		const lastTime = Memory.scouting?.[room.name]?.time || -Infinity;
		const updateInterval = Memory.settings?.scoutingUpdateInterval ?? 10000;
		return Game.time - lastTime > updateInterval;
	}

	scoutRoom(room: Room): void {
		this.info(`Scouting ${room.name}`);

		const time = Game.time;
		const sources = room.find(FIND_SOURCES).map((s) => bareCoord(s.pos));
		const mineral = room.find(FIND_MINERALS).map((m) => {
			return { mineralType: m.mineralType, pos: bareCoord(m.pos) };
		})[0];

		let owner = undefined;
		let reservation = undefined;
		const structures: Partial<Record<StructureConstant, Coord[]>> = {};

		// Controller info
		if (room.controller != null) {
			owner = room.controller.owner?.username;
			reservation = room.controller.reservation;
			structures[STRUCTURE_CONTROLLER] = [bareCoord(room.controller.pos)];
		}

		// Walls
		structures[STRUCTURE_WALL] = room
			.find(FIND_STRUCTURES)
			.filter((s) => s.structureType === STRUCTURE_WALL)
			.map((s) => bareCoord(s.pos));

		this.updateMemory(room.name, {
			time,
			sources,
			mineral,
			owner,
			reservation,
			structures,
		});
	}

	updateMemory(roomName: string, info: RoomScoutingInfo): void {
		if (Memory.scouting == null) {
			Memory.scouting = {};
		}
		Memory.scouting[roomName] = info;
	}

	respondToRequests(): void {
		const requests = global.kernel
			.getPublicMessages()
			.filter(
				(m): m is RequestScoutingInfo => m instanceof RequestScoutingInfo,
			);
		for (const { from, id, roomName } of requests) {
			this.info(
				`Responding to scout request ${id} from ${from} for ${roomName}`,
			);
			const info = this.getScoutingInfo(roomName);
			const response = new SendScoutingInfo(this.id, from, id, roomName, info);
			global.kernel.sendMessage(response);
			global.kernel.removePublicMessage(id);
		}
	}

	*scouting() {
		while (true) {
			for (const roomName in Game.rooms) {
				const room = Game.rooms[roomName];
				if (this.shouldUpdate(room)) {
					this.scoutRoom(room);
				}
			}
			this.respondToRequests();
			yield;
		}
	}
}
ProcessConstructors.set("Scouting", Scouting);

export class RequestScoutingInfo implements IPublicMessage {
	id: MessageId;
	from: ProcessId;
	to: undefined;

	roomName: string;

	constructor(from: ProcessId, roomName: string) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;

		this.roomName = roomName;
	}
}

export class SendScoutingInfo implements IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;

	requestId: MessageId;
	roomName: string;
	info: RoomScoutingInfo | null;

	constructor(
		from: ProcessId,
		to: ProcessId,
		requestId: MessageId,
		roomName: string,
		info: RoomScoutingInfo | null,
	) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;

		this.requestId = requestId;
		this.roomName = roomName;
		this.info = info;
	}
}
