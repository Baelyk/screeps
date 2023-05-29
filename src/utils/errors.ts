import { ErrorMapper } from "utils/ErrorMapper";
import * as logger from "utils/logger";

declare const enum ErrorType {
	default = "",
}

export class ScriptError extends Error {
	type: ErrorType = ErrorType.default;
	displayName = "Error";

	constructor(message: string, type?: ErrorType) {
		super(message);
		if (type != undefined) {
			this.type = type;
		}
		this.displayName = this.constructor.name;
	}

	toString(): string {
		const typeDisplay =
			this.type !== ErrorType.default ? `[${this.type}] ` : "";
		return `[${this.displayName}] ${typeDisplay}${this.message}`;
	}
}

function displayError(error: Error): string {
	return decodeURI(ErrorMapper.sourceMappedStackTrace(error));
}

/** The name (or constant name) of any game object that has an id. */
type GameObjectWithId =
	| StructureConstant
	| "construction site"
	| "creep"
	| "deposit"
	| "mineral"
	| "nuke"
	| "power creep"
	| "resource"
	| "ruin"
	| "source"
	| "tombstone";
export class GetByIdError extends ScriptError {
	constructor(
		object: Id<_HasId> | string,
		objectType?: GameObjectWithId,
		message?: string,
	) {
		let msg = `Could not get ${objectType || "object"} by id: ${object}`;
		// If a message was supplied, add that to the end of the new message
		if (message !== undefined) msg += "\n" + message;

		super(msg);
	}
}

export class MemoryError extends ScriptError {
	constructor(message: string) {
		let msg = `Invalid memory entry`;
		// If a message was supplied, add that to the end of the new message
		if (message !== undefined) msg += "\n" + message;

		super(msg);
	}
}

export class GetPositionError extends ScriptError {
	constructor(
		pos: { x: number; y: number; roomName?: string },
		message?: string,
	) {
		let msg = `Unable to get position (${pos.x}, ${pos.y}) in ${
			pos.roomName ? `room ${pos.roomName}` : "unknown room"
		}`;
		// If a message was supplied, add that to the end of the new message
		if (message !== undefined) msg += "\n" + message;

		super(msg);
	}
}

export class RoomMemoryError extends MemoryError {
	constructor(room: Room, invalidField: keyof RoomMemory, message?: string) {
		let msg = `Room ${room.name} has invalid memory field ${invalidField}`;
		// If a message was supplied, add that to the end of the new message
		if (message !== undefined) msg += "\n" + message;

		super(msg);
	}
}

export class SpawnMemoryError extends MemoryError {
	constructor(
		spawn: StructureSpawn,
		invalidField: keyof SpawnMemory,
		message?: string,
	) {
		let msg = `Spawn ${spawn.name} has invalid memory field ${invalidField}`;
		// If a message was supplied, add that to the end of the new message
		if (message !== undefined) msg += "\n" + message;

		super(msg);
	}
}

/**
 * A wrapper around a function that may throw an error.
 *
 * @param {() => void} fn The function to wrap
 * @param {string} [message] A message to log before the error trace
 * @param {() => void} [final] A function to execute after fn regardless of
 *   whether an error was thrown.
 */
export function wrapper<T>(
	fn: () => T,
	message?: string,
	onError?: () => T,
	final?: () => void,
): T | void {
	try {
		return fn();
	} catch (e) {
		const error = e as Error;
		logger.error((message ? message + "\n" : "") + displayError(error));
		if (onError != null) return onError();
	} finally {
		if (final != null) final();
	}
}

/**
 * Tries to call a function and return it's value. If the function produces a
 * result, returns that result. If the function throws an error, returns the fail result.
 *
 * @param {() => A} fn The function to call
 * @param {B} failValue The value to return if the function throws an error
 * @returns {A | B} The return value of the function or the provided fail value
 */
export function tryFn<A, B>(fn: () => A, failValue: B): A | B {
	try {
		return fn();
	} catch (_) {
		return failValue;
	}
}
