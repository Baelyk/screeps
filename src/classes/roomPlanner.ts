import { ScriptError } from "utils/errors";
import { Graph } from "classes/graph";

class RoomPlannerError extends ScriptError {
  constructor(roomName: string, message: string) {
    let msg = `Error while planning room ${roomName}`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

export class RoomPlanner {
  roomName: string;
  costMatrix: CostMatrix;
  graph: Graph;
  distanceTransform: number[];

  static createGraph(roomName: string): Graph {
    const room = Game.rooms[roomName];
    if (room == undefined) {
      throw new RoomPlannerError(roomName, "Room must be visible");
    }

    const walls: number[] = [];
    // Add natural walls
    const terrain = room.getTerrain();
    for (let i = 0; i < 50 * 50; i++) {
      const tile = terrain.get(i % 50, Math.floor(i / 50));
      if (tile === TERRAIN_MASK_WALL) {
        walls.push(i);
      }
    }
    // Add constructed walls
    _.map(
      room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_WALL } }),
      (structure) => structure.pos.x + structure.pos.y * 50,
    );

    const exits: number[] = _.map(
      room.find(FIND_EXIT),
      (pos) => pos.x + pos.y * 50,
    );

    return new Graph(walls, exits);
  }

  constructor(roomName: string) {
    this.roomName = roomName;
    if (Game.rooms[roomName] == undefined) {
      throw new RoomPlannerError(roomName, "Room must be visible");
    }
    this.costMatrix = new PathFinder.CostMatrix();
    this.graph = RoomPlanner.createGraph(roomName);
    this.distanceTransform = [0]; // this.graph.distanceTransform();
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

  public planRoom(): void {
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
      occupied,
    );
    // Mark the controller link location as occupied. Storage link placed in an
    // already occupied location.
    occupied.push(linkLocations[1]);
    this.addObstruction(linkLocations[0]);
    this.addObstruction(linkLocations[1]);

    const extractorLocation = this.findExtractorLocation();

    const roads = this.findRoadLocations(
      spawnLocation,
      storageLocation,
      sourceContainers,
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

    Memory.debug.plan = {
      occupied,
      spawnLocation,
      storageLocation,
      sourceContainers,
      towerLocations,
      linkLocations,
      extractorLocation,
      roads,
      extensionLocations,
    };
  }

  findSpawnLocation(): number {
    // 1 is required for the spawn and a ring of roads around, +1 for some extra
    // space
    const SPAWN_DISTANCE = 2;

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

    const spawnLocationIndex = this.graph.findClosestTileWithDistance(
      midpoint.x + midpoint.y * 50,
      SPAWN_DISTANCE,
      this.distanceTransform,
      [],
      SPAWN_DISTANCE,
    );
    if (spawnLocationIndex == undefined) {
      throw new RoomPlannerError(
        this.roomName,
        `Unable to find tile with distance ${SPAWN_DISTANCE}`,
      );
    }

    return spawnLocationIndex;
  }

  /** Find a location near to the spawn with 2 space around it. */
  findStorageLocation(spawn: number, occupied: number[]): number {
    const storageLocation = this.graph.findClosestTileWithDistance(
      spawn,
      2,
      this.distanceTransform,
      occupied,
      0,
    );
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
        this.graph.getNeighbors(index, 1, true),
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
    const towerLocation = this.graph.findClosestTileWithDistance(
      storage,
      2,
      this.distanceTransform,
      occupied,
      2,
    );
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
    occupied: number[],
  ): number[] {
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
    const adjacents = this.graph.getNeighbors(controllerIndex, 1, true);
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

    return [storageLink, controllerLink];
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
    const controller = this.getRoom().controller;
    if (controller == undefined) {
      throw new RoomPlannerError(this.roomName, "Room lacks a controller");
    }
    // Don't include initial spawn ring road
    const controllerRoad = _.map(
      _.tail(this.findPath(this.indexToRoomPosition(spawn), controller.pos, 1)),
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

  findExtensionPodLocations(
    storage: number,
    occupied: number[],
  ): [number[], number[]] {
    const storagePos = this.indexToRoomPosition(storage);
    const extensionLocations: number[] = [];
    const roadLocations: number[] = [];
    for (let i = 0; i < 10; i++) {
      const podLocation = this.graph.findClosestTileWithDistance(
        storage,
        1,
        this.distanceTransform,
        occupied,
        1,
      );
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
}
