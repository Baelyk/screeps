import { ErrorMapper } from "utils/ErrorMapper";
import * as logger from "utils/logger";

declare const enum ErrorType {
  default = "",
}

export class ScriptError extends Error {
  type: ErrorType = ErrorType.default;
  displayName = "Error";

  constructor(message: string, type?: ErrorType) {
    super(message);
    if (type != undefined) {
      this.type = type;
    }
    this.displayName = this.constructor.name;
  }

  toString(): string {
    const typeDisplay =
      this.type !== ErrorType.default ? `[${this.type}] ` : "";
    return `[${this.displayName}] ${typeDisplay}${this.message}`;
  }
}

function displayError(error: Error): string {
  return decodeURI(ErrorMapper.sourceMappedStackTrace(error));
}

/** The name (or constant name) of any game object that has an id. */
type GameObjectWithId =
  | StructureConstant
  | "construction site"
  | "creep"
  | "deposit"
  | "mineral"
  | "nuke"
  | "power creep"
  | "resource"
  | "ruin"
  | "source"
  | "tombstone";
export class GetByIdError extends ScriptError {
  constructor(
    object: Id<StructureConstant> | string,
    objectType?: GameObjectWithId,
    message?: string,
  ) {
    let msg = `Could not get ${objectType || "object"} by id: ${object}`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

class MemoryError extends ScriptError {
  constructor(message: string) {
    let msg = `Invalid memory entry`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

export class CreepMemoryError extends MemoryError {
  constructor(creep: Creep, invalidField: keyof CreepMemory, message?: string) {
    let msg = `Creep ${creep.name} has invalid field ${invalidField}`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

export class CreepRoleMemoryError extends CreepMemoryError {
  constructor(creep: Creep, invalidField: keyof CreepMemory, message?: string) {
    let msg = `Field ${invalidField} is required for creep role ${creep.memory.role}`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(creep, invalidField, msg);
  }
}

export class InvalidCreepTaskError extends CreepRoleMemoryError {
  constructor(creep: Creep, validTasks?: CreepTask[], message?: string) {
    let msg = `Invalid task for role ${creep.memory.role}: ${creep.memory.task}`;
    // If valid tasks were supplied, list them after the default message.
    if (validTasks != undefined && validTasks.length > 0) {
      msg += `\nShould be one of: `;
      const last = validTasks.length - 1;
      validTasks.forEach((task, index) => {
        // Don't include a comma after the last valid task
        msg += task + (index !== last ? ", " : "");
      });
    }
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(creep, "task", msg);
  }
}

export class InvalidCreepRoleError extends CreepRoleMemoryError {
  constructor(creep: Creep, validRoles?: CreepRole[], message?: string) {
    let msg = `Invalid role for ${creep.name}: ${creep.memory.role}`;
    // If valid roles were supplied, list them after the default message.
    if (validRoles != undefined && validRoles.length > 0) {
      msg += `\nShould be one of: `;
      const last = validRoles.length - 1;
      validRoles.forEach((role, index) => {
        // Don't include a comma after the last valid role
        msg += role + (index !== last ? ", " : "");
      });
    }
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(creep, "role", msg);
  }
}

export class GetPositionError extends ScriptError {
  constructor(
    pos: { x: number; y: number; roomName?: string },
    message?: string,
  ) {
    let msg = `Unable to get position (${pos.x}, ${pos.y}) in ${
      pos.roomName ? `room ${pos.roomName}` : "unknown room"
    }`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

export class RoomMemoryError extends MemoryError {
  constructor(room: Room, invalidField: keyof RoomMemory, message?: string) {
    let msg = `Room ${room.name} has invalid memory field ${invalidField}`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

export class SpawnMemoryError extends MemoryError {
  constructor(
    spawn: StructureSpawn,
    invalidField: keyof SpawnMemory,
    message?: string,
  ) {
    let msg = `Spawn ${spawn.name} has invalid memory field ${invalidField}`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

/**
 * A wrapper around a function that may throw an error.
 *
 * @param {() => void} fn The function to wrap
 * @param {string} [message] A message to log before the error trace
 * @param {() => void} [final] A function to execute after fn regardless of
 *   whether an error was thrown.
 */
export function wrapper(
  fn: () => void,
  message?: string,
  final?: () => void,
): void {
  try {
    fn();
  } catch (e) {
    logger.error((message ? message + "\n" : "") + displayError(e));
  } finally {
    if (final != undefined) final();
  }
}