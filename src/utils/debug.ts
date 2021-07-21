import { info, warn } from "utils/logger";
import { VisibleRoom } from "roomMemory";
import { Graph } from "classes/graph";
import { RoomPlanner } from "classes/roomPlanner";

export function debugLoop(): void {
  if (Memory.debug.resetRoomMemory) {
    Memory.debug.resetRoomMemory = false;
    resetRoomMemory();
  }
}

function resetRoomMemory(): void {
  warn("Resetting room memory");
  for (const roomName in Game.rooms) {
    const room = new VisibleRoom(roomName);
    room.setDebugFlag("resetRoomMemory");
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
  const pop = _.keys(Game.creeps).length;
  const cpuUsed = Game.cpu.getUsed();
  warn(`Used ${Math.round(cpuUsed * 100) / 100} cpu with ${pop} creeps`);
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
  if (room.getDebugFlag("resetPopLimits")) {
    room.updatePopulationLimitMemory();
    room.removeDebugFlag("resetPopLimits");
  }
  if (room.getDebugFlag("resetPlan")) {
    room.updatePlannerMemory();
    room.removeDebugFlag("resetPlan");
  }
  if (room.getDebugFlag("executePlan")) {
    room.executePlan();
    room.removeDebugFlag("executePlan");
  }
  if (room.getDebugFlag("resetRoomMemory")) {
    room.updateMemory();
    room.removeDebugFlag("resetRoomMemory");
  }
  if (room.getDebugFlag("showPlan")) {
    room.showPlan();
  }
}

export function debugPlannerTesting(): void {
  info(`Testing planner`);
  let roomName = "sim";
  if (Game.rooms[roomName] == undefined) {
    roomName = "E14N43";
  }
  if (Memory.rooms[roomName].planner == undefined) {
    const room = new VisibleRoom(roomName);
    room.updatePlannerMemory();
  } else {
    const visual = Game.rooms[roomName].visual;
    _.forEach(Memory.rooms[roomName]!.planner!.plan, (value, key) => {
      if (key !== "occupied") {
        let char = "?";
        let array = [];
        if (key === "spawn") {
          char = "H";
        } else if (key === "storage") {
          char = "O";
        } else if (key === "sourceContainers") {
          char = "C";
        } else if (key === "towers") {
          char = "T";
        } else if (key === "links") {
          char = "L";
        } else if (key === "roads") {
          char = "+";
          value = _.flatten(value);
        } else if (key === "walls") {
          char = "W";
        } else if (key === "ramparts") {
          char = "R";
        } else if (key === "extensions") {
          char = "E";
        }
        if (!Array.isArray(value)) {
          array = [value];
        } else {
          array = value;
        }
        _.forEach(array, (spot) => {
          visual.text(char, spot % 50, Math.floor(spot / 50), {
            font: "1 monospace",
            backgroundColor: "black",
            backgroundPadding: 0,
            opacity: 0.75,
          });
        });
      } else {
        _.forEach(value, (spot) => {
          visual.circle(spot % 50, Math.floor(spot / 50), { radius: 0.5 });
        });
      }
    });
    if (Memory.debug.visual != undefined) {
      visual.import(Memory.debug.visual);
    }
  }
}
