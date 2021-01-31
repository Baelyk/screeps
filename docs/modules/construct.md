[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / construct

# Module: construct

## Table of contents

### Functions

- [build](construct.md#build)
- [buildRoad](construct.md#buildroad)
- [buildStorage](construct.md#buildstorage)
- [buildStructure](construct.md#buildstructure)
- [fromQueue](construct.md#fromqueue)
- [fromRepairQueue](construct.md#fromrepairqueue)
- [getSurroundingTiles](construct.md#getsurroundingtiles)
- [initConstruction](construct.md#initconstruction)
- [queueLength](construct.md#queuelength)
- [resetRepairQueue](construct.md#resetrepairqueue)
- [surroundingTilesAreEmpty](construct.md#surroundingtilesareempty)
- [unassignConstruction](construct.md#unassignconstruction)
- [updateWallRepair](construct.md#updatewallrepair)

## Functions

### build

▸ **build**(`position`: RoomPosition, `structureType`: BuildableStructureConstant): *boolean*

Build a construction site at a position

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`position` | RoomPosition | The room position at which to create the construction site   |
`structureType` | BuildableStructureConstant | The type of structure to create a construction site for   |

**Returns:** *boolean*

Returns true if the construction site was successfully created

Defined in: [src/construct.ts:53](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L53)

___

### buildRoad

▸ **buildRoad**(`path`: RoomPosition[]): *void*

Create road construction sites along a path

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`path` | RoomPosition[] | An array of `RoomPosition`s    |

**Returns:** *void*

Defined in: [src/construct.ts:25](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L25)

___

### buildStorage

▸ **buildStorage**(`roomName`: *string*): *void*

#### Parameters:

Name | Type |
------ | ------ |
`roomName` | *string* |

**Returns:** *void*

Defined in: [src/construct.ts:315](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L315)

___

### buildStructure

▸ **buildStructure**(`position`: RoomPosition, `type`: BuildableStructureConstant): *boolean*

#### Parameters:

Name | Type |
------ | ------ |
`position` | RoomPosition |
`type` | BuildableStructureConstant |

**Returns:** *boolean*

Defined in: [src/construct.ts:305](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L305)

___

### fromQueue

▸ **fromQueue**(`room`: Room): *string* \| *undefined*

Gets and removes the first construction site from the queue

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *string* \| *undefined*

The id of the construction site if the queue is not empty

Defined in: [src/construct.ts:110](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L110)

___

### fromRepairQueue

▸ **fromRepairQueue**(`room`: Room): *Id*<Structure\> \| *undefined*

Return a structure id from the repair queue. If there are none in the queue
that aren't full hits, returns undefined.

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *Id*<Structure\> \| *undefined*

Defined in: [src/construct.ts:257](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L257)

___

### getSurroundingTiles

▸ **getSurroundingTiles**(`position`: RoomPosition, `radius?`: *number*): RoomPosition[]

#### Parameters:

Name | Type | Default value |
------ | ------ | ------ |
`position` | RoomPosition | - |
`radius` | *number* | 0 |

**Returns:** RoomPosition[]

Defined in: [src/construct.ts:187](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L187)

___

### initConstruction

▸ **initConstruction**(`spawn`: StructureSpawn): *void*

Initialize construction

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`spawn` | StructureSpawn | The initial spawn    |

**Returns:** *void*

Defined in: [src/construct.ts:14](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L14)

___

### queueLength

▸ **queueLength**(`room`: Room): *number*

Gets the length of the construction queue

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *number*

The length of the construction queue

Defined in: [src/construct.ts:136](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L136)

___

### resetRepairQueue

▸ **resetRepairQueue**(`room`: Room): *void*

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *void*

Defined in: [src/construct.ts:246](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L246)

___

### surroundingTilesAreEmpty

▸ **surroundingTilesAreEmpty**(`position`: RoomPosition, `exceptions?`: StructureConstant[]): *boolean*

#### Parameters:

Name | Type |
------ | ------ |
`position` | RoomPosition |
`exceptions?` | StructureConstant[] |

**Returns:** *boolean*

Defined in: [src/construct.ts:271](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L271)

___

### unassignConstruction

▸ **unassignConstruction**(`name`: *string*): *void*

#### Parameters:

Name | Type |
------ | ------ |
`name` | *string* |

**Returns:** *void*

Defined in: [src/construct.ts:200](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L200)

___

### updateWallRepair

▸ **updateWallRepair**(`room`: Room): *void*

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *void*

Defined in: [src/construct.ts:337](https://github.com/Baelyk/screeps/blob/94a340d/src/construct.ts#L337)
