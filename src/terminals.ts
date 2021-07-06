import { TerminalInfo, TerminalRequestingMemory } from "terminalMemory";
import { VisibleRoom } from "roomMemory";

export function terminalBehavior(terminal: StructureTerminal): void {
  const info = new TerminalInfo(terminal.room.name);
}

function getRequestsForDeals(roomName: string): TerminalRequestingMemory {
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
