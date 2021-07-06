import { VisibleRoom } from "roomMemory";
import { GetByIdError } from "utils/errors";

export interface TerminalMemory {
  id: Id<StructureTerminal>;
  requesting: TerminalRequestingMemory;
}

export type TerminalRequestingMemory = { [key in ResourceConstant]?: number };

export class TerminalInfo {
  roomName: string;

  static createMemory(terminal: StructureTerminal): TerminalMemory {
    return { id: terminal.id, requesting: {} };
  }

  constructor(roomName: string) {
    this.roomName = roomName;
  }

  getVisibleRoom(): VisibleRoom {
    return new VisibleRoom(this.roomName);
  }

  getMemory(): TerminalMemory {
    return this.getVisibleRoom().getTerminalMemory();
  }

  getTerminal(): StructureTerminal {
    const terminalId = this.getMemory().id;
    const terminal = Game.getObjectById(terminalId);
    if (terminal == undefined) {
      throw new GetByIdError(terminalId, STRUCTURE_TERMINAL);
    }
    return terminal;
  }

  public getRequestedResources(): TerminalRequestingMemory {
    return this.getMemory().requesting;
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

  public updateRequestedResources(
    requesting: TerminalRequestingMemory,
    reset = false,
  ): void {
    const memory = this.getMemory();
    if (reset) {
      memory.requesting = requesting;
    } else {
      _.forEach(requesting, (amount, key) => {
        if (key == undefined || amount == undefined) {
          return;
        }
        const resource = key as keyof TerminalRequestingMemory;
        let resourceAmount = memory.requesting[resource] || 0;
        resourceAmount += amount;
        memory.requesting[resource] = resourceAmount;
      });
    }
    this.getVisibleRoom().updateTerminalMemory(memory);
  }

  public getNextUnsatisfiedRequest(): [ResourceConstant | undefined, number] {
    const terminal = this.getTerminal();
    const requesting = this.getRequestedResources();
    const unsatisfiedResource = _.findKey(requesting, (value, key) => {
      const amount = value as number;
      if (key == undefined || amount == undefined) {
        return;
      }
      const resource = key as keyof TerminalRequestingMemory;
      const stored = terminal.store.getUsedCapacity(resource);
      return stored <= amount;
    }) as ResourceConstant | undefined;
    if (unsatisfiedResource == undefined) {
      return [undefined, 0];
    }
    return [unsatisfiedResource, requesting[unsatisfiedResource] || 0];
  }
}
