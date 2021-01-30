[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / utils/helpers

# Module: utils/helpers

## Table of contents

### Functions

- [bodyCost](utils_helpers.md#bodycost)
- [countBodyPart](utils_helpers.md#countbodypart)
- [countRole](utils_helpers.md#countrole)
- [getLinksInRoom](utils_helpers.md#getlinksinroom)
- [hasBodyPart](utils_helpers.md#hasbodypart)
- [nameCreep](utils_helpers.md#namecreep)

## Functions

### bodyCost

▸ **bodyCost**(`body`: BodyPartDefinition[] \| BodyPartConstant[]): *number*

#### Parameters:

Name | Type |
------ | ------ |
`body` | BodyPartDefinition[] \| BodyPartConstant[] |

**Returns:** *number*

Defined in: [src/utils/helpers.ts:34](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/helpers.ts#L34)

___

### countBodyPart

▸ **countBodyPart**(`body`: BodyPartDefinition[] \| BodyPartConstant[], `partType`: BodyPartConstant): *number*

#### Parameters:

Name | Type |
------ | ------ |
`body` | BodyPartDefinition[] \| BodyPartConstant[] |
`partType` | BodyPartConstant |

**Returns:** *number*

Defined in: [src/utils/helpers.ts:11](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/helpers.ts#L11)

___

### countRole

▸ **countRole**(`room`: Room, `role`: [*CreepRole*](../enums/types.creeprole.md)): *number*

Count the number of creeps of a certain role

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`room` | Room | - |
`role` | [*CreepRole*](../enums/types.creeprole.md) | The role to count   |

**Returns:** *number*

The number of creeps

Defined in: [src/utils/helpers.ts:51](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/helpers.ts#L51)

___

### getLinksInRoom

▸ **getLinksInRoom**(`room`: Room): *Record*<*string*, StructureLink\>

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |

**Returns:** *Record*<*string*, StructureLink\>

Defined in: [src/utils/helpers.ts:78](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/helpers.ts#L78)

___

### hasBodyPart

▸ **hasBodyPart**(`creep`: Creep, `partType`: BodyPartConstant): *boolean*

#### Parameters:

Name | Type |
------ | ------ |
`creep` | Creep |
`partType` | BodyPartConstant |

**Returns:** *boolean*

Defined in: [src/utils/helpers.ts:3](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/helpers.ts#L3)

___

### nameCreep

▸ **nameCreep**(`memory`: [*CreepMemory*](../interfaces/types.creepmemory.md)): *string*

Generates a name for the creep based on its memory

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`memory` | [*CreepMemory*](../interfaces/types.creepmemory.md) | The memory of the creep-to-be   |

**Returns:** *string*

A name

Defined in: [src/utils/helpers.ts:66](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/helpers.ts#L66)
