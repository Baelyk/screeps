import { ManageRoom, ManageSpawns, Construct } from "./../process";
import { info, warn } from "./../utils/logger";
import { textLines, progressBar, box, interpolateColors } from "./utils";

export function manageRoomProvider(this: Readonly<ManageRoom>): boolean {
	const lines = [];
	lines.push(`Room ${this.roomName}`);

	const controller = this.room.controller;
	if (this.room.controller != null) {
		const progress = Math.floor(
			(100 * this.room.controller.progress) /
				this.room.controller.progressTotal,
		);
		progressBar(
			this.room.visual,
			progress / 100,
			`Level 5: ${progress}%`,
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

	lines.push(`Energy: ${Math.floor(this.energyAvailable / 1000)}k`);

	textLines(this.room.visual, lines, 0, 1);

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
			interpolateColors("#00ff00", "#ff0000", s.hits / s.hitsMax),
		);
	});

	if (this.repairers.size > 0 && this.repairables.length > 0) {
		const target = this.repairables[0];
		box(this.room.visual, target.pos.x, target.pos.y, 1, 1, "black", {
			lineStyle: "dashed",
		});
	}

	textLines(this.room.visual, lines, 0, 5);
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

	textLines(this.room.visual, lines, 0, 6);

	return true;
}
