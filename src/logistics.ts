import { info, warn } from "utils/logger";
import { GetByIdError, ScriptError } from "utils/errors";
import { VisibleRoom } from "roomMemory";
import { profile } from "./utils/profiler";

declare global {
  type LogisticsMemory = { [key: string]: LogisticsRequestMemory };
  /**
   * Stores information about a logistics request.
   *
   * The logistics requests wants source to have `amount` of `resource` stored.
   * So, if `amount` is less than what is stored, bring `resource` to the
   * source from the sink, and if it's less, take `resource` from the source to the sink.
   */
  interface LogisticsRequestMemory {
    /** The origin of the logistics request */
    source: Id<AnyStoreStructure>;
    /** The resource requeted */
    resource: ResourceConstant;
    /** The amount of resource requested */
    amount: number;
    /** The destination of the logistics request */
    sink?: Id<AnyStoreStructure>;
  }
}

export class LogisticsRequest implements LogisticsRequestMemory {
  source: Id<AnyStoreStructure>;
  resource: ResourceConstant;
  amount: number;
  sink?: Id<AnyStoreStructure>;

  static fromMemory(requestMemory: LogisticsRequestMemory): LogisticsRequest {
    return new LogisticsRequest(
      requestMemory.source,
      requestMemory.resource,
      requestMemory.amount,
      requestMemory.sink,
    );
  }

  static toMemory(request: LogisticsRequest): LogisticsRequestMemory {
    const requestMemory: LogisticsRequestMemory = {
      source: request.source,
      resource: request.resource,
      amount: request.amount,
    };
    if (request.sink != undefined) {
      requestMemory.sink = request.sink;
    }
    return requestMemory;
  }

  constructor(
    source: Id<AnyStoreStructure>,
    resource: ResourceConstant,
    amount: number,
    sink?: Id<AnyStoreStructure>,
  ) {
    this.source = source;
    this.resource = resource;
    this.amount = amount;
    if (sink != undefined) {
      this.sink = sink;
    }
  }

  public toString(): string {
    let tail = "";
    if (this.sink != undefined) {
      tail = ` (${this.sink})`;
    }
    return `${this.source} ${this.amount} ${this.resource}${tail}`;
  }

  public getSource(): AnyStoreStructure {
    const source = Game.getObjectById(this.source);
    if (source == undefined) {
      throw new GetByIdError(this.source);
    }
    return source;
  }

  public getSink(): AnyStoreStructure | undefined {
    if (this.sink == undefined) {
      return undefined;
    }

    const sink = Game.getObjectById(this.sink);
    if (sink == undefined) {
      throw new GetByIdError(this.sink);
    }
    return sink;
  }
}

@profile
export class LogisticsInfo {
  static newLogisticsRequestKey(): string {
    // https://stackoverflow.com/a/19964557
    const N = 5;
    const s = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array(N)
      .join()
      .split(",")
      .map(() => s.charAt(Math.floor(Math.random() * s.length)))
      .join("");
  }

  roomName: string;

  constructor(roomName: string) {
    this.roomName = roomName;
  }

  /* Memory interface methods */

  getVisibleRoom(): VisibleRoom {
    return new VisibleRoom(this.roomName);
  }

  getMemory(): LogisticsMemory {
    return this.getVisibleRoom().getLogisticsMemory();
  }

  updateMemory(memory: LogisticsMemory): void {
    this.getVisibleRoom().updateLogisticsMemory(memory);
  }

  /* Map-type helper methods */

  public add(request: LogisticsRequest): string {
    const memory = this.getMemory();
    const key = LogisticsInfo.newLogisticsRequestKey();
    if (memory[key] != undefined) {
      throw new ScriptError(
        `Room ${this.roomName} logistics memory already has key ${key}`,
      );
    }
    memory[key] = LogisticsRequest.toMemory(request);
    this.updateMemory(memory);
    return key;
  }

  public get(key: string): LogisticsRequest {
    const memory = this.getMemory();
    return LogisticsRequest.fromMemory(memory[key]);
  }

  public replace(key: string, request: LogisticsRequest): void {
    const memory = this.getMemory();
    // Manually insert the request with this key
    memory[key] = request;
    this.updateMemory(memory);
  }

  public remove(key: string): void {
    const memory = this.getMemory();
    delete memory[key];
    this.updateMemory(memory);
  }

  public getAll(): LogisticsMemory {
    return this.getMemory();
  }

  find(request: LogisticsRequestMemory): string | undefined {
    const all = this.getAll();
    for (const key in all) {
      const oldRequest = all[key];
      if (
        oldRequest.source === request.source &&
        oldRequest.resource === request.resource &&
        oldRequest.sink === request.sink
      ) {
        return key;
      }
    }
    return undefined;
  }

  public addUnique(
    request: LogisticsRequest,
    method?: "add" | "replace",
  ): string {
    const oldKey = this.find(request);

    if (oldKey == undefined) {
      // This request is already unique, add it normally
      return this.add(request);
    } else if (method == undefined || method === "add") {
      // Add the request amounts together
      const oldRequest = this.get(oldKey);
      if (oldRequest == undefined) {
        throw new ScriptError(`Found key ${oldKey} has undefined request`);
      }
      request.amount += oldRequest.amount;
      this.replace(oldKey, request);
    } else if (method === "replace") {
      // Replace the old request with the new request
      this.replace(oldKey, request);
    }
    return oldKey;
  }

  public getNextKey(): string | undefined {
    // Maybe eventually this could use some sort of prioritization, but for now
    // just return the first key
    for (const key in this.getAll()) {
      return key;
    }
    return undefined;
  }
}
