import { ProcessId } from "./process";
import { error } from "./utils/logger";

export type MessageId = number;

export interface IMessage {
	id: MessageId;
	from: ProcessId;
	to: ProcessId;
}

export class Messenger {
	/** Counter for next MessageId */
	private nextMessageId: MessageId;
	/** Map from recipient process to message */
	private messages: Map<ProcessId, IMessage[]>;

	/**
	 * Creates a new Messenger from a serialization of a Messenger.
	 *
	 * @param serialized The serialization of a Messenger.
	 * @returns A Messenger with the serialized data, or a new Messenger if the
	 * deserialization failed.
	 */
	static fromSerialized(serialized: string): Messenger {
		try {
			const data = JSON.parse(serialized);
			return new Messenger(data);
		} catch (err) {
			error(`Error deserializing Messenger:\n${err}`);
			return new Messenger({});
		}
	}

	constructor({ nextMessageId }: { nextMessageId?: MessageId }) {
		this.nextMessageId = nextMessageId || 0;
		this.messages = new Map();
	}

	/**
	 * Gets a serialization of this Messenger. Note: Messages are *not*
	 * serialized, and will be lost!
	 * @returns A string serialization of this Messenger.
	 */
	serialize(): string {
		const data: ConstructorParameters<typeof Messenger>[0] = {
			nextMessageId: this.nextMessageId,
		};
		return JSON.stringify(data);
	}

	/**
	 * Gets a new unique MessageId.
	 * @returns A new MessageId
	 */
	getNextMessageId(): MessageId {
		return this.nextMessageId++;
	}

	/**
	 * Checks if Messenger has messages for recipient process, and if so removes
	 * and returns them.
	 *
	 * @param recipient The `ProcessId` of the recipient process
	 * @returns The messages as an `IMessage[]`, others `null` if there were none
	 */
	poll(recipient: ProcessId): IMessage[] | null {
		const messages = this.messages.get(recipient);
		if (messages != null) {
			this.messages.delete(recipient);
		}
		return messages || null;
	}

	/**
	 * Logs a message with the Messenger.
	 *
	 * @param message The message as an `IMessage`
	 */
	send(message: IMessage): void {
		const recipient = message.to;
		const messages = this.messages.get(recipient) || [];
		messages.push(message);
		this.messages.set(recipient, messages);
	}
}
