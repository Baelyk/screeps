import { Position } from "classes/position";
import { MoveCommand } from "./move";

type ReturnValue =
  | undefined
  | ResourceConstant
  | MoveCommand
  | ScreepsReturnCode;
interface IReturn {
  type: ReturnType;
  value: ReturnValue;
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

export class Return implements IReturn {
  type: ReturnType;
  value: ReturnValue;

  constructor(type: ReturnType, value: ReturnValue) {
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

export class Ok extends Return {
  value: undefined;

  constructor() {
    super(ReturnType.Ok, undefined);
  }
}

export class Done extends Return {
  value: undefined;

  constructor() {
    super(ReturnType.Done, undefined);
  }
}

export class NotFound extends Return {
  value: undefined;

  constructor() {
    super(ReturnType.NotFound, undefined);
  }
}

export class NeedResource extends Return {
  value!: ResourceConstant;

  constructor(resource: ResourceConstant) {
    super(ReturnType.NeedResource, resource);
  }
}

export class NeedMove extends Return {
  value!: MoveCommand;

  constructor(pos: RoomPosition | Position, range = 0) {
    const destination = new Position(pos);
    super(ReturnType.NeedResource, { destination, range });
  }
}

export class UnhandledScreepsReturn extends Return {
  value!: ScreepsReturnCode;

  constructor(response: ScreepsReturnCode) {
    super(ReturnType.Unhandled, response);
  }
}
