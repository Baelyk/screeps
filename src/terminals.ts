import { TerminalInfo, TerminalRequestingMemory } from "terminalMemory";
import { VisibleRoom } from "roomMemory";
import { info, errorConstant } from "utils/logger";

export function terminalManager(room: VisibleRoom): void {
  const terminal = room.getRoom().terminal;
  if (terminal == undefined) {
    return;
  }
  const terminalBehavior = new TerminalBehavior(terminal);
  terminalBehavior.requestExcessResources();
  const resources = Object.keys(terminal.store) as ResourceConstant[];
  resources.forEach((resource) => {
    terminalBehavior.sellResource(resource);
  });
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
      const amount = storage.store[resource] - 100000;
      if (amount > 0) {
        excessResources[resource] = amount;
      }
    });
    info(`requesting ${JSON.stringify(excessResources)}`);
    this.info.updateRequestedResources(excessResources, "override");
  }

  private calcPricePerOne(order: Order, energyPrice: number): number {
    const fee = order.roomName
      ? 1 *
        (1 -
          Math.exp(
            -Game.map.getRoomLinearDistance(
              this.info.roomName,
              order.roomName,
            ) / 30,
          ))
      : 0;
    const price = order.price;
    return price - fee * energyPrice;
  }

  private findEnergySellPrice(): [number, Order] {
    // Since finding the energy price, when calculating the price of an order,
    // energy has a cost of "1" since the fee is payed in energy.
    const orders = Game.market.getAllOrders({
      type: ORDER_BUY,
      resourceType: RESOURCE_ENERGY,
    });
    const order = _.max(
      orders,
      (order) => this.calcPricePerOne(order, 1),
      this,
    );
    info(`order ${order.id} ${order.price} ${order.roomName}`);
    return [this.calcPricePerOne(order, 1), order];
  }

  findBestSellDealFor(resource: ResourceConstant): Order | undefined {
    // Sell deal as in I want to sell the resource lol
    const orders = Game.market.getAllOrders({
      type: ORDER_BUY,
      resourceType: resource,
    });
    const [energyPrice] = this.findEnergySellPrice();
    const order = _.max(
      orders,
      (order) => this.calcPricePerOne(order, energyPrice),
      this,
    );

    info(
      `energy ${energyPrice} resource ${this.calcPricePerOne(
        order,
        energyPrice,
      )} ${order.id} ${order.roomName} ${order.price}`,
    );

    if (this.calcPricePerOne(order, energyPrice) >= energyPrice) {
      // If selling this resource makes as much or more credits as selling
      // energy, continue
      return order;
    }
    return undefined;
  }

  maxAmountToSell(energy: number, distance: number, isEnergy = false): number {
    const feeRate = 1 - Math.exp(-distance / 30);
    if (!isEnergy) {
      return Math.floor(energy / feeRate);
    } else {
      return Math.floor(energy / (1 + feeRate));
    }
  }

  sellResource(resource: ResourceConstant): void {
    info(`Trying to sell ${resource}`);
    const order = this.findBestSellDealFor(resource);
    if (order == undefined) {
      info(`No order found`);
      return;
    }
    const energyStored = this.terminal.store[RESOURCE_ENERGY];
    let amount = 0;
    if (order.roomName != undefined) {
      amount = this.maxAmountToSell(
        energyStored,
        Game.map.getRoomLinearDistance(this.info.roomName, order.roomName),
        resource === RESOURCE_ENERGY,
      );
    }
    const response = OK; // Game.market.deal(order.id, amount, this.info.roomName);
    info(
      `Selling ${amount} ${resource} to ${order.id}: ${errorConstant(
        response,
      )}`,
    );
  }
}
