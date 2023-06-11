import { errorConstant } from "./../utils/logger";
import { IMessage, MessageId } from "./../messenger";
import { nextAvailableName } from "./../utils";
import {
	reassignCreep,
	ProcessData,
	ProcessId,
	RoomProcess,
	ProcessConstructors,
} from "./../process";
import { genericBody } from "./../creeps/bodies";

interface ICreepSpawned {
	requester: MessageId;
	creepName: string | null;
	requestId: MessageId;
}

export class CreepSpawned implements IMessage, ICreepSpawned {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;

	requester: MessageId;
	creepName: string | null;
	requestId: MessageId;

	constructor(
		from: ProcessId,
		to: ProcessId,
		creepName: string | null,
		requestId: MessageId,
	) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;

		this.requester = to;
		this.creepName = creepName;
		this.requestId = requestId;
	}
}

export class SpawnRequest implements IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;

	creepName: string;
	body: BodyPartConstant[] | ((energy: number) => BodyPartConstant[]) | null;
	important: boolean;

	constructor(
		from: ProcessId,
		to: ProcessId,
		creepName: string,
		body?: BodyPartConstant[] | ((energy: number) => BodyPartConstant[]),
		important?: boolean,
	) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;

		this.creepName = creepName;
		this.body = body || null;
		this.important = important || false;
	}
}

export class UpdateManageSpawnsId implements IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;

	manageSpawnsId: ProcessId | null;

	constructor(
		from: ProcessId,
		to: ProcessId,
		manageSpawnsId: ProcessId | null,
	) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;

		this.manageSpawnsId = manageSpawnsId;
	}
}

type ManageSpawnsQueueItem = [
	string,
	BodyPartConstant[],
	{ id: MessageId; from: ProcessId } | null,
];

export class ManageSpawns extends RoomProcess {
	outbox: ICreepSpawned[];
	queue: ManageSpawnsQueueItem[];

	constructor({
		outbox,
		queue,
		...data
	}: Omit<ProcessData<typeof RoomProcess>, "name"> & {
		outbox?: ICreepSpawned[];
		queue?: ManageSpawnsQueueItem[];
	}) {
		super({ name: "ManageSpawns", ...data });
		this.generator = this.manageSpawns();

		this.outbox = outbox || [];
		this.queue = queue || [];

		if (this.room == null) {
			throw new Error("Room not visible");
		}
	}

	flushQueue(): void {
		this.warn("Flushing queue");
		for (const [_, __, request] of this.queue) {
			if (request != null) {
				this.outbox.push({
					requester: request.from,
					creepName: null,
					requestId: request.id,
				});
			}
		}
		this.queue = [];
	}

	*manageSpawns() {
		const processOutbox = this.processOutbox();
		const spawnCreeps = this.spawnCreeps();
		while (true) {
			processOutbox.next();
			spawnCreeps.next();
			yield;
		}
	}

	*processOutbox() {
		while (true) {
			if (this.outbox.length === 0) {
				yield;
				continue;
			}

			for (const { requester, creepName, requestId } of this.outbox) {
				const message = new CreepSpawned(
					this.id,
					requester,
					creepName,
					requestId,
				);
				this.debug(JSON.stringify(message));
				global.kernel.sendMessage(message);
			}

			this.outbox = [];
		}
	}

	*spawnCreeps() {
		while (true) {
			while (this.queue.length === 0) {
				// Nothing to do
				yield;
			}

			const spawns = this.room.find(FIND_MY_SPAWNS);
			for (const spawn of spawns) {
				if (this.queue.length === 0) {
					break;
				}
				if (spawn.spawning != null) {
					continue;
				}

				// Get the first queue item. Get again from the top, in case priorities
				// have changed.
				const [creepName, body, message] = this.queue[0];
				const spawnedName = nextAvailableName(creepName);
				const response = spawn.spawnCreep(body, spawnedName);
				this.debug(
					`Spawn ${spawn.name} spawning ${creepName} in ${
						this.room.name
					} with response ${errorConstant(response)}`,
				);

				// Unable to spawn this creep, done for this tick.
				// TODO: Consider moving on the next in the queue?
				if (response !== OK) {
					break;
				}

				// Creep spawning, message requester and remove from queue.
				if (message != null) {
					// TODO: Send message on delay?
					this.outbox.push({
						requester: message.from,
						creepName: spawnedName,
						requestId: message.id,
					});
				}
				this.queue.shift();
			}

			yield;
		}
	}

	receiveMessage(message: IMessage): void {
		if (message instanceof SpawnRequest) {
			this.debug(`Received spawn request ${JSON.stringify(message)}`);
			let body = message.body;
			if (body == null) {
				body = genericBody(this.room.energyCapacityAvailable);
			} else if (typeof body === "function") {
				body = body(this.room.energyCapacityAvailable);
			}
			if (message.important) {
				this.queue.unshift([message.creepName, body, message]);
			} else {
				this.queue.push([message.creepName, body, message]);
			}
		} else {
			super.receiveMessage(message);
		}
	}
}
ProcessConstructors.set("ManageSpawns", ManageSpawns);
