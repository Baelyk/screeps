import {
	RoomProcess,
	ProcessData,
	ProcessConstructors,
	ProcessId,
} from "./../process";
import { IMessage, IPrivateMessage, MessageId } from "./../messenger";
import { Counter } from "./../utils/counter";
import * as Iterators from "./../utils/iterators";
import * as LZString from "lz-string";
import {
	bareCoord,
	Coord,
	coordToIndex,
	coordToRoomPosition,
	coordToRoomPositionMapper,
	getNeighbors,
	getTilesInRange,
	Index,
	indexToCoord,
	RoomCoord,
	RoomCoordSet,
} from "./../utils/coord";

import { plan_room } from "./Cargo.toml";

const PRETTY_ROAD_ADJUSTMENT = 1;
const WALL_ADJACENT_COST = 6;
const DEFAULT_COST = 0;
// From fatigue values (wiki/Pathfinding)
const ROAD_COST = 1;
const PLAIN_COST = 2;
const SWAMP_COST = 10;
const UNWALKABLE_COST = 255;
const MAX_EXTENSION_ROAD = 15;

function loadTerrain(roomName: string): [RoomTerrain, CostMatrix, Set<Index>] {
	const costMatrix = new PathFinder.CostMatrix();
	const occupied = new Set<Index>();
	const terrain = Game.map.getRoomTerrain(roomName);
	for (let x = 0; x < 50; x++) {
		for (let y = 0; y < 50; y++) {
			if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
				occupied.add(coordToIndex({ x, y }));
				getNeighbors({ x, y })
					.filter(({ x, y }) => terrain.get(x, y) !== TERRAIN_MASK_WALL)
					.forEach(({ x, y }) => costMatrix.set(x, y, WALL_ADJACENT_COST));
			}
		}
	}

	return [terrain, costMatrix, occupied];
}

function occupyTiles(
	set: Set<Index>,
	tiles: Index | Coord | Index[] | Coord[],
): void {
	let spots: Index[];
	if (Array.isArray(tiles)) {
		if (tiles.length === 0) {
			return;
		}
		if (typeof tiles[0] === "object") {
			spots = (tiles as Coord[]).map(coordToIndex);
		} else {
			spots = tiles as Index[];
		}
	} else if (typeof tiles === "object") {
		spots = [coordToIndex(tiles)];
	} else {
		spots = [tiles];
	}

	spots.forEach((spot) => set.add(spot));
}

function unoccupyTiles(
	set: Set<Index>,
	tiles: Index | Coord | Index[] | Coord[],
): void {
	let spots: Index[];
	if (Array.isArray(tiles)) {
		if (tiles.length === 0) {
			return;
		}
		if (typeof tiles[0] === "object") {
			spots = (tiles as Coord[]).map(coordToIndex);
		} else {
			spots = tiles as Index[];
		}
	} else if (typeof tiles === "object") {
		spots = [coordToIndex(tiles)];
	} else {
		spots = [tiles];
	}

	spots.forEach((spot) => set.delete(spot));
}

export interface IBlueprint {
	structures: Partial<Record<StructureConstant, RoomCoord[]>>;
}

abstract class Blueprint extends RoomProcess implements IBlueprint {
	costMatrices: { [roomName: string]: CostMatrix };
	terrain: RoomTerrain;
	occupied: Set<Index>;

	structures: Partial<Record<StructureConstant, RoomCoord[]>>;

	roads: RoomCoordSet;

	constructor({ ...data }: ProcessData<typeof RoomProcess> & {}) {
		super(data);
		this.costMatrices = {};

		[this.terrain, this.costMatrices[this.roomName], this.occupied] =
			loadTerrain(this.roomName);
		this.structures = {};

		this.roads = new RoomCoordSet();
	}

	occupy(pos: Index | Coord | Index[] | Coord[]): void {
		occupyTiles(this.occupied, pos);
	}

	unoccupy(pos: Index | Coord | Index[] | Coord[]): void {
		unoccupyTiles(this.occupied, pos);
	}

	getCostMatrix(roomName: string): CostMatrix {
		if (!(roomName in this.costMatrices)) {
			this.debug(`Creating new cost matrix for ${roomName}`);
			this.costMatrices[roomName] = new PathFinder.CostMatrix();
		}
		return this.costMatrices[roomName];
	}

	updateCostMatrix(pos: RoomCoord | RoomCoord[], cost: number): void {
		if (!Array.isArray(pos)) {
			this.getCostMatrix(pos.roomName).set(pos.x, pos.y, cost);
			return;
		}
		for (const { x, y, roomName } of pos) {
			this.getCostMatrix(roomName).set(x, y, cost);
		}
	}

	findPath(
		origin: RoomPosition,
		goal: RoomPosition,
		range: number,
		opts?: Partial<{ allowOtherRooms: boolean; maxOps: number }>,
	): PathFinderPath {
		this.debug(`Pathing ${JSON.stringify(origin)} to ${JSON.stringify(goal)}`);
		const options = { allowOtherRooms: false, maxOps: 4000 };
		Object.assign(options, opts);
		return PathFinder.search(
			origin,
			{ pos: goal, range },
			{
				roomCallback: (roomName) => {
					// Do not search other rooms
					if (roomName !== this.roomName && !options.allowOtherRooms) {
						this.debug(`${roomName} is not ${this.roomName}, will not search`);
						return false;
					}
					return this.getCostMatrix(roomName);
				},
				plainCost: PLAIN_COST + PRETTY_ROAD_ADJUSTMENT,
				swampCost: PLAIN_COST + PRETTY_ROAD_ADJUSTMENT,
				...options,
			},
		);
	}

	blueprint(): IBlueprint {
		this.structures[STRUCTURE_ROAD] = Array.from(this.roads);
		return { structures: this.structures };
	}
}

export class RoomPlanner extends Blueprint {
	manageRoomId: ProcessId;

	constructor({
		manageRoomId,
		...data
	}: Omit<ProcessData<typeof Blueprint>, "name"> & {
		manageRoomId: ProcessId;
	}) {
		super({ name: "RoomPlanner", ...data });
		this.generator = this.roomPlanner();

		this.manageRoomId = manageRoomId;
	}

	*roomPlanner() {
		this.info(`Planning room ${this.roomName}`);

		const blueprint = JSON.parse(plan_room(this.roomName));
		const message = new SendBlueprint(this.id, this.manageRoomId, blueprint);
		global.kernel.sendMessage(message);
		yield;
	}
}
ProcessConstructors.set("RoomPlanner", RoomPlanner);

export class SendBlueprint implements IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;

	blueprint: IBlueprint;

	constructor(from: ProcessId, to: ProcessId, blueprint: IBlueprint) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;

		this.blueprint = blueprint;
	}
}

export function blueprintToBuildingPlannerLink(blueprint: IBlueprint): string {
	const json = {
		rcl: 8,
		buildings: blueprint.structures,
	};
	const jsonString = JSON.stringify(json);
	const compressed = LZString.compressToEncodedURIComponent(jsonString);
	const link = `https://screepers.github.io/screeps-tools/?share=${compressed}#/building-planner`;
	return link;
}

export class RemotePlanner extends Blueprint {
	ownerName: string;
	remoteRoomId: ProcessId;

	constructor({
		ownerName,
		remoteRoomId,
		...data
	}: Omit<ProcessData<typeof Blueprint>, "name"> & {
		ownerName: string;
		remoteRoomId: ProcessId;
	}) {
		super({ name: "RoomPlanner", ...data });
		this.generator = this.remotePlanner();

		this.ownerName = ownerName;
		this.remoteRoomId = remoteRoomId;
	}

	sourceRoads(origin: RoomPosition) {
		const sources = this.room.find(FIND_SOURCES);
		this.structures[STRUCTURE_CONTAINER] = [];
		for (const source of sources) {
			const path = this.findPath(source.pos, origin, 1, {
				allowOtherRooms: true,
			});
			if (path.incomplete) {
				this.error(`Unable to complete path ${source.pos} to ${origin}`);
				continue;
			}
			this.structures[STRUCTURE_CONTAINER].push(path.path[0]);
			path.path.shift();
			this.updateCostMatrix(path.path, ROAD_COST);
			path.path.forEach((road) => this.roads.add(road));
		}
	}

	controllerRoad(origin: RoomPosition) {
		if (this.room.controller == null) {
			throw new Error("Room controller not found");
		}

		const path = this.findPath(this.room.controller.pos, origin, 1, {
			allowOtherRooms: true,
		});
		if (path.incomplete) {
			this.error(
				`Unable to complete path ${this.room.controller.pos} to ${origin} (ops ${path.ops})`,
			);
			return;
		}
		this.updateCostMatrix(path.path, ROAD_COST);
		path.path.forEach((road) => this.roads.add(road));
	}

	*remotePlanner() {
		const origin = Game.rooms[this.ownerName].storage?.pos;
		if (origin == null) {
			throw new Error(`Unable to find storage in owner ${this.ownerName}`);
		}
		// Plan roads to sources (and container)
		this.sourceRoads(origin);
		// Plan road to controller
		this.controllerRoad(origin);

		const blueprint = this.blueprint();
		const message = new SendBlueprint(this.id, this.remoteRoomId, blueprint);
		global.kernel.sendMessage(message);
		yield;
	}
}
