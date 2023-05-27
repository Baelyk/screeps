import { IMessage } from "./../messenger";
import { Process, ProcessData, ProcessConstructors } from "./../process";
import { info, warn } from "./../utils/logger";
import {
	BoundVisualProvider,
	RequestVisualConnection,
	VisualConnection,
} from "./connection";
import * as Providers from "./providers";

export class Visualizer extends Process {
	providers: Map<BoundVisualProvider, true>;

	constructor(data: Omit<ProcessData<typeof Process>, "name">) {
		super({ name: "Visualizer", ...data });
		this.providers = new Map();
		this.generator = this.visualizer();
	}

	init(): void {
		for (const roomName in Memory.rooms) {
			const processes = Memory.rooms[roomName].processes;
			if (processes == null) {
				continue;
			}
			const manageRoomId = processes["ManageRoom"];
			if (manageRoomId != null) {
				global.kernel.sendMessage(
					new RequestVisualConnection(
						this.id,
						manageRoomId,
						Providers.manageRoomProvider,
					),
				);
			}
			const economyId = processes["Economy"];
			if (economyId != null) {
				global.kernel.sendMessage(
					new RequestVisualConnection(
						this.id,
						economyId,
						Providers.economyProvider,
					),
				);
			}
			const constructId = processes["Construct"];
			if (constructId != null) {
				global.kernel.sendMessage(
					new RequestVisualConnection(
						this.id,
						constructId,
						Providers.constructProvider,
					),
				);
			}
			const manageSpawnsId = processes["ManageSpawns"];
			if (manageSpawnsId != null) {
				global.kernel.sendMessage(
					new RequestVisualConnection(
						this.id,
						manageSpawnsId,
						Providers.manageSpawnsProvider,
					),
				);
			}
			const roomPlannerId = processes["RoomPlanner"];
			if (roomPlannerId != null) {
				global.kernel.sendMessage(
					new RequestVisualConnection(
						this.id,
						roomPlannerId,
						Providers.roomPlannerProvider,
					),
				);
			}
		}
	}

	*visualizer() {
		while (true) {
			for (const [provider, _] of this.providers) {
				const shouldContinue = provider();
				if (!shouldContinue) {
					this.providers.delete(provider);
				}
			}
			yield;
		}
	}

	receiveMessage(message: IMessage): void {
		if (message instanceof RequestVisualConnection) {
			warn("Received erroneous visual connection request");
			return;
		} else if (message instanceof VisualConnection) {
			this.providers.set(message.provider, true);
			return;
		}
		super.receiveMessage(message);
	}
}
ProcessConstructors.set("Visualizer", Visualizer);
