// Modified by me from screepers/screeps-snippets roomDescribe.js by warinternal

/*
 * Posted 20 June 2019 by @engineeryo
 * Get type of room from name
 *
 * @author engineeryo
 * @co-author warinternal
 */

declare global {
	namespace NodeJS {
		interface Global {
			ROOM_STANDARD: "room";
			ROOM_SOURCE_KEEPER: "source_keeper";
			ROOM_CENTER: "center";
			ROOM_HIGHWAY: "highway";
			ROOM_CROSSROAD: "highway_portal";
		}
	}
}

global.ROOM_STANDARD = "room";
global.ROOM_SOURCE_KEEPER = "source_keeper";
global.ROOM_CENTER = "center";
global.ROOM_HIGHWAY = "highway";
global.ROOM_CROSSROAD = "highway_portal";

export type RoomType =
	| typeof global.ROOM_STANDARD
	| typeof global.ROOM_SOURCE_KEEPER
	| typeof global.ROOM_CENTER
	| typeof global.ROOM_HIGHWAY
	| typeof global.ROOM_CROSSROAD;

export function roomDescribe(roomName: string): RoomType {
	const matched = roomName.match(/\d+/g);
	if (matched == null || matched.length !== 2) {
		throw new Error(`Invalid room name: ${roomName}`);
	}
	const [EW, NS] = [parseInt(matched[0]), parseInt(matched[1])];
	if (EW % 10 === 0 && NS % 10 === 0) {
		return global.ROOM_CROSSROAD;
	} else if (EW % 10 === 0 || NS % 10 === 0) {
		return global.ROOM_HIGHWAY;
	} else if (EW % 5 === 0 && NS % 5 === 0) {
		return global.ROOM_CENTER;
	} else if (Math.abs(5 - (EW % 10)) <= 1 && Math.abs(5 - (NS % 10)) <= 1) {
		return global.ROOM_SOURCE_KEEPER;
	} else {
		return global.ROOM_STANDARD;
	}
}
