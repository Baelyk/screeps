import { ManageRoom, ManageSpawns, Construct, Economy } from "./../rooms";
import { info, warn } from "./../utils/logger";
import { textLines, progressBar, box, interpolateColors } from "./utils";
import { RoomPlanner } from "./../planner";

// Right now, the only provider that actually providing a useful connection to
// a process is the `manageSpawnsProvider`, providing access to the spawn queue.

declare global {
	interface Memory {
		settings?: { showBlueprint?: boolean };
	}
}

export function manageRoomProvider(this: Readonly<ManageRoom>): boolean {
	const lines = [];
	lines.push(`Room ${this.roomName}`);

	if (this.room.controller != null) {
		const progress = Math.floor(
			(100 * this.room.controller.progress) /
				this.room.controller.progressTotal,
		);
		progressBar(
			this.room.visual,
			progress / 100,
			`Level ${this.room.controller.level}: ${progress}%`,
			0,
			lines.length,
			10,
		);
		lines.push("");
	}

	const spawnEnergy = Math.floor(
		(100 * this.room.energyAvailable) / this.room.energyCapacityAvailable,
	);
	progressBar(
		this.room.visual,
		spawnEnergy / 100,
		`Spawn energy: ${spawnEnergy}%`,
		0,
		lines.length,
		10,
	);
	lines.push("");

	textLines(this.room.visual, lines, 0, 1);

	// Show plan
	const blueprint = this.blueprint;
	if (Memory.settings?.showBlueprint && blueprint != null) {
		(blueprint.structures[STRUCTURE_ROAD] || []).forEach(({ x, y }) =>
			this.room.visual.circle(x, y),
		);
		(blueprint.structures[STRUCTURE_CONTAINER] || []).forEach(({ x, y }) =>
			this.room.visual.circle(x, y, { fill: "yellow" }),
		);
		(blueprint.structures[STRUCTURE_SPAWN] || []).forEach(({ x, y }) =>
			this.room.visual.circle(x, y, { fill: "red" }),
		);
		(blueprint.structures[STRUCTURE_STORAGE] || []).forEach(({ x, y }) =>
			this.room.visual.circle(x, y, { fill: "orange" }),
		);
		(blueprint.structures[STRUCTURE_EXTENSION] || []).forEach(({ x, y }) =>
			this.room.visual.circle(x, y, { fill: "green" }),
		);
	}

	return true;
}

export function economyProvider(this: Readonly<Economy>): boolean {
	const lines = [];

	const upgradeEfficiency = Math.floor(100 * this.upgradeEfficiency);
	progressBar(
		this.room.visual,
		Math.min(1, upgradeEfficiency / 100),
		`Upgrade Eff: ${upgradeEfficiency < 999 ? upgradeEfficiency : ">999"}%`,
		0,
		lines.length + 3,
		10,
	);
	lines.push("");

	const useEfficiency = Math.floor(100 * this.useEfficiency);
	progressBar(
		this.room.visual,
		Math.min(1, useEfficiency / 100),
		`Use Eff: ${useEfficiency < 999 ? useEfficiency : ">999"}%`,
		0,
		lines.length + 3,
		10,
	);
	lines.push("");

	const harvestEfficiency = Math.floor(100 * this.harvestEfficiency);
	progressBar(
		this.room.visual,
		Math.min(1, harvestEfficiency / 100),
		`Harvest Eff: ${harvestEfficiency < 999 ? harvestEfficiency : ">999"}%`,
		0,
		lines.length + 3,
		10,
	);
	lines.push("");

	lines.push(`Energy: ${Math.floor(this.energyAvailable / 1000)}k`);

	textLines(this.room.visual, lines, 0, 4);

	return true;
}

export function constructProvider(this: Readonly<Construct>): boolean {
	const lines = [];

	const repairsNeeded = this.repairables.reduce(
		(energy, s) => energy + s.hitsMax - s.hits,
		0,
	);
	lines.push(`Repairs: ${Math.ceil(repairsNeeded / 1000)}k`);

	// Show boxes around
	this.repairables.forEach((s) => {
		box(
			this.room.visual,
			s.pos.x,
			s.pos.y,
			1,
			1,
			interpolateColors("#ff0000", "#00ff00", s.hits / s.hitsMax),
		);
	});

	// Highlight urgent repair
	if (this.repairers.size > 0 && this.repairables.length > 0) {
		const target = this.repairables[0];
		if (target.hits < target.hitsMax * 0.25) {
			box(this.room.visual, target.pos.x, target.pos.y, 1, 1, "black", {
				lineStyle: "dashed",
			});
		}
	}

	textLines(this.room.visual, lines, 0, 8);
	return true;
}

export function manageSpawnsProvider(this: Readonly<ManageSpawns>): boolean {
	const lines = [];

	const spawning: Spawning[] = [];
	this.room.find(FIND_STRUCTURES).forEach((s) => {
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

	if (this.queue.length === 0) {
		lines.push("Spawn queue empty");
	} else {
		lines.push("Spawn queue:");
		this.queue.forEach((item) => lines.push(`\t${item[0]}`));
	}

	textLines(this.room.visual, lines, 0, 9);

	return true;
}

export function roomPlannerProvider(this: Readonly<RoomPlanner>): boolean {
	const lines = [];
	lines.push(`Planning room ${this.roomName}`);

	textLines(this.room.visual, lines, 10, 1);

	return true;
}
