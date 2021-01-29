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
- [repairQueueLength](construct.md#repairqueuelength)
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

Defined in: [src/construct.ts:79](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L79)

___

### buildRoad

▸ **buildRoad**(`path`: RoomPosition[]): *void*

Create road construction sites along a path

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`path` | RoomPosition[] | An array of `RoomPosition`s    |

**Returns:** *void*

Defined in: [src/construct.ts:51](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L51)

___

### buildStorage

▸ **buildStorage**(`roomName`: *string*): *void*

#### Parameters:

Name | Type |
------ | ------ |
`roomName` | *string* |

**Returns:** *void*

Defined in: [src/construct.ts:352](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L352)

___

### buildStructure

▸ **buildStructure**(`position`: RoomPosition, `type`: BuildableStructureConstant): *boolean*

#### Parameters:

Name | Type |
------ | ------ |
`position` | RoomPosition |
`type` | BuildableStructureConstant |

**Returns:** *boolean*

Defined in: [src/construct.ts:342](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L342)

___

### fromQueue

▸ **fromQueue**(): *string* \| *undefined*

Gets and removes the first construction site from the queue

**Returns:** *string* \| *undefined*

The id of the construction site if the queue is not empty

Defined in: [src/construct.ts:137](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L137)

___

### fromRepairQueue

▸ **fromRepairQueue**(): *Id*<Structure\> \| *undefined*

Return a structure id from the repair queue. If there are none in the queue
that aren't full hits, returns undefined.

**Returns:** *Id*<Structure\> \| *undefined*

Defined in: [src/construct.ts:285](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L285)

___

### getSurroundingTiles

▸ **getSurroundingTiles**(`position`: RoomPosition, `radius?`: *number*): RoomPosition[]

#### Parameters:

Name | Type | Default value |
------ | ------ | ------ |
`position` | RoomPosition | - |
`radius` | *number* | 0 |

**Returns:** RoomPosition[]

Defined in: [src/construct.ts:214](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L214)

___

### initConstruction

▸ **initConstruction**(`spawn`: StructureSpawn): *void*

Initialize construction

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`spawn` | StructureSpawn | The initial spawn    |

**Returns:** *void*

Defined in: [src/construct.ts:14](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L14)

___

### queueLength

▸ **queueLength**(): *number*

Gets the length of the construction queue

**Returns:** *number*

The length of the construction queue

Defined in: [src/construct.ts:163](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L163)

___

### repairQueueLength

▸ **repairQueueLength**(): *number*

Gets the length of the construction queue

**Returns:** *number*

The length of the construction queue

Defined in: [src/construct.ts:338](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L338)

___

### resetRepairQueue

▸ **resetRepairQueue**(`room`: Room): *void*

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *void*

Defined in: [src/construct.ts:269](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L269)

___

### surroundingTilesAreEmpty

▸ **surroundingTilesAreEmpty**(`position`: RoomPosition, `exceptions?`: StructureConstant[]): *boolean*

#### Parameters:

Name | Type |
------ | ------ |
`position` | RoomPosition |
`exceptions?` | StructureConstant[] |

**Returns:** *boolean*

Defined in: [src/construct.ts:299](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L299)

___

### unassignConstruction

▸ **unassignConstruction**(`name`: *string*): *void*

#### Parameters:

Name | Type |
------ | ------ |
`name` | *string* |

**Returns:** *void*

Defined in: [src/construct.ts:227](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L227)

___

### updateWallRepair

▸ **updateWallRepair**(`room`: Room): *void*

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *void*

Defined in: [src/construct.ts:374](https://github.com/Baelyk/screeps/blob/9bfed96/src/construct.ts#L374)
