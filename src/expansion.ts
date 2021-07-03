import { VisibleRoom } from "roomMemory";
import { info } from "utils/logger";
import { wrapper } from "utils/errors";

// Add ExpansionMemory to the global Memory interface
declare global {
  interface Memory {
    expansion: ExpansionMemory;
  }
}

interface ExpansionMemory {
  /** Array of room names of currently in progress expansions */
  inProgress?: string[];
}

function getExpansionTarget(): string | undefined {
  // TODO: Not hardcoded
  return "E14N43";
}

export function expansionManager(): void {
  const ownedRooms = VisibleRoom.controlledRooms();
  const inProgressExpansions: string[] = Memory.expansion.inProgress || [];
  const controlCount = _.union(ownedRooms, inProgressExpansions).length;
  if (
    (Memory.expansion.inProgress || []).length === 0 &&
    Game.gcl.level > controlCount
  ) {
    info(`Expansion possible`);
    expand();
  }

  const expansions = Memory.expansion.inProgress || [];
  _.forEach(expansions, (expansion) => {
    wrapper(() => {
      expansionBehavior(expansion);
    }, `Error processing expansion behavior for ${expansion}`);
  });
}

function expansionBehavior(expansionName: string): void {
  const caretaker = new VisibleRoom(findCaretakers(expansionName)[0]);

  // Get vision in the room
  if (!VisibleRoom.isVisible(expansionName)) {
    // Check if a vision provider is on the way or in the spawn queue
    const caretakerSpawnQueue = caretaker.getSpawnQueue();
    if (
      _.find(caretakerSpawnQueue, {
        role: CreepRole.scout,
        overrides: { task: CreepTask.claim, room: expansionName },
      }) == undefined &&
      _.find(Memory.creeps, {
        role: CreepRole.scout,
        task: CreepTask.claim,
        room: expansionName,
      }) == undefined
    ) {
      info(
        `Spawning vision provider for expansion ${expansionName} from room ${caretaker.name}`,
      );
      caretaker.addToSpawnQueue({
        role: CreepRole.scout,
        overrides: {
          task: CreepTask.claim,
          room: expansionName,
          noRenew: true,
        },
      });
    }
    return;
  }

  const expansion = new VisibleRoom(expansionName);

  // Wait until there are no present hostiles
  const hostiles = expansion.getHostiles();
  if (hostiles.length > 0) {
    // Check if a guard is on the way or in the spawn queue
    const caretakerSpawnQueue = caretaker.getSpawnQueue();
    if (
      _.find(caretakerSpawnQueue, {
        role: CreepRole.guard,
        overrides: { room: expansionName },
      }) == undefined &&
      _.find(Memory.creeps, {
        role: CreepRole.guard,
        room: expansionName,
      }) == undefined
    ) {
      info(
        `Spawning guard for expansion ${expansionName} from room ${caretaker.name}`,
      );
      caretaker.addToSpawnQueue({
        role: CreepRole.guard,
        overrides: { room: expansionName },
      });
    }
    return;
  }

  // Claim the room
  if (!expansion.ownedBy()) {
    // Check if a claimer is on the way or in the spawn queue
    const caretakerSpawnQueue = caretaker.getSpawnQueue();
    if (
      _.find(caretakerSpawnQueue, {
        role: CreepRole.claimer,
        overrides: { task: CreepTask.claim, room: expansionName },
      }) == undefined &&
      _.find(Memory.creeps, {
        role: CreepRole.claimer,
        task: CreepTask.claim,
        room: expansionName,
      }) == undefined
    ) {
      info(
        `Spawning claimer for expansion ${expansionName} from room ${caretaker.name}`,
      );
      caretaker.addToSpawnQueue({
        role: CreepRole.claimer,
        overrides: {
          task: CreepTask.claim,
          room: expansionName,
          noRenew: true,
        },
      });
    }
    return;
  }

  // Let's get building
  if (expansion.roomLevel() === 0) {
    expansion.levelChangeCheck();
    expansion.executePlan();
  }

  // Add expansion's construction queue to it's caretakers, but only empty the
  // expansion's queue if it's below RCL 4
  const caretakerQueue = caretaker.getConstructionQueue();
  caretaker.concatToConstructionQueue(
    _.filter(
      expansion.getConstructionQueue(),
      (item) => !_.includes(caretakerQueue, item),
    ),
  );
  if (expansion.roomLevel() < 4) {
    expansion.emptyConstructionQueue();
  }

  // Once an expansion has a spawn, it is now a primary room
  if (
    _.find(expansion.getRoom().find(FIND_MY_STRUCTURES), {
      structureType: STRUCTURE_SPAWN,
    }) != undefined
  ) {
    if (expansion.roomType !== RoomType.primary) {
      expansion.setRoomType(RoomType.primary);
      expansion.updateMemory();
    }
  } else if (expansion.roomType !== RoomType.expansion) {
    // Change type to expansion and update memory (also replans)
    expansion.setRoomType(RoomType.expansion);
    expansion.updateMemory();
  }

  // Once an expansion has a storage, it can be freed
  // if (expansion.getRoom().storage != undefined) {
  //   info(`Room ${expansionName} has a storage and is no longer an in progress expansion`);
  //   _.remove(Memory.expansion.inProgress, expansionName);
  // }

  info(`Expansion ${expansionName} should be all set`);
}

function expand(): void {
  const expansionTarget = getExpansionTarget();
  if (expansionTarget == undefined) {
    info(`Unable to find expansion target`);
    return;
  }
  info(`Targetting ${expansionTarget} for expansion`);

  if (Memory.expansion.inProgress == undefined) {
    Memory.expansion.inProgress = [];
  }

  Memory.expansion.inProgress.push(expansionTarget);
}

function findCaretakers(expansion: string): string[] {
  // TODO: search for nearby built rooms that could help
  return ["E15N41"];
}
