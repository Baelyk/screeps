import { ErrorMapper } from "utils/ErrorMapper";
import { watcher } from "utils/watch-client";
import { doRole, handleDead } from "creeps";
import { init } from "initialize";
import { spawnManager, getMaxExtensions } from "spawns";
import * as logger from "utils/logger";
import { buildStorage, resetRepairQueue, updateWallRepair } from "construct";
import { census } from "population";
import { buildTower, towerManager } from "towers";
import { getTowersInRoom } from "rooms";
import { debugEnergyHarvested, debugLoop } from "utils/debug";
import { linkManager } from "links";
import { GetByIdError, wrapper } from "utils/errors";

console.log("- - - - RESTARTING - - - -");

export const loop = ErrorMapper.wrapLoop(() => {
  logger.tick();

  if (Memory.uninitialized) {
    init();
  }

  // Debug
  debugLoop();

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      handleDead(name);
      delete Memory.creeps[name];
    }
  }

  // Process creep behavior
  for (const name in Game.creeps) {
    wrapper(
      () => doRole(Game.creeps[name]),
      `Error processing creep ${name} behavior`,
    );
  }

  // Process spawn behavior
  for (const name in Game.spawns) {
    spawnManager(Game.spawns[name]);
  }

  // Process room behavior
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (room.memory.level >= 3) {
      // Process tower behavior
      for (const towerIndex in room.memory.towers) {
        const tower = Game.getObjectById(
          room.memory.towers[towerIndex],
        ) as StructureTower;
        if (tower !== null) {
          towerManager(tower);
        } else {
          logger.warn(
            `Unable to get tower of id ${room.memory.towers[towerIndex]} in room ${roomName}`,
          );
        }
      }
    }
    if (room.memory.level >= 4) {
      // Process link behavior
      for (const linkId in room.memory.links.all) {
        const link = Game.getObjectById(linkId) as StructureLink | null;
        if (link != undefined) {
          linkManager(link);
        } else {
          throw new GetByIdError(
            linkId,
            STRUCTURE_LINK,
            `The link should be in room ${roomName}`,
          );
        }
      }
    }
  }

  // Infrequent actions:
  // Update repair queue and pop limits every 100 ticks
  if (Game.time % 100 === 0) {
    for (const name in Game.rooms) {
      const room = Game.rooms[name];
      const controller = room.controller;
      // This will not work with multiple rooms, despite the way I've made it
      resetRepairQueue(room);
      updateWallRepair(room);
      census(room);
      // If we have reached the miner tier, queue as many containers as possible for sources
      if (
        !Memory.status.builtAllSourceContainers &&
        Memory.populationLimit.miner
      ) {
        const maxExtensions = getMaxExtensions(
          (room.controller as StructureController).level,
        );
        const extensionsCount = room
          .find(FIND_MY_STRUCTURES)
          .filter((structure) => {
            return structure.structureType === STRUCTURE_EXTENSION;
          }).length;
        if (extensionsCount === maxExtensions) {
          logger.info(`Requesting containers around sources`, InfoType.build);
          // constructMinerContainers(room, -1);
          Memory.status.builtAllSourceContainers = true;
        } else {
          logger.info(
            `Waiting for max extensions to request containers around sources`,
            InfoType.build,
          );
        }
      }

      if (controller !== undefined) {
        // If the controller has leveled up, level up the room
        if (controller.level !== room.memory.level) {
          room.memory.level = controller.level;
          logger.info(`Updating room memory level to ${room.memory.level}`);
          if (room.memory.level === 3) {
            // Level 3: Build tower
            buildTower(room.name);
          }
          if (room.memory.level === 4) {
            // Level 4: Build storage
            buildStorage(room.name);
          }
        }

        // Level-based room checks
        if (room.memory.level >= 3) {
          if (
            room.memory.towers === undefined ||
            room.memory.towers.length === 0
          ) {
            // There should be a tower (or construction site)
            room.memory.towers = getTowersInRoom(room);
            if (room.memory.towers.length === 0) {
              logger.warn(
                `Room ${room.name} should have a tower but none were found`,
              );
            }
          }
        }
        if (room.memory.level >= 4) {
          // Set primary storage
          if (room.memory.storage === undefined) {
            const storage = room
              .find(FIND_MY_STRUCTURES)
              .find(
                (structure) => structure.structureType === STRUCTURE_STORAGE,
              ) as StructureStorage | undefined;
            if (storage !== undefined) {
              logger.info(
                `Setting storage ${storage.id} as room ${room.name} primary storage`,
              );
              room.memory.storage = storage.id;
            } else {
              logger.info(
                `No candidate for primary storage for room ${room.name}`,
              );
            }
          }
        }
      }
    }
  }

  // Debug testing for energy harvested
  debugEnergyHarvested();

  const cpuUsed = Game.cpu.getUsed();
  if (cpuUsed >= 5) {
    logger.warn(`Used ${cpuUsed} cpu`);
  }

  // screeps-multimeter watcher
  watcher();
});
