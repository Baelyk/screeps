import { info, warn, errorConstant } from "utils/logger";
import { ScriptError } from "utils/errors";
import { VisibleRoom } from "roomMemory";
import { Position } from "classes/position";
import { profile } from "utils/profiler";

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

@profile
export class CreepAction {
  static move(
    creep: Creep,
    target: RoomPosition,
    providedOptions?: Partial<MoveActionOptions>,
  ): ScreepsReturnCode {
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
    if (
      providedOptions == undefined ||
      providedOptions.reusePath == undefined
    ) {
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
              _.forEach(surrounding, (pos) =>
                costMatrix.set(pos.x, pos.y, 255),
              );
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

    return response;
  }

  static harvest(
    creep: Creep,
    target: Source | Mineral | Deposit,
    warn = true,
  ): ScreepsReturnCode {
    const response = creep.harvest(target);
    if (response === ERR_NOT_IN_RANGE) {
      return CreepAction.move(creep, target.pos, { range: 1 });
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

  static getResource(
    creep: Creep,
    target: AnyStoreStructure,
    resource: ResourceConstant,
    amount?: number,
    warn = true,
  ): ScreepsReturnCode {
    const response = creep.withdraw(target, resource, amount);
    if (response === ERR_NOT_IN_RANGE) {
      return CreepAction.move(creep, target.pos, { range: 1 });
    } else if (response !== OK && warn) {
      actionWarn(creep, "getResource", response);
    }
    return response;
  }

  static getFromTombstone(
    creep: Creep,
    target: Tombstone,
    resource: ResourceConstant,
    amount: number,
    warn = true,
  ): ScreepsReturnCode {
    const response = creep.withdraw(target, resource, amount);
    if (response === ERR_NOT_IN_RANGE) {
      return CreepAction.move(creep, target.pos, { range: 1 });
    } else if (response !== OK && warn) {
      actionWarn(creep, "getFromTombstone", response);
    }
    return response;
  }

  static putResource(
    creep: Creep,
    target: AnyStoreStructure,
    resource: ResourceConstant,
    amount?: number,
    warn = true,
  ): ScreepsReturnCode {
    const response = creep.transfer(target, resource, amount);
    if (response === ERR_NOT_IN_RANGE) {
      return CreepAction.move(creep, target.pos, { range: 1 });
    } else if (response !== OK && warn) {
      actionWarn(creep, "putResource", response);
    }
    return response;
  }

  static upgrade(
    creep: Creep,
    target: StructureController,
    warn = true,
  ): ScreepsReturnCode {
    const response = creep.upgradeController(target);
    if (response === ERR_NOT_IN_RANGE) {
      return CreepAction.move(creep, target.pos, { range: 3 });
    } else if (response !== OK && warn) {
      actionWarn(creep, "upgrade", response);
    }
    return response;
  }

  static build(
    creep: Creep,
    target: ConstructionSite,
    warn = true,
  ): ScreepsReturnCode {
    const response = creep.build(target);
    if (response === ERR_NOT_IN_RANGE) {
      return CreepAction.move(creep, target.pos, { range: 3 });
    } else if (response !== OK && warn) {
      actionWarn(creep, "build", response);
    }
    return response;
  }

  static repair(
    creep: Creep,
    target: Structure,
    warn = true,
  ): ScreepsReturnCode {
    const response = creep.repair(target);
    if (response === ERR_NOT_IN_RANGE) {
      return CreepAction.move(creep, target.pos, { range: 3 });
    } else if (response !== OK && warn) {
      actionWarn(creep, "repair", response);
    }
    return response;
  }

  static pickupResource(
    creep: Creep,
    target: Resource,
    warn = true,
  ): ScreepsReturnCode {
    const response = creep.pickup(target);
    if (response === ERR_NOT_IN_RANGE) {
      return CreepAction.move(creep, target.pos, { range: 1 });
    } else if (response !== OK && warn) {
      actionWarn(creep, "pickup", response);
    }
    return response;
  }

  static getEnergy(creep: Creep): ScreepsReturnCode {
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
      return CreepAction.pickupResource(creep, adjacentPiles[0]);
    }

    const adjacentTombstones = creep.pos.findInRange(FIND_TOMBSTONES, 1, {
      filter: (tombstone) => {
        return tombstone.store[RESOURCE_ENERGY] > 0;
      },
    });
    if (adjacentTombstones.length > 0) {
      const tombstone = adjacentTombstones[0];
      const amount = Math.min(creepCapacity, tombstone.store[RESOURCE_ENERGY]);
      return CreepAction.getFromTombstone(
        creep,
        tombstone,
        RESOURCE_ENERGY,
        amount,
      );
    }

    const storage = creep.room.storage;
    if (storage != undefined) {
      const storageEnergy = storage.store[RESOURCE_ENERGY];
      if (storageEnergy > 0) {
        const amount = Math.min(creepCapacity, storageEnergy);
        return CreepAction.getResource(creep, storage, RESOURCE_ENERGY, amount);
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
        const amount = Math.min(
          creepCapacity,
          container.store[RESOURCE_ENERGY],
        );
        return CreepAction.getResource(
          creep,
          container,
          RESOURCE_ENERGY,
          amount,
        );
      }
    }

    const recoverResponse = CreepAction.recoverResource(creep, RESOURCE_ENERGY);
    if (recoverResponse !== ERR_NOT_FOUND) {
      return recoverResponse;
    }

    const nearestSource = creep.pos.findClosestByPath(FIND_SOURCES, {
      filter: (source) => {
        return source.energy > 0;
      },
    });
    if (nearestSource != undefined) {
      return CreepAction.harvest(creep, nearestSource);
    }

    return ERR_NOT_FOUND;
  }

  static depositEnergy(creep: Creep): ScreepsReturnCode {
    // Deposit energy into:
    // 1. Nearest spawn/extension
    // 2. Tower under half capacity
    // 3. Spawn link under half capacity
    const creepEnergy = creep.store[RESOURCE_ENERGY];

    const room = new VisibleRoom(creep.room.name);

    const extension = room.getNextExtension();
    if (extension != undefined) {
      const amount = Math.min(
        creepEnergy,
        extension.store.getFreeCapacity(RESOURCE_ENERGY),
      );
      return CreepAction.putResource(creep, extension, RESOURCE_ENERGY, amount);
    }

    const spawn = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure) => {
        return (
          structure.structureType === STRUCTURE_SPAWN &&
          structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
      },
    }) as StructureSpawn | null;

    if (spawn != undefined) {
      const amount = Math.min(
        creepEnergy,
        spawn.store.getFreeCapacity(RESOURCE_ENERGY),
      );
      return CreepAction.putResource(creep, spawn, RESOURCE_ENERGY, amount);
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
      return CreepAction.putResource(creep, tower, RESOURCE_ENERGY, amount);
    }

    try {
      const spawnLink = room.getSpawnLink();
      info(`Creep ${creep.name} depositing into link`);
      return CreepAction.tendLink(creep, spawnLink, LINK_CAPACITY / 2, "put");
    } catch (error) {
      // No spawn link
    }

    return ERR_NOT_FOUND;
  }

  static idle(creep: Creep): ScreepsReturnCode {
    info(`Creep ${creep.name} is idle`);
    const controller = creep.room.controller;
    if (controller == undefined) {
      warn(`Creep ${creep.name} has nothing to do`);
      return OK;
    } else {
      return CreepAction.upgrade(creep, controller);
    }
  }

  static moveToRoom(
    creep: Creep,
    roomName: string,
    options?: Partial<MoveActionOptions>,
  ): ScreepsReturnCode {
    const dummyPosition = new RoomPosition(24, 24, roomName);
    if (options == undefined) {
      options = {};
    }
    options.range = 22;
    return CreepAction.move(creep, dummyPosition, options);
  }

  static recoverResource(
    creep: Creep,
    resource: ResourceConstant,
  ): ScreepsReturnCode {
    const nearestPile = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
      filter: { resourceType: resource },
    });
    if (nearestPile != undefined) {
      return CreepAction.pickupResource(creep, nearestPile);
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
      return CreepAction.getFromTombstone(
        creep,
        nearestTombstone,
        resource,
        amount,
      );
    }

    return ERR_NOT_FOUND;
  }

  static tendLink(
    creep: Creep,
    target: StructureLink,
    energyTarget: number,
    action?: "get" | "put" | "decide",
    warn = true,
  ): ScreepsReturnCode {
    const linkEnergy = target.store[RESOURCE_ENERGY];
    const extraEnergy = linkEnergy - energyTarget;

    if (extraEnergy === 0) {
      return ERR_NOT_ENOUGH_RESOURCES;
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
          if (amount === 0) {
            return ERR_FULL;
          }
          return CreepAction.getResource(
            creep,
            target,
            RESOURCE_ENERGY,
            amount,
            warn,
          );
        } else {
          return ERR_NOT_ENOUGH_RESOURCES;
        }
      }
      case "put": {
        if (extraEnergy < 0) {
          const amount = Math.min(creep.store[RESOURCE_ENERGY], -extraEnergy);
          return CreepAction.putResource(
            creep,
            target,
            RESOURCE_ENERGY,
            amount,
            warn,
          );
        } else {
          return ERR_NOT_ENOUGH_RESOURCES;
        }
      }
    }
  }

  static storeEnergy(
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
    return CreepAction.putResource(
      creep,
      storage,
      RESOURCE_ENERGY,
      amount,
      shouldWarn,
    );
  }

  static plunderTombstone(
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
        return CreepAction.move(creep, target.pos);
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
      return CreepAction.getFromTombstone(creep, target, resource, amount);
    } else if (creep.store.getUsedCapacity() > 0) {
      // Creep is full or tombstone is empty, either way deposit
      info(`Creep ${creep.name} plundering tombstone (storing plunder)`);
      return CreepAction.storeCarriedResources(creep, store);
    }

    return ERR_NOT_FOUND;
  }

  static storeCarriedResources(
    creep: Creep,
    store: AnyStoreStructure,
  ): ScreepsReturnCode {
    if (!creep.pos.isNearTo(store.pos)) {
      return CreepAction.move(creep, store.pos);
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
    const amount = Math.min(
      creep.store.getFreeCapacity(),
      store.store[resource],
    );
    return CreepAction.putResource(creep, store, resource, amount);
  }

  static attack(
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
    const moveResponse = CreepAction.move(creep, target.pos, moveOptions);
    let attackResponse: ScreepsReturnCode = OK;
    if (moveOptions.range == undefined || moveOptions.range <= 1) {
      attackResponse = creep.attack(target);
    }
    const rangedResponse = creep.rangedAttack(target);
    info(
      `Creep ${creep.name} attacking ${
        target.pos
      }: CreepAction.move ${errorConstant(moveResponse)}, melee ${errorConstant(
        attackResponse,
      )}, ranged ${errorConstant(rangedResponse)}`,
    );
    return attackResponse || rangedResponse || moveResponse;
  }

  static heal(
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

  static supplyTerminal(creep: Creep): ScreepsReturnCode {
    const storage = creep.room.storage;
    const terminal = creep.room.terminal;
    if (storage == undefined || terminal == undefined) {
      return ERR_NOT_FOUND;
    }

    const terminalInfo = new VisibleRoom(creep.room.name).getTerminalInfo();
    const [resource, requestAmount] = terminalInfo.getNextUnsatisfiedRequest();
    if (resource == undefined || requestAmount === 0) {
      return ERR_FULL;
    }

    if (requestAmount > 0) {
      // Bring resource to terminal
      const creepFreeCapacity = creep.store.getFreeCapacity(resource);
      const creepAmount = creep.store[resource];
      const storageAmount = storage.store[resource];
      if (
        creepFreeCapacity > 0 &&
        creepAmount < requestAmount &&
        storageAmount > 0
      ) {
        // If the creep can carry more, is carrying less than the requested
        // amount, and there is more in storage, get some from the storage.
        const amount = Math.min(
          creepFreeCapacity,
          requestAmount,
          storageAmount,
        );
        return this.getResource(creep, storage, resource, amount);
      } else if (creepAmount > 0) {
        // If the creep has some of the resource (either the desired amount or
        // less than the desired amount but the storage has none left), bring
        // what is carried to the terminal.
        const amount = Math.min(creepAmount, requestAmount);
        return this.putResource(creep, terminal, resource, amount);
      } else if (storageAmount === 0) {
        return ERR_NOT_ENOUGH_RESOURCES;
      }
    } else {
      // Remove resource from terminal

      // Request amount is negative, e.g. -x means take x amount from the
      // terminal and put it into storage.

      const creepFreeCapacity = creep.store.getFreeCapacity(resource);
      const creepAmount = creep.store[resource];
      const terminalAmount = terminal.store[resource];

      if (terminalAmount === 0 || terminalAmount < -requestAmount) {
        warn(
          `Creep ${creep.name} detected invalid negative terminal request, ignoring`,
        );
        return ERR_INVALID_ARGS;
      }

      if (
        creepFreeCapacity > 0 &&
        creepAmount < -requestAmount &&
        terminalAmount > 0
      ) {
        // If the creep can carry more, is carrying less than the requested
        // amount, and there is more in the terminal, get more from the terminal
        const amount = Math.min(creepFreeCapacity, -requestAmount);
        return this.getResource(creep, terminal, resource, amount);
      } else if (creepAmount > 0) {
        // If the creep has some of the resource (either the desired amount or
        // less than the desired amount but the storage has none left), bring
        // what is carried to the terminal.
        const amount = Math.min(creepAmount, requestAmount);
        return this.putResource(creep, storage, resource, amount);
      }
    }

    warn(
      `Creep ${creep.name} doesn't know how to supply terminal ${requestAmount} ${resource}`,
    );
    return ERR_INVALID_ARGS;
  }
}
