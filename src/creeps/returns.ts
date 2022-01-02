import { Position } from "classes/position";
import { MoveCommand } from "./move";

interface IReturn<T> {
  type: ReturnType;
  value?: T;
}

export enum ReturnType {
  /** Succesful but in progress */
  Ok = "ok",
  /** Finished succesfully */
  Done = "done",
  /** Unhandled Screeps return code */
  Unhandled = "unhandled",
  /** Need resource to continue */
  NeedResource = "need_resource",
  /** Need to move to a position */
  Move = "move",
  /** No target found */
  NotFound = "not_found",
}

export class Return<T> implements IReturn<T> {
  type: ReturnType;
  value: T;

  constructor(type: ReturnType, value: T) {
    this.type = type;
    this.value = value;
  }

  toString(): string {
    if (this.value != undefined) {
      return `${this.type}: ${JSON.stringify(this.value)}`;
    } else {
      return `${this.type}`;
    }
  }

  isOk(): boolean {
    return this.type === ReturnType.Ok;
  }
}

export class Ok extends Return<undefined> {
  constructor() {
    super(ReturnType.Ok, undefined);
  }
}

export class Done extends Return<undefined> {
  constructor() {
    super(ReturnType.Done, undefined);
  }
}

export class NotFound extends Return<undefined> {
  constructor() {
    super(ReturnType.NotFound, undefined);
  }
}

export class NeedResource extends Return<ResourceConstant> {
  constructor(resource: ResourceConstant) {
    super(ReturnType.NeedResource, resource);
  }
}

export class NeedMove extends Return<MoveCommand> {
  constructor(pos: RoomPosition | Position, range = 0) {
    const destination = new Position(pos);
    super(ReturnType.NeedResource, { destination, range });
  }
}

export class UnhandledScreepsReturn extends Return<ScreepsReturnCode> {
  constructor(response: ScreepsReturnCode) {
    super(ReturnType.Unhandled, response);
  }
}
