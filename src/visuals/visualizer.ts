import { wrapper } from "./../utils/errors";
import { IMessage } from "./../messenger";
import {
	Process,
	ProcessData,
	ProcessConstructors,
	RoomProcess,
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
	providers: Map<BoundVisualProvider, null>;

	constructor(data: Omit<ProcessData<typeof Process>, "name">) {
		super({ name: "Visualizer", ...data });
		this.providers = new Map();
		this.generator = this.visualizer();
	}

	init(): void {
		for (const roomName in Game.rooms) {
			if (
				Game.rooms[roomName].controller?.my ||
				Game.rooms[roomName].controller?.reservation?.username ===
					global.USERNAME
			) {
				this.providers.set(Providers.roomStats(roomName), null);
			}

			// Get saved RoomProcesses
			const processes = Memory.rooms[roomName]?.processes || {};
			for (const processName in processes) {
				const processId = processes[processName];
				const provider = Providers.RoomProcessProviders.get(processName);
				if (processId != null && provider != null) {
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

	*visualizer() {
		while (true) {
			for (const [provider, _] of this.providers) {
				wrapper(() => {
					const status = provider.next();
					if (status.done) {
						info(`A provider has finished with ${JSON.stringify(status)}`);
						this.providers.delete(provider);
					}
				}, "An error occured while running a provider");
			}
			yield;
		}
	}

	receiveMessage(message: IMessage): void {
		if (message instanceof RequestVisualConnection) {
			warn("Received erroneous visual connection request");
			return;
		} else if (message instanceof VisualConnection) {
			this.providers.set(message.provider, null);
			return;
		}
		super.receiveMessage(message);
	}
}
ProcessConstructors.set("Visualizer", Visualizer);
