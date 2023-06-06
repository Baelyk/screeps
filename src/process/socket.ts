import { IMessage, MessageId } from "./../messenger";
import { Process, ProcessConstructors, ProcessData } from "./index";

// rome-ignore lint/suspicious/noExplicitAny: Some sort of constructor of `IMessage`s
type MessageConstructor<T> = new (...args: any[]) => T;
export class Socket<T = IMessage> extends Process {
	static send<T = IMessage>(
		message: IMessage,
		messageType: MessageConstructor<T>,
	): Socket<T> {
		// Replace the message sender with the socket
		const socket = new Socket({ messageType });
		message.from = socket.id;
		// Send the message
		global.kernel.sendMessage(message);

		return socket;
	}

	messageType: MessageConstructor<T>;
	message: T | undefined;
	generator: Generator<void, T, void>;

	constructor({
		messageType,
		...data
	}: Omit<ProcessData<typeof Process>, "name"> & {
		messageType: MessageConstructor<T>;
	}) {
		super({
			name: "Socket",
			...data,
		});
		this.generator = this.socket();

		this.messageType = messageType;
	}

	display(): string {
		return `${this.id} ${this.name} for ${this.messageType?.prototype?.name}`;
	}

	*socket(): Generator<void, T, void> {
		while (this.message == null) {
			this.info("Awaiting message");

			// TODO: This is here until we improve yield*ing to a process
			const messages = global.kernel.pollMessages(this.id);
			if (messages != null) {
				for (const message of messages) {
					this.receiveMessage(message);
				}
			}
			yield;
		}
		return this.message;
	}

	[Symbol.iterator](): Generator<void, T, void> {
		if (this.generator == null) {
			throw new Error("Iterating through Generatorless Process");
		}
		return this.generator;
	}

	receiveMessage(message: IMessage): void {
		if (message instanceof this.messageType) {
			this.debug(
				`Socket received message of desired type ${this.messageType?.prototype?.name}`,
			);
			this.message = message;
		} else {
			super.receiveMessage(message);
		}
	}
}
ProcessConstructors.set("Socket", Socket);
