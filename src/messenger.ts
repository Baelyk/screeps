import { ProcessId } from "./process";
import { error } from "./utils/logger";

export type MessageId = number;

// I don't want this to be a union of private, public messages so that messages
// can implement IMessage
export interface IMessage {
	id: MessageId;
	from: ProcessId;
	to?: ProcessId;
}

export interface IPrivateMessage extends IMessage {
	to: ProcessId;
}

export interface IPublicMessage extends IMessage {
	to: undefined;
}

export class Messenger {
	/** Counter for next MessageId */
	private nextMessageId: MessageId;
	/** Map from recipient process to message */
	private messages: Map<ProcessId, IPrivateMessage[]>;
	/** Map from message id to message, for public messages */
	private publicMessages: Map<MessageId, IPublicMessage>;

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
		this.publicMessages = new Map();
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
		// TODO: Some way to get this to work as a type guard?
		if (message.to == null) {
			// Public message
			this.publicMessages.set(message.id, message as IPublicMessage);
		} else {
			// Private message
			const recipient = message.to;
			const messages = this.messages.get(recipient) || [];
			messages.push(message as IPrivateMessage);
			this.messages.set(recipient, messages);
		}
	}

	/**
	 * Logs a public message with the Messenger.
	 *
	 * @param message The public message as an `IPublicMessage`
	 */
	sendPublicMessage(message: IPublicMessage): void {
		this.publicMessages.set(message.id, message);
	}

	/**
	 * Removes a public message from the Messenger.
	 *
	 * @param messageId The public message id
	 */
	removePublicMessage(messageId: MessageId): void {
		this.publicMessages.delete(messageId);
	}

	/**
	 * Gets the list of public messages.
	 */
	getPublicMessages(): IPublicMessage[] {
		return Array.from(this.publicMessages.values());
	}
}
