/**
 * Get a new array without duplicates from a supplied array.
 *
 * @param array The array to remove duplicates from
 * @returns A new array without duplicates
 */
export function roomPositionArrayRemoveDuplicates(
  array: RoomPosition[]
): RoomPosition[] {
  const newArray: RoomPosition[] = [];
  array.forEach((element) => {
    const duplicate = newArray.find((newElement) =>
      newElement.isEqualTo(element)
    );
    if (duplicate == undefined) newArray.push(element);
  });
  return newArray;
}
