import { VisibleRoom } from "roomMemory";
import { info, warn } from "utils/logger";
import { LogisticsInfo, LogisticsRequest } from "logistics";

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
  }
}

class LabInfo implements LabMemory {
  // LabMemory fields
  logisticsRequest?: string;
  role: LabRole;
  resource: ResourceConstant | undefined;
  targetAmount?: number;

  // LabInfo fields
  lab: StructureLab;

  // Hidden fields
  _room?: VisibleRoom;
  _logistics?: LogisticsInfo;

  static getMemoryFor(lab: StructureLab): LabMemory | undefined {
    const room = new VisibleRoom(lab.room.name);
    const labsMemory = room.getLabsMemory();
    return labsMemory[lab.id];
  }

  constructor(lab: StructureLab) {
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
    }
  }

  getRequestKey(): string | undefined {
    return this.logisticsRequest;
  }

  setRequestKey(requestKey: string): void {
    this.logisticsRequest = requestKey;
  }

  getRole(): LabRole {
    return this.role;
  }

  setRole(role: LabRole): void {
    this.role = role;
  }

  getResource(): ResourceConstant | undefined {
    return this.resource;
  }

  setResource(resource: ResourceConstant): void {
    this.resource = resource;
  }

  getTargetAmount(): number | undefined {
    return this.targetAmount;
  }

  setTargetAmount(amount: number | undefined): void {
    this.targetAmount = amount;
  }

  get room() {
    if (this._room == undefined) {
      const room = new VisibleRoom(this.lab.room.name);
      this._room = room;
    }
    return this._room;
  }

  get logistics() {
    if (this._logistics == undefined) {
      const logistics = new LogisticsInfo(this.lab.room.name);
      this._logistics = logistics;
    }
    return this._logistics;
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
    const key = this.logistics.addUnique(request);
    this.setRequestKey(key);
    return key;
  }
}

class LabActor {
  lab: StructureLab;
  info: LabInfo;

  constructor(lab: StructureLab) {
    this.lab = lab;
    this.info = new LabInfo(lab);
  }
}
