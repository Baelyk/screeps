import { ScriptError } from "utils/errors";

export interface Pos {
  x: number;
  y: number;
  roomName: string;
}

export class Position implements Pos {
  x: number;
  y: number;
  roomName: string;

  static serialize(pos: Pos): string {
    return `${pos.x}:${pos.y}:${pos.roomName}`;
  }

  static deserialize(str: string): Pos {
    const parts = str.split(":");
    return { x: parseInt(parts[0]), y: parseInt(parts[1]), roomName: parts[2] };
  }

  static fromSerialized(str: string): Position {
    return new Position(Position.deserialize(str));
  }

  static serializedToRoomPosition(str: string): RoomPosition {
    return Position.fromSerialized(str).intoRoomPosition();
  }

  constructor(pos: Pos) {
    this.x = pos.x;
    this.y = pos.y;
    this.roomName = pos.roomName;
  }

  public intoRoomPosition(): RoomPosition {
    const roomPosition = new RoomPosition(this.x, this.y, this.roomName);
    if (roomPosition == undefined) {
      throw new ScriptError(`Invalid position ${Position.serialize(this)}`);
    }
    return roomPosition;
  }

  public tryIntoRoomPosition(): RoomPosition | undefined {
    try {
      return this.intoRoomPosition();
    } catch (_) {
      return undefined;
    }
  }
}
