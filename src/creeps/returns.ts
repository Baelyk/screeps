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
  InProgress = "in_progress",
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
  /** Switch tasks */
  SwitchTask = "switch_tasks",
  /** No capacity for this resource */
  NoCapacity = "no_capacity",
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
}

export class InProgress extends Return {
  value: undefined;

  constructor() {
    super(ReturnType.InProgress, undefined);
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

export class NoCapacity extends Return {
  value!: ResourceConstant;

  constructor(resource: ResourceConstant) {
    super(ReturnType.NoCapacity, resource);
  }
}
