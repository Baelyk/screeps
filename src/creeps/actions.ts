import { info, warn, errorConstant } from "utils/logger";
import { ScriptError } from "utils/errors";
import { VisibleRoom } from "roomMemory";
import { Position } from "classes/position";

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
  avoidHostiles: boolean;
  costCallback: (roomName: string, costMatrix: CostMatrix) => CostMatrix | void;
  flee: boolean;
  reusePath: number;
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
  target: RoomPosition,
  providedOptions?: Partial<MoveActionOptions>,
): ScreepsReturnCode {
  const startCpu = Game.cpu.getUsed();
  const MOVE_ACTION_DEFAULTS: MoveActionOptions = {
    range: 0,
    avoidHostiles: true,
    costCallback: () => {
      return;
    },
    flee: false,
    reusePath: 5,
  };
  const options: MoveActionOptions = _.assign(
    MOVE_ACTION_DEFAULTS,
    providedOptions,
  );

  if (
    providedOptions == undefined ||
    providedOptions.costCallback == undefined
  ) {
    options.costCallback = costCallback;
  }
  if (providedOptions == undefined || providedOptions.reusePath == undefined) {
    if (creep.room.name !== target.roomName) {
      options.reusePath = 50;
    }
  }

  function costCallback(
    roomName: string,
    costMatrix: CostMatrix,
  ): CostMatrix | void {
    let changed = false;
    // Block off tiles within range 3 of hostile creeps
    if (options.avoidHostiles) {
      const room = Game.rooms[roomName];
      if (room != undefined) {
        changed = true;
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        _.forEach(hostiles, (hostile) => {
          // Only consider hostiles with attack parts
          if (
            hostile.getActiveBodyparts(ATTACK) > 0 ||
            hostile.getActiveBodyparts(RANGED_ATTACK) > 0
          ) {
            const surrounding = Position.getSurrounding(hostile.pos, 3);
            _.forEach(surrounding, (pos) => costMatrix.set(pos.x, pos.y, 255));
          }
        });
      }
    }

    if (changed) {
      return costMatrix;
    }
  }

  if (options.flee && options.range <= 1) {
    warn(`Creep ${creep.name} fleeing without range, canceling flee`);
  }

  let response: ScreepsReturnCode;
  if (options.flee) {
    const path = PathFinder.search(
      creep.pos,
      { pos: target, range: options.range },
      { flee: options.flee },
    ).path;
    response = creep.moveByPath(path);
  } else {
    response = creep.moveTo(target, options);
  }

  if (response !== OK && response !== ERR_TIRED && warn) {
    actionWarn(creep, "move", response);
  }

  const used = Math.round((Game.cpu.getUsed() - startCpu) * 100) / 100;
  if (used >= 0.3) {
    info(
      `Action ${_.padLeft("move", 11)} used ${_.padRight(
        String(used),
        5,
      )} cpu: ${creep.pos} to ${target} ${response === OK ? "+intent" : "-no"}`,
    );
  }
  return response;
}

export function harvest(
  creep: Creep,
  target: Source | Mineral | Deposit,
  warn = true,
): ScreepsReturnCode {
  const response = creep.harvest(target);
  if (response === ERR_NOT_IN_RANGE) {
    return move(creep, target.pos, { range: 1 });
  } else if (
    response !== OK &&
    response !== ERR_NOT_ENOUGH_RESOURCES &&
    response !== ERR_TIRED &&
    warn
  ) {
    actionWarn(creep, "harvest", response);
  }
  return response;
}

export function getResource(
  creep: Creep,
  target: AnyStoreStructure,
  resource: ResourceConstant,
  amount: number,
  warn = true,
): ScreepsReturnCode {
  const response = creep.withdraw(target, resource, amount);
  if (response === ERR_NOT_IN_RANGE) {
    return move(creep, target.pos, { range: 1 });
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
    return move(creep, target.pos, { range: 1 });
  } else if (response !== OK && warn) {
    actionWarn(creep, "getFromTombstone", response);
  }
  return response;
}

export function putResource(
  creep: Creep,
  target: AnyStoreStructure,
  resource: ResourceConstant,
  amount: number,
  warn = true,
): ScreepsReturnCode {
  const response = creep.transfer(target, resource, amount);
  if (response === ERR_NOT_IN_RANGE) {
    return move(creep, target.pos, { range: 1 });
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
    return move(creep, target.pos, { range: 3 });
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
    return move(creep, target.pos, { range: 3 });
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
    return move(creep, target.pos, { range: 3 });
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
    return move(creep, target.pos, { range: 1 });
  } else if (response !== OK && warn) {
    actionWarn(creep, "pickup", response);
  }
  return response;
}

export function getEnergy(creep: Creep): ScreepsReturnCode {
  const startCpu = Game.cpu.getUsed();
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
      info(`Stored, used ${Game.cpu.getUsed() - startCpu}`);
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
      info(`Container, used ${Game.cpu.getUsed() - startCpu}`);
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
    info(`Harvesting, used ${Game.cpu.getUsed() - startCpu}`);
    return harvest(creep, nearestSource);
  }

  const used = Math.round((Game.cpu.getUsed() - startCpu) * 100) / 100;
  if (used >= 0.1) {
    info(
      `Action ${_.padLeft("getEnergy", 11)} used ${_.padRight(
        String(used),
        5,
      )} cpu`,
    );
  }

  return ERR_NOT_FOUND;
}

export function depositEnergy(creep: Creep): ScreepsReturnCode {
  const startCpu = Game.cpu.getUsed();
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

  info(`spawnOrExtension, used ${Game.cpu.getUsed() - startCpu}`);
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
  info(`tower, used ${Game.cpu.getUsed() - startCpu}`);
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
    info(`Creep ${creep.name} depositing into link`);
    return tendLink(creep, spawnLink, LINK_CAPACITY / 2, "put");
  } catch (error) {
    // No spawn link
  }

  const used = Math.round((Game.cpu.getUsed() - startCpu) * 100) / 100;
  if (used >= 0.1) {
    info(
      `Action ${_.padLeft("depEnergy", 11)} used ${_.padRight(
        String(used),
        5,
      )} cpu`,
    );
  }

  return ERR_NOT_FOUND;
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

export function moveToRoom(
  creep: Creep,
  roomName: string,
  options?: Partial<MoveActionOptions>,
): ScreepsReturnCode {
  const dummyPosition = new RoomPosition(24, 24, roomName);
  if (options == undefined) {
    options = {};
  }
  options.range = 22;
  return move(creep, dummyPosition, options);
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

export function tendLink(
  creep: Creep,
  target: StructureLink,
  energyTarget: number,
  action?: "get" | "put" | "decide",
  warn = true,
): ScreepsReturnCode {
  const startCpu = Game.cpu.getUsed();

  function usedCpu(msg: string): void {
    info(`Creep ${creep.name} used ${Game.cpu.getUsed() - startCpu} ${msg}`);
  }
  const linkEnergy = target.store[RESOURCE_ENERGY];
  const extraEnergy = linkEnergy - energyTarget;
  usedCpu("counting energy");

  if (extraEnergy === 0) {
    return ERR_FULL;
  }

  // `action` is true when trying to get energy, false when trying to put
  // energy, and undefined/"decide" for either based on `energyTarget` (> 0 is
  // get, < 0 is put).

  if (action == undefined || action == "decide") {
    action = extraEnergy > 0 ? "get" : "put";
  }
  switch (action) {
    case "get": {
      if (extraEnergy > 0) {
        const amount = Math.min(creep.store.getFreeCapacity(), extraEnergy);
        usedCpu("get");
        return getResource(creep, target, RESOURCE_ENERGY, amount, warn);
      } else {
        usedCpu("get err");
        return ERR_NOT_ENOUGH_RESOURCES;
      }
    }
    case "put": {
      if (extraEnergy < 0) {
        const amount = Math.min(creep.store[RESOURCE_ENERGY], -extraEnergy);
        usedCpu("put");
        return putResource(creep, target, RESOURCE_ENERGY, amount, warn);
      } else {
        usedCpu("put err");
        return ERR_FULL;
      }
    }
  }
}

export function storeEnergy(
  creep: Creep,
  backupRoomName?: string,
  shouldWarn = true,
): ScreepsReturnCode {
  // Store energy into:
  // 0. Current room's storage
  // 1. Back up room's storage

  let storage = creep.room.storage;
  if (storage == undefined && backupRoomName != undefined) {
    const backupRoom = Game.rooms[backupRoomName];
    if (backupRoom != undefined) {
      storage = backupRoom.storage;
    }
  }
  if (storage == undefined) {
    if (shouldWarn) {
      const room =
        backupRoomName != undefined
          ? `${creep.room.name} or ${backupRoomName}`
          : creep.room.name;
      warn(`Creep ${creep.name} unable to find storage in ${room}`);
    }
    return ERR_NOT_FOUND;
  }

  const amount = Math.min(
    creep.store[RESOURCE_ENERGY],
    storage.store.getFreeCapacity(),
  );
  return putResource(creep, storage, RESOURCE_ENERGY, amount, shouldWarn);
}

export function plunderTombstone(
  creep: Creep,
  target: Tombstone | undefined,
  store: AnyStoreStructure,
): ScreepsReturnCode {
  if (
    target != undefined &&
    creep.store.getFreeCapacity() > 0 &&
    target.store.getUsedCapacity() > 0
  ) {
    info(`Creep ${creep.name} plundering tombstone ${target.pos}`);
    // If the creep has space and the tombstone has resources
    if (!creep.pos.isNearTo(target.pos)) {
      return move(creep, target.pos);
    }

    const resource = _.find(
      _.keys(target.store),
      (resource) => target.store[resource as ResourceConstant] > 0,
    ) as ResourceConstant | undefined;
    if (resource == undefined) {
      throw new CreepActionError(
        creep,
        "plunderTombstone",
        "Tombstone has positive used capacity but no resource constant found",
      );
    }
    const amount = Math.min(
      creep.store.getFreeCapacity(),
      target.store[resource],
    );
    return getFromTombstone(creep, target, resource, amount);
  } else if (creep.store.getUsedCapacity() > 0) {
    // Creep is full or tombstone is empty, either way deposit
    info(`Creep ${creep.name} plundering tombstone (storing plunder)`);
    storeCarriedResources(creep, store);
  }

  return ERR_NOT_FOUND;
}

export function storeCarriedResources(
  creep: Creep,
  store: AnyStoreStructure,
): ScreepsReturnCode {
  if (!creep.pos.isNearTo(store.pos)) {
    return move(creep, store.pos);
  }
  const resource = _.find(
    _.keys(creep.store),
    (resource) => creep.store[resource as ResourceConstant] > 0,
  ) as ResourceConstant | undefined;
  if (resource == undefined) {
    throw new CreepActionError(
      creep,
      "storeCarriedResources",
      "Unable to find resource to store",
    );
  }
  const amount = Math.min(creep.store.getFreeCapacity(), store.store[resource]);
  return putResource(creep, store, resource, amount);
}

export function attack(
  creep: Creep,
  target: Creep | Structure,
  moveOptions: Partial<MoveActionOptions>,
): ScreepsReturnCode {
  if (moveOptions == undefined) {
    moveOptions = {};
  }
  if (moveOptions.avoidHostiles == undefined) {
    moveOptions.avoidHostiles = false;
  }
  console.log(JSON.stringify(moveOptions));
  const moveResponse = move(creep, target.pos, moveOptions);
  let attackResponse: ScreepsReturnCode = OK;
  if (moveOptions.range == undefined || moveOptions.range <= 1) {
    attackResponse = creep.attack(target);
  }
  const rangedResponse = creep.rangedAttack(target);
  info(
    `Creep ${creep.name} attacking ${target.pos}: move ${errorConstant(
      moveResponse,
    )}, melee ${errorConstant(attackResponse)}, ranged ${errorConstant(
      rangedResponse,
    )}`,
  );
  return attackResponse || rangedResponse || moveResponse;
}

export function heal(
  creep: Creep,
  target: Creep,
  healType?: "both" | "ranged" | "melee",
  warn = true,
): ScreepsReturnCode {
  if (healType == undefined) {
    healType = "both";
  }

  let response: ScreepsReturnCode = OK;

  if (healType != "ranged") {
    response = creep.heal(target);
  }
  if (healType != "melee") {
    response = creep.rangedHeal(target);
  }

  if (response !== OK && warn) {
    actionWarn(creep, "heal", response);
  }

  return response;
}
