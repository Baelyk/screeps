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

  constructor(pos: Pos) {
    this.x = pos.x;
    this.y = pos.y;
    this.roomName = pos.roomName;
  }

  public intoRoomPosition(): RoomPosition {
    const roomPosition = Game.rooms[this.roomName].getPositionAt(
      this.x,
      this.y,
    );
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
