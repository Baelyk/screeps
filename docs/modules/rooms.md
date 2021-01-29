[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / rooms

# Module: rooms

## Table of contents

### Functions

- [getLinksInRoom](rooms.md#getlinksinroom)
- [getNextTombInRoom](rooms.md#getnexttombinroom)
- [getRoomAvailableEnergy](rooms.md#getroomavailableenergy)
- [getSourcesInRoom](rooms.md#getsourcesinroom)
- [getTowersInRoom](rooms.md#gettowersinroom)
- [initRoom](rooms.md#initroom)
- [resetRoomLinksMemory](rooms.md#resetroomlinksmemory)
- [updateRoomMemory](rooms.md#updateroommemory)

## Functions

### getLinksInRoom

▸ **getLinksInRoom**(`room`: Room): *Record*<*string*, StructureLink\>

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *Record*<*string*, StructureLink\>

Defined in: [src/rooms.ts:117](https://github.com/Baelyk/screeps/blob/9bfed96/src/rooms.ts#L117)

___

### getNextTombInRoom

▸ **getNextTombInRoom**(`room`: Room): Tombstone \| *undefined*

Get the next tombstone from the room's list of tombstones.

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`room` | Room | The room   |

**Returns:** Tombstone \| *undefined*

The tombstone, or undefined if the no valid tombstone was found

Defined in: [src/rooms.ts:79](https://github.com/Baelyk/screeps/blob/9bfed96/src/rooms.ts#L79)

___

### getRoomAvailableEnergy

▸ **getRoomAvailableEnergy**(`room`: Room): *number* \| *undefined*

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *number* \| *undefined*

Defined in: [src/rooms.ts:104](https://github.com/Baelyk/screeps/blob/9bfed96/src/rooms.ts#L104)

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

Defined in: [src/rooms.ts:62](https://github.com/Baelyk/screeps/blob/9bfed96/src/rooms.ts#L62)

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

Defined in: [src/rooms.ts:49](https://github.com/Baelyk/screeps/blob/9bfed96/src/rooms.ts#L49)

___

### initRoom

▸ **initRoom**(`room`: Room): *void*

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *void*

Defined in: [src/rooms.ts:5](https://github.com/Baelyk/screeps/blob/9bfed96/src/rooms.ts#L5)

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

Defined in: [src/rooms.ts:136](https://github.com/Baelyk/screeps/blob/9bfed96/src/rooms.ts#L136)

___

### updateRoomMemory

▸ **updateRoomMemory**(`room`: Room): *void*

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *void*

Defined in: [src/rooms.ts:11](https://github.com/Baelyk/screeps/blob/9bfed96/src/rooms.ts#L11)
