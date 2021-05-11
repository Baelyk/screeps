import { info, warn } from "utils/logger";
import { VisibleRoom } from "roomMemory";

export function debugLoop(): void {
  if (Memory.debug.resetRoomMemory) {
    resetRoomMemory();
    Memory.debug.resetRoomMemory = false;
  }
}

function resetRoomMemory(): void {
  warn("Resetting room memory");
  for (const roomName in Game.rooms) {
    const room = new VisibleRoom(roomName);
    room.updateMemory();
  }
}

export function debugEnergyHarvested(): void {
  // Only print harvest statistics in harvestStats flag is true
  if (!Memory.debug.harvestStats) return;

  // If energyharvested is undefined for some reason, initialize it
  if (Memory.debug.energyHarvested == undefined) {
    Memory.debug.energyHarvested = { startTick: Game.time, amount: 0 };
  }
  // Every 10 ticks, print harvested energy stats
  if (Game.time % 10 === 0) {
    const { startTick, amount } = Memory.debug.energyHarvested;
    const ticks = Game.time - startTick + 1;
    // Round per tick amount to 2 decimal places
    const perTick = Math.round((amount / ticks) * 100) / 100;
    info(
      `Harvesting ${perTick} / t (${amount} total in ${ticks} t since ${startTick})`,
    );
  }
  // Note about statistics:
  // Sources have 3000 energy and regenerate every 300 ticks. Therefore, I want
  // to harvest as close to 10 energy / tick / source as possible.
}

export function debugPostLoop(): void {
  // Debug testing for energy harvested
  debugEnergyHarvested();

  // Warn if more than 5 CPU used during this tick
  const cpuUsed = Game.cpu.getUsed();
  if (cpuUsed >= 5) {
    warn(`Used ${cpuUsed} cpu`);
  }
}

export function roomDebugLoop(room: VisibleRoom): void {
  if (room.getDebugFlag("removeConstructionSites")) {
    room.removeAllConstructionSites();
    room.removeDebugFlag("removeConstructionSites");
  }
  if (room.getDebugFlag("resetConstructionSites")) {
    room.updateConstructionQueue();
    room.removeDebugFlag("resetConstructionSites");
  }
}
