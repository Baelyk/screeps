import { info, warn } from "utils/logger";
import { ScriptError } from "utils/errors";
import { RoomPlannerMemory } from "planner";

export function testFunction(): void {
  info(`Testfunction`);
}

declare global {
  interface RoomMemory {
    /** The type of room, e.g. remote */
    roomType: RoomType;

    /** Scouting information for the room */
    scouting?: RoomScoutingMemory;
    /** Geography information for the room, e.g. source or mineral information */
    geography?: RoomGeographyMemory;

    /** Memory properties specific for remote rooms */
    remote?: RemoteRoomMemory;
    /** Memory properties specific for owned rooms */
    owned?: OwnedRoomMemory;

    /** Room plan */
    planner?: RoomPlannerMemory;
    /** Tombs in this room */
    tombs?: Id<Tombstone>[];
    /** Queues associated with this room */
    queues?: RoomQueueMemory;
    /** Population limits */
    populationLimit?: RoomPopulationLimitMemory;

    /** Debug memory for the room */
    debug?: RoomDebugMemory;
  }

  interface RoomScoutingMemory {
    /** The owner of the room, undefined if unowned */
    owner: string | undefined;
    /** The room controller level */
    level: number;
  }

  interface RoomGeographyMemory {
    sources: Id<Source>[];
  }

  interface RemoteRoomMemory {
    owner: string;
    entrance: { x: number; y: number };
  }

  interface OwnedRoomMemory {
    spawns: Id<StructureSpawn>[];
    towers: Id<StructureTower>[];
    links: RoomLinksMemory;
    remotes?: string[];
  }

  interface RoomQueueMemory {
    constuction: ConstructionQueue;
    repair: RepairQueue;
    wallRepair: WallRepairQueue;
    spawnQueue: SpawnQueueItem[];
  }

  type RoomPopulationLimitMemory = { [key in CreepRole]?: number };
  type WallRepairQueue = Id<StructureRampart | StructureWall>[];
}

class RoomMemory implements RoomMemory {
  name: string;
  roomType: RoomType;

  constructor(roomName: string) {
    this.name = roomName;
    this.roomType = Memory.rooms[roomName].roomType;
  }
}

class VisibleRoom extends RoomMemory {
  room: Room;
  constructor(roomName: string) {
    super(roomName);
    const room = Game.rooms[roomName];
    if (room == undefined) {
      throw new ScriptError(
        `Invisible room ${roomName} cannot be a VisibleRoom`,
      );
    }
    this.room = room;
  }
}

class OwnedRoom extends VisibleRoom {
  constructor(roomName: string) {
    super(roomName);
    const controller = this.room.controller;
    if (controller == undefined) {
      throw new ScriptError(`Owned room ${roomName} lacks a controller`);
    }
    if (!controller.my) {
      throw new ScriptError(`Room ${roomName} is owned by ${controller.owner}`);
    }
  }
}
