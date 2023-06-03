import { debug, info } from "./logger";

export interface Coord {
	x: number;
	y: number;
}

export interface RoomCoord extends Coord {
	roomName: string;
}

export type Index = number;

export function bareCoord({ x, y }: Coord): Coord {
	return { x, y };
}

export function roomCoordToRoomPosition({
	x,
	y,
	roomName,
}: RoomCoord): RoomPosition {
	return new RoomPosition(x, y, roomName);
}

export function roomCoordToStr(coord: RoomCoord): string {
	return `[room ${coord.roomName} pos ${coord.x},${coord.y}]`;
}

export function strToRoomCoord(str: string): RoomCoord {
	const parts = str.split(" ");
	if (parts.length !== 4) {
		throw new Error("Incorrect number of parts");
	}
	const roomName = parts[1];
	const [xStr, yStr] = parts[3].split(",");
	const x = parseInt(xStr);
	const y = parseInt(yStr);
	return { x, y, roomName };
}

export function indexToCoord(index: Index): Coord {
	return { x: Math.floor(index / 50), y: index % 50 };
}

export function coordToIndex({ x, y }: Coord): Index {
	return x * 50 + y;
}

export function coordToTuple({ x, y }: Coord): [number, number] {
	return [x, y];
}

export function tupleToCoord([x, y]: [number, number]): Coord {
	return { x, y };
}

export function getNeighbors<T extends Coord>(coord: T): CoordOrRoomCoord<T>[] {
	return getTilesInRange(coord, 1);
}

type CoordOrRoomCoord<T extends RoomCoord | Coord> = T extends RoomCoord
	? RoomCoord
	: Coord;
export function getTilesInRange<T extends RoomCoord | Coord>(
	coord: T,
	range: number,
): CoordOrRoomCoord<T>[] {
	const roomName = (coord as RoomCoord).roomName;

	const neighbors = [];
	for (let dx = -range; dx <= range; dx++) {
		for (let dy = -range; dy <= range; dy++) {
			neighbors.push({ x: coord.x + dx, y: coord.y + dy, roomName });
		}
	}
	return neighbors.filter(({ x, y }) => x >= 0 && x <= 49 && y >= 0 && y <= 49);
}

export function coordToRoomPosition(
	{ x, y }: Coord,
	roomName: string,
): RoomPosition {
	return new RoomPosition(x, y, roomName);
}

export function coordToRoomPositionMapper(
	roomName: string,
): (coord: Coord) => RoomPosition {
	return (coord: Coord) => coordToRoomPosition(coord, roomName);
}

export class RoomCoordSet {
	set: Set<string>;

	constructor() {
		this.set = new Set();
	}

	add(coord: RoomCoord): void {
		const index = roomCoordToStr(coord);
		this.set.add(index);
	}

	delete(coord: RoomCoord): boolean {
		const index = roomCoordToStr(coord);
		return this.set.delete(index);
	}

	has(coord: RoomCoord): boolean {
		const index = roomCoordToStr(coord);
		return this.set.has(index);
	}

	get size(): number {
		return this.set.size;
	}

	*[Symbol.iterator]() {
		const iterator = this.set[Symbol.iterator]();
		while (true) {
			const { value, done } = iterator.next();
			if (done) {
				return undefined;
			}
			yield strToRoomCoord(value);
		}
	}
}
