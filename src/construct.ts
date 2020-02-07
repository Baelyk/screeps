// Manages construction

/**
 * Initialize construction
 *
 * @param  spawn the initial spawn
 */
export function initConstruction (spawn: StructureSpawn) {
  // Initialize an empty construction queue
  Memory.constructionQueue = []

  // Construct a road from the spawn to the "first" source in the room. The "first" source because
  // that is the source that the initial harvester will harvest from.
  let source = spawn.room.find(FIND_SOURCES_ACTIVE)[0]
  let path = PathFinder.search(spawn.pos, source.pos).path
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
    throw new Error(`build attempted to build ${structureType} over invalid terrain at \
      (${response}) ${position}`)
  } else if (response === ERR_FULL) {
    throw new Error(`buildRoad exceded construction capacity`)
  } else if (response === ERR_RCL_NOT_ENOUGH) {
    throw new Error(`buildRoad attempted to build ${structureType} with insufficient RCL: \
      ${(Game.rooms[position.roomName].controller as StructureController).level}`)
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
  console.log(`Removed ${position} (${position.x}, ${position.y}) from queue`)
  // Each construction sites should have it's own entry in the queue even if it has the same
  // position as another site. So for example, if there were two sites at point A, there would be
  // two entries in the queue for point A, so removing one instance will be fine.
  //
  // HOWEVER, if the second instance of point A in the queue is accessed before the first site is
  // finished, there will be an issue
  return sites[0]
}
