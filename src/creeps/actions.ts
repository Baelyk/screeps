import { info, warn, errorConstant } from "utils/logger";
import { ScriptError } from "utils/errors";
import { VisibleRoom } from "roomMemory";

class CreepActionError extends ScriptError {
  constructor(creep: Creep, action: string, message: string) {
    let msg = `Error while performing action: ${Creep.name} ${action}`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

interface MoveActionOptions {
  range: number;
}

function actionWarn(
  creep: Creep,
  action: string,
  response: ScreepsReturnCode,
): void {
  warn(
    `Creep ${
      creep.name
    } tried to perform ${action} with response ${errorConstant(response)}`,
  );
}

export function move(
  creep: Creep,
  target: RoomPosition | { pos: RoomPosition },
  providedOptions?: Partial<MoveActionOptions>,
): ScreepsReturnCode {
  const MOVE_ACTION_DEFAULTS: MoveActionOptions = {
    range: 0,
  };
  const options: MoveActionOptions = _.assign(
    MOVE_ACTION_DEFAULTS,
    providedOptions,
  );

  return creep.moveTo(target, options);
}

export function harvest(
  creep: Creep,
  target: Source | Mineral | Deposit,
  warn = true,
): ScreepsReturnCode {
  const response = creep.harvest(target);
  if (response === ERR_NOT_IN_RANGE) {
    return move(creep, target, { range: 3 });
  } else if (response !== OK && warn) {
    actionWarn(creep, "harvest", response);
  }
  return response;
}

export function getResource(
  creep: Creep,
  target: Structure,
  resource: ResourceConstant,
  amount: number,
  warn = true,
): ScreepsReturnCode {
  // @ts-expect-error The next line is to detect whether the target has a store,
  // so let it.
  if (target.store == undefined) {
    throw new CreepActionError(
      creep,
      "getResource",
      `Target ${target.structureType} ${target.pos} lacks a store`,
    );
  }

  const response = creep.withdraw(target, resource, amount);
  if (response === ERR_NOT_IN_RANGE) {
    return move(creep, target, { range: 1 });
  } else if (response !== OK && warn) {
    actionWarn(creep, "getResource", response);
  }
  return response;
}

export function getFromTombstone(
  creep: Creep,
  target: Tombstone,
  resource: ResourceConstant,
  amount: number,
  warn = true,
): ScreepsReturnCode {
  const response = creep.withdraw(target, resource, amount);
  if (response === ERR_NOT_IN_RANGE) {
    return move(creep, target, { range: 1 });
  } else if (response !== OK && warn) {
    actionWarn(creep, "getResource", response);
  }
  return response;
}

export function putResource(
  creep: Creep,
  target: Structure,
  resource: ResourceConstant,
  amount: number,
  warn = true,
): ScreepsReturnCode {
  // @ts-expect-error The next line is to detect whether the target has a store,
  // so let it.
  if (target.store == undefined) {
    throw new CreepActionError(
      creep,
      "putResource",
      `Target ${target.structureType} ${target.pos} lacks a store`,
    );
  }

  const response = creep.transfer(target, resource, amount);
  if (response === ERR_NOT_IN_RANGE) {
    return move(creep, target, { range: 1 });
  } else if (response !== OK && warn) {
    actionWarn(creep, "putResource", response);
  }
  return response;
}

export function upgrade(
  creep: Creep,
  target: StructureController,
  warn = true,
): ScreepsReturnCode {
  const response = creep.upgradeController(target);
  if (response === ERR_NOT_IN_RANGE) {
    return move(creep, target, { range: 3 });
  } else if (response !== OK && warn) {
    actionWarn(creep, "upgrade", response);
  }
  return response;
}

export function build(
  creep: Creep,
  target: ConstructionSite,
  warn = true,
): ScreepsReturnCode {
  const response = creep.build(target);
  if (response === ERR_NOT_IN_RANGE) {
    return move(creep, target, { range: 3 });
  } else if (response !== OK && warn) {
    actionWarn(creep, "build", response);
  }
  return response;
}

export function repair(
  creep: Creep,
  target: Structure,
  warn = true,
): ScreepsReturnCode {
  const response = creep.repair(target);
  if (response === ERR_NOT_IN_RANGE) {
    return move(creep, target, { range: 3 });
  } else if (response !== OK && warn) {
    actionWarn(creep, "repair", response);
  }
  return response;
}

export function pickupResource(
  creep: Creep,
  target: Resource,
  warn = true,
): ScreepsReturnCode {
  const response = creep.pickup(target);
  if (response === ERR_NOT_IN_RANGE) {
    return move(creep, target, { range: 1 });
  } else if (response !== OK && warn) {
    actionWarn(creep, "pickup", response);
  }
  return response;
}

export function getEnergy(creep: Creep): ScreepsReturnCode {
  // Get energy from:
  // 0. Adjacent tombstones or piles
  // 1. Room storage
  // 2. Containers
  // 3. Nearest tombstone or pile
  // 4. Harvesting from sources
  const creepCapacity = creep.store.getFreeCapacity();

  const adjacentPiles = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
    filter: { resourceType: RESOURCE_ENERGY },
  }) as Resource<RESOURCE_ENERGY>[];
  if (adjacentPiles.length > 0) {
    return pickupResource(creep, adjacentPiles[0]);
  }

  const adjacentTombstones = creep.pos.findInRange(FIND_TOMBSTONES, 1, {
    filter: (tombstone) => {
      return tombstone.store[RESOURCE_ENERGY] > 0;
    },
  });
  if (adjacentTombstones.length > 0) {
    const tombstone = adjacentTombstones[0];
    const amount = Math.min(creepCapacity, tombstone.store[RESOURCE_ENERGY]);
    return getFromTombstone(creep, tombstone, RESOURCE_ENERGY, amount);
  }

  const storage = creep.room.storage;
  if (storage != undefined) {
    const storageEnergy = storage.store[RESOURCE_ENERGY];
    if (storageEnergy > 0) {
      const amount = Math.min(creepCapacity, storageEnergy);
      return getResource(creep, storage, RESOURCE_ENERGY, amount);
    }
  }

  const containers = creep.room.find(FIND_STRUCTURES, {
    filter: (structure) => {
      return (
        structure.structureType === STRUCTURE_CONTAINER &&
        structure.store[RESOURCE_ENERGY] > 0
      );
    },
  }) as StructureContainer[];
  if (containers.length > 0) {
    const container = creep.pos.findClosestByPath(containers);
    if (container != undefined) {
      const amount = Math.min(creepCapacity, container.store[RESOURCE_ENERGY]);
      return getResource(creep, container, RESOURCE_ENERGY, amount);
    }
  }

  const recoverResponse = recoverResource(creep, RESOURCE_ENERGY);
  if (recoverResponse !== ERR_NOT_FOUND) {
    return recoverResponse;
  }

  const nearestSource = creep.pos.findClosestByPath(FIND_SOURCES, {
    filter: (source) => {
      return source.energy > 0;
    },
  });
  if (nearestSource != undefined) {
    return harvest(creep, nearestSource);
  }

  throw new CreepActionError(
    creep,
    "getEnergy",
    "Unable to find suitable target to get energy",
  );
}

export function depositEnergy(creep: Creep): ScreepsReturnCode {
  // Deposit energy into:
  // 1. Nearest spawn/extension
  // 2. Tower under half capacity
  // 3. Spawn link under half capacity
  const creepEnergy = creep.store[RESOURCE_ENERGY];

  const spawnOrExtension = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
    filter: (structure) => {
      return (
        (structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_EXTENSION) &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      );
    },
  }) as StructureSpawn | StructureExtension | null;

  if (spawnOrExtension != undefined) {
    const amount = Math.min(
      creepEnergy,
      spawnOrExtension.store.getFreeCapacity(RESOURCE_ENERGY),
    );
    return putResource(creep, spawnOrExtension, RESOURCE_ENERGY, amount);
  }

  const tower = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
    filter: (structure) => {
      return (
        structure.structureType === STRUCTURE_TOWER &&
        structure.store[RESOURCE_ENERGY] < TOWER_CAPACITY / 2
      );
    },
  }) as StructureTower | null;
  if (tower != undefined) {
    const amount = Math.min(
      creepEnergy,
      tower.store.getFreeCapacity(RESOURCE_ENERGY),
    );
    return putResource(creep, tower, RESOURCE_ENERGY, amount);
  }

  const room = new VisibleRoom(creep.room.name);
  try {
    const spawnLink = room.getSpawnLink();
    const amount = Math.min(
      creepEnergy,
      LINK_CAPACITY / 2 - spawnLink.store[RESOURCE_ENERGY],
    );
    return putResource(creep, spawnLink, RESOURCE_ENERGY, amount);
  } catch (error) {
    // No spawn link
  }

  throw new CreepActionError(
    creep,
    "depositEnergy",
    "Unable to find suitable target to deposit energy",
  );
}

export function idle(creep: Creep): ScreepsReturnCode {
  info(`Creep ${creep.name} is idle`);
  const controller = creep.room.controller;
  if (controller == undefined) {
    warn(`Creep ${creep.name} has nothing to do`);
    return OK;
  } else {
    return upgrade(creep, controller);
  }
}

export function moveToRoom(creep: Creep, roomName: string): ScreepsReturnCode {
  const dummyPosition = new RoomPosition(24, 24, roomName);
  return move(creep, dummyPosition, { range: 22 });
}

export function recoverResource(
  creep: Creep,
  resource: ResourceConstant,
): ScreepsReturnCode {
  const nearestPile = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
    filter: { resourceType: resource },
  });
  if (nearestPile != undefined) {
    return pickupResource(creep, nearestPile);
  }

  const nearestTombstone = creep.pos.findClosestByPath(FIND_TOMBSTONES, {
    filter: (tombstone) => {
      return tombstone.store[resource] > 0;
    },
  });
  if (nearestTombstone != undefined) {
    const amount = Math.min(
      creep.store.getFreeCapacity(),
      nearestTombstone.store[resource],
    );
    return getFromTombstone(creep, nearestTombstone, resource, amount);
  }

  return ERR_NOT_FOUND;
}
