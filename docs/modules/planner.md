[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / planner

# Module: planner

## Table of contents

### Functions

- [executePlan](planner.md#executeplan)
- [getExitWallsAndRamparts](planner.md#getexitwallsandramparts)
- [getExtensionRoadSpots](planner.md#getextensionroadspots)
- [getExtensionSpots](planner.md#getextensionspots)
- [makePlan](planner.md#makeplan)
- [minerContainers](planner.md#minercontainers)
- [roadSpots](planner.md#roadspots)
- [towerSpots](planner.md#towerspots)

## Functions

### executePlan

▸ **executePlan**(`room`: Room, `levelOverride?`: *number*): *boolean*

#### Parameters:

Name | Type | Default value |
------ | ------ | ------ |
`room` | Room | - |
`levelOverride` | *number* | -1 |

**Returns:** *boolean*

Defined in: [src/planner.ts:931](https://github.com/Baelyk/screeps/blob/94a340d/src/planner.ts#L931)

___

### getExitWallsAndRamparts

▸ **getExitWallsAndRamparts**(`room`: Room): [RoomPosition[], RoomPosition[]]

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** [RoomPosition[], RoomPosition[]]

Defined in: [src/planner.ts:11](https://github.com/Baelyk/screeps/blob/94a340d/src/planner.ts#L11)

___

### getExtensionRoadSpots

▸ **getExtensionRoadSpots**(`room`: Room): RoomPosition[]

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** RoomPosition[]

Defined in: [src/planner.ts:561](https://github.com/Baelyk/screeps/blob/94a340d/src/planner.ts#L561)

___

### getExtensionSpots

▸ **getExtensionSpots**(`room`: Room): RoomPosition[]

Get the extension spots for this spawn. This is just based on design and
does not take terrain/already existing structures into account.

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** RoomPosition[]

An array of the RoomPositions

Defined in: [src/planner.ts:405](https://github.com/Baelyk/screeps/blob/94a340d/src/planner.ts#L405)

___

### makePlan

▸ **makePlan**(`room`: Room): *boolean*

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *boolean*

Defined in: [src/planner.ts:824](https://github.com/Baelyk/screeps/blob/94a340d/src/planner.ts#L824)

___

### minerContainers

▸ **minerContainers**(`room`: Room): RoomPosition[]

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** RoomPosition[]

Defined in: [src/planner.ts:664](https://github.com/Baelyk/screeps/blob/94a340d/src/planner.ts#L664)

___

### roadSpots

▸ **roadSpots**(`room`: Room): RoomPosition[]

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** RoomPosition[]

Defined in: [src/planner.ts:637](https://github.com/Baelyk/screeps/blob/94a340d/src/planner.ts#L637)

___

### towerSpots

▸ **towerSpots**(`room`: Room): RoomPosition[]

The RoomPostions of the towers, in order.

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`room` | Room | The room to plan   |

**Returns:** RoomPosition[]

The RoomPositions to build the towers, in order

Defined in: [src/planner.ts:268](https://github.com/Baelyk/screeps/blob/94a340d/src/planner.ts#L268)
