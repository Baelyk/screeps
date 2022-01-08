import { ErrorMapper } from "utils/ErrorMapper";
import { Log } from "utils/log";

export class ScriptError extends Error {
  displayName: string;

  constructor(message: string) {
    super(message);
    this.displayName = this.constructor.name;
  }

  toString(): string {
    return `[${this.displayName}] ${this.message}`;
  }
}

export class IdError extends ScriptError {
  public readonly id: string;

  constructor(id: string, message?: string) {
    let msg = `Error getting id ${id}`;
    if (message != undefined) msg += "\n" + message;
    super(msg);

    this.id = id;
  }
}

function displayError(error: Error): string {
  return decodeURI(ErrorMapper.sourceMappedStackTrace(error));
}

/**
 * A wrapper around a function that may throw an error.
 *
 * @param {() => void} fn The function to wrap
 * @param {string} [message] A message to log before the error trace
 * @param {() => void} [final] A function to execute after fn regardless of
 *   whether an error was thrown.
 */
export function wrapper(
  fn: () => void,
  msg?: string,
  final?: () => void,
): void {
  try {
    fn();
  } catch (error) {
    Log.error(`${msg ? `${msg}\n` : ""}${displayError(error)}`);
  } finally {
    if (final != undefined) final();
  }
}
