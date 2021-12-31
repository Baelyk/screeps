import { VisibleRoom } from "roomMemory";
import { info, warn, errorConstant } from "utils/logger";
import { LogisticsInfo, LogisticsRequest } from "logistics";
import { GetByIdError, ScriptError, wrapper } from "utils/errors";
import { Position } from "classes/position";

enum LabRole {
  /** This lab is storing reagent for a reaction */
  Reagent = "reagent",
  /** This lab is running a reaction and storing the product */
  Product = "product",
  /** This lab is storing compound to boost a creep */
  Boost = "boost",
  /** This lab currently has no role */
  None = "none",
}

declare global {
  type RoomLabsMemory = {
    [id: string]: LabMemory;
  };

  interface LabMemory {
    logisticsRequest?: string;
    role: LabRole;
    resource: ResourceConstant | undefined;
    targetAmount?: number;
    reagentLabs?: [Id<StructureLab>, Id<StructureLab>];
  }
}

class LabInfo implements LabMemory {
  // LabMemory fields
  logisticsRequest?: string;
  role: LabRole;
  resource: ResourceConstant | undefined;
  targetAmount?: number;
  reagentLabs?: [Id<StructureLab>, Id<StructureLab>];

  // LabInfo fields
  name: string;
  roomName: string;
  lab: StructureLab;

  // Hidden fields
  _room?: VisibleRoom;
  _logistics?: LogisticsInfo;

  static getMemoryFor(lab: StructureLab): LabMemory | undefined {
    const room = new VisibleRoom(lab.room.name);
    const labsMemory = room.getLabsMemory();
    return labsMemory[lab.id];
  }

  static getAllLabResources(roomName: string): ResourceConstant[] {
    const room = new VisibleRoom(roomName);
    const labsMemory = room.getLabsMemory();
    const resources: ResourceConstant[] = [];
    for (const id in labsMemory) {
      const memory = labsMemory[id];
      if (memory.resource != undefined) {
        resources.push(memory.resource);
      }
    }
    return resources;
  }

  static getAllReagentLabs(roomName: string): Id<StructureLab>[] {
    const room = new VisibleRoom(roomName);
    const labsMemory = room.getLabsMemory();
    const reagentLabIds: Id<StructureLab>[] = [];
    for (const id in labsMemory) {
      const memory = labsMemory[id];
      if (memory.reagentLabs != undefined) {
        reagentLabIds.push(...memory.reagentLabs);
      }
    }
    return reagentLabIds;
  }

  constructor(lab: StructureLab) {
    this.name = Position.serialize(lab.pos);
    this.roomName = lab.room.name;
    this.lab = lab;

    const memory = LabInfo.getMemoryFor(lab);
    if (memory == undefined) {
      warn(`Room ${lab.room.name} lab ${lab.id} has no memory, using defaults`);
      this.role = LabRole.None;
      this.resource = undefined;
    } else {
      this.logisticsRequest = memory.logisticsRequest;
      this.role = memory.role;
      this.resource = memory.resource;
      this.targetAmount = memory.targetAmount;
      this.reagentLabs = memory.reagentLabs;
    }
  }

  updateMemory(): void {
    const memory: LabMemory = {
      role: this.role,
      resource: this.resource,
    };
    if (this.logisticsRequest != undefined) {
      memory.logisticsRequest = this.logisticsRequest;
    }
    if (this.targetAmount != undefined) {
      memory.targetAmount = this.targetAmount;
    }
    if (this.reagentLabs != undefined) {
      memory.reagentLabs = this.reagentLabs;
    }

    const allMemory = this.room.getLabsMemory();
    allMemory[this.lab.id] = memory;
    this.room.updateLabsMemory(allMemory);
  }

  getRequestKey(): string | undefined {
    return this.logisticsRequest;
  }

  setRequestKey(requestKey: string): void {
    this.logisticsRequest = requestKey;
    this.updateMemory();
  }

  getRole(): LabRole {
    return this.role;
  }

  setRole(role: LabRole): void {
    this.role = role;
    this.updateMemory();
  }

  getResource(): ResourceConstant | undefined {
    return this.resource;
  }

  setResource(resource: ResourceConstant | undefined): void {
    this.resource = resource;
    this.updateMemory();
  }

  getTargetAmount(): number | undefined {
    return this.targetAmount;
  }

  setTargetAmount(amount: number | undefined): void {
    this.targetAmount = amount;
    this.updateMemory();
  }

  getReagentLabIds(): [Id<StructureLab>, Id<StructureLab>] | undefined {
    return this.reagentLabs;
  }

  setReagentLabIds(labIds: [Id<StructureLab>, Id<StructureLab>]): void {
    this.reagentLabs = labIds;
    this.updateMemory();
  }

  removeReagentLabIds(): void {
    this.reagentLabs = undefined;
    this.updateMemory();
  }

  get room() {
    if (this._room == undefined) {
      const room = new VisibleRoom(this.roomName);
      this._room = room;
    }
    return this._room;
  }

  get logistics() {
    if (this._logistics == undefined) {
      const logistics = new LogisticsInfo(this.roomName);
      this._logistics = logistics;
    }
    return this._logistics;
  }

  isUnoccupied(): boolean {
    return this.getRole() === LabRole.None;
  }

  isProducing(): boolean {
    return this.getRole() === LabRole.Product;
  }

  isSupplying(): boolean {
    return this.getRole() === LabRole.Reagent;
  }

  isBoosting(): boolean {
    return this.getRole() === LabRole.Boost;
  }

  getRequest(): LogisticsRequest | undefined {
    const key = this.getRequestKey();
    if (key == undefined) {
      return undefined;
    }
    return this.logistics.get(key);
  }

  removeRequest(): void {
    const oldKey = this.getRequestKey();
    if (oldKey == undefined) {
      return;
    }
    this.logistics.remove(oldKey);
  }

  setRequest(request: LogisticsRequest): string {
    this.removeRequest();
    const key = this.logistics.addUnique(request, "replace");
    this.setRequestKey(key);
    return key;
  }

  getReagentLabs(): [StructureLab, StructureLab] | undefined {
    const labIds = this.getReagentLabIds();
    if (labIds == undefined) {
      return undefined;
    }
    const labs: StructureLab[] = [];
    labIds.forEach((id) => {
      const lab = Game.getObjectById(id);
      if (lab == undefined) {
        throw new GetByIdError(id);
      }
      labs.push(lab);
    });

    if (labs.length != 2) {
      return undefined;
    }
    return [labs[0], labs[1]];
  }

  getReagentLabInfos(): [LabInfo, LabInfo] | undefined {
    const reagentLabs = this.getReagentLabs();
    if (reagentLabs == undefined) {
      return undefined;
    }
    return [new LabInfo(reagentLabs[0]), new LabInfo(reagentLabs[1])];
  }

  setReagentLabs(labs: [StructureLab, StructureLab]): void {
    this.setReagentLabIds([labs[0].id, labs[1].id]);
  }

  isActiveReagentLab(): boolean {
    return LabInfo.getAllReagentLabs(this.roomName).indexOf(this.lab.id) !== -1;
  }
}

class LabActor {
  lab: StructureLab;
  info: LabInfo;

  static getStoredResource(lab: StructureLab): ResourceConstant | undefined {
    for (const resource in lab.store) {
      return resource as ResourceConstant;
    }
    return undefined;
  }

  constructor(lab: StructureLab) {
    this.lab = lab;
    this.info = new LabInfo(lab);
  }

  isOnCooldown(): boolean {
    return this.lab.cooldown > 0;
  }

  behave(): void {
    // If this lab is unoccupied, try and find a reaction to perform
    if (this.info.isUnoccupied()) {
      const resource = this.selectReaction();
      if (resource != undefined) {
        this.info.setRole(LabRole.Product);
        this.info.setResource(resource);
      }
    }

    // If this lab is producing, try and produce
    if (this.info.isProducing()) {
      const response = this.performReaction();
      info(
        `Lab ${this.lab.id} in ${
          this.lab.room.name
        } attempting reaction: ${errorConstant(response)}`,
      );
      if (response === ERR_NOT_ENOUGH_RESOURCES) {
        if (this.considerStopping()) {
          info(`Lab ${this.info.name} stopping current reaction`);
          this.info.setResource(undefined);
          this.info.setRole(LabRole.None);
          this.info.setTargetAmount(undefined);
          this.info.removeReagentLabIds();
        }
      }
    }

    // If this lab is supplying a reaction that's no longer occuring, stop
    if (this.info.isSupplying() && !this.info.isActiveReagentLab()) {
      this.info.setResource(undefined);
      this.info.setRole(LabRole.None);
      this.info.setTargetAmount(undefined);
    }

    this.manageLogistics();
  }

  considerStopping(): boolean {
    const reagentLabInfos = this.info.getReagentLabInfos();
    if (reagentLabInfos == undefined) {
      return true;
    }

    let outOfReagent = false;
    reagentLabInfos.forEach((labInfo) => {
      const resource = labInfo.getResource();
      if (resource == undefined) {
        outOfReagent = true;
      } else {
        if (
          labInfo.lab.store[resource] +
            labInfo.room.storedResourceAmount(resource) <
          LAB_REACTION_AMOUNT
        ) {
          outOfReagent = true;
        }
      }
    });
    return outOfReagent;
  }

  manageLogistics(): void {
    // Manage this lab's logistics request
    const storedResource = LabActor.getStoredResource(this.lab);
    if (this.info.isUnoccupied() || this.info.isProducing()) {
      // Unoccupied and producing labs should be empty
      if (storedResource == undefined) {
        // This lab is empty, make sure it has no logistics request
        this.info.removeRequest();
      } else {
        // Empty this lab
        const request = new LogisticsRequest(this.lab.id, storedResource, 0);
        this.info.setRequest(request);
      }
    } else if (this.info.isSupplying() || this.info.isBoosting()) {
      // Labs providing reagent or boosting labs should have their resource
      const resource = this.info.getResource();
      if (resource == undefined) {
        throw new ScriptError(
          `Lab ${
            this.lab.id
          } has role ${this.info.getRole()} but no resource specified`,
        );
      }
      const targetAmount =
        this.info.getTargetAmount() || this.lab.store.getCapacity() || 0;
      if (storedResource == undefined) {
        // Lab is empty, request resource
        const request = new LogisticsRequest(
          this.lab.id,
          resource,
          targetAmount,
        );
        this.info.setRequest(request);
      } else if (storedResource !== resource) {
        // Lab has wrong resource, empty the lab
        const request = new LogisticsRequest(this.lab.id, storedResource, 0);
        this.info.setRequest(request);
      } else if (storedResource === resource) {
        const storedAmount = this.lab.store[resource];
        if (storedAmount !== targetAmount) {
          // Lab has some of the right resource, but not the right amount
          const request = new LogisticsRequest(
            this.lab.id,
            resource,
            targetAmount,
          );
          this.info.setRequest(request);
        } else if (storedAmount === targetAmount) {
          // Lab has exactly the right amount
          this.info.removeRequest();
        }
      }
    }
  }

  selectReaction(): ResourceConstant | undefined {
    const storage = this.lab.room.storage;
    if (storage == undefined) {
      warn(`Room ${this.lab.room.name} lacks storage, not selecting reaction`);
      return undefined;
    }

    const otherReactions = LabInfo.getAllLabResources(this.lab.room.name);

    // Find a possible reaction
    for (const firstResource in storage.store) {
      if (firstResource === RESOURCE_ENERGY) {
        continue;
      }
      const possibleReactions = REACTIONS[firstResource];
      for (const secondResource in storage.store) {
        if (secondResource === RESOURCE_ENERGY) {
          continue;
        }
        const possibleReaction = possibleReactions[secondResource] as
          | ResourceConstant
          | undefined;
        // If this reagent combo produces a resource not already being produced
        if (
          possibleReaction != undefined &&
          otherReactions.indexOf(possibleReaction) === -1
        ) {
          const reagents: [ResourceConstant, ResourceConstant] = [
            firstResource as ResourceConstant,
            secondResource as ResourceConstant,
          ];
          // And if we can find reagent labs for this reaction
          const reagentLabs = this.pickReagentLabs(reagents);
          if (reagentLabs != undefined) {
            // Then, select this reaction
            this.info.setReagentLabs(reagentLabs);
            this.instructReagentLabs(reagents, reagentLabs);
            return possibleReaction;
          }
        }
      }
    }

    return undefined;
  }

  pickReagentLabs(
    reagents: [ResourceConstant, ResourceConstant],
  ): [StructureLab, StructureLab] | undefined {
    const firstReagentLabs: StructureLab[] = [];
    const secondReagentLabs: StructureLab[] = [];
    const unoccupiedLabs: StructureLab[] = [];

    this.lab.pos.findInRange(FIND_MY_STRUCTURES, 2).forEach((structure) => {
      if (structure.structureType === STRUCTURE_LAB) {
        const info = new LabInfo(structure);
        const resource = info.getResource();
        if (resource != undefined) {
          switch (reagents.indexOf(resource)) {
            case 0:
              firstReagentLabs.push(structure);
              break;
            case 1:
              secondReagentLabs.push(structure);
              break;
          }
        } else if (info.isUnoccupied()) {
          unoccupiedLabs.push(structure);
        }
      }
    });

    let unoccupiedIndex = 0;
    let firstLab = firstReagentLabs[0];
    let secondLab = secondReagentLabs[0];

    try {
      if (firstLab == undefined) {
        firstLab = unoccupiedLabs[unoccupiedIndex++];
      }
      if (secondLab == undefined) {
        secondLab = unoccupiedLabs[unoccupiedIndex++];
      }
    } catch (e) {
      // There weren't enough unoccupied labs, so we cannot find reagent labs
    }

    if (firstLab == undefined || secondLab == undefined) {
      return undefined;
    }

    return [firstLab, secondLab];
  }

  instructReagentLabs(
    reagents: [ResourceConstant, ResourceConstant],
    reagentLabs: [StructureLab, StructureLab],
  ): void {
    const firstInfo = new LabInfo(reagentLabs[0]);
    const secondInfo = new LabInfo(reagentLabs[1]);

    [firstInfo, secondInfo].forEach((labInfo, index) => {
      if (labInfo.isUnoccupied()) {
        info(
          `Assigning ${labInfo.name} to supply ${reagents[index]} for ${this.info.name}`,
        );
        labInfo.setRole(LabRole.Reagent);
        labInfo.setResource(reagents[index]);
      } else if (labInfo.isSupplying()) {
        if (labInfo.getResource() !== reagents[index]) {
          warn(
            `Expected lab ${labInfo.name} to supply ${
              reagents[index]
            } not ${labInfo.getResource()} for ${this.info.name}`,
          );
        }
      } else {
        warn(
          `Expected lab ${labInfo.name} to be unoccupied/supply ${
            reagents[index]
          }, but is ${labInfo.getRole()} with ${labInfo.getResource()} for ${
            this.info.name
          }`,
        );
      }
    });
  }

  performReaction(): ScreepsReturnCode {
    const reagentLabs = this.info.getReagentLabs();
    if (reagentLabs == undefined) {
      return ERR_INVALID_TARGET;
    }
    const resource = this.info.getResource();
    const firstReagent = LabActor.getStoredResource(reagentLabs[0]);
    const secondReagent = LabActor.getStoredResource(reagentLabs[1]);

    // One of the labs lacks resources
    if (firstReagent == undefined || secondReagent == undefined) {
      return ERR_NOT_ENOUGH_RESOURCES;
    }

    // One of the labs has an incorrect resource
    const product = REACTIONS[firstReagent as string][secondReagent as string];
    if (resource !== product) {
      warn(`${firstReagent} + ${secondReagent} = ${product} not ${resource}`);
      return ERR_INVALID_ARGS;
    }

    return this.lab.runReaction(...reagentLabs);
  }
}

export function labManager(room: VisibleRoom): void {
  const labs = room
    .getRoom()
    .find(FIND_MY_STRUCTURES)
    .filter(
      (structure) => structure.structureType === STRUCTURE_LAB,
    ) as StructureLab[];

  labs.forEach((lab) => {
    wrapper(() => {
      const actor = new LabActor(lab);
      actor.behave();
    }, `Error while processing behavior for lab ${lab.id} in ${lab.room.name}`);
  });
}
