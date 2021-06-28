import { info, warn } from "utils/logger";
import { VisibleRoom } from "roomMemory";
import { Graph } from "classes/graph";
import { RoomPlanner } from "classes/roomPlanner";

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

  // Graph testing
  // debugGraphTesting();

  // Planner testing
  // debugPlannerTesting();

  // Warn if more than 5 CPU used during this tick
  const cpuUsed = Game.cpu.getUsed();
  if (cpuUsed >= 5) {
    const pop = _.keys(Game.creeps).length;
    warn(`Used ${Math.round(cpuUsed * 100) / 100} cpu with ${pop} creeps`);
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

function debugGraphTesting(): void {
  if (Memory.debug.distTran == undefined) {
    const room = Game.rooms["E15N41"];
    const walls: number[] = [];
    const exits: number[] = _.map(
      room.find(FIND_EXIT),
      (pos) => pos.x + pos.y * 50,
    );

    // Note: this does not get built walls
    const terrain = room.getTerrain();
    for (let i = 0; i < 50 * 50; i++) {
      const tile = terrain.get(i % 50, Math.floor(i / 50));
      if (tile === TERRAIN_MASK_WALL) {
        walls.push(i);
      }
    }

    const graph = new Graph(walls, exits);
    const distTran = graph.distanceTransform();
    const visual = new RoomVisual("E15N41");
    _.forEach(distTran, (dist, index) => {
      if (dist !== -1) {
        visual.text(dist.toString(), index % 50, Math.floor(index / 50));
      }
    });
    Memory.debug.distTran = visual.export();
  } else {
    // const visual = new RoomVisual("E15N41");
    // visual.import(Memory.debug.distTran);
  }
}

/**
 * Function debugPlannerTesting(): void { if (Memory.debug.plan == undefined) {
 * const planner = new RoomPlanner("E15N41"); planner.planRoom(); } else {
 * const visual = Game.rooms["E15N41"].visual; _.forEach(Memory.debug.plan,
 * (value, key) => { if (key !== "occupied") { let char = "?"; let array = [];
 * if (key === "spawnLocation") { char = "H"; } else if (key ===
 * "storageLocation") { char = "O"; } else if (key === "sourceContainers") {
 * char = "C"; } else if (key === "towerLocations") { char = "T"; } else if
 * (key === "linkLocation") { char = "L"; } else if (key === "roads") { char =
 * "+"; value = _.flatten(value); } else if (key === "extensionLocations") {
 * char = "E"; } if (!Array.isArray(value)) { array = [value]; } else { array =
 * value; } _.forEach(array, (spot) => { visual.text(char, spot % 50,
 * Math.floor(spot / 50), { font: "1 monospace", backgroundColor: "black",
 * backgroundPadding: 0, opacity: 0.75, }); }); } }); } }
 */
