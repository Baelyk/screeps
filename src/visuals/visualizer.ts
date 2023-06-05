import { wrapper } from "./../utils/errors";
import { IMessage } from "./../messenger";
import {
	Process,
	ProcessData,
	ProcessConstructors,
	RoomProcess,
	ProcessId,
} from "./../process";
import { info, warn } from "./../utils/logger";
import {
	BoundVisualProvider,
	RequestVisualConnection,
	UnboundVisualProvider,
	VisualConnection,
} from "./connection";
import * as Providers from "./providers";

export class Visualizer extends Process {
	providers: Map<BoundVisualProvider, ProcessId | string>;

	constructor(data: Omit<ProcessData<typeof Process>, "name">) {
		super({ name: "Visualizer", ...data });
		this.providers = new Map();
		this.generator = this.visualizer();
	}

	getNewProviders(): void {
		const provided = new Set(this.providers.values());
		for (const roomName in Game.rooms) {
			if (
				!provided.has(roomName) &&
				(Game.rooms[roomName].controller?.my ||
					Game.rooms[roomName].controller?.reservation?.username ===
						global.USERNAME)
			) {
				this.providers.set(Providers.roomStats(roomName), roomName);
			}

			// Get saved RoomProcesses
			const processes = Memory.rooms[roomName]?.processes || {};
			for (const processName in processes) {
				const processId = processes[processName];
				if (processId == null || provided.has(processId)) {
					continue;
				}

				const provider = Providers.RoomProcessProviders.get(processName);
				if (provider != null) {
					global.kernel.sendMessage(
						new RequestVisualConnection(
							this.id,
							processId,
							provider as UnboundVisualProvider<RoomProcess>,
						),
					);
				}
			}
		}
	}

	init(): void {
		this.getNewProviders();
	}

	*visualizer() {
		while (true) {
			// Look for new providers
			if (Game.time % 100 === 0) {
				this.getNewProviders();
			}

			for (const [provider, id] of this.providers) {
				wrapper(() => {
					const status = provider.next();
					if (status.done) {
						info(
							`A provider for ${id} has finished with ${JSON.stringify(
								status,
							)}`,
						);
						this.providers.delete(provider);
					}
				}, `An error occured while running a provider for ${id}`);
			}
			yield;
		}
	}

	receiveMessage(message: IMessage): void {
		if (message instanceof RequestVisualConnection) {
			warn("Received erroneous visual connection request");
			return;
		} else if (message instanceof VisualConnection) {
			this.providers.set(message.provider, message.from);
			return;
		}
		super.receiveMessage(message);
	}
}
ProcessConstructors.set("Visualizer", Visualizer);
