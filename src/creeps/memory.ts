import { MemoryError } from "utils/errors";
import * as CreepInfoHelpers from "./helpers";
import { warn } from "utils/logger";
import { profile } from "utils/profiler";

// Keep the generic CreepMemory in global
declare global {
  interface CreepMemory {
    role: CreepRole;
    task: CreepTask;
    room: string;
    /** Whether to prevent this creep from being renewed */
    noRenew?: boolean;
    /** Whether this creep should have attack notifications enabled */
    attackNotifications?: boolean;
  }
}

type AnyCreepMemory =
  | CreepMemory
  | HarvesterCreepMemory
  | MinerCreepMemory
  | BuilderCreepMemory
  | UpgraderCreepMemory
  | HaulerCreepMemory
  | ClaimerCreepMemory
  | TenderCreepMemory
  | ExtractorCreepMemory
  | RemoteHaulerCreepMemory
  | ScoutCreepMemory
  | GuardCreepMemory
  | EscortCreepMemory;

export class CreepInfo {
  creepName: string;

  constructor(creepName: string) {
    if (Memory.creeps[creepName] == undefined) {
      throw new CreepMemoryError(creepName, "Creep memory undefined");
    }
    this.creepName = creepName;
  }

  getCreep(): Creep {
    const creep = Game.creeps[this.creepName];
    if (creep == undefined) {
      throw new CreepInfoError(this.creepName, "Creep undefined");
    }
    return creep;
  }

  getMemory(): AnyCreepMemory {
    return Memory.creeps[this.creepName];
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
  getRole(): CreepRole {
    return this.getMemory().role;
  }

  setRole(role: CreepRole): void {
    Memory.creeps[this.creepName].role = role;
  }

  noRenew(): boolean {
    // Undefined value for noRenew means false (renewing enabled)
    return this.getMemory().noRenew || false;
  }

  setNoRenew(setting: boolean): void {
    if (setting) {
      Memory.creeps[this.creepName].noRenew = true;
    } else {
      delete Memory.creeps[this.creepName].noRenew;
    }
  }

  getAttackNotifications(): boolean | undefined {
    // Undefined value means false (email attack notifications desired)
    return this.getMemory().attackNotifications;
  }

  deleteAttackNotifications(): void {
    delete Memory.creeps[this.creepName].attackNotifications;
  }
}

interface HarvesterCreepMemory extends CreepMemory {
  role: CreepRole.harvester;
  task: CreepTask.fresh | CreepTask.harvest | CreepTask.deposit;
}

export class HarvesterCreepInfo extends CreepInfo {
  role = CreepRole.harvester;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    if (role !== this.role) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): HarvesterCreepMemory {
    return Memory.creeps[this.creepName] as HarvesterCreepMemory;
  }
}

interface MinerCreepMemory extends CreepMemory {
  role: CreepRole.miner;
  task: CreepTask.fresh | CreepTask.harvest;
  /** A source assigned to this creep by id */
  assignedSource: Id<Source>;
  /** A spot assigned to this creep */
  spot: string;
}

export class MinerCreepInfo extends CreepInfo {
  role = CreepRole.miner;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    if (role !== this.role) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): MinerCreepMemory {
    return Memory.creeps[this.creepName] as MinerCreepMemory;
  }

  getSpot(): RoomPosition {
    const spot = CreepInfoHelpers.getSpot(this.getMemory().spot);
    if (spot == undefined) {
      throw new CreepRoleMemoryError(this.getCreep(), "spot");
    }
    return spot;
  }

  getAssignedSource(): Source | undefined {
    return CreepInfoHelpers.getAssignedById(this.getMemory().assignedSource);
  }
}

interface BuilderCreepMemory extends CreepMemory {
  role: CreepRole.builder;
  task: CreepTask.fresh | CreepTask.build | CreepTask.repair | CreepTask.idle;
  /** A construction site assigned to this creep by id */
  assignedConstruction?: Id<ConstructionSite>;
  /** A structuring needing repairs that this creep is repairing */
  assignedRepairs?: Id<Structure>;
}

export class BuilderCreepInfo extends CreepInfo {
  role = CreepRole.builder;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    if (role !== this.role) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): BuilderCreepMemory {
    return Memory.creeps[this.creepName] as BuilderCreepMemory;
  }

  getAssignedConstruction(): ConstructionSite | undefined {
    try {
      return CreepInfoHelpers.getAssignedById(
        this.getMemory().assignedConstruction,
      );
    } catch (error) {
      warn(
        `Removing assigned construction from Creep ${this.creepName} due to error:`,
      );
      warn(error.toString());
      this.removeAssignedConstruction();
    }
    return undefined;
  }

  setAssignedConstruction(id: Id<ConstructionSite>): void {
    (Memory.creeps[
      this.creepName
    ] as BuilderCreepMemory).assignedConstruction = id;
  }

  removeAssignedConstruction(): void {
    delete (Memory.creeps[this.creepName] as BuilderCreepMemory)
      .assignedConstruction;
  }

  getAssignedRepairs(): Structure | undefined {
    return CreepInfoHelpers.getAssignedById(this.getMemory().assignedRepairs);
  }

  setAssignedRepairs(id: Id<Structure>): void {
    (Memory.creeps[this.creepName] as BuilderCreepMemory).assignedRepairs = id;
  }

  removeAssignedRepairs(): void {
    delete (Memory.creeps[this.creepName] as BuilderCreepMemory)
      .assignedRepairs;
  }
}

interface UpgraderCreepMemory extends CreepMemory {
  role: CreepRole.upgrader;
  task: CreepTask.fresh | CreepTask.getEnergy | CreepTask.deposit;
}

export class UpgraderCreepInfo extends CreepInfo {
  role = CreepRole.upgrader;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    if (role !== this.role) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): UpgraderCreepMemory {
    return Memory.creeps[this.creepName] as UpgraderCreepMemory;
  }
}

interface HaulerCreepMemory extends CreepMemory {
  role: CreepRole.hauler;
  task: CreepTask.fresh | CreepTask.getEnergy | CreepTask.deposit;
  /** A spot assigned to this creep */
  spot: string;
}

export class HaulerCreepInfo extends CreepInfo {
  role = CreepRole.hauler;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    // TODO: Merge remote haulers and haulers into just haulers
    if (role !== this.role && role !== CreepRole.remoteHauler) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): HaulerCreepMemory {
    return Memory.creeps[this.creepName] as HaulerCreepMemory;
  }

  getSpot(): RoomPosition | undefined {
    return CreepInfoHelpers.getSpot(this.getMemory().spot);
  }
}

// TODO: Just get rid of remote haulers, the only really different thing about
// them is their body has a work part. The road-repair behavior can be a check
// in the normal hauler behavior (if room lacks tower and creep has active work
// part, repair road if present).
interface RemoteHaulerCreepMemory extends CreepMemory {
  role: CreepRole.remoteHauler;
  task: CreepTask.fresh | CreepTask.getEnergy | CreepTask.deposit;
  /** A spot assigned to this creep */
  spot: string;
}

export class RemoteHaulerCreepInfo extends CreepInfo {
  role = CreepRole.remoteHauler;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    if (role !== this.role) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): RemoteHaulerCreepMemory {
    return Memory.creeps[this.creepName] as RemoteHaulerCreepMemory;
  }

  getSpot(): RoomPosition {
    const spot = CreepInfoHelpers.getSpot(this.getMemory().spot);
    if (spot == undefined) {
      throw new CreepRoleMemoryError(this.getCreep(), "spot");
    }
    return spot;
  }
}

interface ClaimerCreepMemory extends CreepMemory {
  role: CreepRole.claimer;
  task: CreepTask.fresh | CreepTask.claim | CreepTask.reserve;
  /** The room this claimer creep is targetting */
  claimTarget?: string;
}

export class ClaimerCreepInfo extends CreepInfo {
  role = CreepRole.claimer;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    if (role !== this.role) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): ClaimerCreepMemory {
    return Memory.creeps[this.creepName] as ClaimerCreepMemory;
  }
}

interface TenderCreepMemory extends CreepMemory {
  role: CreepRole.tender;
  task: CreepTask.fresh | CreepTask.getEnergy | CreepTask.deposit;
  targetStore: Id<AnyStoreStructure>;
}

export class TenderCreepInfo extends CreepInfo {
  role = CreepRole.claimer;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    if (role !== this.role) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): TenderCreepMemory {
    return Memory.creeps[this.creepName] as TenderCreepMemory;
  }

  getTargetStore(): AnyStoreStructure | undefined {
    try {
      return CreepInfoHelpers.getAssignedById(this.getMemory().targetStore);
    } catch (error) {
      warn(`Removing target store from Creep ${this.creepName} due to error:`);
      warn(error.toString());
      this.removeTargetStore();
    }
    return undefined;
  }

  setTargetStore(id: Id<AnyStoreStructure>): void {
    (Memory.creeps[this.creepName] as TenderCreepMemory).targetStore = id;
  }

  removeTargetStore(): void {
    delete (Memory.creeps[this.creepName] as TenderCreepMemory).targetStore;
  }
}

interface ExtractorCreepMemory extends CreepMemory {
  role: CreepRole.extractor;
  task: CreepTask.fresh | CreepTask.harvest | CreepTask.deposit;
  /** A spot assigned to this creep */
  spot: string;
}

export class ExtractorCreepInfo extends CreepInfo {
  role = CreepRole.extractor;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    if (role !== this.role) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): ExtractorCreepMemory {
    return Memory.creeps[this.creepName] as ExtractorCreepMemory;
  }

  getSpot(): RoomPosition {
    const spot = CreepInfoHelpers.getSpot(this.getMemory().spot);
    if (spot == undefined) {
      throw new CreepRoleMemoryError(this.getCreep(), "spot");
    }
    return spot;
  }
}

interface ScoutCreepMemory extends CreepMemory {
  role: CreepRole.scout;
  task: CreepTask.fresh | CreepTask.scout | CreepTask.claim;
  targetRoom?: string;
}

export class ScoutCreepInfo extends CreepInfo {
  role = CreepRole.scout;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    if (role !== this.role) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): ScoutCreepMemory {
    return Memory.creeps[this.creepName] as ScoutCreepMemory;
  }

  getTargetRoom(): string | undefined {
    return this.getMemory().targetRoom;
  }

  setTargetRoom(targetRoom: string): void {
    (Memory.creeps[this.creepName] as ScoutCreepMemory).targetRoom = targetRoom;
  }
}

interface GuardCreepMemory extends CreepMemory {
  role: CreepRole.guard;
  task: CreepTask.fresh | CreepTask.move | CreepTask.attack | CreepTask.idle;
  /** The room this creep is targetting */
  targetRoom?: string;
}

export class GuardCreepInfo extends CreepInfo {
  role = CreepRole.guard;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    if (role !== this.role) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): GuardCreepMemory {
    return Memory.creeps[this.creepName] as GuardCreepMemory;
  }

  getTargetRoom(): string | undefined {
    return this.getMemory().targetRoom;
  }

  setTargetRoom(targetRoom: string): void {
    (Memory.creeps[this.creepName] as GuardCreepMemory).targetRoom = targetRoom;
  }
}

interface EscortCreepMemory extends CreepMemory {
  role: CreepRole.escort;
  task: CreepTask.fresh | CreepTask.move | CreepTask.attack | CreepTask.idle;
  /** The creep this escort is following */
  protectee?: string;
  /** The range within to attack hostiles */
  range: number;
}

export class EscortCreepInfo extends CreepInfo {
  role = CreepRole.escort;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    if (role !== this.role) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): EscortCreepMemory {
    return Memory.creeps[this.creepName] as EscortCreepMemory;
  }

  getProtectee(): Creep | undefined {
    const name = this.getMemory().protectee;
    if (name == undefined) {
      return undefined;
    }
    const creep = Game.creeps[name];
    if (creep == undefined) {
      throw new CreepInfoError(this.creepName, `Protectee ${name} undefined`);
    }
    return creep;
  }

  setProtectee(protectee: string): void {
    (Memory.creeps[this.creepName] as EscortCreepMemory).protectee = protectee;
  }

  getRange(): number {
    return this.getMemory().range;
  }

  setRange(range: number): void {
    (Memory.creeps[this.creepName] as EscortCreepMemory).range = range;
  }
}

interface RangedHarvesterCreepMemory extends CreepMemory {
  role: CreepRole.miner;
  task: CreepTask.fresh | CreepTask.harvest;
  /** A source assigned to this creep by id */
  assignedSource: Id<Source>;
  /** A spot assigned to this creep */
  spot: string;
}

export class RangedHarvesterCreepInfo extends CreepInfo {
  role = CreepRole.rangedHarvester;

  constructor(creepName: string) {
    super(creepName);
    const role = Memory.creeps[creepName].role;
    if (role !== this.role) {
      throw new CreepInfoError(
        creepName,
        `Creep has role ${role} not ${this.role}`,
      );
    }
  }

  getMemory(): RangedHarvesterCreepMemory {
    return Memory.creeps[this.creepName] as RangedHarvesterCreepMemory;
  }

  getSpot(): RoomPosition {
    const spot = CreepInfoHelpers.getSpot(this.getMemory().spot);
    if (spot == undefined) {
      throw new CreepRoleMemoryError(this.getCreep(), "spot");
    }
    return spot;
  }

  getAssignedSource(): Source | undefined {
    try {
      return CreepInfoHelpers.getAssignedById(this.getMemory().assignedSource);
    } catch (error) {
      return undefined;
    }
  }
}

// The exact task depends also on the role
export const enum CreepTask {
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

export const enum CreepRole {
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
  /** Creep that follows another creep and attacks hostiles within range */
  escort = "escort",
  /** Creep that harvests a source/mineral and brings the resource back */
  rangedHarvester = "ranged_harvester",
}

export class CreepMemoryError extends MemoryError {
  constructor(creepName: string, message?: string) {
    let msg = `Creep ${creepName} memory error`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

class CreepInfoError extends CreepMemoryError {
  constructor(creepName: string, message?: string) {
    let msg = `Creep ${creepName} CreepInfo error`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

export class CreepMemoryFieldError extends CreepMemoryError {
  constructor(creep: Creep, invalidField: string, message?: string) {
    let msg = `Creep ${creep.name} has invalid field ${invalidField}`;
    // If a message was supplied, add that to the end of the new message
    if (message !== undefined) msg += "\n" + message;

    super(msg);
  }
}

export class CreepRoleMemoryError extends CreepMemoryFieldError {
  constructor(creep: Creep, invalidField: string, message?: string) {
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

export const RoleCreepInfo = {
  [CreepRole.harvester]: HarvesterCreepInfo,
  [CreepRole.miner]: MinerCreepInfo,
  [CreepRole.builder]: BuilderCreepInfo,
  [CreepRole.upgrader]: UpgraderCreepInfo,
  [CreepRole.hauler]: HaulerCreepInfo,
  [CreepRole.claimer]: ClaimerCreepInfo,
  [CreepRole.tender]: TenderCreepInfo,
  [CreepRole.extractor]: ExtractorCreepInfo,
  [CreepRole.remoteHauler]: RemoteHaulerCreepInfo,
  [CreepRole.scout]: ScoutCreepInfo,
  [CreepRole.guard]: GuardCreepInfo,
  [CreepRole.escort]: EscortCreepInfo,
  [CreepRole.rangedHarvester]: RangedHarvesterCreepInfo,
};

export {
  AnyCreepMemory,
  HarvesterCreepMemory,
  MinerCreepMemory,
  BuilderCreepMemory,
  UpgraderCreepMemory,
  HaulerCreepMemory,
  ClaimerCreepMemory,
  TenderCreepMemory,
  ExtractorCreepMemory,
  RemoteHaulerCreepMemory,
  ScoutCreepMemory,
  GuardCreepMemory,
  EscortCreepMemory,
  RangedHarvesterCreepMemory,
};
