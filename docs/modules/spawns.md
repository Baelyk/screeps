[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / spawns

# Module: spawns

## Table of contents

### Functions

- [generateBodyByRole](spawns.md#generatebodybyrole)
- [getMaxExtensions](spawns.md#getmaxextensions)
- [getSpawnCapacity](spawns.md#getspawncapacity)
- [getSpawnEnergy](spawns.md#getspawnenergy)
- [initSpawn](spawns.md#initspawn)
- [spawnManager](spawns.md#spawnmanager)

## Functions

### generateBodyByRole

▸ **generateBodyByRole**(`spawn`: StructureSpawn, `role`: [*CreepRole*](../enums/types.creeprole.md)): BodyPartConstant[]

Generate a creep body based on its role and the spawn's capacity.

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`spawn` | StructureSpawn | The spawn the creep will be spawned from to determine available energy   |
`role` | [*CreepRole*](../enums/types.creeprole.md) | The role to generate a body for   |

**Returns:** BodyPartConstant[]

An array of BodyPartConstants representing the creep's body

Defined in: [src/spawns.ts:200](https://github.com/Baelyk/screeps/blob/94a340d/src/spawns.ts#L200)

___

### getMaxExtensions

▸ **getMaxExtensions**(`level`: *number*): *number*

#### Parameters:

Name | Type |
------ | ------ |
`level` | *number* |

**Returns:** *number*

Defined in: [src/spawns.ts:368](https://github.com/Baelyk/screeps/blob/94a340d/src/spawns.ts#L368)

___

### getSpawnCapacity

▸ **getSpawnCapacity**(`spawn`: StructureSpawn): *number*

#### Parameters:

Name | Type |
------ | ------ |
`spawn` | StructureSpawn |

**Returns:** *number*

Defined in: [src/spawns.ts:346](https://github.com/Baelyk/screeps/blob/94a340d/src/spawns.ts#L346)

___

### getSpawnEnergy

▸ **getSpawnEnergy**(`spawn`: StructureSpawn): *number*

#### Parameters:

Name | Type |
------ | ------ |
`spawn` | StructureSpawn |

**Returns:** *number*

Defined in: [src/spawns.ts:360](https://github.com/Baelyk/screeps/blob/94a340d/src/spawns.ts#L360)

___

### initSpawn

▸ **initSpawn**(`spawn`: StructureSpawn): *void*

#### Parameters:

Name | Type |
------ | ------ |
`spawn` | StructureSpawn |

**Returns:** *void*

Defined in: [src/spawns.ts:372](https://github.com/Baelyk/screeps/blob/94a340d/src/spawns.ts#L372)

___

### spawnManager

▸ **spawnManager**(): *void*

**Returns:** *void*

Defined in: [src/spawns.ts:395](https://github.com/Baelyk/screeps/blob/94a340d/src/spawns.ts#L395)
