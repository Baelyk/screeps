import { VisibleRoom } from "roomMemory";
import { GetByIdError } from "utils/errors";

export interface TerminalMemory {
  id: Id<StructureTerminal>;
  requests: string[];
  deals: Id<Order>[];
}

export class TerminalInfo {
  roomName: string;

  static createMemory(terminal: StructureTerminal): TerminalMemory {
    return { id: terminal.id, requests: [], deals: [] };
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

  public getLogisticsRequests(): string[] {
    return this.getMemory().requests || [];
  }

  public updateRequests(
    newRequests: string[],
    method?: "append" | "reset",
  ): void {
    const memory = this.getMemory();
    if (method == undefined || method == "append") {
      const requests = this.getLogisticsRequests();
      newRequests.forEach((requestKey) => {
        if (requests.indexOf(requestKey) === -1) {
          requests.push(requestKey);
        }
      });
      memory.requests = requests;
    } else if (method == "reset") {
      memory.requests = newRequests;
    }
    this.getVisibleRoom().updateTerminalMemory(memory);
  }
}
