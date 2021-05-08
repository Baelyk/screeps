import { info, warn } from "utils/logger";
import { ScriptError } from "utils/errors";
import { RoomPlannerMemory, makeRoomPlanner } from "planner";
import {
  resetConstructionQueue,
  resetRepairQueue,
  updateWallRepair,
} from "construct";
import { census } from "population";

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
    /** The tick this information was last updated */
    time: number;
    /** The owner of the room, undefined if unowned */
    owner: string | undefined;
    /** The room controller level, undefined if the room lacks a controller */
    level: number | undefined;
    /** The reserver of the room, undefined if unreserved */
    reserver: string | undefined;
    /** The ticks left on the reservation, undefined if unreserved */
    reservedTicks: number | undefined;
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
    construction: ConstructionQueue;
    repair: RepairQueue;
    wallRepair: WallRepairQueue;
    spawn: SpawnQueueItem[];
  }

  type ConstructionQueue = RoomPosition[];
  type RepairQueue = Id<Structure>[];
  type RoomPopulationLimitMemory = { [key in CreepRole]?: number };
  type WallRepairQueue = Id<StructureRampart | StructureWall>[];

  interface SpawnQueueItem {
    role: CreepRole;
    overrides?: Partial<CreepMemory>;
    name?: string;
  }

  interface RoomDebugMemory {
    removeConstructionSites?: boolean;
    resetConstructionSites?: boolean;
    energyFlow?: RoomDebugEnergyFlow;
    remoteAnalysis?: boolean;
  }

  interface RoomDebugEnergyFlow {
    start: number;
    restart?: boolean;
    cost: number;
    gain: number;
  }

  const enum RoomType {
    primary = "primary",
    remote = "remote",
  }
}

class RoomInfo implements RoomMemory {
  name: string;
  roomType: RoomType;

  constructor(roomName: string) {
    this.name = roomName;
    if (Memory.rooms[this.name] == undefined) {
      throw new ScriptError(`Memory for room ${roomName} is undefined`);
    }
    this.roomType = Memory.rooms[roomName].roomType;
  }

  memory(): RoomMemory {
    return Memory.rooms[this.name];
  }

  remoteMemory(): RemoteRoomMemory {
    const memory = this.memory();
    if (memory.roomType === RoomType.remote) {
      if (memory.remote != undefined) {
        return memory.remote;
      }
      throw new ScriptError(`Remote room ${this.name} lacks remote memory`);
    }
    throw new ScriptError(
      `Room ${this.name} is of type ${memory.roomType} not ${RoomType.remote}`,
    );
  }

  ownedMemory(): OwnedRoomMemory {
    const memory = this.memory();
    if (memory.roomType === RoomType.primary) {
      if (memory.owned != undefined) {
        return memory.owned;
      }
      throw new ScriptError(`Primary room ${this.name} lacks owned memory`);
    }
    throw new ScriptError(
      `Room ${this.name} is of type ${memory.roomType} not ${RoomType.primary}`,
    );
  }

  /**
   * Get the room name of the owner of this room.
   *
   * @returns A string room name
   */
  public remoteOwner(): string {
    return this.remoteMemory().owner;
  }

  /**
   * Get the remotes of this room.
   *
   * @returns An array of string room names that are remotes of this room, or
   *   an empty array.
   */
  public remotes(): string[] {
    return this.ownedMemory().remotes || [];
  }
}

class VisibleRoom extends RoomInfo {
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

  getRoom(): Room {
    const room = Game.rooms[this.name];
    if (room == undefined) {
      throw new ScriptError(`Visible room ${this.name} is invisible`);
    }
    return room;
  }

  /** Updates memory for this room. */
  public updateMemory(): void {
    info(`Updating memory for room ${this.name}`);
    this.updateScoutingMemory();
    this.updateGeographyMemory();

    // Update room type-based memory
    switch (this.roomType) {
      case RoomType.remote:
        this.updateRemoteRoomMemory();
        break;
      case RoomType.primary:
        this.updateOwnedRoomMemory();
        break;
    }

    this.updatePlannerMemory();
    this.updateTombsMemory();
    this.updateQueuesMemory();
    this.updatePopulationLimitMemory();
  }

  updateScoutingMemory(): void {
    const room = this.getRoom();
    let owner = undefined;
    let reserver = undefined;
    let reservedTicks = undefined;
    let level = undefined;
    const controller = room.controller;
    if (controller != undefined) {
      level = controller.level;
      if (controller.owner != undefined) {
        owner = controller.owner.username;
      }
      if (controller.reservation != undefined) {
        reserver = controller.reservation.username;
        reservedTicks = controller.reservation.ticksToEnd;
      }
    }
    Memory.rooms[this.name].scouting = {
      time: Game.time,
      owner,
      level,
      reserver,
      reservedTicks,
    };
  }

  updateGeographyMemory(): void {
    const room = this.getRoom();
    const sources = _.pluck(room.find(FIND_SOURCES), "id");
    Memory.rooms[this.name].geography = { sources };
  }

  updateRemoteRoomMemory(reset = false): void {
    const remoteMemory = Memory.rooms[this.name].remote;
    let owner = undefined;
    let entrance = undefined;
    if (remoteMemory == undefined) {
      reset = true;
    } else {
      owner = remoteMemory.owner;
      entrance = remoteMemory.entrance;
    }

    if (reset || owner == undefined) {
      // Iterate through known rooms and find which has this room as a remote
      for (const roomName in Memory.rooms) {
        const roomMemory = new RoomInfo(roomName);
        if (
          roomMemory.roomType === RoomType.primary &&
          _.includes(roomMemory.remotes(), this.name)
        ) {
          owner = roomName;
          break;
        }
      }
    }
    if (owner == undefined) {
      throw new ScriptError(`Unable to find owner for remote ${this.name}`);
    }
    if (entrance == undefined) {
      // TODO: For now, just panic if entrance is undefined, but eventually
      // find it again. This is either going to require forcing remotes to be
      // adjacent or to figure out how to multi-room path.
      throw new ScriptError(
        `Remote ${this.name} lacks entrance which needs to be set when created`,
      );
    }

    Memory.rooms[this.name].remote = { owner, entrance };
  }

  updateOwnedRoomMemory(reset = false): void {
    const ownedMemory = Memory.rooms[this.name].owned;
    let spawns = [];
    let towers = [];
    let links = { all: {} };
    let remotes = [];

    if (ownedMemory == undefined) {
      reset = true;
    }

    const room = this.getRoom();
    const structures = room.find(FIND_MY_STRUCTURES);
    // Find spawns and towers
    spawns = _.pluck(
      _.filter(structures, { structureType: STRUCTURE_SPAWN }),
      "id",
    );
    towers = _.pluck(
      _.filter(structures, { structureType: STRUCTURE_TOWER }),
      "id",
    );

    // TODO: Actually update link memory, skipping for to wait for planner
    // implementation
    if (ownedMemory != undefined && ownedMemory.links != undefined) {
      links = ownedMemory.links;
    }

    // Preserves current list of remotes if one exists, otherwise searches known
    // rooms that have this room as an owner.
    if (reset || ownedMemory == undefined || ownedMemory.remotes == undefined) {
      for (const roomName in Memory.rooms) {
        const roomMemory = new RoomInfo(roomName);
        if (
          roomMemory.roomType === RoomType.remote &&
          roomMemory.remoteOwner() === this.name
        ) {
          remotes.push(roomName);
        }
      }
    } else {
      remotes = ownedMemory.remotes;
    }

    Memory.rooms[this.name].owned = { spawns, towers, links, remotes };
  }

  updatePlannerMemory(): void {
    const planner: RoomPlannerMemory = makeRoomPlanner(this.name);
    Memory.rooms[this.name].planner = planner;
  }

  updateTombsMemory(): void {
    const room = this.getRoom();
    const tombs = _.pluck(room.find(FIND_TOMBSTONES), "id");
    Memory.rooms[this.name].tombs = tombs;
  }

  updateQueuesMemory(reset = false): void {
    const queuesMemory = Memory.rooms[this.name].queues;
    const room = this.getRoom();
    const construction: ConstructionQueue = [];
    const repair: RepairQueue = [];
    const wallRepair: WallRepairQueue = [];
    let spawn: SpawnQueueItem[] = [];

    if (queuesMemory == undefined) {
      reset = true;
    } else {
      spawn = queuesMemory.spawn;
    }

    if (reset) {
      spawn = [];
    }

    Memory.rooms[this.name].queues = {
      construction,
      repair,
      wallRepair,
      spawn,
    };
    resetConstructionQueue(room);
    resetRepairQueue(room);
    updateWallRepair(room);
  }

  updatePopulationLimitMemory(): void {
    const room = this.getRoom();
    census(room);
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
