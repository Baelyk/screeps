import { ManageRoom, ManageSpawns, Construct, Economy } from "./../rooms";
import { debug } from "./../utils/logger";
import {
	textLines,
	progressBar,
	box,
	interpolateColors,
	displayPerTick,
} from "./utils";
import { RoomPlanner } from "./../planner";
import { UnboundVisualProvider } from "./connection";
import { ProcessName } from "./../process";
import * as Iterators from "./../utils/iterators";

declare global {
	interface SettingsMemory {
		/** Whether to visualize the RoomPlanner blueprint */
		showBlueprint?: boolean;
		/** How often room stats should be updated in ticks */
		statsUpdateRate?: number;
	}
}

export const RoomProcessProviders: Map<
	ProcessName,
	| UnboundVisualProvider<ManageRoom>
	| UnboundVisualProvider<ManageSpawns>
	| UnboundVisualProvider<Construct>
	| UnboundVisualProvider<Economy>
	| UnboundVisualProvider<RoomPlanner>
> = new Map();

RoomProcessProviders.set("ManageRoom", manageRoomProvider);
function* manageRoomProvider(manageRoom: Readonly<ManageRoom>) {
	while (global.kernel.hasProcess(manageRoom.id)) {
		const lines = [];
		lines.push(`Room ${manageRoom.roomName}`);

		if (manageRoom.room.controller != null) {
			const progress = Math.floor(
				(100 * manageRoom.room.controller.progress) /
					manageRoom.room.controller.progressTotal,
			);
			progressBar(
				manageRoom.room.visual,
				progress / 100,
				`Level ${manageRoom.room.controller.level}`,
				0,
				lines.length,
				10,
			);
			lines.push("");
		}

		const spawnEnergy = Math.floor(
			(100 * manageRoom.room.energyAvailable) /
				manageRoom.room.energyCapacityAvailable,
		);
		progressBar(
			manageRoom.room.visual,
			spawnEnergy / 100,
			"Spawn energy:",
			0,
			lines.length,
			10,
		);
		lines.push("");

		textLines(manageRoom.room.visual, lines, 0, 1);

		// Show plan
		const blueprint = manageRoom.blueprint;
		if (Memory.settings?.showBlueprint && blueprint != null) {
			(blueprint.structures[STRUCTURE_CONTAINER] || []).forEach(({ x, y }) =>
				manageRoom.room.visual.circle(x, y, { fill: "yellow" }),
			);
			(blueprint.structures[STRUCTURE_EXTENSION] || []).forEach(({ x, y }) =>
				manageRoom.room.visual.circle(x, y, { fill: "green" }),
			);
			(blueprint.structures[STRUCTURE_ROAD] || []).forEach(({ x, y }) =>
				manageRoom.room.visual.circle(x, y),
			);
			(blueprint.structures[STRUCTURE_SPAWN] || []).forEach(({ x, y }) =>
				manageRoom.room.visual.circle(x, y, { fill: "red" }),
			);
			(blueprint.structures[STRUCTURE_STORAGE] || []).forEach(({ x, y }) =>
				manageRoom.room.visual.circle(x, y, { fill: "orange" }),
			);
			(blueprint.structures[STRUCTURE_TOWER] || []).forEach(({ x, y }) =>
				manageRoom.room.visual.circle(x, y, { fill: "purple" }),
			);
			(blueprint.structures[STRUCTURE_LINK] || []).forEach(({ x, y }) =>
				manageRoom.room.visual.circle(x, y, { fill: "blue" }),
			);
		}

		yield;
	}
}

export function* roomStats(roomName: string) {
	const room = Game.rooms[roomName];
	if (room == null) {
		return;
	}

	const numSources = room.find(FIND_SOURCES).length;
	let ticksSoFar = 0;
	const historyLength = CREEP_LIFE_TIME * 10;
	const built: number[] = [];
	const repaired: number[] = [];
	const spawned: number[] = [];
	const upgraded: number[] = [];
	const harvested: number[] = [];
	let builtTotal = 0;
	let repairedTotal = 0;
	let spawnedTotal = 0;
	let upgradedTotal = 0;
	let harvestedTotal = 0;
	let usedTotal = 0;
	let builtPerTick = 0;
	let repairedPerTick = 0;
	let spawnedPerTick = 0;
	let upgradedPerTick = 0;
	let harvestedPerTick = 0;
	let harvestedEfficiency = 0;
	let usedPerTick = 0;

	while (true) {
		const start = Game.cpu.getUsed();
		const events = room.getEventLog();
		ticksSoFar = Math.min(historyLength, ticksSoFar + 1);

		// Track energy usage this tick
		let builtNow = 0;
		let repairedNow = 0;
		let spawnedNow = 0;
		let upgradedNow = 0;
		let harvestedNow = 0;
		for (const { event, data } of events) {
			if (event === EVENT_BUILD) {
				builtNow += data.amount;
			} else if (event === EVENT_REPAIR) {
				repairedNow += data.energySpent;
			} else if (
				event === EVENT_TRANSFER &&
				data.resourceType === RESOURCE_ENERGY
			) {
				const target = Game.getObjectById(
					data.targetId as Id<AnyStoreStructure>,
				);
				if (
					target != null &&
					(target.structureType === STRUCTURE_SPAWN ||
						target.structureType === STRUCTURE_EXTENSION)
				) {
					spawnedNow += data.amount;
				}
			} else if (event === EVENT_UPGRADE_CONTROLLER) {
				upgradedNow += data.energySpent;
			} else if (
				event === EVENT_HARVEST &&
				Game.getObjectById(
					data.targetId as Id<Source | Mineral | Deposit>,
				) instanceof Source
			) {
				harvestedNow += data.amount;
			}
		}

		// Throw out old usage data
		if (built.unshift(builtNow) > historyLength) {
			built.pop();
		}
		if (repaired.unshift(repairedNow) > historyLength) {
			repaired.pop();
		}
		if (spawned.unshift(spawnedNow) > historyLength) {
			spawned.pop();
		}
		if (upgraded.unshift(upgradedNow) > historyLength) {
			upgraded.pop();
		}
		if (harvested.unshift(harvestedNow) > historyLength) {
			harvested.pop();
		}

		// Update stats
		const statsUpdateRate = Memory.settings?.statsUpdateRate || 1;
		if (Game.time % statsUpdateRate === 0) {
			// Update totals
			builtTotal = Iterators.sum(built);
			repairedTotal = Iterators.sum(repaired);
			spawnedTotal = Iterators.sum(spawned);
			upgradedTotal = Iterators.sum(upgraded);
			harvestedTotal = Iterators.sum(harvested);
			usedTotal = builtTotal + repairedTotal + spawnedTotal + upgradedTotal;

			// Update tick counts
			builtPerTick = builtTotal / ticksSoFar;
			repairedPerTick = repairedTotal / ticksSoFar;
			spawnedPerTick = spawnedTotal / ticksSoFar;
			upgradedPerTick = upgradedTotal / ticksSoFar;
			harvestedPerTick = harvestedTotal / ticksSoFar;
			usedPerTick = usedTotal / ticksSoFar;

			// Update efficiencies
			harvestedEfficiency =
				harvestedTotal / (10 * numSources * harvested.length);
		}

		// Visualize stats
		const x = 0;
		const y = 3;
		progressBar(
			room.visual,
			builtTotal / usedTotal,
			`Built: ${displayPerTick(builtPerTick)}`,
			x,
			y,
			10,
		);
		progressBar(
			room.visual,
			repairedTotal / usedTotal,
			`Repaired: ${displayPerTick(repairedPerTick)}`,
			x,
			y + 1,
			10,
		);
		progressBar(
			room.visual,
			spawnedTotal / usedTotal,
			`Spawned: ${displayPerTick(spawnedPerTick)}`,
			x,
			y + 2,
			10,
		);
		progressBar(
			room.visual,
			upgradedTotal / usedTotal,
			`Upgraded: ${displayPerTick(upgradedPerTick)}`,
			x,
			y + 3,
			10,
		);
		progressBar(
			room.visual,
			usedTotal / harvestedTotal,
			`Usage: ${displayPerTick(usedPerTick)}`,
			x,
			y + 4,
			10,
		);
		progressBar(
			room.visual,
			harvestedEfficiency,
			`Harvested: ${displayPerTick(harvestedPerTick)}`,
			x,
			y + 5,
			10,
		);

		const elapsed = Game.cpu.getUsed() - start;
		debug(
			`Used ${
				Math.round(100 * elapsed) / 100
			} CPU calculating efficiencies (over ${harvested.length})`,
		);
		yield;
	}
}

RoomProcessProviders.set("Economy", economyProvider);
function* economyProvider(economy: Readonly<Economy>) {
	while (global.kernel.hasProcess(economy.id)) {
		const lines = [];

		lines.push(`Energy: ${Math.floor(economy.energyAvailable / 1000)}k`);

		textLines(economy.room.visual, lines, 0, 10);

		yield;
	}
}

RoomProcessProviders.set("Construct", constructProvider);
function* constructProvider(construct: Readonly<Construct>) {
	while (global.kernel.hasProcess(construct.id)) {
		const lines = [];

		const repairsNeeded = construct.repairables.reduce(
			(energy, s) => energy + s.hitsMax - s.hits,
			0,
		);
		lines.push(`Repairs: ${Math.ceil(repairsNeeded / 1000)}k`);

		// Show boxes around
		construct.repairables.forEach((s) => {
			box(
				construct.room.visual,
				s.pos.x,
				s.pos.y,
				1,
				1,
				interpolateColors("#ff0000", "#00ff00", s.hits / s.hitsMax),
			);
		});

		// Highlight urgent repair
		if (construct.urgentRepairs.length > 0) {
			const target = construct.urgentRepairs[0];
			if (target.hits < target.hitsMax * 0.25) {
				box(construct.room.visual, target.pos.x, target.pos.y, 1, 1, "black", {
					lineStyle: "dashed",
				});
			}
		}

		textLines(construct.room.visual, lines, 0, 11);

		yield;
	}
}

RoomProcessProviders.set("ManageSpawns", manageSpawnsProvider);
function* manageSpawnsProvider(manageSpawns: Readonly<ManageSpawns>) {
	while (global.kernel.hasProcess(manageSpawns.id)) {
		const lines = [];

		const spawning: Spawning[] = [];
		manageSpawns.room.find(FIND_STRUCTURES).forEach((s) => {
			if (s.structureType === STRUCTURE_SPAWN && s.spawning != null) {
				spawning.push(s.spawning);
			}
		});
		if (spawning.length > 0) {
			lines.push("Spawning");
			spawning.forEach(({ name, remainingTime }) =>
				lines.push(`\t${name} ${remainingTime}`),
			);
		}

		if (manageSpawns.queue.length === 0) {
			lines.push("Spawn queue empty");
		} else {
			lines.push("Spawn queue:");
			manageSpawns.queue.forEach((item) => lines.push(`\t${item[0]}`));
		}

		textLines(manageSpawns.room.visual, lines, 0, 12);

		yield;
	}
}

RoomProcessProviders.set("RoomPlanner", roomPlannerProvider);
function* roomPlannerProvider(roomPlanner: Readonly<RoomPlanner>) {
	while (global.kernel.hasProcess(roomPlanner.id)) {
		const lines = [];
		lines.push(`Planning room ${roomPlanner.roomName}`);

		textLines(roomPlanner.room.visual, lines, 10, 1);

		yield;
	}
}
