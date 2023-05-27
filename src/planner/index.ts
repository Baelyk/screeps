import {
	RoomProcess,
	ProcessData,
	ProcessConstructors,
	ProcessId,
} from "./../process";
import { IMessage, MessageId } from "./../messenger";
import { info, warn, error } from "./../utils/logger";
import { Counter } from "./../utils/counter";
import * as Iterators from "./../utils/iterators";

const PRETTY_ROAD_ADJUSTMENT = 1;
const WALL_ADJACENT_COST = 6;
// From fatigue values (wiki/Pathfinding)
const ROAD_COST = 1;
const PLAIN_COST = 2;
const SWAMP_COST = 10;
const UNWALKABLE_COST = 255;

export interface Blueprint {
	structures: Partial<Record<StructureConstant, Coord[]>>;
}

interface Coord {
	x: number;
	y: number;
}

type Index = number;

function bareCoord({ x, y }: Coord): Coord {
	return { x, y };
}

function indexToCoord(index: Index): Coord {
	return { x: Math.floor(index / 50), y: index % 50 };
}

function coordToIndex({ x, y }: Coord): Index {
	return x * 50 + y;
}

function coordToTuple({ x, y }: Coord): [number, number] {
	return [x, y];
}

function tupleToCoord([x, y]: [number, number]): Coord {
	return { x, y };
}

function getNeighbors({ x, y }: Coord): Coord[] {
	const neighbors: [number, number][] = [
		[x - 1, y - 1],
		[x, y - 1],
		[x + 1, y - 1],
		[x - 1, y],
		[x + 1, y],
		[x - 1, y + 1],
		[x, y + 1],
		[x + 1, y + 1],
	];
	return neighbors.map(tupleToCoord);
}

function getTilesInRange({ x, y }: Coord, range: number): Coord[] {
	const neighbors = [];
	for (let dx = -range; dx <= range; dx++) {
		for (let dy = -range; dy <= range; dy++) {
			neighbors.push({ x: x + dx, y: y + dy });
		}
	}
	return neighbors;
}

function coordToRoomPosition({ x, y }: Coord, roomName: string): RoomPosition {
	return new RoomPosition(x, y, roomName);
}

function coordToRoomPositionMapper(
	roomName: string,
): (coord: Coord) => RoomPosition {
	return (coord: Coord) => coordToRoomPosition(coord, roomName);
}

function prettyRoadCostMatrix(roomName: string): CostMatrix {
	const costMatrix = new PathFinder.CostMatrix();
	const terrain = Game.map.getRoomTerrain(roomName);
	for (let x = 0; x < 50; x++) {
		for (let y = 0; y < 50; y++) {
			if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
				costMatrix.set(x, y, UNWALKABLE_COST);
				getNeighbors({ x, y })
					.filter(({ x, y }) => terrain.get(x, y) !== TERRAIN_MASK_WALL)
					.forEach(({ x, y }) => costMatrix.set(x, y, WALL_ADJACENT_COST));
			}
		}
	}

	return costMatrix;
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

export class RoomPlanner extends RoomProcess {
	manageRoomId: ProcessId;

	costMatrix: CostMatrix;
	terrain: RoomTerrain;
	occupied: Set<Index>;

	roads: RoomPosition[];
	containers: RoomPosition[] = [];
	extensions: RoomPosition[] = [];
	spawns: RoomPosition[] = [];
	towers: RoomPosition[] = [];
	extractor: RoomPosition | null = null;
	storage: RoomPosition | null = null;

	constructor({
		manageRoomId,
		...data
	}: Omit<ProcessData<typeof RoomProcess>, "name"> & {
		manageRoomId: ProcessId;
	}) {
		super({ name: "RoomPlanner", ...data });
		this.generator = this.roomPlanner();

		this.manageRoomId = manageRoomId;

		this.costMatrix = prettyRoadCostMatrix(this.roomName);
		this.terrain = Game.map.getRoomTerrain(this.roomName);
		this.occupied = new Set();

		this.roads = [];
	}

	occupy(pos: Index | Coord | Index[] | Coord[]): void {
		occupyTiles(this.occupied, pos);
	}

	unoccupy(pos: Index | Coord | Index[] | Coord[]): void {
		unoccupyTiles(this.occupied, pos);
	}

	updateCostMatrix(pos: Coord | Coord[], cost: number): void {
		if (!Array.isArray(pos)) {
			this.costMatrix.set(pos.x, pos.y, cost);
			return;
		}
		for (const { x, y } of pos) {
			this.costMatrix.set(x, y, cost);
		}
	}

	findPath(
		origin: RoomPosition,
		goal: RoomPosition,
		range: number,
		opts?: { allowOtherRooms: boolean },
	): PathFinderPath {
		return PathFinder.search(
			origin,
			{ pos: goal, range },
			{
				roomCallback: (roomName) => {
					// Do not search other rooms
					if (roomName !== this.roomName) {
						return opts?.allowOtherRooms ? new PathFinder.CostMatrix() : false;
					}
					return this.costMatrix;
				},
				plainCost: PLAIN_COST + PRETTY_ROAD_ADJUSTMENT,
				swampCost: PLAIN_COST + PRETTY_ROAD_ADJUSTMENT,
			},
		);
	}

	economyRoads(): [RoomPosition[], RoomPosition[], RoomPosition | null] {
		const sources = this.room.find(FIND_SOURCES) as (Source | Mineral)[];
		const controller = this.room.controller;
		if (controller == null) {
			throw new Error("No controller");
		}
		// Find roads for the closest first
		sources.sort(
			(a, b) =>
				a.pos.getRangeTo(controller.pos) - b.pos.getRangeTo(controller.pos),
		);

		// Count roads as indices since Counters don't play well with objects
		const roadCounter = new Counter<Index>();
		const containers: RoomPosition[] = [];
		for (const source of sources) {
			const path = this.findPath(source.pos, controller.pos, 3);
			if (path.incomplete) {
				warn(`Unable to complete path ${source.pos} to ${controller.pos}`);
				continue;
			}
			if (source instanceof Source) {
				containers.push(path.path[0]);
				path.path.shift();
			}
			this.updateCostMatrix(path.path, ROAD_COST);
			roadCounter.pushMany(path.path.map(coordToIndex));
		}
		let firstIntersection: RoomPosition | null = null;
		let intersections = 0;
		for (const [pos, count] of roadCounter) {
			if (count > intersections) {
				firstIntersection = coordToRoomPosition(
					indexToCoord(pos),
					this.roomName,
				);
				intersections = count;
			}
		}

		const roads = Array.from(roadCounter.keys()).map((index) =>
			coordToRoomPosition(indexToCoord(index), this.roomName),
		);
		this.occupy(roads);
		this.occupy(containers);
		return [roads, containers, firstIntersection];
	}

	findSpawnSpot(spawnStart: RoomPosition): RoomPosition {
		const queue: Coord[] = [spawnStart];
		const visited: Set<Index> = new Set();

		while (queue.length > 0) {
			const current = queue.shift();
			if (current == null) {
				break;
			}
			visited.add(coordToIndex(current));

			// No tiles within three are walls
			const withinThree = Iterators.all(
				getTilesInRange(current, 3),
				(tile) => this.terrain.get(tile.x, tile.y) !== TERRAIN_MASK_WALL,
			);
			if (withinThree) {
				return coordToRoomPosition(current, this.roomName);
			}

			getNeighbors(current)
				.filter((n) => !visited.has(coordToIndex(n)))
				.forEach((n) => {
					visited.add(coordToIndex(n));
					queue.push(n);
				});
		}

		throw new Error(`Unable to find valid spawn spot from ${spawnStart}`);
	}

	spawnStamp(
		spawnSpot: RoomPosition,
	): [RoomPosition[], RoomPosition[], RoomPosition, RoomPosition] {
		const area = getTilesInRange(spawnSpot, 2);
		this.occupy(area);
		const spawns = [area[6], area[8], area[18]];
		const roads = [
			area[1],
			area[3],
			area[5],
			area[7],
			area[9],
			area[11],
			area[13],
			area[15],
			area[17],
			area[19],
			area[21],
			area[23],
		];
		const storage = area[16];
		const tower = area[2];
		this.updateCostMatrix(roads, ROAD_COST);
		this.updateCostMatrix(spawns, UNWALKABLE_COST);
		this.updateCostMatrix(storage, UNWALKABLE_COST);
		this.updateCostMatrix(tower, UNWALKABLE_COST);
		return [
			spawns.map(coordToRoomPositionMapper(this.roomName)),
			roads.map(coordToRoomPositionMapper(this.roomName)),
			coordToRoomPosition(storage, this.roomName),
			coordToRoomPosition(tower, this.roomName),
		];
	}

	mineralExtractor(storage: RoomPosition): [RoomPosition, RoomPosition[]] {
		const mineral = this.room.find(FIND_MINERALS)[0];
		if (mineral == null) {
			throw new Error(`Room ${this.roomName} lacks mineral`);
		}

		const path = this.findPath(storage, mineral.pos, 1);
		if (path.incomplete) {
			throw new Error(`Unable to path to mineral in room ${this.roomName}`);
		}
		// Delete storage from path
		path.path.shift();

		this.updateCostMatrix(path.path, ROAD_COST);
		this.occupy(path.path);
		this.occupy(mineral.pos);

		return [mineral.pos, path.path];
	}

	pathToExits(spawnSpot: RoomPosition): void {
		const exits = Game.map.describeExits(this.roomName);
		for (const roomName of Object.values(exits)) {
			const pos = new RoomPosition(24, 24, roomName);
			const path = this.findPath(spawnSpot, pos, 22, { allowOtherRooms: true });
			if (path.incomplete) {
				error(`Unable to find path from ${this.roomName} to ${roomName}`);
				continue;
			}
			this.occupy(path.path);
		}
	}

	placeExtensions(spawnSpot: RoomPosition): [RoomPosition[], RoomPosition[]] {
		const temporarilyOccupied: Set<Index> = new Set();
		const tileOpen = function (this: RoomPlanner, coord: Coord): boolean {
			return (
				!this.occupied.has(coordToIndex(coord)) &&
				!temporarilyOccupied.has(coordToIndex(coord)) &&
				this.terrain.get(coord.x, coord.y) !== TERRAIN_MASK_WALL
			);
		}.bind(this);

		const queue: Coord[] = [spawnSpot];
		const visited: Set<Index> = new Set();
		const extensions: Coord[] = [];
		const roads: Coord[] = [];

		while (queue.length > 0 && extensions.length < 60) {
			const current = queue.shift();
			if (current == null) {
				break;
			}
			visited.add(coordToIndex(current));

			// This tile is empty
			if (tileOpen(current)) {
				const path = this.findPath(
					spawnSpot,
					coordToRoomPosition(current, this.roomName),
					0,
				);
				// Delete spawnSpot
				path.path.shift();
				occupyTiles(temporarilyOccupied, path.path);
				const openNeighbors = getNeighbors(current).filter(tileOpen);
				// At least 5 of its neighbors are empty
				if (!path.incomplete && openNeighbors.length >= 5) {
					const path = this.findPath(
						spawnSpot,
						coordToRoomPosition(current, this.roomName),
						0,
					);
					while (extensions.length + openNeighbors.length > 60) {
						openNeighbors.pop();
					}
					roads.push(...path.path);
					extensions.push(...openNeighbors);
					this.occupy(path.path);
					this.occupy(openNeighbors);
					info(`Extensions: ${extensions.length}`);
				}
				unoccupyTiles(temporarilyOccupied, path.path);
			}

			this.updateCostMatrix(roads, ROAD_COST);
			this.updateCostMatrix(extensions, UNWALKABLE_COST);

			getNeighbors(current)
				.filter((n) => !visited.has(coordToIndex(n)))
				.forEach((n) => {
					visited.add(coordToIndex(n));
					queue.push(n);
				});
		}

		return [
			extensions.map(coordToRoomPositionMapper(this.roomName)),
			roads.map(coordToRoomPositionMapper(this.roomName)),
		];
	}

	blueprint(): Blueprint {
		const structures: Partial<Record<StructureConstant, Coord[]>> = {};

		// Containers
		structures[STRUCTURE_CONTAINER] = this.containers;

		// Extensions
		structures[STRUCTURE_EXTENSION] = this.extensions;

		// Extractor
		if (this.extractor == null) {
			throw new Error(`Room ${this.roomName} lacks an extractor plan`);
		}
		structures[STRUCTURE_EXTRACTOR] = [this.extractor];

		// Roads
		structures[STRUCTURE_ROAD] = Array.from(
			new Set(this.roads.map(coordToIndex)),
		).map(indexToCoord);

		// Spawns
		structures[STRUCTURE_SPAWN] = this.spawns.map(bareCoord);

		// Storage
		if (this.storage == null) {
			throw new Error(`Room ${this.roomName} lacks a storage plan`);
		}
		structures[STRUCTURE_STORAGE] = [bareCoord(this.storage)];

		// Towers
		structures[STRUCTURE_TOWER] = this.towers.map(bareCoord);

		return { structures };
	}

	*roomPlanner() {
		info(`Planning room ${this.roomName}`);
		const [roads, containers, spawnStart] = this.economyRoads();
		this.roads = roads;
		this.containers = containers;
		if (spawnStart == null) {
			throw new Error("Unable to find spawn starting spot");
		}
		const spawnSpot = this.findSpawnSpot(spawnStart);
		const [spawns, spawnRoads, storage, tower] = this.spawnStamp(spawnSpot);
		this.roads.push(...spawnRoads);
		this.spawns = spawns;
		this.storage = storage;
		this.towers = [tower];
		const [extractor, extractorRoad] = this.mineralExtractor(storage);
		this.extractor = extractor;
		this.roads.push(...extractorRoad);
		this.pathToExits(spawnSpot);
		const [extensions, extensionRoads] = this.placeExtensions(spawnSpot);
		this.extensions = extensions;
		this.roads.push(...extensionRoads);

		const blueprint = this.blueprint();
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

	blueprint: Blueprint;

	constructor(from: ProcessId, to: ProcessId, blueprint: Blueprint) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;

		this.blueprint = blueprint;
	}
}
