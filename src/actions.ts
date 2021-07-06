import { info, warn, errorConstant } from "utils/logger";
import { ScriptError } from "utils/errors";

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

function move(
  creep: Creep,
  target: RoomPosition | { pos: RoomPosition },
  options: Partial<MoveActionOptions>,
): ScreepsReturnCode {
  return creep.moveTo(target, options);
}

function harvest(
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

function getResource(
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

function getFromTombstone(
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

function putResource(
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

function upgrade(
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

function build(
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

function repair(
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

function pickupResource(
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
