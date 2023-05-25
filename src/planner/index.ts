import { RoomProcess, ProcessData, ProcessConstructors } from "./../process";
import { info, warn } from "./../utils/logger";

// From fatigue values (wiki/Pathfinding)
const ROAD_COST = 1;
const PLAIN_COST = 2;
const SWAMP_COST = 10;
const WALL_ADJACENT_COST = 3;
const UNWALKABLE_COST = 255;

interface Coord {
	x: number;
	y: number;
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

export class RoomPlanner extends RoomProcess {
	costMatrix: CostMatrix;

	roads: RoomPosition[];

	constructor(data: Omit<ProcessData<typeof RoomProcess>, "name">) {
		super({ name: "RoomPlanner", ...data });
		this.generator = this.roomPlanner();

		this.costMatrix = prettyRoadCostMatrix(this.roomName);

		this.roads = [];
	}

	updateCostMatrix(pos: Coord | Coord[], cost: number): void {
		if (!Array.isArray(pos)) {
			this.costMatrix.set(pos.x, pos.y, cost);
			return;
		}
		for (const { x, y } of pos) {
			info(`setting ${x},${y} to ${cost}`);
			this.costMatrix.set(x, y, cost);
		}
	}

	findPath(
		origin: RoomPosition,
		goal: RoomPosition,
		range: number,
	): PathFinderPath {
		return PathFinder.search(
			origin,
			{ pos: goal, range },
			{
				roomCallback: (roomName) => {
					// Do not search other rooms
					if (roomName !== this.roomName) {
						return false;
					}
					info(`26,38: ${this.costMatrix.get(26, 38)}`);
					return this.costMatrix;
				},
				plainCost: PLAIN_COST,
				swampCost: PLAIN_COST,
				maxRooms: 1,
			},
		);
	}

	economyRoads() {
		const sources = (
			this.room.find(FIND_SOURCES) as (Source | Mineral)[]
		).concat(this.room.find(FIND_MINERALS));
		const controller = this.room.controller;
		if (controller == null) {
			return;
		}
		sources.sort(
			(a, b) =>
				a.pos.getRangeTo(controller.pos) - b.pos.getRangeTo(controller.pos),
		);

		let roads: RoomPosition[] = [];
		for (const source of sources) {
			info(`Pathing from ${source.pos} to ${controller.pos}`);
			const path = this.findPath(source.pos, controller.pos, 3);
			if (path.incomplete) {
				warn(`Unable to complete path ${source.pos} to ${controller.pos}`);
				continue;
			}
			this.updateCostMatrix(path.path, ROAD_COST);
			info(`26,38: ${this.costMatrix.get(26, 38)}`);
			roads = roads.concat(roads, path.path);
		}

		this.roads = roads;
	}

	*roomPlanner() {
		this.economyRoads();
		while (true) {
			info(`Planning room ${this.roomName}`);
			yield;
		}
	}
}
ProcessConstructors.set("RoomPlanner", RoomPlanner);
console.log("hello");
