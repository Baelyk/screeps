import { TerminalInfo } from "terminalMemory";
import { VisibleRoom } from "roomMemory";
import { info, warn, errorConstant } from "utils/logger";
import { LogisticsInfo, LogisticsRequest } from "logistics";

export function terminalManager(room: VisibleRoom): void {
  const terminal = room.getRoom().terminal;
  if (terminal == undefined) {
    return;
  }
  const terminalBehavior = new TerminalBehavior(terminal);
  terminalBehavior.requestExcessResources();
  terminalBehavior.manageLogisticsRequests();

  if (terminal.store[RESOURCE_ENERGY] !== 0) {
    const resources = Object.keys(terminal.store) as ResourceConstant[];
    resources.forEach((resource) => {
      if (resource !== RESOURCE_ENERGY) {
        terminalBehavior.sellResource(resource);
      }
    });
  }
}

export class TerminalBehavior {
  terminal: StructureTerminal;
  info: TerminalInfo;

  constructor(terminal: StructureTerminal) {
    this.terminal = terminal;
    this.info = new TerminalInfo(terminal.room.name);
  }

  requestExcessResources(): void {
    const storage = this.terminal.room.storage;
    if (storage == undefined) {
      return;
    }
    const storageResources = Object.keys(storage.store) as ResourceConstant[];
    const requests: string[] = [];
    storageResources.forEach((resource) => {
      const amount = storage.store[resource] - 100000;
      if (amount > 0) {
        const request = new LogisticsRequest(
          this.terminal.id,
          resource,
          this.terminal.store[resource] + amount,
          storage.id,
        );
        const logistics = new LogisticsInfo(this.terminal.room.name);
        const key = logistics.addUnique(request, "replace");
        requests.push(key);
      }
    });
    this.info.updateRequests(requests);
  }

  manageLogisticsRequests(): void {
    const requests = this.info.getLogisticsRequests();
    const logistics = new LogisticsInfo(this.terminal.room.name);
    const keptRequests = requests.filter((requestKey) => {
      // Returns true to keep the request, false to remove it
      try {
        const request = logistics.get(requestKey);
        // Remove the logistics request if the request is satisfied
        if (this.terminal.store[request.resource] === request.amount) {
          logistics.remove(requestKey);
          return false;
        }
      } catch (error) {
        warn(
          `Terminal ${this.terminal.room.name} unable to manage request ${requestKey}`,
        );
      }
      return true;
    });
    this.info.updateRequests(keptRequests, "reset");
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
      amount = Math.min(
        this.terminal.store[resource],
        this.maxAmountToSell(
          energyStored,
          Game.map.getRoomLinearDistance(this.info.roomName, order.roomName),
          resource === RESOURCE_ENERGY,
        ),
      );
    }
    const response = Game.market.deal(order.id, amount, this.info.roomName);
    info(
      `Selling ${amount} ${resource} to ${order.id}: ${errorConstant(
        response,
      )}`,
    );
  }
}
