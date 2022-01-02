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

  static getSurrounding(pos: Pos, radius = 1): Pos[] {
    const node = pos.x + pos.y * 50;
    const nodeX = node % 50;
    const nodeY = Math.floor(node / 50);

    // Adjust by the radius or the max possible adjustment staying within 0-49
    const xMinus = Math.min(radius, nodeX);
    const xPlus = Math.min(radius, 49 - nodeX);
    const yMinus = Math.min(radius, nodeY);
    const yPlus = Math.min(radius, 49 - nodeY);

    const surrounding: Pos[] = [];
    for (let y = nodeY - yMinus; y <= nodeY + yPlus; y++) {
      for (let x = nodeX - xMinus; x <= nodeX + xPlus; x++) {
        if (x + y * 50 === node) {
          continue;
        }
        surrounding.push({ x, y, roomName: pos.roomName });
      }
    }

    return surrounding;
  }

  static areEqual(a: Pos, b: Pos): boolean {
    return a.x === b.x && a.y === b.y && a.roomName === b.roomName;
  }

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

  static fromIndex(index: number, roomName: string): Position {
    return new Position({ x: index % 50, y: Math.floor(index / 50), roomName });
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

  public toString(): string {
    return Position.serialize(this);
  }
}
