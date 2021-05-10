import { info } from "utils/logger";
import { linkManager } from "links";
import { wrapper } from "utils/errors";
import { towerManager } from "towers";
import { makePlan, executePlan } from "planner";
import { census } from "population";
import { updateWallRepair, resetRepairQueue } from "construct";
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

  wrapper(
    () => updateSpawnQueue(room),
    `Errpr managing spawn queue for room ${room.name}`,
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

    if (!room.hasPlan()) {
      makePlan(room);
    }

    // Update repair queue and pop limits every 100 ticks
    resetRepairQueue(room);
    updateWallRepair(room);
    census(room);

    // If the controller has leveled up, level up the room
    if (room.levelChangeCheck()) {
      room.executePlan();
    }

    // Update special structure lists
    room.updateSpecialStructuresMemory();

    // Remote executePlan checker if no structures
    if (room.roomType === RoomType.remote) {
      const structures = room.getRoom().find(FIND_STRUCTURES);
      if (structures.length === 0) {
        executePlan(room);
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
