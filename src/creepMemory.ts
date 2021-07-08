import { MemoryError, GetByIdError } from "utils/errors";
import { Position } from "classes/position";

interface CreepMemory {
  role: CreepRole;
  task: CreepTask;
  // Undefined if the creep is spawning
  room: string;
  /** A source assigned to this creep by id */
  assignedSource?: Id<Source>;
  /** A construction site assigned to this creep by id */
  assignedConstruction?: Id<ConstructionSite>;
  /** A structuring needing repairs that this creep is repairing */
  assignedRepairs?: Id<Structure>;
  /** A spot assigned to this creep */
  spot?: string;
  /** Whether to prevent this creep from being renewed */
  noRenew?: boolean | undefined;
  /** The room this claimer creep is targetting */
  claimTarget?: string | undefined;
  /** A path for this creep to use, serialized with `Room.serializePath` */
  path?: string;
  /** The room the path originated in, to know when to recreate path */
  pathStartRoom?: string;
  /** The room this creep is targetting */
  roomTarget?: string;
  /** Whether this creep should have attack notifications enabled */
  attackNotifications?: boolean;
}

// The exact task depends also on the role
export declare const enum CreepTask {
  /** Role indicating the creep is freshly spawned (i.e. uninit) */
  fresh = "fresh",
  /** Task indicating the creep is waiting for further instructions/state change */
  idle = "idle",
  harvest = "harvest",
  deposit = "deposit",
  getEnergy = "get_energy",
  build = "build",
  repair = "repair",
  renew = "renew",
  claim = "claim",
  reserve = "reserve",
  /** Move to target */
  move = "move",
  /** Attack hostiles */
  attack = "attack",
  /** Scout rooms without necessarily staying and signing */
  scout = "scout",
}

export declare const enum CreepRole {
  /** Simple creep that performs the harvest and deposit actions */
  harvester = "harvester",
  /** Creep that mines into a container near to the source */
  miner = "miner",
  /** Creep that constructs buildings */
  builder = "builder",
  /** Creep that gets energy and deposits energy to spawn then controller */
  upgrader = "upgrader",
  /** Creep that hauls energy between sources and deposits energy */
  hauler = "hauler",
  /** Creep that moves to other rooms to claim them */
  claimer = "claimer",
  /** Creep that keeps energy in spawns, extensions, and towers */
  tender = "tender",
  /** Creep that works mineral deposits */
  extractor = "extractor",
  /** Creep that hauls between remotes */
  remoteHauler = "remote_hauler",
  /** Creep that moves to a room to provide vision */
  scout = "scout",
  /** Creep that guards rooms and their remotes */
  guard = "guard",
}

export class CreepMemoryError extends MemoryError {
  constructor(creepName: string, message?: string) {
    let msg = `Creep ${creepName} memory error`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

export class CreepMemoryFieldError extends CreepMemoryError {
  constructor(creep: Creep, invalidField: keyof CreepMemory, message?: string) {
    let msg = `Creep ${creep.name} has invalid field ${invalidField}`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

export class CreepRoleMemoryError extends CreepMemoryFieldError {
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

export class CreepInfo {
  creepName: string;

  constructor(creepName: string) {
    if (Memory.creeps[creepName] == undefined) {
      throw new CreepMemoryError(creepName, "Creep memory undefined");
    }
    this.creepName = creepName;
  }

  getMemory(): CreepMemory {
    return Memory.creeps[this.creepName];
  }

  getSpot(): RoomPosition | undefined {
    const spotMemory = this.getMemory().spot;
    if (spotMemory == undefined) {
      return undefined;
    }
    return Position.fromSerialized(spotMemory).intoRoomPosition();
  }

  getAssignedSource(): Source | undefined {
    const assignedSourceMemory = this.getMemory().assignedSource;
    if (assignedSourceMemory == undefined) {
      return undefined;
    }
    const source = Game.getObjectById(assignedSourceMemory);
    if (source == undefined) {
      throw new GetByIdError(assignedSourceMemory, "source");
    }
    return source;
  }

  getAssignedConstruction(): ConstructionSite | undefined {
    const assignedConstructionMemory = this.getMemory().assignedConstruction;
    if (assignedConstructionMemory == undefined) {
      return undefined;
    }
    const construction = Game.getObjectById(assignedConstructionMemory);
    if (construction == undefined) {
      throw new GetByIdError(assignedConstructionMemory, "construction site");
    }
    return construction;
  }

  setAssignedConstruction(id: Id<ConstructionSite>): void {
    Memory.creeps[this.creepName].assignedConstruction = id;
  }

  removeAssignedConstruction(): void {
    delete Memory.creeps[this.creepName].assignedConstruction;
  }

  getAssignedRepairs(): Structure | undefined {
    const assignedRepairsMemory = this.getMemory().assignedRepairs;
    if (assignedRepairsMemory == undefined) {
      return undefined;
    }
    const repairs = Game.getObjectById(assignedRepairsMemory);
    if (repairs == undefined) {
      throw new GetByIdError(assignedRepairsMemory);
    }
    return repairs;
  }

  setAssignedRepairs(id: Id<Structure>): void {
    Memory.creeps[this.creepName].assignedRepairs = id;
  }

  removeAssignedRepairs(): void {
    delete Memory.creeps[this.creepName].assignedRepairs;
  }

  getAssignedRoomName(): string {
    return this.getMemory().room;
  }

  setAssignedRoomName(roomName: string): void {
    Memory.creeps[this.creepName].room = roomName;
  }

  getTask(): CreepTask {
    return this.getMemory().task;
  }

  setTask(task: CreepTask): void {
    Memory.creeps[this.creepName].task = task;
  }
}
