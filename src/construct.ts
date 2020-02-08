import { error, info, warn } from "utils/logger";

// Manages construction

// ISSUE: When a creep dies before it can completely construct something, the site is lost from the
// queue

/**
 * Initialize construction
 *
 * @param  spawn the initial spawn
 */
export function initConstruction (spawn: StructureSpawn) {
  // Initialize an empty construction queue
  Memory.constructionQueue = []

  // Construct containers near the sources for miners
  constructMinerContainers(spawn.room)

  // Construct a road from the spawn to the "first" source in the room. The "first" source because
  // that is the source that the initial harvester will harvest from.
  let source = spawn.room.find(FIND_SOURCES_ACTIVE)[0]
  let path = PathFinder.search(spawn.pos, {pos: source.pos, range: 1}).path
  console.log(`Source road from ${spawn.pos} to ${source.pos}: ${JSON.stringify(path)}`)
  buildRoad(path)
}

/**
 * Create road construction sites along a path
 *
 * @param  path an array of `RoomPosition`s
 */
function buildRoad (path: RoomPosition[]) {
  path.forEach(position => {
    build(position, STRUCTURE_ROAD)
  })
}

/**
 * Build a construction site at a position
 *
 * @param  position the room position at which to create the construction site
 * @param  structureType the type of structure to create a construction site for
 */
function build(position: RoomPosition, structureType: BuildableStructureConstant) {
  // Attempt to create the construction site
  let response = position.createConstructionSite(structureType)

  // Handle the response
  if (response === ERR_INVALID_TARGET || response === ERR_INVALID_ARGS ) {
    let structures = position.lookFor(LOOK_STRUCTURES).filter(structure => {
      return structure.structureType === structureType
    })
    let sites = position.lookFor(LOOK_CONSTRUCTION_SITES).filter(site => {
      return site.structureType === structureType
    })
    if (structures.length > 0 || sites.length > 0) {
      console.log(`{o-fg}build attempted to build ${structureType} over site/structure of same ` +
        `time{/o-fg}`)
    } else {
      throw new Error(`build attempted to build ${structureType} over invalid terrain at ` +
        `(${response}) ${position}`)
    }
  } else if (response === ERR_FULL) {
    throw new Error(`buildRoad exceded construction capacity`)
  } else if (response === ERR_RCL_NOT_ENOUGH) {
    throw new Error(`buildRoad attempted to build ${structureType} with insufficient RCL: ` +
      `${(Game.rooms[position.roomName].controller as StructureController).level}`)
  } else if (response === OK) {
    // Construction site successfullly created
    addToQueue(position)
  }
}

/**
 * Add construction sites at a position to the construction queue
 *
 * @param  position the position at which there are construction sites to add to the construction
 * queue
 */
function addToQueue (position: RoomPosition) {
  Memory.constructionQueue.push(position)
}

/**
 * Gets and removes the first construction site from the queue
 *
 * @return the id of the construction site if the queue is not empty
 */
export function fromQueue(): string | undefined {
  let queueItem = Memory.constructionQueue.shift()
  if (queueItem == undefined) return
  let position = Game.rooms[queueItem.roomName].getPositionAt(queueItem.x, queueItem.y)
  if (position == undefined) return
  let sites = position.lookFor(LOOK_CONSTRUCTION_SITES).map(site => {
      return site.id
    })
  info(`Removed ${position} from queue`)
  // Each construction sites should have it's own entry in the queue even if it has the same
  // position as another site. So for example, if there were two sites at point A, there would be
  // two entries in the queue for point A, so removing one instance will be fine.
  //
  // HOWEVER, if the second instance of point A in the queue is accessed before the first site is
  // finished, there will be an issue
  return sites[0]
}

/**
 * Gets the length of the construction queue
 *
 * @return the length of the construction queue
 */
export function queueLength(): number {
  return Memory.constructionQueue.length
}

export function constructMinerContainers (room: Room) {
  let sources = room.find(FIND_SOURCES)
  let terrain = Game.map.getRoomTerrain(room.name)
  sources.forEach(source => {
    let foundViable = false
    getSurroundingTiles(source.pos, 2).forEach(position => {
      if (!foundViable) {
        console.log(`${position}: terrain: ${terrain.get(position.x, position.y)}`)
        // If the terrain at the position is plain
        if (terrain.get(position.x, position.y) === 0) {
          let viable = surroundingTilesAreEmpty(position)

          if (viable) {
            build(position, STRUCTURE_CONTAINER)
            foundViable = true
          }
        }
      }
    })
    if (!foundViable) {
      error(`Unable to find suitable container location for source at (${source.pos.x}, ` +
        `${source.pos.y})`)
    }
  })
}

/**
 * Get a ring of the surrounding coords of radius
 *
 * @param  x the x coord of the center
 * @param  y the y coord of the center
 * @param  radius=0 the radius of the ring, where radius 0 is just the point
 *
 * @return an array of coordinate pairs forming the ring
 */
function getSurroundingCoords(x: number, y: number, radius = 1): {x: number, y: number}[] {
  if (radius === 0) return [{x, y}]

  let maxX = x + radius
  let maxY = y + radius
  let minX = x - radius
  let minY = y - radius
  console.log(`${x},${y} x:${minX}-${maxX} y:${minY}-${maxY}`)
  let coords = []

  for (let xCoord = minX; xCoord <= maxX; xCoord++) {
    coords.push({
      x: xCoord, y: maxY
    })
    coords.push({
      x: xCoord, y: minY
    })
  }

  // Don't include the coordinates at the corners, because they were included in the first for loop
  for (let yCoord = minY + 1; yCoord < maxY; yCoord++) {
    coords.push({
      x: maxX, y: yCoord
    })
    coords.push({
      x: minX, y: yCoord
    })
  }

  return coords
}

function getSurroundingTiles(position: RoomPosition, radius = 0): RoomPosition[] {
  let coords = getSurroundingCoords(position.x, position.y, radius)
  return coords.map(coord => {
    return Game.rooms[position.roomName].getPositionAt(coord.x, coord.y) as RoomPosition
  })
}

export function unassignConstruction (name: string) {
  let memory = Memory.creeps[name]
  if (memory.assignedConstruction) {
    let site = Game.getObjectById(memory.assignedConstruction) as ConstructionSite
    addToQueue(site.pos)
    delete memory.assignedConstruction
  } else {
    warn(`Attempted to delete undefined assigned construction for creep ${name}`)
  }
}

function getStructuresNeedingRepair (room: Room): string[] {
  return room.find(FIND_STRUCTURES)
  .filter(structure => {
    switch (structure.structureType) {
      case STRUCTURE_ROAD:
      case STRUCTURE_CONTAINER:
        return true
      default: return false
    }
  })
  .map(structure => {
    return structure.id
  })
}

function sortRepairQueue() {
  Memory.repairQueue = Memory.repairQueue.sort((a, b) => {
    let structureA = Game.getObjectById(a) as Structure
    let structureB = Game.getObjectById(b) as Structure
    if (structureA.hits < structureB.hits) return -1
    if (structureA.hits < structureB.hits) return -1
    return 0
  })
}

export function resetRepairQueue (room: Room) {
  info(`Resetting repair queue`)
  let structures = getStructuresNeedingRepair(room)
  Memory.repairQueue = structures
  sortRepairQueue()
}

export function fromRepairQueue(): string | undefined {
  let repair = Game.getObjectById(Memory.repairQueue.shift()) as Structure
  while (repair.hits === repair.hitsMax) {
    repair = Game.getObjectById(Memory.repairQueue.shift()) as Structure
  }
  return repair.id
}

function surroundingTilesAreEmpty(position: RoomPosition, exceptions?: StructureConstant[]): boolean {
  let terrain = Game.map.getRoomTerrain(position.roomName)
  let empty = true

  // Exceptions should not be undefined and should include roads
  if (exceptions == undefined) {
    exceptions = [STRUCTURE_ROAD]
  }
  if (exceptions.indexOf(STRUCTURE_ROAD) === -1) {
    exceptions.push(STRUCTURE_ROAD)
  }

  getSurroundingTiles(position, 1).forEach(positionAround => {
    console.log(`\t${positionAround}: terrain: ${terrain.get(positionAround.x, positionAround.y)}`)
    // If the terrain at the position isn't plain,
    if (terrain.get(positionAround.x, positionAround.y) !== 0) {
      // This terrain isn't viable
      empty = false
    }
    positionAround.lookFor(LOOK_STRUCTURES).forEach(structure => {
      if ((exceptions as StructureConstant[]).indexOf(structure.structureType) === -1) {
        empty = false
      }
    })
  })

  return empty
}
