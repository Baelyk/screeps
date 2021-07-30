import { TerminalInfo, TerminalRequestingMemory } from "terminalMemory";
import { VisibleRoom } from "roomMemory";

export function terminalManager(room: VisibleRoom): void {
  const terminal = room.getRoom().terminal;
  if (terminal == undefined) {
    return;
  }
  const terminalBehavior = new TerminalBehavior(terminal);
  terminalBehavior.requestExcessResources();
}

export class TerminalBehavior {
  terminal: StructureTerminal;
  info: TerminalInfo;

  constructor(terminal: StructureTerminal) {
    this.terminal = terminal;
    this.info = new TerminalInfo(terminal.room.name);
  }

  getRequestsForDeals(roomName: string): TerminalRequestingMemory {
    const deals = Game.market.orders;
    const roomDeals = _.filter(deals, { type: ORDER_SELL, roomName: roomName });
    const requesting: TerminalRequestingMemory = {};
    _.forEach(roomDeals, (deal) => {
      // Only request game resources (not account resources)
      switch (deal.resourceType) {
        case SUBSCRIPTION_TOKEN:
        case CPU_UNLOCK:
        case PIXEL:
        case ACCESS_KEY:
          return;
      }
      let resourceAmount = requesting[deal.resourceType] || 0;
      resourceAmount += deal.remainingAmount;
      requesting[deal.resourceType] = resourceAmount;
    });
    return requesting;
  }

  requestExcessResources(): void {
    const storage = this.terminal.room.storage;
    if (storage == undefined) {
      return;
    }
    const storageResources = Object.keys(storage.store) as ResourceConstant[];
    const excessResources: TerminalRequestingMemory = {};
    storageResources.forEach((resource) => {
      const amount =
        storage.store[resource] -
        100000 -
        this.info.getRequestedAmount(resource);
      if (amount > 0) {
        excessResources[resource] = amount;
      }
    });
    this.info.updateRequestedResources(excessResources);
  }
}
