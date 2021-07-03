import { RoomInfo } from "roomMemory";

export interface TerminalMemory {
  id: Id<StructureTerminal>;
  requesting: TerminalRequestingMemory;
}

type TerminalRequestingMemory = { [key in ResourceConstant]?: number };

export class TerminalInfo {
  roomName: string;
  memory: TerminalMemory;

  static createMemory(terminal: StructureTerminal): TerminalMemory {
    return { id: terminal.id, requesting: {} };
  }

  constructor(roomName: string) {
    this.roomName = roomName;
    this.memory = new RoomInfo(roomName).getTerminalMemory();
  }

  public getRequestedResources(): TerminalRequestingMemory {
    return this.memory.requesting;
  }

  public getRequestedResourceTypes(): ResourceConstant[] {
    return _.keys(this.getRequestedResources()) as ResourceConstant[];
  }

  public getRequestedAmount(resource: ResourceConstant): number {
    const amount = this.getRequestedResources()[resource];
    if (amount == undefined) {
      return 0;
    }
    return amount;
  }
}
