import { error, info, warn } from "utils/logger";
import { buildStructure, getSurroundingTiles } from "construct";
import { roomPositionArrayRemoveDuplicates } from "utils/utilities";

export function getExitWallsAndRamparts(
  room: Room
): [RoomPosition[], RoomPosition[]] {
  info(`Building walls for room ${room.name}`);

  const walls: RoomPosition[] = [];
  const ramparts: RoomPosition[] = [];
  // Top/Left and Bottom/Right exit max for Top, Right, Bottom, Left
  const seals: (RoomPosition | null)[] = [
    [49, 0],
    [0, 0],
    [49, 49],
    [49, 0],
    [0, 49],
    [49, 49],
    [0, 0],
    [0, 49],
  ].map((spot) => room.getPositionAt(spot[0], spot[1]));

  room.find(FIND_EXIT).forEach((exit) => {
    if (exit != undefined) {
      if (exit.y === 0) {
        // Top exit
        if (seals[0] == undefined) {
          seals[0] = exit;
        }
        if (seals[1] == undefined) {
          seals[1] = exit;
        }
        if (exit.x < seals[0].x) {
          seals[0] = exit;
        } else if (exit.x > seals[1].x) {
          seals[1] = exit;
        }
      } else if (exit.x === 49) {
        // Right exit
        if (seals[2] == undefined) {
          seals[2] = exit;
        }
        if (seals[3] == undefined) {
          seals[3] = exit;
        }
        if (exit.y < seals[2].y) {
          seals[2] = exit;
        } else if (exit.y > seals[3].y) {
          seals[3] = exit;
        }
      } else if (exit.y === 49) {
        // Bottom exit
        if (seals[4] == undefined) {
          seals[4] = exit;
        }
        if (seals[5] == undefined) {
          seals[5] = exit;
        }
        if (exit.x < seals[4].x) {
          seals[4] = exit;
        } else if (exit.x > seals[5].x) {
          seals[5] = exit;
        }
      } else if (exit.x === 0) {
        // Left exit
        if (seals[6] == undefined) {
          seals[6] = exit;
        }
        if (seals[7] == undefined) {
          seals[7] = exit;
        }
        if (exit.x < seals[6].x) {
          seals[6] = exit;
        } else if (exit.x > seals[7].x) {
          seals[7] = exit;
        }
      } else {
        error(`Unable to get wall position for exit ${JSON.stringify(exit)}`);
      }
    }
  });

  // Generate the walls between seals. Generating [Top, Left, Bottom, Right]
  // according to when i is its index (e.g. i = 0 is top and i = 3 is right).
  for (let i = 0; i < 4; i++) {
    const terrain = room.getTerrain();
    const begin = seals[i * 2];
    const end = seals[i * 2 + 1];
    if (begin == undefined || end == undefined) {
      error(`Failed to find seal for exit ${i}`);
      return [[], []];
    }
    let beginSeal;
    let endSeal;
    let beginIndex;
    let endIndex;
    let middleIndex;
    if (i % 2 === 0) {
      // if i = 0, y = 2; else y = 47
      let y: number;
      if (i === 0) {
        y = 2;
        beginSeal = room.getPositionAt(begin.x - 2, 1);
        endSeal = room.getPositionAt(end.x + 2, 1);
      } else {
        y = 47;
        beginSeal = room.getPositionAt(begin.x - 2, 48);
        endSeal = room.getPositionAt(end.x + 2, 48);
      }
      if (beginSeal != undefined) {
        beginIndex = walls.push(beginSeal);
      } else {
        warn(`no wall for exit ${i}`);
        continue;
      }
      for (let x = begin.x - 2; x <= end.x + 2; x++) {
        const wall = room.getPositionAt(x, y);
        if (wall != undefined) {
          walls.push(wall);
        } else {
          error(
            `Failed to find wall position at (${x}, ${y}) in room ${room.name} for i ${i}`
          );
          return [[], []];
        }
      }
      if (endSeal != undefined) {
        endIndex = walls.push(endSeal);
      } else {
        error(`Failed to find end seal for exit ${i}`);
        return [[], []];
      }

      middleIndex = Math.floor((endIndex + beginIndex) / 2);
      let passedChecks = false;
      while (!passedChecks) {
        middleIndex--;
        if (middleIndex === beginIndex) {
          error(`Unable to find entryway for ${i}`);
          return [[], []];
        }
        passedChecks = true;
        for (let offset = -1; offset <= 1; offset++) {
          let exit;
          let doorstep;
          if (i === 0) {
            exit = room.getPositionAt(walls[middleIndex + offset].x, 0);
            doorstep = room.getPositionAt(walls[middleIndex + offset].x, 1);
          } else {
            exit = room.getPositionAt(walls[middleIndex + offset].x, 49);
            doorstep = room.getPositionAt(walls[middleIndex + offset].x, 48);
          }
          if (exit == undefined || doorstep == undefined) {
            error(
              `Failed to get exit/doorstep at ${JSON.stringify(
                walls[middleIndex]
              )}`
            );
            return [[], []];
          }
          if (
            terrain.get(exit.x, exit.y) !== 0 ||
            terrain.get(doorstep.x, doorstep.y) !== 0
          ) {
            passedChecks = false;
          }
        }
      }

      if (passedChecks) {
        const removed = walls.splice(middleIndex - 1, 3);
        ramparts.push(...removed);
      }
    } else {
      let x: number;
      if (i === 1) {
        x = 47;
        beginSeal = room.getPositionAt(48, begin.y - 2);
        endSeal = room.getPositionAt(48, end.y + 2);
      } else {
        x = 2;
        beginSeal = room.getPositionAt(1, begin.y - 2);
        endSeal = room.getPositionAt(1, end.y + 2);
      }
      if (beginSeal != undefined) {
        beginIndex = walls.push(beginSeal);
      } else {
        warn(`no wall for exit ${i}`);
        continue;
      }
      for (let y = begin.y - 2; y <= end.y + 2; y++) {
        const wall = room.getPositionAt(x, y);
        if (wall != undefined) {
          walls.push(wall);
        } else {
          error(
            `Failed to find wall position at (${x}, ${y}) in room ${room.name} for i ${i}`
          );
          return [[], []];
        }
      }
      if (endSeal != undefined) {
        endIndex = walls.push(endSeal);
      } else {
        error(`Failed to find end seal for exit ${i}`);
        return [[], []];
      }

      middleIndex = Math.floor((endIndex + beginIndex) / 2);
      let passedChecks = false;
      while (!passedChecks) {
        middleIndex--;
        if (middleIndex === beginIndex) {
          error(`Unable to find entryway for ${i}`);
          return [[], []];
        }
        passedChecks = true;
        for (let offset = -1; offset <= 1; offset++) {
          let exit;
          let doorstep;
          if (i === 1) {
            exit = room.getPositionAt(49, walls[middleIndex + offset].y);
            doorstep = room.getPositionAt(48, walls[middleIndex + offset].y);
          } else {
            exit = room.getPositionAt(0, walls[middleIndex + offset].y);
            doorstep = room.getPositionAt(1, walls[middleIndex + offset].y);
          }
          if (exit == undefined || doorstep == undefined) {
            error(
              `Failed to get exit/doorstep at ${JSON.stringify(
                walls[middleIndex]
              )}`
            );
            return [[], []];
          }
          if (
            terrain.get(exit.x, exit.y) !== 0 ||
            terrain.get(doorstep.x, doorstep.y) !== 0
          ) {
            passedChecks = false;
          }
        }
      }

      if (passedChecks) {
        const removed = walls.splice(middleIndex - 1, 3);
        ramparts.push(...removed);
      } else {
        error(`Failed to find entryway for ${i}`);
        return [[], []];
      }
    }
  }

  /* walls.forEach((wall) => {
    buildStructure(wall, STRUCTURE_WALL);
  });
  ramparts.forEach((rampart) => {
    buildStructure(rampart, STRUCTURE_RAMPART);
  }); */
  return [walls, ramparts];
}

/**
 * The RoomPostions of the towers, in order.
 *
 * @param room The room to plan
 * @returns The RoomPositions to build the towers, in order
 */
export function towerSpots(room: Room): RoomPosition[] {
  return getTowerSpots(room);
}

function getTowerSpots(room: Room): RoomPosition[] {
  const spawn = Game.getObjectById(room.memory.spawn) as
    | StructureSpawn
    | undefined;
  if (spawn == undefined) {
    error(`Couldn't find spawn for tower spots in room ${room.name}`);
    return [];
  }

  const offsets: [number, number][] = [
    [-5, 0],
    [-6, -1],
    [-7, -1],
    [-7, 0],
    [-7, 1],
    [-6, 1],
  ];

  return offsetToPosition(spawn.pos, offsets);
}

function offsetToPosition(
  origin: RoomPosition,
  offsets: [number, number][]
): RoomPosition[] {
  const room = Game.rooms[origin.roomName];
  const positions: RoomPosition[] = [];
  offsets.forEach((offset) => {
    const position = room.getPositionAt(
      origin.x + offset[0],
      origin.y + offset[1]
    );
    if (position != undefined) {
      positions.push(position);
    } else {
      error(
        `Unable to find position (${origin.x + offset[0]}, ${
          origin.y + offset[0]
        }) in room ${room.name}`
      );
    }
  });

  return positions;
}

function getLinkSpots(room: Room): RoomPosition[] {
  const spawn = Game.getObjectById(room.memory.spawn) as
    | StructureSpawn
    | undefined;
  if (spawn == undefined) {
    error(`Couldn't find spawn for tower spots in room ${room.name}`);
    return [];
  }

  const positions: RoomPosition[] = [];
  // [-1, -2] is the offset for the spawn-side link
  const offsets: [number, number][] = [[-1, -2]];
  positions.push(...offsetToPosition(spawn.pos, offsets));

  // Controller link
  const controllerLink = getControllerSetupSpots(room);
  if (controllerLink == undefined) {
    warn(`Failed to get controller link position in room ${room.name}`);
  } else {
    positions.push(controllerLink);
  }

  return positions;
}

/**
 * Gets the RoomPositions for the container and link next to the controller.
 *
 * @param room The Room to find the positions for
 * @returns An array with two RoomPositions. [0] is the container position and
 *   [1] is the link position.
 */
function getControllerSetupSpots(room: Room): RoomPosition | undefined {
  const controller = room.controller;
  if (controller == undefined) {
    error(`Couldn't find controller for room ${room.name}`);
    return;
  }

  const terrain = room.getTerrain();
  // let container: RoomPosition | null = null;
  let link: RoomPosition | null = null;

  // Check all the tiles around the controller for a spot to place the link
  getSurroundingTiles(controller.pos, 1).forEach((position) => {
    if (link == undefined) {
      // If the terrain at the position and one above are plain
      if (terrain.get(position.x, position.y) === 0) {
        // container = position;
        link = room.getPositionAt(position.x, position.y);
      }
    }
  });

  // If no suitable location was found
  // if (container == undefined) {
  //  error(
  //    `Failed to find suitable location for controller container in room ${room.name}`
  //  );
  //  return;
  // }

  // If the room failed to find the position above the container
  if (link == undefined) {
    error(
      `Failed to find suitable location for controller link in room ${room.name}`
    );
    return;
  }

  return link;
}

function getStorageSpots(room: Room): RoomPosition[] {
  const spawn = Game.getObjectById(room.memory.spawn) as
    | StructureSpawn
    | undefined;
  if (spawn == undefined) {
    error(`Couldn't find spawn for tower spots in room ${room.name}`);
    return [];
  }

  return offsetToPosition(spawn.pos, [[-2, -1]]);
}

/**
 * Get the extension spots for this spawn. This is just based on design and
 * does not take terrain/already existing structures into account.
 *
 * @param spawn The spawn to get the spots for
 * @returns An array of the RoomPositions
 */
export function getExtensionSpots(room: Room): RoomPosition[] {
  const spawn = Game.getObjectById(room.memory.spawn) as
    | StructureSpawn
    | undefined;
  if (spawn == undefined) {
    error(`Couldn't find spawn for tower spots in room ${room.name}`);
    return [];
  }

  info(`Find extension spots for spawn ${spawn.name}`);
  // We want order to matter, so we want to build each pod first. We also might
  // as well construct each pod group first before moving on to the next.
  // Starting with the top right pod group.
  let positions: RoomPosition[] = [];
  // This is the primary road interesection that forms that heart of the podgroup
  const groupCenter = spawn.room.getPositionAt(
    spawn.pos.x + 3,
    spawn.pos.y + 3
  );
  if (groupCenter === null) {
    error(
      `Unable to get first group center position (${spawn.pos.x + 3}, ${
        spawn.pos.y + 3
      })`
    );
    return [];
  }
  // These are the three pod centers, the spots the creep will sit to refill
  const firstCenter = spawn.room.getPositionAt(
    spawn.pos.x + 2,
    spawn.pos.y + 4
  );
  if (firstCenter === null) {
    error(
      `Unable to get first center position (${spawn.pos.x + 2}, ${
        spawn.pos.y + 4
      })`
    );
    return [];
  }
  const secondCenter = spawn.room.getPositionAt(
    spawn.pos.x + 4,
    spawn.pos.y + 4
  );
  if (secondCenter === null) {
    error(
      `Unable to get second center position (${spawn.pos.x + 4}, ${
        spawn.pos.y + 4
      })`
    );
    return [];
  }
  const thirdCenter = spawn.room.getPositionAt(
    spawn.pos.x + 4,
    spawn.pos.y + 2
  );
  if (thirdCenter === null) {
    error(
      `Unable to get third center position (${spawn.pos.x + 4}, ${
        spawn.pos.y + 2
      })`
    );
    return [];
  }
  // The two exits, the extra spots lacking extensions off of the first and
  // third pods
  const firstExit = spawn.room.getPositionAt(spawn.pos.x + 1, spawn.pos.y + 5);
  if (firstExit === null) {
    error(
      `Unable to get first exit position (${spawn.pos.x + 1}, ${
        spawn.pos.y + 5
      })`
    );
    return [];
  }
  const secondExit = spawn.room.getPositionAt(spawn.pos.x + 5, spawn.pos.y + 1);
  if (secondExit === null) {
    error(
      `Unable to get second exit position (${spawn.pos.x + 5}, ${
        spawn.pos.y + 1
      })`
    );
    return [];
  }

  // Remove the group center
  positions = positions
    .concat(getSurroundingTiles(secondCenter, 1))
    .filter((spot) => {
      return spot.x !== groupCenter.x || spot.y !== groupCenter.y;
    });
  info(`second pod size: ${positions.length}`);

  // Merge the third and first pods then remove all spots that are also in the
  // second pod.
  const firstPod = getSurroundingTiles(firstCenter, 1);
  const thirdPod = getSurroundingTiles(thirdCenter, 1);
  let addition = firstPod.concat(thirdPod);
  // Remove duplicates
  addition = addition.filter((newSpot) => {
    if (newSpot.x === firstExit.x && newSpot.y === firstExit.y) {
      return false;
    }
    if (newSpot.x === secondExit.x && newSpot.y === secondExit.y) {
      return false;
    }
    if (newSpot.x === groupCenter.x && newSpot.y === groupCenter.y) {
      return false;
    }
    for (let i = 0; i < positions.length; i++) {
      if (newSpot.x === positions[i].x && newSpot.y === positions[i].y) {
        // Don't include deplicates
        return false;
      }
    }
    return true;
  });
  positions = positions.concat(addition);

  // Reflect the first pod group across the horizontal to get the second
  const horizontalReflection: RoomPosition[] = [];
  positions.forEach((spot) => {
    // The y-coord is spawn.y minus the y-offset of the spot and spawn
    const reflected = spawn.room.getPositionAt(
      spot.x,
      spawn.pos.y - (spot.y - spawn.pos.y)
    );
    if (reflected === null) {
      error(`Unable to get horizontal reflection of ${spot}`);
    } else {
      horizontalReflection.push(reflected);
    }
  });
  positions = positions.concat(horizontalReflection);

  // Reflect the first and second pod groups across the vertical to get the
  // third and fourth
  const verticalReflection: RoomPosition[] = [];
  positions.forEach((spot) => {
    // The x-coord is spawn.x minus the x-offset of the spot and spawn
    const reflected = spawn.room.getPositionAt(
      spawn.pos.x - (spot.x - spawn.pos.x),
      spot.y
    );
    if (reflected === null) {
      error(`Unable to get vertical reflection of ${spot}`);
    } else {
      verticalReflection.push(reflected);
    }
  });
  positions = positions.concat(verticalReflection);

  return positions;
}

export function getExtensionRoadSpots(room: Room): RoomPosition[] {
  const spawn = Game.getObjectById(room.memory.spawn) as
    | StructureSpawn
    | undefined;
  if (spawn == undefined) {
    error(`Couldn't find spawn for tower spots in room ${room.name}`);
    return [];
  }

  info(`Finding extension road spots for spawn ${spawn.name}`);
  let positions: RoomPosition[] = [];
  // Get the spots for the roads for the first pod group then reflect twice to
  // get the rest
  const offsets = [
    [2, 2],
    [3, 3],
    [4, 4],
    [2, 4],
    [1, 5],
    [4, 2],
    [5, 1],
  ];
  // Turn the offsets into positions and add them
  offsets.forEach((spot) => {
    const position = spawn.room.getPositionAt(
      spawn.pos.x + spot[0],
      spawn.pos.y + spot[1]
    );
    if (position !== null) {
      positions.push(position);
    }
  });

  // Reflect the first pod group across the horizontal to get the second
  const horizontalReflection: RoomPosition[] = [];
  positions.forEach((spot) => {
    // The y-coord is spawn.y minus the y-offset of the spot and spawn
    const reflected = spawn.room.getPositionAt(
      spot.x,
      spawn.pos.y - (spot.y - spawn.pos.y)
    );
    if (reflected === null) {
      error(`Unable to get horizontal reflection of ${spot}`);
    } else {
      horizontalReflection.push(reflected);
    }
  });
  positions = positions.concat(horizontalReflection);

  // Reflect the first and second pod groups across the vertical to get the
  // third and fourth
  const verticalReflection: RoomPosition[] = [];
  positions.forEach((spot) => {
    // The x-coord is spawn.x minus the x-offset of the spot and spawn
    const reflected = spawn.room.getPositionAt(
      spawn.pos.x - (spot.x - spawn.pos.x),
      spot.y
    );
    if (reflected === null) {
      error(`Unable to get vertical reflection of ${spot}`);
    } else {
      verticalReflection.push(reflected);
    }
  });
  positions = positions.concat(verticalReflection);

  return positions;
}

export function roadSpots(room: Room): RoomPosition[] {
  const positions: RoomPosition[] = [];
  const spawn = Game.getObjectById(room.memory.spawn) as
    | StructureSpawn
    | undefined;
  if (spawn == undefined) {
    error(`Couldn't find spawn for tower spots in room ${room.name}`);
    return [];
  }

  // Ring of roads around the spawn
  positions.push(...getSurroundingTiles(spawn.pos, 1));
  // Extension roads
  positions.push(...getExtensionRoadSpots(room));
  // The road at the intersection of the ends of the extension roads
  positions.push(
    ...offsetToPosition(spawn.pos, [
      [0, -6],
      [6, 0],
      [0, 6],
      [-6, 0],
    ])
  );
  // The above are 40 roads

  return positions;
}

export function minerContainers(room: Room): RoomPosition[] {
  const sources = room.find(FIND_SOURCES);
  const terrain = Game.map.getRoomTerrain(room.name);
  const containers: RoomPosition[] = [];
  sources.forEach((source) => {
    let count = 0;
    getSurroundingTiles(source.pos, 1).forEach((position) => {
      if (count < 1) {
        // If the terrain at the position is plain
        if (terrain.get(position.x, position.y) === 0) {
          containers.push(position);
          count++;
        }
      }
    });
    if (count === 0) {
      error(
        `Unable to find suitable container location for source at (${source.pos.x}, ` +
          `${source.pos.y})`
      );
    }
  });

  return containers;
}

function roadToSources(room: Room, planMatrix?: CostMatrix): RoomPosition[] {
  const spawn = Game.getObjectById(room.memory.spawn) as
    | StructureSpawn
    | undefined;
  if (spawn == undefined) {
    error(`Couldn't find spawn for tower spots in room ${room.name}`);
    return [];
  }

  const road: RoomPosition[] = [];
  const containers = minerContainers(room);
  containers.forEach((dest) => {
    road.push(...planPath(room, spawn.pos, dest, planMatrix));
  });
  return road;
}

function roadToController(room: Room, planMatrix?: CostMatrix): RoomPosition[] {
  const spawn = Game.getObjectById(room.memory.spawn) as
    | StructureSpawn
    | undefined;
  if (spawn == undefined) {
    error(`Couldn't find spawn for tower spots in room ${room.name}`);
    return [];
  }

  const road: RoomPosition[] = [];
  const controller = room.controller;
  if (controller == undefined) {
    error(`Couldn't find controller for room ${room.name}`);
    return [];
  }

  // Turn the path into RoomPositions and add it to the road
  return planPath(room, spawn.pos, controller.pos, planMatrix);
}

function pathToRoomPosition(room: Room, path: PathStep[]): RoomPosition[] {
  const spots = path.map((step) => room.getPositionAt(step.x, step.y));
  const positions = spots.filter(
    (position) => position != undefined
  ) as RoomPosition[];
  return positions;
}

function planPath(
  room: Room,
  start: RoomPosition,
  end: RoomPosition,
  matrix: CostMatrix | undefined
): RoomPosition[] {
  const path = start.findPathTo(end, {
    costCallback: (roomName, pathMatrix) => {
      // If this is the planning room, exchange the previous matrix with the
      // planning cost matrix.
      if (matrix != undefined && room.name === roomName) {
        return matrix;
      }
      // If this is some other room or the planning cost matrix is undefined,
      // continue with the previous matrix.
      return pathMatrix;
    },
  });

  // Turn the path into RoomPositions and add it to the road
  return pathToRoomPosition(room, path);
}

function roomPositionToPlanCoord(positions: RoomPosition[]): PlannerCoord[] {
  return positions.map((position) => {
    return { x: position.x, y: position.y };
  });
}

function planCoordToRoomPosition(
  room: Room,
  coords: PlannerCoord[]
): RoomPosition[] {
  const positions: RoomPosition[] = [];
  coords.forEach((coord) => {
    const position = room.getPositionAt(coord.x, coord.y);
    if (position != undefined) {
      positions.push(position);
    } else {
      warn(
        `Unable to convert coord (${coord.x}, ${coord.y}) to position in room ${room.name}`
      );
    }
  });
  return positions;
}

function batchSetMatrix(
  matrix: CostMatrix,
  positions: RoomPosition[],
  cost = 255
): CostMatrix {
  positions.forEach((position) => {
    matrix.set(position.x, position.y, cost);
  });
  return matrix;
}

function getPositionsInArea(
  topLeft: RoomPosition,
  bottomRight: RoomPosition
): RoomPosition[] {
  const top = topLeft.y;
  const left = topLeft.x;
  const bottom = bottomRight.y;
  const right = bottomRight.x;
  const room = Game.rooms[topLeft.roomName];
  const positions: RoomPosition[] = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const pos = room.getPositionAt(x, y);
      if (pos == undefined) {
        error(`Unable to find position for (${x}, ${y}) in room ${room.name}`);
        continue;
      }
      positions.push(pos);
    }
  }
  return positions;
}

function getContainerSpots(room: Room): RoomPosition[] {
  const containers: RoomPosition[] = [];
  containers.push(...minerContainers(room));
  // const controllerSetup = getControllerSetupSpots(room);
  // if (controllerSetup == undefined || controllerSetup[0] == undefined) {
  //   warn(`No controller container spot for room ${room.name}`);
  // } else {
  //   containers.push(controllerSetup[0]);
  // }
  return containers;
}

export function makePlan(room: Room): boolean {
  // 1. Spawn ring road
  // 2. Extensions and extension roads
  // 3. Planned spawn strucutres
  // 4. Roads to sources and controllers
  const spawn = Game.getObjectById(room.memory.spawn) as
    | StructureSpawn
    | undefined;
  if (spawn == undefined) {
    error(`Couldn't find spawn for tower spots in room ${room.name}`);
    return false;
  }

  const plan: PlannerPlan = {};
  let planMatrix = new PathFinder.CostMatrix();
  const spawnBounds = offsetToPosition(spawn.pos, [
    [-5, -5],
    [5, 5],
  ]);
  const towerBounds = offsetToPosition(spawn.pos, [
    [-7, -1],
    [-6, 1],
  ]);
  const spawnArea = getPositionsInArea(spawnBounds[0], spawnBounds[1]).concat(
    getPositionsInArea(towerBounds[0], towerBounds[1])
  );
  // Block off the spawn area
  planMatrix = batchSetMatrix(planMatrix, spawnArea, 255);

  // - - - Structures - - -
  const wallsAndRamparts: [
    RoomPosition[],
    RoomPosition[]
  ] = getExitWallsAndRamparts(room);
  const extensions: RoomPosition[] = getExtensionSpots(room);
  const containers: RoomPosition[] = getContainerSpots(room);
  const storage: RoomPosition[] = getStorageSpots(room);
  const links: RoomPosition[] = getLinkSpots(room);
  const towers: RoomPosition[] = getTowerSpots(room);

  // - - - Roads - - -
  let roads: RoomPosition[] = roadSpots(room);
  // Allow roads inside the spawn area to be pathed upon
  planMatrix = batchSetMatrix(planMatrix, roads, 0);
  // Roads to the miner containers by sources
  minerContainers(room).forEach((dest) => {
    roads.push(...planPath(room, spawn.pos, dest, planMatrix));
  });
  // Road to the controller
  roads.push(...roadToController(room, planMatrix));
  // Remove duplicates from the roads
  roads = roomPositionArrayRemoveDuplicates(roads);

  // - - - Finish up - - -
  // Build the plan
  plan[STRUCTURE_WALL] = { pos: roomPositionToPlanCoord(wallsAndRamparts[0]) };
  plan[STRUCTURE_RAMPART] = {
    pos: roomPositionToPlanCoord(wallsAndRamparts[1]),
  };
  plan[STRUCTURE_ROAD] = { pos: roomPositionToPlanCoord(roads) };
  plan[STRUCTURE_EXTENSION] = { pos: roomPositionToPlanCoord(extensions) };
  plan[STRUCTURE_CONTAINER] = { pos: roomPositionToPlanCoord(containers) };
  plan[STRUCTURE_STORAGE] = { pos: roomPositionToPlanCoord(storage) };
  plan[STRUCTURE_LINK] = { pos: roomPositionToPlanCoord(links) };
  plan[STRUCTURE_TOWER] = { pos: roomPositionToPlanCoord(towers) };
  // Save the plan and planner CostMatrix to memory
  const plannerMemory: PlannerMemory = {
    plan: plan,
    costMatrix: planMatrix.serialize(),
  };
  room.memory.planner = plannerMemory;

  // Planner success
  return true;
}

function buildStructurePlan(
  room: Room,
  structureType: BuildableStructureConstant,
  plan: PlannerStructurePlan
): boolean {
  const positions = planCoordToRoomPosition(room, plan.pos);
  positions.forEach((pos) => buildStructure(pos, structureType));
  return true;
}

/**
 * Get part of a StructurePlan from start to end indices both inclusive.
 *
 * @param plan The plan
 * @param start The first index to be included
 * @param end The last index to be included
 * @returns A plan containing indices start through end inclusive or an empty plan.
 */
function getPartOfPlan(
  plan: PlannerStructurePlan,
  start: number,
  end: number
): PlannerStructurePlan {
  const slice = plan.pos.slice(start, end + 1);
  if (slice.length != end - start + 1) {
    warn(
      `Plan has length ${plan.pos.length} but requested slice starts at ${start} and ends at ${end}`
    );
  }
  return { pos: slice };
}

export function executePlan(room: Room, levelOverride = -1): boolean {
  info(`Executing plan for room ${room.name}`);
  if (room.memory.level == undefined) {
    error(`Room ${room.name} has no level`);
    return false;
  }
  if (room.memory.planner == undefined) {
    error(`Room ${room.name} has no plan`);
    return false;
  }
  // The level to execute the plan at
  let level = room.memory.level;
  if (levelOverride !== -1) {
    level = levelOverride;
    info(`Executing plan for room ${room.name} with level override ${level}`);
  }

  switch (level) {
    case 0:
    case 1: {
      // Level 0/1: Initial plan
      // - Place roads
      // - Place miner containers
      const roads = room.memory.planner.plan[STRUCTURE_ROAD];
      if (roads != undefined) buildStructurePlan(room, STRUCTURE_ROAD, roads);
      const containers = room.memory.planner.plan[STRUCTURE_CONTAINER];
      if (containers != undefined) {
        // !! TODO: this *will not* work if there are less than two sources !!
        // The miner containrs should be the first two planned contaiers, so
        // get indices 0 through 1 both-inclusive.
        const minerContainers = getPartOfPlan(containers, 0, 1);
        buildStructurePlan(room, STRUCTURE_CONTAINER, minerContainers);
      } else {
        warn(`Room ${room.name}'s plan is missing containers`);
      }
      return true;
    }
    case 5: {
      const links = room.memory.planner.plan[STRUCTURE_LINK];
      if (links != undefined) {
        // At RCL 5, only two links can be built.
        buildStructurePlan(room, STRUCTURE_LINK, getPartOfPlan(links, 0, 1));
      } else {
        warn(`Room ${room.name}'s plan is missing links`);
      }
      const towers = room.memory.planner.plan[STRUCTURE_TOWER];
      if (towers != undefined) {
        // At RCL 5, only one additional (two total) towers can be built
        buildStructurePlan(room, STRUCTURE_TOWER, getPartOfPlan(towers, 1, 1));
      } else {
        warn(`Room ${room.name}'s plan is missing towers`);
      }
      // const containers = room.memory.planner.plan[STRUCTURE_CONTAINER];
      // if (containers != undefined) {
      //   // !! TODO: this *will not* work if there are less than two sources !!
      //   // The link container should be the third container if there are two
      //   // sources.
      //   const controllerContainer = getPartOfPlan(containers, 2, 2);
      //   buildStructurePlan(room, STRUCTURE_CONTAINER, controllerContainer);
      // } else {
      //   warn(`Room ${room.name}'s plan is missing containers`);
      // }
      return true;
    }
    default:
      return false;
  }
}
