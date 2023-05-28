import { IMessage, MessageId } from "./../messenger";
import { ProcessId, Process } from "./../process";

export type UnboundVisualProvider<T extends Process> = (
	process: Readonly<T>,
) => Generator;
export type BoundVisualProvider = Generator;

export class RequestVisualConnection<T extends Process> implements IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;

	provider: UnboundVisualProvider<T>;

	constructor(
		from: ProcessId,
		to: ProcessId,
		provider: UnboundVisualProvider<T>,
	) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;
		this.provider = provider;
	}

	accept(process: T): void {
		const connection = new VisualConnection(
			this.to,
			this.from,
			this.provider(process),
		);
		global.kernel.sendMessage(connection);
	}
}

export class VisualConnection implements IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;

	provider: BoundVisualProvider;

	constructor(from: ProcessId, to: ProcessId, provider: BoundVisualProvider) {
		this.id = global.kernel.getNextMessageId();
		this.from = from;
		this.to = to;
		this.provider = provider;
	}
}
