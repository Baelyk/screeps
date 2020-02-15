import { getSurroundingTiles, queueLength, repairQueueLength } from "construct";
import { info } from "utils/logger";

/**
 * Reasses population limits
 *
 * @param  room the room
 */
export function census(room: Room) {
  info(`Updating population limits`, InfoType.spawn)
  // Recalculate miners
  let miners = 0
  room.find(FIND_SOURCES).forEach(source => {
    getSurroundingTiles(source.pos, 2).forEach(position => {
      // One miner per container around a source
      // TODO: change this to one miner per source-accessible tile
      miners += position.lookFor(LOOK_STRUCTURES).filter(structure => {
        return structure.structureType === STRUCTURE_CONTAINER
      }).length
    })
  })

  // If we have no miners, we need harvesters
  let harvesters = 0
  let upgraders = 0
  if (miners === 0) {
    harvesters = 1
  } else {
    // If we have miners, we want upgraders
    upgraders = miners * 2 - 1
  }

  // One builder per two construction queue items, or per ten repair queue items, with a minimum of
  // one builder
  let builders = Math.max(Math.floor(queueLength() / 2), Math.floor(repairQueueLength() / 10)) || 1

  Memory.populationLimit.miner = miners
  Memory.populationLimit.harvester = harvesters
  Memory.populationLimit.upgrader = upgraders
  Memory.populationLimit.builder = builders
}
