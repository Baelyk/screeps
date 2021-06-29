import { info } from "utils/logger";
import { linkManager } from "links";
import { ScriptError, wrapper } from "utils/errors";
import { towerManager } from "towers";
import { census } from "population";
import { roomDebugLoop } from "utils/debug";
import { updateSpawnQueue } from "spawning";
import { roomVisualManager } from "roomVisuals";
import { RoomInfo, VisibleRoom } from "roomMemory";

export function initRoom(room: Room): void {
  info(`Initializing room ${room.name}`);
  VisibleRoom.new(room.name, RoomType.primary);
}

export function getRoomAvailableEnergy(room: Room): number | undefined {
  if (room.storage == undefined) {
    return undefined;
  }
  return room.storage.store.getUsedCapacity(RESOURCE_ENERGY);
}

export function roomManager(): void {
  for (const roomName in Game.rooms) {
    wrapper(
      () => roomBehavior(roomName),
      `Error processing behavior for room ${roomName}`,
    );
  }
}

function roomBehavior(roomName: string): void {
  const room = VisibleRoom.getOrNew(roomName);

  wrapper(() => roomDebugLoop(room), `Error debugging for room ${room.name}`);

  wrapper(() => scoutRoom(room), `Error scouting room ${room.name}`);

  // Only primary and remote rooms have further behavior
  if (room.roomType !== RoomType.primary && room.roomType !== RoomType.remote) {
    return;
  }

  wrapper(
    () => updateSpawnQueue(room),
    `Error managing spawn queue for room ${room.name}`,
  );

  if (room.roomLevel() >= 3) {
    // Process tower behavior
    wrapper(
      () => towerManager(room),
      `Error managing links for room ${room.name}`,
    );
  }

  if (room.roomLevel() >= 4) {
    // Process link behavior
    wrapper(
      () => linkManager(room),
      `Error managing links for room ${room.name}`,
    );
  }

  if (room.getRemotes().length > 0) {
    wrapper(
      () => remoteManager(room),
      `Error managing remotes for room ${room.name}`,
    );
  }

  // Scout rooms if primary room with no spawn queue
  if (room.roomType === RoomType.primary && room.getSpawnQueue().length === 0) {
    wrapper(
      () => spawnScoutCreep(room),
      `Error scouting for room ${room.name}`,
    );
  }

  wrapper(() => roomVisualManager(room), `Error managing room visuals`);

  // Infrequent actions:
  wrapper(
    () => infrequentRoomActions(room),
    `Error during infrequent room actions for room ${room.name}`,
  );
}

function infrequentRoomActions(room: VisibleRoom) {
  if (Game.time % 100 === 0) {
    if (
      room.roomType !== RoomType.primary &&
      room.roomType !== RoomType.remote
    ) {
      // Only primary and remote rooms need infrequent actions
      return;
    }

    // Update repair queue and pop limits every 100 ticks
    room.updateRepairQueue();
    room.updateWallRepairQueue();
    census(room);

    // If the controller has leveled up, level up the room
    if (room.levelChangeCheck()) {
      // TODO: WHILE DEBUGING PLS STOP EXECUTING PLAN ON E15N41
      if (room.name !== "E15N41") {
        room.executePlan();
      }
    }

    // Update special structure lists
    room.updateSpecialStructuresMemory();

    // Remote executePlan checker if no structures
    if (room.roomType === RoomType.remote) {
      const structures = room.getRoom().find(FIND_STRUCTURES);
      // Don't count controllers or roads
      _.remove(structures, (structure) => {
        return (
          structure.structureType === STRUCTURE_CONTROLLER ||
          structure.structureType === STRUCTURE_ROAD
        );
      });
      if (structures.length === 0) {
        room.executePlan();
      }
    }
  }
}

function remoteManager(owner: VisibleRoom): void {
  const remotes = owner.getRemotes();
  remotes.forEach((remote) => {
    wrapper(
      () => remoteBehavior(owner, remote),
      `Error managing remote ${remote} for room ${owner.name}`,
    );
  });
}

function remoteBehavior(owner: VisibleRoom, remoteName: string): void {
  const remoteMemory = new RoomInfo(remoteName);

  // Add the remote's construction queue to its owner's
  const constructionQueue = remoteMemory.getConstructionQueue();
  if (constructionQueue.length > 0) {
    owner.concatToConstructionQueue(constructionQueue);
    remoteMemory.emptyConstructionQueue();
  }

  // Add the remote's spawn queue to its owner's
  const spawnQueue = remoteMemory.getSpawnQueue();
  if (spawnQueue.length > 0) {
    owner.concatToSpawnQueue(spawnQueue);
    remoteMemory.emptySpawnQueue();
  }
}

function scoutRoom(room: VisibleRoom): void {
  let scoutTime = 0;
  try {
    const scoutingMemory = room.getScoutingMemory();
    scoutTime = scoutingMemory.time;
  } catch (error) {
    info(`Room ${room.name} never before scouted`);
  }
  if (Game.time - scoutTime > 100) {
    room.updateScoutingMemory();
    room.updateGeographyMemory();
  }
}

function spawnScoutCreep(room: VisibleRoom): void {
  // Only spawn a scout creep if there is none in the queue and there are none
  // alive
  const spawnQueue = room.getSpawnQueue();
  if (
    _.find(spawnQueue, { role: CreepRole.scout }) ||
    _.find(Memory.creeps, { role: CreepRole.scout, task: CreepTask.scout })
  ) {
    return;
  }

  const targetRoom = RoomInfo.findNearestUnscoutedRoom(room.name, 50, true);

  // Unable to find a room to scout
  if (targetRoom == undefined) {
    info(`Unable to find room to scout for ${room.name}`);
    return;
  }

  info(`Room ${room.name} spawning new scout for ${targetRoom}`);
  // Add a scout to the spawn queue
  room.addToSpawnQueue({
    role: CreepRole.scout,
    overrides: { task: CreepTask.scout, room: targetRoom, noRenew: true },
  });
}
