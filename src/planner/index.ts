import {
	RoomProcess,
	ProcessData,
	ProcessConstructors,
	ProcessId,
} from "./../process";
import { IMessage, MessageId } from "./../messenger";
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
					if (roomName !== this.roomName) {
						return options.allowOtherRooms
							? new PathFinder.CostMatrix()
							: false;
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

	exitPaths: Set<Index>;
	containers: RoomPosition[] = [];
	extensions: RoomPosition[] = [];
	spawns: RoomPosition[] = [];
	towers: RoomPosition[] = [];
	links: RoomPosition[] = [];
	extractor: RoomPosition | null = null;
	storage: RoomPosition | null = null;

	constructor({
		manageRoomId,
		...data
	}: Omit<ProcessData<typeof Blueprint>, "name"> & {
		manageRoomId: ProcessId;
	}) {
		super({ name: "RoomPlanner", ...data });
		this.generator = this.roomPlanner();

		this.manageRoomId = manageRoomId;

		this.exitPaths = new Set();
	}

	findSpawnSpot(): RoomPosition {
		let spawnStart;

		// Path from sources to controller, and start looking at their intersection
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
		for (const source of sources) {
			const path = this.findPath(source.pos, controller.pos, 2);
			if (path.incomplete) {
				this.warn(`Unable to complete path ${source.pos} to ${controller.pos}`);
				continue;
			}
			this.updateCostMatrix(path.path, ROAD_COST);
			roadCounter.pushMany(path.path.map(coordToIndex));
		}
		// Find intersection
		let intersections = 0;
		for (const [pos, count] of roadCounter) {
			if (count > intersections) {
				spawnStart = coordToRoomPosition(indexToCoord(pos), this.roomName);
				intersections = count;
			}
			if (intersections === sources.length) {
				break;
			}
		}
		if (spawnStart == null) {
			throw new Error("Unable to find spawn spot");
		}
		// Clean up roads, will recreate after spawn is planned
		const roads = Array.from(roadCounter.keys()).map((index) =>
			coordToRoomPosition(indexToCoord(index), this.roomName),
		);
		this.updateCostMatrix(roads, DEFAULT_COST);

		const queue: Coord[] = [spawnStart];
		const visited: Set<Index> = new Set();

		while (queue.length > 0) {
			const current = queue.shift();
			if (current == null) {
				break;
			}

			const spawnArea = getTilesInRange(current, 3);

			// Does not run off the map
			const onMap = spawnArea.length === (1 + 2 * 3) ** 2;

			// No tiles within three are walls
			const withinThree = Iterators.all(
				spawnArea,
				(tile) => this.terrain.get(tile.x, tile.y) !== TERRAIN_MASK_WALL,
			);
			if (onMap && withinThree) {
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
	): [
		RoomPosition[],
		RoomPosition[],
		RoomPosition,
		RoomPosition,
		RoomPosition,
	] {
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
		const link = area[10];
		this.updateCostMatrix(roads, ROAD_COST);
		this.updateCostMatrix(spawns, UNWALKABLE_COST);
		this.updateCostMatrix(storage, UNWALKABLE_COST);
		this.updateCostMatrix(tower, UNWALKABLE_COST);
		this.updateCostMatrix(link, UNWALKABLE_COST);
		return [
			spawns.map(coordToRoomPositionMapper(this.roomName)),
			roads.map(coordToRoomPositionMapper(this.roomName)),
			coordToRoomPosition(storage, this.roomName),
			coordToRoomPosition(tower, this.roomName),
			coordToRoomPosition(link, this.roomName),
		];
	}

	economySetup(
		spawnSpot: RoomPosition,
	): [RoomPosition[], RoomPosition[], RoomPosition[]] {
		const roads: RoomPosition[] = [];
		const containers: RoomPosition[] = [];
		const links: RoomPosition[] = [];

		// Sources to spawn
		const sources = this.room.find(FIND_SOURCES) as (Source | Mineral)[];
		// Find roads for the closest first
		sources.sort(
			(a, b) => a.pos.getRangeTo(spawnSpot) - b.pos.getRangeTo(spawnSpot),
		);
		for (const source of sources) {
			const path = this.findPath(source.pos, spawnSpot, 1);
			if (path.incomplete) {
				this.warn(`Unable to complete path ${source.pos} to ${spawnSpot}`);
			}
			// Container replaces first road on the source -> spawn road
			containers.push(path.path[0]);
			this.updateCostMatrix(containers, UNWALKABLE_COST);
			path.path.shift();
			this.updateCostMatrix(path.path, ROAD_COST);
			roads.push(...path.path);
		}

		// Miners will sit on containers, so mark them as unwalkable

		// Spawn to controller
		const controller = this.room.controller;
		if (controller == null) {
			throw new Error(`Room ${this.roomName} lacks a controller`);
		}
		const path = this.findPath(spawnSpot, controller.pos, 2);
		if (path.incomplete) {
			this.warn(`Unable to complete path ${spawnSpot} to ${controller.pos}`);
		}
		// Controller link is the end of the source-controller road(s)
		if (links.length === 0) {
			links.push(path.path[path.path.length - 1]);
		}
		this.updateCostMatrix(path.path, ROAD_COST);
		roads.push(...path.path);

		// Source links
		containers.forEach((pos) => {
			// An unoccupied tile adjacent to the source container
			const sourceLink = getNeighbors(pos).find(
				(n) => !this.occupied.has(coordToIndex(n)),
			);
			if (sourceLink != null) {
				links.push(coordToRoomPosition(sourceLink, this.roomName));
			}
		});
		this.updateCostMatrix(links, UNWALKABLE_COST);

		this.occupy(roads);
		this.occupy(containers);
		this.occupy(links);

		return [roads, containers, links];
	}

	prioritizeLinks(
		links: RoomPosition[],
		spawnSpot: RoomPosition,
	): RoomPosition[] {
		// Using range as analog for path distance, sort furthest links first
		links.sort((a, b) => b.getRangeTo(spawnSpot) - a.getRangeTo(spawnSpot));
		// But have the storage link first
		links.unshift(links[links.length - 1]);
		links.pop();
		return links;
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
				this.error(`Unable to find path from ${this.roomName} to ${roomName}`);
				continue;
			}
			this.occupy(path.path);
			path.path.forEach((road) => this.exitPaths.add(coordToIndex(road)));
		}
	}

	placeExtensions(spawnSpot: RoomPosition): [RoomPosition[], RoomPosition[]] {
		const temporarilyOccupied: Set<Index> = new Set();
		const tilePathable = function (
			this: RoomPlanner,
			coord: RoomCoord,
		): boolean {
			return (
				!this.occupied.has(coordToIndex(coord)) ||
				this.roads.has(coord) ||
				this.exitPaths.has(coordToIndex(coord))
			);
		}.bind(this);
		const tileOpen = function (this: RoomPlanner, coord: RoomCoord): boolean {
			return (
				!this.occupied.has(coordToIndex(coord)) &&
				!temporarilyOccupied.has(coordToIndex(coord))
			);
		}.bind(this);

		const queue: RoomCoord[] = [spawnSpot];
		const visited: Set<Index> = new Set();
		const extensions: RoomCoord[] = [];
		const roads: RoomCoord[] = [];

		while (queue.length > 0 && extensions.length < 60) {
			const current = queue.shift();
			if (current == null) {
				break;
			}
			// This tile is no longer valid to search along
			if (extensions.length > 0 && !tilePathable(current)) {
				continue;
			}

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
				// At least 6 of its neighbors are empty (> 5 prevents cap arrangement)
				if (
					!path.incomplete &&
					path.path.length <= MAX_EXTENSION_ROAD &&
					openNeighbors.length >= 6
				) {
					const path = this.findPath(
						spawnSpot,
						coordToRoomPosition(current, this.roomName),
						0,
					);
					while (extensions.length + openNeighbors.length > 60) {
						openNeighbors.pop();
					}
					path.path.forEach((road) => this.roads.add(road));
					extensions.push(...openNeighbors);
					this.occupy(path.path);
					this.occupy(openNeighbors);
					this.debug(
						`Extension at ${current.x} ${current.y} [${extensions.length}]`,
					);
				}
				unoccupyTiles(temporarilyOccupied, path.path);
			}

			this.updateCostMatrix(roads, ROAD_COST);
			this.updateCostMatrix(extensions, UNWALKABLE_COST);

			getNeighbors(current)
				// Only traverse along unoccupied or road/exit path neighbors
				.filter(tilePathable)
				.filter((n) => !visited.has(coordToIndex(n)))
				.forEach((n) => {
					visited.add(coordToIndex(n));
					queue.push(n);
				});
		}

		if (extensions.length !== 60) {
			this.warn(`Only able to plan ${extensions.length} extensions`);
		}

		return [
			extensions.map(coordToRoomPositionMapper(this.roomName)),
			roads.map(coordToRoomPositionMapper(this.roomName)),
		];
	}

	blueprint(): IBlueprint {
		const structures: Partial<Record<StructureConstant, RoomCoord[]>> = {};

		// Containers
		structures[STRUCTURE_CONTAINER] = this.containers;

		// Extensions
		structures[STRUCTURE_EXTENSION] = this.extensions;

		// Extractor
		if (this.extractor == null) {
			throw new Error(`Room ${this.roomName} lacks an extractor plan`);
		}
		structures[STRUCTURE_EXTRACTOR] = [this.extractor];

		// Extensions
		structures[STRUCTURE_LINK] = this.links;

		// Roads
		structures[STRUCTURE_ROAD] = Array.from(this.roads);

		// Spawns
		structures[STRUCTURE_SPAWN] = this.spawns;

		// Storage
		if (this.storage == null) {
			throw new Error(`Room ${this.roomName} lacks a storage plan`);
		}
		structures[STRUCTURE_STORAGE] = [this.storage];

		// Towers
		structures[STRUCTURE_TOWER] = this.towers;

		this.structures = structures;

		return { structures };
	}

	*roomPlanner() {
		this.info(`Planning room ${this.roomName}`);
		const spawnSpot = this.findSpawnSpot();

		const [spawns, spawnRoads, storage, tower, storageLink] =
			this.spawnStamp(spawnSpot);
		spawnRoads.forEach((road) => this.roads.add(road));
		this.spawns = spawns;
		this.storage = storage;
		this.towers = [tower];
		this.links.push(storageLink);

		const [roads, containers, links] = this.economySetup(spawnSpot);
		roads.forEach((road) => this.roads.add(road));
		this.containers = containers;
		this.links.push(...links);

		this.links = this.prioritizeLinks(this.links, spawnSpot);
		const [extractor, extractorRoad] = this.mineralExtractor(storage);
		this.extractor = extractor;
		extractorRoad.forEach((road) => this.roads.add(road));

		this.pathToExits(spawnSpot);

		const [extensions] = this.placeExtensions(spawnSpot);
		this.extensions = extensions;

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
