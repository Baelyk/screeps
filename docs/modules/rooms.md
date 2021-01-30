[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / rooms

# Module: rooms

## Table of contents

### Functions

- [getNextTombInRoom](rooms.md#getnexttombinroom)
- [getRoomAvailableEnergy](rooms.md#getroomavailableenergy)
- [getSourcesInRoom](rooms.md#getsourcesinroom)
- [getTowersInRoom](rooms.md#gettowersinroom)
- [initRoom](rooms.md#initroom)
- [resetRoomLinksMemory](rooms.md#resetroomlinksmemory)
- [roomManager](rooms.md#roommanager)
- [updateRoomMemory](rooms.md#updateroommemory)

## Functions

### getNextTombInRoom

▸ **getNextTombInRoom**(`room`: Room): Tombstone \| *undefined*

Get the next tombstone from the room's list of tombstones.

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`room` | Room | The room   |

**Returns:** Tombstone \| *undefined*

The tombstone, or undefined if the no valid tombstone was found

Defined in: [src/rooms.ts:90](https://github.com/Baelyk/screeps/blob/c7b9358/src/rooms.ts#L90)

___

### getRoomAvailableEnergy

▸ **getRoomAvailableEnergy**(`room`: Room): *number* \| *undefined*

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *number* \| *undefined*

Defined in: [src/rooms.ts:115](https://github.com/Baelyk/screeps/blob/c7b9358/src/rooms.ts#L115)

___

### getSourcesInRoom

▸ **getSourcesInRoom**(`room`: Room): *Id*<Source\>[]

Get the ids of the sources in the room.

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`room` | Room | The room to look in   |

**Returns:** *Id*<Source\>[]

A string[] of source ids, possibly empty if none were found

Defined in: [src/rooms.ts:73](https://github.com/Baelyk/screeps/blob/c7b9358/src/rooms.ts#L73)

___

### getTowersInRoom

▸ **getTowersInRoom**(`room`: Room): *Id*<StructureTower\>[]

Get the ids of the towers in the room.

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`room` | Room | The room to look in   |

**Returns:** *Id*<StructureTower\>[]

A string[] of tower ids, possibly empty if none were found

Defined in: [src/rooms.ts:60](https://github.com/Baelyk/screeps/blob/c7b9358/src/rooms.ts#L60)

___

### initRoom

▸ **initRoom**(`room`: Room): *void*

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *void*

Defined in: [src/rooms.ts:9](https://github.com/Baelyk/screeps/blob/c7b9358/src/rooms.ts#L9)

___

### resetRoomLinksMemory

▸ **resetRoomLinksMemory**(`room`: Room): *void*

Get the ids of the links in the room.

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`room` | Room | The room to look in   |

**Returns:** *void*

A string[] of link ids, possibly empty if none were found

Defined in: [src/rooms.ts:134](https://github.com/Baelyk/screeps/blob/c7b9358/src/rooms.ts#L134)

___

### roomManager

▸ **roomManager**(): *void*

**Returns:** *void*

Defined in: [src/rooms.ts:156](https://github.com/Baelyk/screeps/blob/c7b9358/src/rooms.ts#L156)

___

### updateRoomMemory

▸ **updateRoomMemory**(`room`: Room): *void*

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *void*

Defined in: [src/rooms.ts:15](https://github.com/Baelyk/screeps/blob/c7b9358/src/rooms.ts#L15)
