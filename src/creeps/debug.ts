import { AnyCreepMemory, CreepRole, CreepTask } from "./memory";
import { Position } from "classes/position";

export function convertCreepMemory() {
  interface OldCreepMemory {
    role: CreepRole;
    task: CreepTask;
    // Undefined if the creep is spawning
    room: string;
    /** A source assigned to this creep by id */
    assignedSource?: Id<Source> | undefined;
    /** A construction site assigned to this creep by id */
    assignedConstruction?: string | undefined;
    /** A structuring needing repairs that this creep is repairing */
    assignedRepairs?: Id<Structure> | undefined;
    /** A spot assigned to this creep */
    spot?: RoomPosition | undefined;
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

  const newMemory: typeof Memory.creeps = {};
  const oldMemory = (Memory.creeps as unknown) as {
    [name: string]: OldCreepMemory;
  };

  for (const name in oldMemory) {
    console.log(`updating ${name}`);
    const oldCreepMemory = oldMemory[name];
    const newCreepMemory: any = {
      role: oldCreepMemory.role,
      task: oldCreepMemory.task,
      room: oldCreepMemory.room,
    };

    if (oldCreepMemory.assignedSource != undefined) {
      newCreepMemory.assignedSource = oldCreepMemory.assignedSource;
    }

    if (oldCreepMemory.assignedConstruction != undefined) {
      newCreepMemory.assignedConstruction = oldCreepMemory.assignedConstruction;
    }

    if (oldCreepMemory.assignedRepairs != undefined) {
      newCreepMemory.assignedRepairs = oldCreepMemory.assignedRepairs;
    }

    if (oldCreepMemory.spot != undefined) {
      newCreepMemory.spot = Position.serialize(oldCreepMemory.spot);
    }

    if (oldCreepMemory.noRenew) {
      newCreepMemory.noRenew = true;
    }

    if (oldCreepMemory.claimTarget != undefined) {
      newCreepMemory.claimTarget = oldCreepMemory.claimTarget;
    }

    if (oldCreepMemory.roomTarget != undefined) {
      newCreepMemory.roomTarget = oldCreepMemory.roomTarget;
    }

    if (oldCreepMemory.attackNotifications) {
      newCreepMemory.attackNotifications = true;
    }

    newMemory[name] = newCreepMemory;
  }

  console.log("Resetting creep memory");
  Memory.creeps = newMemory;
}
