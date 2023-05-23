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

		this.init();
	}

	init() {
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