import { ManageRoom, ManageSpawns } from "./../process";
import { info, warn } from "./../utils/logger";
import { textLines, progressBar } from "./utils";

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

	textLines(this.room.visual, lines, 0, 5);

	return true;
}
