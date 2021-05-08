/**
 * Get a new array without duplicates from a supplied array.
 *
 * @param array The array to remove duplicates from
 * @returns A new array without duplicates
 */
export function roomPositionArrayRemoveDuplicates(
  array: RoomPosition[],
): RoomPosition[] {
  const newArray: RoomPosition[] = [];
  array.forEach((element) => {
    const duplicate = newArray.find((newElement) =>
      newElement.isEqualTo(element),
    );
    if (duplicate == undefined) newArray.push(element);
  });
  return newArray;
}
/**
 * Converts a path to a RoomPosition[]
 *
 * @param room The room the path is in
 * @returns The spots in the path as a RoomPosition[]
 */
export function pathToRoomPosition(
  room: Room,
  path: PathStep[],
): RoomPosition[] {
  const spots = path.map((step) => room.getPositionAt(step.x, step.y));
  const positions = spots.filter(
    (position) => position != undefined,
  ) as RoomPosition[];
  return positions;
}
