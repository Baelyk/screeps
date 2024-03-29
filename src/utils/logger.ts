// Useful functions for producing user-readable output to the console

/**
 * Return the name of the error code, i.e. it's constant name
 *
 * @param error The error code
 * @returns The constant name of the error code, or an empty string if the
 *   error code does not exist
 */
export function errorConstant(error: ScreepsReturnCode): string {
	switch (error) {
		case OK:
			return "OK";
		case ERR_NOT_OWNER:
			return "ERR_NOT_OWNER";
		case ERR_NO_PATH:
			return "ERR_NO_PATH";
		case ERR_NAME_EXISTS:
			return "ERR_NAME_EXISTS";
		case ERR_BUSY:
			return "ERR_BUSY";
		case ERR_NOT_FOUND:
			return "ERR_NOT_FOUND ";
		case ERR_NOT_ENOUGH_RESOURCES:
			return "ERR_NOT_ENOUGH_RESOURCES";
		case ERR_NOT_ENOUGH_ENERGY:
			return "ERR_NOT_ENOUGH_ENERGY";
		case ERR_INVALID_TARGET:
			return "ERR_INVALID_TARGET";
		case ERR_FULL:
			return "ERR_FULL";
		case ERR_NOT_IN_RANGE:
			return "ERR_NOT_IN_RANGE";
		case ERR_INVALID_ARGS:
			return "ERR_INVALID_ARGS";
		case ERR_TIRED:
			return "ERR_TIRED";
		case ERR_NO_BODYPART:
			return "ERR_NO_BODYPART";
		case ERR_NOT_ENOUGH_EXTENSIONS:
			return "ERR_NOT_ENOUGH_EXTENSIONS";
		case ERR_RCL_NOT_ENOUGH:
			return "ERR_RCL_NOT_ENOUGH";
		case ERR_GCL_NOT_ENOUGH:
			return "ERR_GCL_NOT_ENOUGH";
		default:
			return "";
	}
}

const ERROR_COLOR = "red";
// Deep sky blue
const INFO_COLOR = "#00BFFF";
// Gold
const TICK_COLOR = "#FFD700";
// Gold
const WARN_COLOR = "#FFD700";

function withColor(color: string, msg?: any): string {
	return `<span style="color: ${color}">${msg}</span>`;
}

/**
 * Logs a message in blue
 *
 * @param msg The message
 */
export function info(msg?: any) {
	console.log(withColor(INFO_COLOR, ` ${msg}`));
}

declare global {
	interface SettingsMemory {
		/** Whether to print debug logs */
		debug?: boolean;
	}
}

/**
 * Like info, but only prints the message if `Memory.settings.debug` is set
 *
 * @param msg The message
 */
export function debug(msg?: any) {
	if (Memory.settings?.debug) console.log(withColor(INFO_COLOR, ` ${msg}`));
}

/**
 * Logs a message in red
 *
 * @param msg The message
 */
export function error(msg?: any) {
	console.log(withColor(ERROR_COLOR, ` ${msg}`));
}

/**
 * Logs a message in yellow
 *
 * @param msg The message
 */
export function warn(msg?: any) {
	console.log(withColor(WARN_COLOR, ` ${msg}`));
}

/**
 * Creates a string from a provided BodyPartConstant array
 *
 * @param body The BodyPartConstant[]
 * @returns A string representing the body
 */
export function stringifyBody(body: BodyPartConstant[]): string {
	let string = "";
	body.forEach((part) => {
		switch (part) {
			case WORK:
				string += "W";
				break;
			case CARRY:
				string += "C";
				break;
			case MOVE:
				string += "M";
				break;
			case CLAIM:
				string += "L";
				break;
			case ATTACK:
				string += "A";
				break;
			case RANGED_ATTACK:
				string += "R";
				break;
			case TOUGH:
				string += "T";
				break;
			default:
				error(`stringifyBody unexpected body part ${part}`);
		}
	});
	return string;
}

/** Log the current tick */
export function tick(format?: string): void {
	if (format == undefined) {
		format = `color: black; background: ${TICK_COLOR}; font-weight: bold`;
	}
	console.log(`<span style="${format}">[ ${Game.time} ]</span>`);
}
