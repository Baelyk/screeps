import { info, warn } from "utils/logger";
import { GetByIdError, ScriptError } from "utils/errors";
import {
  RoomPlannerMemory,
  RoomPlanner,
  RoomPlanExecuter,
} from "classes/roomPlanner";
import { census } from "population";
import { createLinkMemory } from "links";
import { Pos, Position } from "classes/position";

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
    mineral: RoomGeographyMineralMemory;
  }

  interface RoomGeographyMineralMemory {
    mineralType: MineralConstant;
    density: number;
    id: Id<Mineral>;
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

  type ConstructionQueue = string[];
  type RepairQueue = Id<Structure>[];
  type RoomPopulationLimitMemory = { [key in CreepRole]?: number };
  type WallRepairQueue = Id<StructureRampart | StructureWall>[];

  interface SpawnQueueItem {
    role: CreepRole;
    overrides?: Partial<CreepMemory>;
    name?: string;
  }

  interface RoomDebugMemory {
    flags?: RoomDebugFlagsMemory;
    removeConstructionSites?: boolean;
    resetConstructionSites?: boolean;
  }

  interface RoomDebugFlagsMemory {
    [key: string]: boolean | undefined;
    removeConstructionSites?: boolean;
    resetConstructionSites?: boolean;
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
    neutral = "neutral",
    occupied = "occupied",
    highway = "highway",
    central = "central",
  }
}

export class RoomInfo implements RoomMemory {
  name: string;
  roomType: RoomType;

  constructor(roomName: string) {
    this.name = roomName;
    if (Memory.rooms[this.name] == undefined) {
      throw new ScriptError(`Memory for room ${roomName} is undefined`);
    }
    this.roomType = Memory.rooms[roomName].roomType;
  }

  getMemory(): RoomMemory {
    return Memory.rooms[this.name];
  }

  setRoomType(roomType: RoomType): void {
    info(
      `Updating room ${this.name} type from ${this.roomType} to ${roomType}`,
    );
    this.roomType = roomType;
    Memory.rooms[this.name].roomType = roomType;
  }

  public getScoutingMemory(): RoomScoutingMemory {
    const memory = this.getMemory();
    if (memory.scouting == undefined) {
      throw new ScriptError(`Room ${this.name} lacks scouting memory`);
    }
    return memory.scouting;
  }

  getGeographyMemory(): RoomGeographyMemory {
    const memory = this.getMemory();
    if (memory.geography == undefined) {
      throw new ScriptError(`Room ${this.name} lacks geography memory`);
    }
    return memory.geography;
  }

  getRemoteMemory(): RemoteRoomMemory {
    const memory = this.getMemory();
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

  getEntrance(): { x: number; y: number } {
    const remoteMemory = this.getRemoteMemory();
    return remoteMemory.entrance;
  }

  getOwnedMemory(): OwnedRoomMemory {
    const memory = this.getMemory();
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

  public getLinksMemory(): RoomLinksMemory {
    const ownedMemory = this.getOwnedMemory();
    if (ownedMemory.links == undefined) {
      throw new ScriptError(`Room ${this.name} lacks links memory`);
    }
    return ownedMemory.links;
  }

  getPlannerMemory(): RoomPlannerMemory | undefined {
    const memory = this.getMemory();
    return memory.planner;
  }

  getQueuesMemory(): RoomQueueMemory {
    const memory = this.getMemory();
    if (memory.queues == undefined) {
      throw new ScriptError(`Room ${this.name} lacks queues memory`);
    }
    return memory.queues;
  }

  getPopLimitMemory(): RoomPopulationLimitMemory {
    const memory = this.getMemory();
    if (memory.populationLimit == undefined) {
      throw new ScriptError(`Room ${this.name} lacks population limit memory`);
    }
    return memory.populationLimit;
  }

  getDebugMemory(): RoomDebugMemory {
    const memory = this.getMemory();
    if (memory.debug == undefined) {
      return {};
    }
    return memory.debug;
  }

  getDebugFlag(flag: keyof RoomDebugFlagsMemory): boolean {
    const debugMemory = this.getDebugMemory();
    if (debugMemory.flags == undefined) {
      return false;
    }
    return debugMemory.flags[flag] || false;
  }

  removeDebugFlag(flag: keyof RoomDebugFlagsMemory): void {
    const debugMemory = this.getDebugMemory();
    const flags = debugMemory.flags;
    if (flags != undefined) {
      delete flags[flag];
      debugMemory.flags = flags;
    }
    Memory.rooms[this.name].debug = debugMemory;
  }

  /**
   * Whether this is the script's room. Returns true if the room is owned or
   * reserved by the script, and false if otherwise or unsure.
   */
  public my(): boolean {
    const memory = this.getMemory();
    if (memory.scouting == undefined) {
      return false;
    } else {
      return (
        memory.scouting.owner === "Baelyk" ||
        memory.scouting.reserver === "Baelyk"
      );
    }
  }

  /** Returns the room planner level of this room. */
  public roomLevel(): number {
    const memory = this.getMemory();
    if (memory.planner == undefined) {
      return 0;
    } else {
      return memory.planner.level;
    }
  }

  public setRoomLevel(level: number): void {
    const memory = this.getMemory();
    if (memory.planner != undefined) {
      memory.planner.level = level;
    }
  }

  public getSources(): Id<Source>[] {
    return this.getGeographyMemory().sources || [];
  }

  /**
   * Get the room name of the owner of this room.
   *
   * @returns A string room name
   */
  public getRemoteOwner(): string {
    return this.getRemoteMemory().owner;
  }

  public getTowers(): Id<StructureTower>[] {
    return this.getOwnedMemory().towers || [];
  }

  /**
   * Get the remotes of this room.
   *
   * @returns An array of string room names that are remotes of this room, or
   *   an empty array.
   */
  public getRemotes(): string[] {
    try {
      return this.getOwnedMemory().remotes || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Adds a new remote to this room.
   *
   * @param {string} remoteName The name of the new remote
   */
  public addRemote(remoteName: string): void {
    if (this.roomType !== RoomType.primary) {
      throw new ScriptError(
        `Attempted to add remote ${remoteName} to ${this.roomType} room ${this.name}`,
      );
    }
    const remotes = this.getRemotes();
    if (_.includes(remotes, remoteName)) {
      throw new ScriptError(
        `Room ${this.name} already has remote ${remoteName}`,
      );
    }
    remotes.push(remoteName);
    const ownedMemory = this.getOwnedMemory();
    ownedMemory.remotes = remotes;
    Memory.rooms[this.name].owned = ownedMemory;
  }

  /**
   * Get the tombs this room knows about.
   *
   * @returns An array of tomb ids
   */
  public getTombs(): Id<Tombstone>[] {
    return this.getMemory().tombs || [];
  }

  public getConstructionQueue(): ConstructionQueue {
    const queues = Memory.rooms[this.name].queues;
    if (queues != undefined) {
      return queues.construction;
    }
    return [];
  }

  public addToConstructionQueue(site: RoomPosition, priority = false): void {
    const queuesMemory = this.getQueuesMemory();
    const constructionQueue = this.getConstructionQueue();
    if (priority) {
      constructionQueue.unshift(Position.serialize(site));
    } else {
      constructionQueue.push(Position.serialize(site));
    }
    queuesMemory.construction = constructionQueue;
    Memory.rooms[this.name].queues = queuesMemory;
  }

  public concatToConstructionQueue(additions: ConstructionQueue): void {
    const queue = this.getConstructionQueue();
    queue.push(...additions);
    const queuesMemory = this.getQueuesMemory();
    queuesMemory.construction = queue;
    Memory.rooms[this.name].queues = queuesMemory;
  }

  public getFromConstructionQueue(remove = true): Pos | undefined {
    const queue = this.getConstructionQueue();
    const item = queue[0];
    if (remove && queue.length > 0) {
      const queuesMemory = this.getQueuesMemory();
      queue.shift();
      queuesMemory.construction = queue;
      Memory.rooms[this.name].queues = queuesMemory;
    }
    if (item != undefined) {
      return Position.deserialize(item);
    }
    return undefined;
  }

  public emptyConstructionQueue(): void {
    const queuesMemory = this.getQueuesMemory();
    queuesMemory.construction = [];
    Memory.rooms[this.name].queues = queuesMemory;
  }

  public getRepairQueue(): RepairQueue {
    const queues = Memory.rooms[this.name].queues;
    if (queues != undefined) {
      return queues.repair;
    }
    return [];
  }

  public getFromRepairQueue(remove = false): Id<Structure> | undefined {
    const repairQueue = this.getRepairQueue();
    const item = repairQueue[0];
    if (remove && item != undefined) {
      const queuesMemory = this.getQueuesMemory();
      repairQueue.shift();
      queuesMemory.repair = repairQueue;
      Memory.rooms[this.name].queues = queuesMemory;
    }
    return item;
  }

  public getWallRepairQueue(): WallRepairQueue {
    const queues = Memory.rooms[this.name].queues;
    if (queues != undefined) {
      return queues.wallRepair;
    }
    return [];
  }

  public getFromWallRepairQueue(
    remove = false,
  ): Id<StructureRampart | StructureWall> | undefined {
    const wallRepairQueue = this.getWallRepairQueue();
    const item = wallRepairQueue[0];
    if (remove && item != undefined) {
      const queuesMemory = this.getQueuesMemory();
      wallRepairQueue.shift();
      queuesMemory.wallRepair = wallRepairQueue;
      Memory.rooms[this.name].queues = queuesMemory;
    }
    return item;
  }

  public addToWallRepairQueue(
    item: Id<StructureRampart | StructureWall>,
    priority = false,
  ): void {
    const queuesMemory = this.getQueuesMemory();
    const wallRepairQueue = this.getWallRepairQueue();
    if (priority) {
      wallRepairQueue.unshift(item);
    } else {
      wallRepairQueue.push(item);
    }
    queuesMemory.wallRepair = wallRepairQueue;
    Memory.rooms[this.name].queues = queuesMemory;
  }

  public getSpawnQueue(): SpawnQueueItem[] {
    const queues = Memory.rooms[this.name].queues;
    if (queues != undefined) {
      return queues.spawn;
    }
    return [];
  }

  public addToSpawnQueue(entry: SpawnQueueItem, priority = false): void {
    const queuesMemory = this.getQueuesMemory();
    const spawnQueue = this.getSpawnQueue();
    if (priority) {
      spawnQueue.unshift(entry);
    } else {
      spawnQueue.push(entry);
    }
    queuesMemory.spawn = spawnQueue;
    Memory.rooms[this.name].queues = queuesMemory;
  }

  public concatToSpawnQueue(additions: SpawnQueueItem[]): void {
    const queue = this.getSpawnQueue();
    queue.push(...additions);
    const queuesMemory = this.getQueuesMemory();
    queuesMemory.spawn = queue;
    Memory.rooms[this.name].queues = queuesMemory;
  }

  public getFromSpawnQueue(remove = true): SpawnQueueItem | undefined {
    const spawnQueue = this.getSpawnQueue();
    const item = spawnQueue[0];
    if (remove && spawnQueue.length > 0) {
      const queuesMemory = this.getQueuesMemory();
      spawnQueue.shift();
      queuesMemory.spawn = spawnQueue;
      Memory.rooms[this.name].queues = queuesMemory;
    }
    return item;
  }

  public emptySpawnQueue(): void {
    const queuesMemory = this.getQueuesMemory();
    queuesMemory.spawn = [];
    Memory.rooms[this.name].queues = queuesMemory;
  }

  public hasPlan(): boolean {
    return Memory.rooms[this.name].planner != undefined;
  }

  public getRoleLimit(role: CreepRole): number {
    const popLimits = this.getPopLimitMemory();
    const limit = popLimits[role];
    if (limit != undefined) {
      return limit;
    }
    warn(`Room ${this.name} has undefined pop limit for role ${role}`);
    return 0;
  }

  public setRoleLimit(role: CreepRole, limit: number): void {
    const popLimits = this.getPopLimitMemory();
    popLimits[role] = limit;
    Memory.rooms[this.name].populationLimit = popLimits;
  }
}

export class VisibleRoom extends RoomInfo {
  /**
   * Creates a new or completely resets room.
   *
   * @param {string} roomName The name of the room
   * @param {RoomType} roomType The type of room
   * @returns {VisibleRoom} A VisibleRoom instance for the room with newly reset memory.
   */
  static new(roomName: string, roomType: RoomType): VisibleRoom {
    // Reset/create memory
    Memory.rooms[roomName] = <RoomMemory>{};
    Memory.rooms[roomName].roomType = roomType;
    // Create the VisibleRoom instance and update memory
    const room = new VisibleRoom(roomName);
    room.updateMemory(true);

    return room;
  }

  static getOrNew(roomName: string): VisibleRoom {
    if (Memory.rooms[roomName] == undefined) {
      return VisibleRoom.new(roomName, RoomType.neutral);
    } else {
      return new VisibleRoom(roomName);
    }
  }

  static isVisible(roomName: string): boolean {
    return Game.rooms[roomName] != undefined;
  }

  constructor(roomName: string) {
    super(roomName);
    const room = Game.rooms[roomName];
    if (room == undefined) {
      throw new ScriptError(
        `Invisible room ${roomName} cannot be a VisibleRoom`,
      );
    }
  }

  public getRoom(): Room {
    const room = Game.rooms[this.name];
    if (room == undefined) {
      throw new ScriptError(`Visible room ${this.name} is invisible`);
    }
    return room;
  }

  /**
   * Whether this room is owned by the user. If username is not supplied, the
   * script username is used.
   *
   * @param {string} [username] The username to check ownership for, "Baelyk"
   *   if not provided
   * @returns True if the room is owned by the user, false if otherwise or unownable
   */
  public ownedBy(username = "Baelyk"): boolean {
    const room = this.getRoom();
    if (room.controller != undefined) {
      return room.controller.my;
    }
    // Rooms without a controller cannot be owned
    return false;
  }

  /** Updates memory for this room. */
  public updateMemory(reset = false): void {
    info(`Updating memory for room ${this.name}`);
    this.updateScoutingMemory();
    this.updateGeographyMemory();

    // Update room type-based memory
    switch (this.roomType) {
      case RoomType.remote:
        this.updateRemoteRoomMemory(reset);
        break;
      case RoomType.primary:
        this.updateOwnedRoomMemory(reset);
        break;
    }

    const plannableRoomTypes = [RoomType.primary, RoomType.neutral];
    if (_.includes(plannableRoomTypes, this.roomType)) {
      this.updatePlannerMemory();
    }
    this.updateTombsMemory();
    this.updateQueuesMemory(reset);
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
    } else {
      // Check if central or highway
      const sources = room.find(FIND_SOURCES);
      if (sources.length > 0) {
        this.setRoomType(RoomType.central);
      } else {
        this.setRoomType(RoomType.highway);
      }
    }

    if (
      (owner != undefined && owner != "Baelyk") ||
      (reserver != undefined && reserver != "Baelyk")
    ) {
      this.setRoomType(RoomType.occupied);
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
    const mineral = _.map(room.find(FIND_MINERALS), (mineral) => {
      return {
        mineralType: mineral.mineralType,
        density: mineral.density,
        id: mineral.id,
      };
    })[0];

    Memory.rooms[this.name].geography = { sources, mineral };
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
          _.includes(roomMemory.getRemotes(), this.name)
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
    let remotes = [];

    const { spawns, towers, links } = this.createSpecialStructuresMemory();

    if (ownedMemory == undefined) {
      reset = true;
    }

    // Preserves current list of remotes if one exists, otherwise searches known
    // rooms that have this room as an owner.
    if (reset || ownedMemory == undefined || ownedMemory.remotes == undefined) {
      for (const roomName in Memory.rooms) {
        const roomMemory = new RoomInfo(roomName);
        if (
          roomMemory.roomType === RoomType.remote &&
          roomMemory.getRemoteOwner() === this.name
        ) {
          remotes.push(roomName);
        }
      }
    } else {
      remotes = ownedMemory.remotes;
    }

    Memory.rooms[this.name].owned = { spawns, towers, links, remotes };
  }

  createSpecialStructuresMemory(): {
    spawns: Id<StructureSpawn>[];
    towers: Id<StructureTower>[];
    links: RoomLinksMemory;
  } {
    let spawns = [];
    let towers = [];
    const links: RoomLinksMemory = { all: {} };

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

    _.forEach(
      _.pluck(_.filter(structures, { structureType: STRUCTURE_LINK }), "id"),
      (linkId) => {
        const memory = createLinkMemory(this, linkId);
        links.all[linkId] = memory;
        if (memory.type === LinkType.spawn) {
          links.spawn = linkId;
        }
        if (memory.type === LinkType.controller) {
          links.controller = linkId;
        }
      },
    );

    return { spawns, towers, links };
  }

  updatePlannerMemory(): void {
    const roomPlanner = new RoomPlanner(this.name, this.roomType);
    let planner: RoomPlannerMemory;
    if (this.roomType === RoomType.remote) {
      const entrance = this.getEntrance();
      const entranceIndex = entrance.x + entrance.y * 50;
      planner = roomPlanner.planRoom(entranceIndex);
    } else {
      planner = roomPlanner.planRoom();
    }
    Memory.rooms[this.name].planner = planner;
  }

  public updateTombsMemory(): void {
    const room = this.getRoom();
    const tombs = _.pluck(room.find(FIND_TOMBSTONES), "id");
    Memory.rooms[this.name].tombs = tombs;
  }

  updateQueuesMemory(reset = false): void {
    const queuesMemory = Memory.rooms[this.name].queues;
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

    this.updateConstructionQueue();
    this.updateRepairQueue();
    this.updateWallRepairQueue();
  }

  public updateConstructionQueue(): void {
    const rooms = [this.name].concat(this.getRemotes());
    const sites: RoomPosition[] = [];
    _.forEach(rooms, (roomName) => {
      const room = Game.rooms[roomName];
      if (room != undefined) {
        sites.push(..._.pluck(room.find(FIND_MY_CONSTRUCTION_SITES), "pos"));
      }
    });
    const queue: ConstructionQueue = _.map(sites, Position.serialize);
    const queuesMemory = this.getQueuesMemory();
    queuesMemory.construction = queue;
    Memory.rooms[this.name].queues = queuesMemory;
  }

  public updateRepairQueue(): void {
    const room = this.getRoom();
    const structures = _.filter(room.find(FIND_STRUCTURES), (structure) => {
      if (
        structure.structureType === STRUCTURE_RAMPART ||
        structure.structureType === STRUCTURE_WALL
      ) {
        return false;
      }
      return structure.hits < structure.hitsMax;
    });
    const repairQueue = _.pluck(_.sortBy(structures, "hits"), "id");
    const queuesMemory = this.getQueuesMemory();
    queuesMemory.repair = repairQueue;
    Memory.rooms[this.name].queues = queuesMemory;
  }

  public updateWallRepairQueue(): void {
    const minHits = [0, 5e4, 5e4, 1e5, 2e5, 3e5, 4e5, 5e5, 1e6][
      this.roomLevel()
    ];
    const room = this.getRoom();
    const structures = _.filter(room.find(FIND_STRUCTURES), (structure) => {
      return (
        (structure.structureType === STRUCTURE_RAMPART ||
          structure.structureType === STRUCTURE_WALL) &&
        structure.hits < minHits
      );
    });
    const wallRepairQueue = _.pluck(_.sortBy(structures, "hits"), "id");
    const queuesMemory = this.getQueuesMemory();
    queuesMemory.wallRepair = wallRepairQueue;
    Memory.rooms[this.name].queues = queuesMemory;
  }

  updatePopulationLimitMemory(): void {
    try {
      this.getPopLimitMemory();
    } catch (error) {
      info(`Resetting pop limits for room ${this.name}`);
      Memory.rooms[this.name].populationLimit = {};
    }
    census(this);
  }

  public getNextConstructionSite(
    remove = true,
  ): Id<ConstructionSite> | undefined {
    const constructionQueue = this.getConstructionQueue();
    let index = 0;
    let foundSite = undefined;
    for (let i = 0; i < constructionQueue.length; i++) {
      const pos = Position.fromSerialized(
        constructionQueue[i],
      ).tryIntoRoomPosition();
      if (pos == undefined) {
        continue;
      }
      const site = pos.lookFor(LOOK_CONSTRUCTION_SITES)[0];
      if (site != undefined) {
        index = i;
        foundSite = site.id;
        break;
      }
    }
    const newQueue = _.slice(constructionQueue, index);
    if (remove) {
      newQueue.shift();
    }
    this.emptyConstructionQueue();
    this.concatToConstructionQueue(newQueue);
    return foundSite;
  }

  public getNextRepairTarget(remove = false): Structure | undefined {
    let target: Structure | null = null;
    while (target == undefined) {
      const nextId = this.getFromRepairQueue(remove);
      if (nextId == undefined) {
        return undefined;
      }
      target = Game.getObjectById(nextId);
      // If this id was not already removed and it corresponds to an invalid
      // target, remove the id from the repair queue.
      if (!remove && (target == undefined || target.hits === target.hitsMax)) {
        this.getFromRepairQueue(true);
        target = null;
      }
    }
    return target;
  }

  /**
   * Get the next tombstone from the list that still exists and has >= 50
   * energy left. Removes earlier tombstones in the list that do not satisfy
   * the requirements.
   *
   * @returns {Tombstone} The tombstone object or undefined if there are no
   *   such tombstones.
   */
  public getNextTombstone(): Tombstone | undefined {
    const room = this.getRoom();
    if (room.memory.tombs == undefined || room.memory.tombs.length == 0) {
      return undefined;
    }
    let tomb: Tombstone | undefined | null = undefined;
    while (tomb == undefined && room.memory.tombs.length > 0) {
      // Try and turn the first id in the list into a tombstone
      tomb = Game.getObjectById(room.memory.tombs[0]);
      if (tomb == undefined) {
        // If the tomb no longer exists, remove it from the list
        room.memory.tombs.shift();
        tomb = undefined;
      } else if (tomb.store.getUsedCapacity(RESOURCE_ENERGY) < 50) {
        // The tomb does not have enough energy to be worthwhile, so remove it
        room.memory.tombs.shift();
        tomb = undefined;
      }
    }
    // A satisfactory tomb was found and return it or there were no satisfactory
    // tombs and return undefined
    return tomb;
  }

  public removeAllConstructionSites(): void {
    const room = this.getRoom();
    room.find(FIND_MY_CONSTRUCTION_SITES).forEach((site) => site.remove());
    this.emptyConstructionQueue();
  }

  public levelChangeCheck(): boolean {
    const room = this.getRoom();
    const controller = room.controller;
    if (controller != undefined && controller.level !== this.roomLevel()) {
      info(
        `Room ${this.name} leveled to ${
          controller.level
        } from ${this.roomLevel()}`,
      );
      this.setRoomLevel(controller.level);
      return true;
    }
    return false;
  }

  public executePlan(level?: number): void {
    if (level == undefined) {
      level = this.roomLevel();
    }
    const planner = this.getPlannerMemory();
    if (planner != undefined) {
      const roomPlanExecuter = new RoomPlanExecuter(planner);
      roomPlanExecuter.executePlan(level);
    } else {
      warn(`Attempted to execute plan for room ${this.name} lacking a plan`);
    }
  }

  public updateSpecialStructuresMemory(): void {
    if (this.roomType !== RoomType.primary) {
      return;
    }
    const { spawns, towers, links } = this.createSpecialStructuresMemory();
    if (Memory.rooms[this.name].owned == undefined) {
      this.updateOwnedRoomMemory();
    } else {
      const ownedMemory = this.getOwnedMemory();
      ownedMemory.spawns = spawns;
      ownedMemory.towers = towers;
      ownedMemory.links = links;
      Memory.rooms[this.name].owned = ownedMemory;
    }
  }

  public storedResourceAmount(resource: ResourceConstant): number {
    const room = this.getRoom();
    const storage = room.storage;
    if (storage != undefined) {
      return storage.store.getUsedCapacity(resource);
    }
    return 0;
  }

  public getPrimarySpawn(): StructureSpawn {
    if (this.roomType !== RoomType.primary) {
      throw new ScriptError(
        `Room ${this.name} of type ${this.roomType} lacks a primary spawn since it is not a ${RoomType.primary} room`,
      );
    }
    const primarySpawnId = this.getOwnedMemory().spawns[0];
    const primarySpawn = Game.getObjectById(primarySpawnId);
    if (primarySpawn == undefined) {
      throw new GetByIdError(primarySpawnId, STRUCTURE_SPAWN);
    }
    return primarySpawn;
  }
}

class OwnedRoom extends VisibleRoom {
  constructor(roomName: string) {
    super(roomName);
    if (!this.ownedBy) {
      throw new ScriptError(`Room ${roomName} is not owned by the script`);
    }
  }
}
