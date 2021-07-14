import { ScriptError } from "utils/errors";
import { Graph } from "classes/graph";
import { info, warn, errorConstant } from "utils/logger";

class RoomPlannerError extends ScriptError {
  constructor(roomName: string, message: string) {
    let msg = `Error while planning room ${roomName}`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

export interface RoomPlannerMemory {
  roomName: string;
  roomType: RoomType;
  costMatrix: number[];
  plan: RoomPlannerPlanMemory;
  level: number;
}

type RoomPlannerPlanMemory =
  | OwnedRoomPlannerPlanMemory
  | RemoteRoomPlannerPlanMemory;
type RoomPlannerRoadMemory =
  | OwnedRoomPlannerRoadMemory
  | RemoteRoomPlannerRoadMemory;

interface OwnedRoomPlannerPlanMemory {
  occupied: number[];
  spawn: number;
  storage: number;
  sourceContainers: number[];
  towers: number[];
  links: [number, number, number[]];
  extractor?: number;
  roads: OwnedRoomPlannerRoadMemory;
  extensions: number[];
  walls: number[];
  ramparts: number[];
}

interface OwnedRoomPlannerRoadMemory {
  spawnRing: number[];
  storageRing: number[];
  spawnStorage: number[];
  controller: number[];
  sources: number[];
  tower: number[];
  extractor?: number[];
  extensions: number[];
}

interface RemoteRoomPlannerPlanMemory {
  occupied: number[];
  sourceContainers: number[];
  roads: RemoteRoomPlannerRoadMemory;
}

interface RemoteRoomPlannerRoadMemory {
  sources: number[];
}

class RoomPlannerBase {
  roomName: string;

  constructor(roomName: string) {
    this.roomName = roomName;
    if (Game.rooms[roomName] === undefined) {
      throw new RoomPlannerError(roomName, "Room must be visible");
    }
  }

  /**
   * Get the Screeps Room object for this room. If the room is not visible,
   * throws a RoomPlannerError.
   *
   * @returns The Screeps Room object
   */
  getRoom(): Room {
    const room = Game.rooms[this.roomName];
    if (room == undefined) {
      throw new RoomPlannerError(this.roomName, "Room must be visible");
    }
    return room;
  }

  /** Converts a graph index into a RoomPosition in this room. */
  indexToRoomPosition(index: number): RoomPosition {
    const room = this.getRoom();
    const roomPosition = room.getPositionAt(index % 50, Math.floor(index / 50));
    if (roomPosition == undefined) {
      throw new RoomPlannerError(
        this.roomName,
        `Unable to turn index ${index} into a RoomPosition in ${this.roomName}`,
      );
    }
    return roomPosition;
  }
}

export class RoomPlanner extends RoomPlannerBase {
  roomType: RoomType;
  costMatrix: CostMatrix;
  graph: Graph;
  distanceTransform: number[];

  static visualizePlan(plan: RoomPlannerMemory): string {
    const visual = new RoomVisual(plan.roomName);
    // rip the visuals this tick
    visual.clear();

    _.forEach(plan.plan, (value, key) => {
      if (key !== "occupied") {
        let char = "?";
        let array = [];
        if (key === "spawn") {
          char = "H";
        } else if (key === "storage") {
          char = "O";
        } else if (key === "sourceContainers") {
          char = "C";
        } else if (key === "towers") {
          char = "T";
        } else if (key === "links") {
          char = "L";
        } else if (key === "roads") {
          char = "+";
          value = _.flatten(value);
        } else if (key === "extensions") {
          char = "E";
        }
        if (!Array.isArray(value)) {
          array = [value];
        } else {
          array = value;
        }
        _.forEach(array, (spot) => {
          visual.text(char, spot % 50, Math.floor(spot / 50), {
            font: "1 monospace",
            backgroundColor: "black",
            backgroundPadding: 0,
            opacity: 0.75,
          });
        });
      }
    });

    const serialized = visual.export();
    visual.clear();
    return serialized;
  }

  static createGraph(roomName: string): Graph {
    const room = Game.rooms[roomName];
    if (room == undefined) {
      throw new RoomPlannerError(roomName, "Room must be visible");
    }

    const sources: number[] = [];
    let sinks: number[] = [];
    const walls: number[] = [];

    // Add terrain and constructed walls
    const terrain = room.getTerrain();
    for (let i = 0; i < 50 * 50; i++) {
      if (terrain.get(i % 50, Math.floor(i / 50)) === TERRAIN_MASK_WALL) {
        walls.push(i);
      }
    }
    _.forEach(
      room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_WALL } }),
      (wall) => walls.push(wall.pos.x + wall.pos.y * 50),
    );
    // Exit and exit adjacent tiles to sinks
    _.forEach(room.find(FIND_EXIT), (exit) => {
      sinks.push(exit.x + exit.y * 50);
      const unbuildable = _.difference(
        Graph.getSurrounding(exit.x + exit.y * 50),
        walls,
      );
      _.forEach(unbuildable, (node) => {
        sinks.push(node);
      });
    });
    // Remove overlap between sinks and walls from adding surrounding tiles
    // without checking that they aren't walls
    sinks = _.difference(_.uniq(sinks), walls);
    // Protect structures
    _.forEach(room.find(FIND_MY_STRUCTURES), (structure) =>
      sources.push(structure.pos.x + structure.pos.y * 50),
    );

    return Graph.createScreepsGraph(sources, sinks, walls);
  }

  constructor(roomName: string, roomType: RoomType) {
    super(roomName);

    this.roomType = roomType;
    this.costMatrix = new PathFinder.CostMatrix();
    this.graph = RoomPlanner.createGraph(roomName);
    this.distanceTransform = [0]; // this.graph.distanceTransform();

    // Mark constructed walls as obstructions
    _.forEach(
      this.getRoom().find(FIND_STRUCTURES, {
        filter: { structureType: STRUCTURE_WALL },
      }),
      (structure) =>
        this.addObstruction(structure.pos.x + structure.pos.y * 50),
    );
  }

  /**
   * Finds a path between two positions in the room accounting for obstacles
   * already in the plan using the plan CostMatrix.
   *
   * @param start The starting position
   * @param finish The destination position
   * @param distance The distance within which to consider having arrived at
   *   the destination
   * @returns A RoomPosition array representing a path from start to finish
   */
  findPath(
    start: RoomPosition,
    finish: RoomPosition,
    distance = 0,
  ): RoomPosition[] {
    const path = PathFinder.search(
      start,
      { pos: finish, range: distance },
      {
        roomCallback: (pathRoomName) => {
          // Do not search other rooms
          if (pathRoomName !== this.roomName) {
            return false;
          }
          return this.costMatrix;
        },
      },
    );

    if (path.incomplete) {
      throw new RoomPlannerError(
        this.roomName,
        `Unable to find path from (${start.x}, ${start.y}) to (${finish.x}, ${finish.y})`,
      );
    }

    return path.path;
  }

  addObstruction(index: number): void {
    this.costMatrix.set(index % 50, Math.floor(index / 50), 255);
  }

  public planRoom(entrance?: number): RoomPlannerMemory {
    switch (this.roomType) {
      case RoomType.expansion:
      case RoomType.primary:
        return this.planOwnedRoom();
      case RoomType.remote: {
        if (entrance == undefined) {
          throw new RoomPlannerError(
            this.roomName,
            "Entrance must be defined for remote rooms",
          );
        }
        return this.planRemoteRoom(entrance);
      }
      default:
        throw new RoomPlannerError(
          this.roomName,
          `Unable to plan ${this.roomType} room ${this.roomName}`,
        );
    }
  }

  planOwnedRoom(): RoomPlannerMemory {
    let occupied: number[] = [];

    const spawnLocation = this.findSpawnLocation();
    // Mark the spawn location and it's ring of roads as occupied.
    occupied.push(spawnLocation, ...this.graph.getNeighbors(spawnLocation));
    this.addObstruction(spawnLocation);

    const storageLocation = this.findStorageLocation(spawnLocation, occupied);
    occupied.push(storageLocation, ...this.graph.getNeighbors(spawnLocation));
    this.addObstruction(storageLocation);

    const sourceContainers = this.findSourceContainerLocations(occupied);
    occupied.push(...sourceContainers);

    const [towerSetupLocation, towerLocations] = this.findTowerLocation(
      storageLocation,
      occupied,
    );
    occupied.push(towerSetupLocation, ...towerLocations);

    const linkLocations = this.findLinkLocations(
      spawnLocation,
      storageLocation,
      sourceContainers,
      occupied,
    );
    // Mark the controller link location as occupied. Storage link placed in an
    // already occupied location.
    occupied.push(linkLocations[1]);
    this.addObstruction(linkLocations[0]);
    this.addObstruction(linkLocations[1]);
    this.addObstruction(linkLocations[2][0]);
    this.addObstruction(linkLocations[2][1]);

    const extractorLocation = this.findExtractorLocation();

    const roads = this.findRoadLocations(
      spawnLocation,
      storageLocation,
      sourceContainers,
      linkLocations[1],
      towerSetupLocation,
      extractorLocation,
    );
    _.forEach(roads, (road) => {
      _.forEach(road, (roadPosition) => {
        occupied.push(roadPosition);
      });
    });
    // Remove duplicates from occupied after adding roads
    occupied = _.uniq(occupied);

    const [
      extensionLocations,
      extensionRoadLocations,
    ] = this.findExtensionPodLocations(storageLocation, occupied);
    // Add extension roads to roads list
    roads.push(extensionRoadLocations);

    const { walls, ramparts } = this.findWallRampartLocations(occupied);

    const roadMemory: RoomPlannerRoadMemory = {
      spawnRing: roads[0],
      storageRing: roads[1],
      spawnStorage: roads[2],
      controller: roads[3],
      sources: roads[4],
      tower: roads[5],
      extractor: roads[6],
      extensions: roads[7],
    };

    const planMemory: RoomPlannerPlanMemory = {
      occupied,
      spawn: spawnLocation,
      storage: storageLocation,
      sourceContainers,
      towers: towerLocations,
      links: linkLocations,
      extractor: extractorLocation,
      roads: roadMemory,
      extensions: extensionLocations,
      walls: walls,
      ramparts: ramparts,
    };

    return {
      roomName: this.roomName,
      roomType: this.roomType,
      costMatrix: this.costMatrix.serialize(),
      plan: planMemory,
      level: 0,
    };
  }

  planRemoteRoom(entrance: number): RoomPlannerMemory {
    let occupied: number[] = [];

    const sourceContainers = this.findSourceContainerLocations(occupied);
    occupied.push(...sourceContainers);

    const roads = this.findRemoteRoadLocations(entrance, sourceContainers);
    _.forEach(roads, (road) => {
      _.forEach(road, (roadPosition) => {
        occupied.push(roadPosition);
      });
    });
    // Remove duplicates from occupied after adding roads
    occupied = _.uniq(occupied);

    const roadMemory: RoomPlannerRoadMemory = {
      sources: roads[0],
    };

    const planMemory: RoomPlannerPlanMemory = {
      occupied,
      sourceContainers,
      roads: roadMemory,
    };

    return {
      roomName: this.roomName,
      roomType: this.roomType,
      costMatrix: this.costMatrix.serialize(),
      plan: planMemory,
      level: 0,
    };
  }

  findSpawnLocation(): number {
    const room = this.getRoom();
    // Find paths from the room's source(s) to the controller
    const sources = room.find(FIND_SOURCES);
    if (sources.length === 0) {
      throw new RoomPlannerError(
        this.roomName,
        "Room must have sources for a spawn",
      );
    }
    const controller = room.controller;
    if (controller === undefined) {
      throw new RoomPlannerError(
        this.roomName,
        "Room must have a controller for a spawn",
      );
    }
    const sourceControllerRoads: RoomPosition[][] = [];
    _.forEach(sources, (source) => {
      sourceControllerRoads.push(this.findPath(source.pos, controller.pos, 1));
    });
    // There are either 1 or 2 sources in this room, find which is closest to
    // the controller.
    const minIndex =
      sourceControllerRoads[0].length < sourceControllerRoads[1].length ? 0 : 1;

    // Use the midpoint of the (shortest) path as the start location for the
    // spawn location search.
    const midpoint =
      sourceControllerRoads[minIndex][
        Math.floor(sourceControllerRoads[minIndex].length / 2)
      ];

    const spawnLocationIndex = this.graph.findOpenTile(
      midpoint.x + midpoint.y * 50,
      2,
      [],
    );
    if (spawnLocationIndex == undefined) {
      throw new RoomPlannerError(
        this.roomName,
        `Unable to find tile with distance 2`,
      );
    }

    return spawnLocationIndex;
  }

  /** Find a location near to the spawn with 2 space around it. */
  findStorageLocation(spawn: number, occupied: number[]): number {
    const storageLocation = this.graph.findOpenTile(spawn, 2, occupied);
    if (storageLocation == undefined) {
      throw new RoomPlannerError(
        this.roomName,
        `Unable to find tile with distance 2`,
      );
    }
    return storageLocation;
  }

  /** Find the location(s) for source containers */
  findSourceContainerLocations(occupied: number[]): number[] {
    const room = this.getRoom();
    const sources = room.find(FIND_SOURCES);
    const containers: number[] = [];
    console.log(JSON.stringify(occupied));
    _.forEach(sources, (source) => {
      const index = Graph.coordToIndex(source.pos);
      // Get the first neighbor not occupied in the plan
      const spot = _.find(
        this.graph.getNeighbors(index, 1),
        (neighbor) => !_.includes(occupied, neighbor),
      );
      if (spot == undefined) {
        throw new RoomPlannerError(
          this.roomName,
          `Unable to find container spot for source ${source.id} at ${index}`,
        );
      }
      containers.push(spot);
    });
    return containers;
  }

  /**
   * Find the location for the center of the tower set up starting with the
   * storage location
   */
  findTowerLocation(storage: number, occupied: number[]): [number, number[]] {
    const towerLocation = this.graph.findOpenTile(storage, 2, occupied);
    if (towerLocation == undefined) {
      throw new RoomPlannerError(
        this.roomName,
        `Unable to find tile with distance 2 and ignore radius 2`,
      );
    }
    const neighbors = this.graph.getNeighbors(towerLocation);
    occupied.push(towerLocation, ...neighbors);
    const path = _.map(
      this.findPath(
        this.indexToRoomPosition(storage),
        this.indexToRoomPosition(towerLocation),
      ),
      (pos) => Graph.coordToIndex(pos),
    );
    // Mark the first 6 adjacent tiles that aren't part of the path to the
    // tower setup spot as towers
    const towers = _.take(
      _.filter(neighbors, (neighbor) => !_.includes(path, neighbor)),
      6,
    );
    // Mark the towers as obstructions
    _.forEach(towers, (spot) => {
      this.addObstruction(spot);
    });
    return [towerLocation, towers];
  }

  /**
   * Finds link locations.
   *
   * @returns The link locations as an array: storage link, controller link
   */
  findLinkLocations(
    spawn: number,
    storage: number,
    sourceContainers: number[],
    occupied: number[],
  ): [number, number, number[]] {
    // The storage link should be on one of the diagonals of the storage, which
    // is already marked occupied. However, it should not be placed within the
    // spawn's ring of roads, in the case that the storage and spawn are close.
    const storageDiagonals: number[] = [];
    for (let yOff = -1; yOff <= 1; yOff += 2) {
      for (let xOff = -1; xOff <= 1; xOff += 2) {
        storageDiagonals.push(
          (storage % 50) + xOff + (Math.floor(storage / 50) + yOff) * 50,
        );
      }
    }
    const storageLink = _.find(
      storageDiagonals,
      (diagonal) => !_.includes(occupied, diagonal),
    );
    if (storageLink == undefined) {
      throw new RoomPlannerError(
        this.roomName,
        `Unable to find storage link position`,
      );
    }

    // The controller link should be in an adjacent, non-occupied tile
    const controller = this.getRoom().controller;
    if (controller == undefined) {
      throw new RoomPlannerError(this.roomName, `Room lacks a controller`);
    }
    const controllerIndex = Graph.coordToIndex(controller.pos);
    const adjacents = this.graph.getNeighbors(controllerIndex, 1);
    const controllerLink = _.find(
      adjacents,
      (adjacent) => !_.includes(occupied, adjacent),
    );
    if (controllerLink == undefined) {
      throw new RoomPlannerError(
        this.roomName,
        `Unable to find controller link position`,
      );
    }

    const sourceLinks: number[] = [];
    _.forEach(sourceContainers, (sourceContainer) => {
      const adjacents = this.graph.getNeighbors(sourceContainer, 1);
      const sourceLink = _.find(
        adjacents,
        (adjacent) => !_.includes(occupied, adjacent),
      );
      if (sourceLink == undefined) {
        throw new RoomPlannerError(
          this.roomName,
          `Unable to find source link from container ${sourceContainer}`,
        );
      }
      sourceLinks.push(sourceLink);
    });

    return [storageLink, controllerLink, sourceLinks];
  }

  findExtractorLocation(): number | undefined {
    const room = this.getRoom();
    const mineral = room.find(FIND_MINERALS)[0];
    if (mineral == undefined) {
      return undefined;
    }
    return Graph.coordToIndex(mineral.pos);
  }

  findRoadLocations(
    spawn: number,
    storage: number,
    sourceContainers: number[],
    controllerLink: number,
    tower: number,
    extractor: number | undefined,
  ): number[][] {
    // Spawn ring roads
    const spawnRingRoad = this.graph.getNeighbors(spawn);

    // Storage ring roads
    const storageRingRoad = this.graph.getNeighbors(storage);

    // Road from spawn to storage, not including roads built for the spawn and
    // storage rings.
    const spawnStorageRoad = _.difference(
      _.map(
        this.findPath(
          this.indexToRoomPosition(spawn),
          this.indexToRoomPosition(storage),
          1,
        ),
        (pos) => Graph.coordToIndex(pos),
      ),
      spawnRingRoad,
      storageRingRoad,
    );

    // Road from spawn to controller
    // Don't include initial spawn ring road
    const controllerRoad = _.map(
      _.tail(
        this.findPath(
          this.indexToRoomPosition(spawn),
          this.indexToRoomPosition(controllerLink),
          1,
        ),
      ),
      (pos) => Graph.coordToIndex(pos),
    );

    // Road from spawn to source containers. Not seperated into individual roads
    // for each source, but instead one road.
    const sourceRoads: number[] = [];
    _.forEach(sourceContainers, (container) => {
      const road = this.findPath(
        this.indexToRoomPosition(spawn),
        this.indexToRoomPosition(container),
        1,
      );
      // The first position in the road will be part of the spawn ring
      sourceRoads.push(
        ..._.map(_.tail(road), (pos) => Graph.coordToIndex(pos)),
      );
    });

    // Road from spawn to tower setup (without initial spawn ring road)
    const towerRoad = _.map(
      _.tail(
        this.findPath(
          this.indexToRoomPosition(spawn),
          this.indexToRoomPosition(tower),
        ),
      ),
      (pos) => Graph.coordToIndex(pos),
    );

    // Road from spawn to extractor, minus initial spawn ring road
    let extractorRoad: number[] = [];
    if (extractor != undefined) {
      extractorRoad = _.map(
        _.tail(
          this.findPath(
            this.indexToRoomPosition(spawn),
            this.indexToRoomPosition(extractor),
            1,
          ),
        ),
        (pos) => Graph.coordToIndex(pos),
      );
    }

    return [
      spawnRingRoad,
      storageRingRoad,
      spawnStorageRoad,
      controllerRoad,
      sourceRoads,
      towerRoad,
      extractorRoad,
    ];
  }

  findRemoteRoadLocations(
    entrance: number,
    sourceContainers: number[],
  ): number[][] {
    // Road from the entrance to source containers. Not seperated into
    // individual roads for each source, but instead one road.
    const sourceRoads: number[] = [];
    _.forEach(sourceContainers, (container) => {
      const road = this.findPath(
        this.indexToRoomPosition(entrance),
        this.indexToRoomPosition(container),
        1,
      );
      sourceRoads.push(..._.map(road, (pos) => Graph.coordToIndex(pos)));
    });

    return [sourceRoads];
  }

  findExtensionPodLocations(
    storage: number,
    occupied: number[],
  ): [number[], number[]] {
    const storagePos = this.indexToRoomPosition(storage);
    const extensionLocations: number[] = [];
    const roadLocations: number[] = [];
    for (let i = 0; i < 10; i++) {
      const podLocation = this.graph.findOpenTile(storage, 1, occupied);
      if (podLocation == undefined) {
        throw new RoomPlannerError(
          this.roomName,
          `Unable to find ${i}th extension pod location`,
        );
      }
      const podNeighbors = this.graph.getNeighbors(podLocation);
      occupied.push(podLocation, ...podNeighbors);
      const path = _.map(
        this.findPath(storagePos, this.indexToRoomPosition(podLocation)),
        (pos) => Graph.coordToIndex(pos),
      );
      // Mark the first 6 adjacent tiles that aren't part of the path to the
      // extension pod spot as extensions
      const podExtensions = _.take(
        _.filter(podNeighbors, (neighbor) => !_.includes(path, neighbor)),
        6,
      );
      // Add the extensions to the location list and mark them as obstructions
      _.forEach(podExtensions, (spot) => {
        extensionLocations.push(spot);
        this.addObstruction(spot);
      });
      // Add the road to the pod to the road location list
      roadLocations.push(...path);
      // Mark the extension roads as occupied
      occupied.push(...path);
    }
    console.log(_.uniq(roadLocations).length);
    // Remove duplicates from roads and return
    return [extensionLocations, _.uniq(roadLocations)];
  }

  findWallRampartLocations(
    protect: number[],
  ): { walls: number[]; ramparts: number[] } {
    this.graph.addManyToSource(protect);
    const [walls, ramparts] = this.graph.wallPositions();
    return { walls, ramparts };
  }
}

export class RoomPlanExecuter extends RoomPlannerBase {
  plan: RoomPlannerMemory;
  sitePositions: RoomPosition[];
  invalidTargets: number;

  constructor(plan: RoomPlannerMemory) {
    super(plan.roomName);

    this.plan = plan;
    this.sitePositions = [];
    this.invalidTargets = 0;
  }

  executePlan(level: number): RoomPosition[] {
    const room = Game.rooms[this.roomName];
    if (room == undefined) {
      throw new RoomPlannerError(this.roomName, "Room must be visible");
    }

    switch (this.plan.roomType) {
      case RoomType.expansion:
      case RoomType.primary: {
        this.executeOwnedRoomPlan(level);
        break;
      }
      case RoomType.remote: {
        this.executeRemoteRoomPlan();
        break;
      }
    }

    info(
      `Room ${this.roomName} plan execution for level ${level} encountered ${this.invalidTargets} invalid targets`,
    );
    return this.sitePositions;
  }

  executeOwnedRoomPlan(level: number): void {
    const plan = this.plan.plan as OwnedRoomPlannerPlanMemory;

    // Switch with highest level first so that the execution falls through to
    // the levels below to "fix" the plan.
    switch (level) {
      case 8: {
        // Level 8:
        // - +1 Spawn
        // - +10 Extensions
        // - +2 Links
        // - +3 Towers
        // - Observer
        // - Power spawn
        // - +4 Labs
        // - Nuker
        this.buildMany(plan.extensions.slice(50), STRUCTURE_EXTENSION);
        // this.buildMany(plan.links.slice(4), STRUCTURE_LINK);
        this.buildMany(plan.towers.slice(3), STRUCTURE_TOWER);
      }
      // falls through
      case 7: {
        // Level 7:
        // - +1 Spawn
        // - +10 Extensions
        // - +1 Link
        // - +1 Tower
        // - +3 Labs
        // - 1 Factory
        this.buildMany(plan.extensions.slice(40, 50), STRUCTURE_EXTENSION);
        this.build(plan.links[2][1], STRUCTURE_LINK);
        this.build(plan.towers[2], STRUCTURE_TOWER);
      }
      // falls through
      case 6: {
        // Level 6:
        // - +10 Extensions
        // - +1 Link
        // - Extractor
        // - Terminal
        // - 3 labs
        this.buildMany(plan.extensions.slice(30, 40), STRUCTURE_EXTENSION);
        this.build(plan.links[2][0], STRUCTURE_LINK);
        if (plan.extractor != undefined && plan.roads.extractor != undefined) {
          this.buildMany(plan.roads.extractor, STRUCTURE_EXTRACTOR);
          this.build(plan.extractor, STRUCTURE_EXTRACTOR);
        }
      }
      // falls through
      case 5: {
        // Level 5:
        // - +10 Extensions
        // - 2 Links
        // - +1 Tower
        this.buildMany(plan.extensions.slice(20, 30), STRUCTURE_EXTENSION);
        this.buildMany([plan.links[0], plan.links[1]], STRUCTURE_LINK);
        this.build(plan.towers[1], STRUCTURE_TOWER);
      }
      // falls through
      case 4: {
        // Level 4:
        // - +10 Extensions
        // - Storage
        this.buildMany(plan.extensions.slice(10, 20), STRUCTURE_EXTENSION);
        this.build(plan.storage, STRUCTURE_STORAGE);
      }
      // falls through
      case 3: {
        // Level 3:
        // - +5 extensions
        // - Tower
        this.buildMany(plan.extensions.slice(5, 10), STRUCTURE_EXTENSION);
        this.build(plan.towers[0], STRUCTURE_TOWER);
      }
      // falls through
      case 2: {
        // Level 2:
        // - 5 extensions
        // - Walls/ramparts
        this.buildMany(plan.extensions.slice(0, 5), STRUCTURE_EXTENSION);
        this.buildMany(plan.roads.extensions, STRUCTURE_ROAD);
      }
      // falls through
      case 1: {
        // Level 0/1: Initial plan
        // - Place spawn
        // - Place roads
        //   - Spawn ring road
        //   - Source roads
        //   - Controller roads
        // - Place miner containers
        this.build(plan.spawn, STRUCTURE_SPAWN);
        this.buildMany(plan.roads.spawnRing, STRUCTURE_ROAD);
        this.buildMany(plan.roads.sources, STRUCTURE_ROAD);
        this.buildMany(plan.roads.controller, STRUCTURE_ROAD);
        this.buildMany(plan.sourceContainers, STRUCTURE_CONTAINER);
      }
    }
  }

  executeRemoteRoomPlan(): void {
    const plan = this.plan.plan as RemoteRoomPlannerPlanMemory;
    this.buildMany(plan.roads.sources, STRUCTURE_ROAD);
    this.buildMany(plan.sourceContainers, STRUCTURE_CONTAINER);
  }

  build(index: number, structureType: BuildableStructureConstant): void {
    const pos = this.indexToRoomPosition(index);
    const response = pos.createConstructionSite(structureType);
    if (response === OK) {
      this.sitePositions.push(pos);
    } else if (response === ERR_INVALID_TARGET) {
      this.invalidTargets++;
    } else {
      warn(
        `Attempted to build ${structureType} at (${pos.x}, ${
          pos.y
        }) with response ${errorConstant(response)}`,
      );
    }
  }

  buildMany(
    indices: number[],
    structureType: BuildableStructureConstant,
  ): void {
    _.forEach(indices, (index) => this.build(index, structureType));
  }
}
