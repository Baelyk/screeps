import { Position } from "classes/Position";
import { GetByIdError } from "utils/errors";

export function getSpot(spot: string): RoomPosition | undefined {
  if (spot == undefined) {
    return undefined;
  }
  return Position.fromSerialized(spot).intoRoomPosition();
}

export function getAssignedById<T>(id: Id<T> | undefined): T | undefined {
  if (id == undefined) {
    return undefined;
  }
  const source = Game.getObjectById(id);
  if (source == undefined) {
    throw new GetByIdError(id);
  }
  return source;
}
