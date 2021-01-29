[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / creeps

# Module: creeps

## Table of contents

### Functions

- [bodyCost](creeps.md#bodycost)
- [countBodyPart](creeps.md#countbodypart)
- [countRole](creeps.md#countrole)
- [doRole](creeps.md#dorole)
- [handleDead](creeps.md#handledead)
- [hasBodyPart](creeps.md#hasbodypart)
- [nameCreep](creeps.md#namecreep)

## Functions

### bodyCost

▸ **bodyCost**(`body`: BodyPartDefinition[] \| BodyPartConstant[]): *number*

#### Parameters:

Name | Type |
------ | ------ |
`body` | BodyPartDefinition[] \| BodyPartConstant[] |

**Returns:** *number*

Defined in: [src/creeps.ts:664](https://github.com/Baelyk/screeps/blob/9bfed96/src/creeps.ts#L664)

___

### countBodyPart

▸ **countBodyPart**(`body`: BodyPartDefinition[] \| BodyPartConstant[], `partType`: BodyPartConstant): *number*

#### Parameters:

Name | Type |
------ | ------ |
`body` | BodyPartDefinition[] \| BodyPartConstant[] |
`partType` | BodyPartConstant |

**Returns:** *number*

Defined in: [src/creeps.ts:641](https://github.com/Baelyk/screeps/blob/9bfed96/src/creeps.ts#L641)

___

### countRole

▸ **countRole**(`role`: [*CreepRole*](../enums/types.creeprole.md)): *number*

Count the number of creeps of a certain role

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`role` | [*CreepRole*](../enums/types.creeprole.md) | The role to count   |

**Returns:** *number*

The number of creeps

Defined in: [src/creeps.ts:449](https://github.com/Baelyk/screeps/blob/9bfed96/src/creeps.ts#L449)

___

### doRole

▸ **doRole**(`creep`: Creep): *void*

Passes creep to appropriate behavior function based on the creep's role
(`creep.memory.role`)

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`creep` | Creep | The creep    |

**Returns:** *void*

Defined in: [src/creeps.ts:562](https://github.com/Baelyk/screeps/blob/9bfed96/src/creeps.ts#L562)

___

### handleDead

▸ **handleDead**(`name`: *string*): *void*

Performs actions upon the death of a creep based on the creeps roll

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`name` | *string* | The name of the dead creep    |

**Returns:** *void*

Defined in: [src/creeps.ts:603](https://github.com/Baelyk/screeps/blob/9bfed96/src/creeps.ts#L603)

___

### hasBodyPart

▸ **hasBodyPart**(`creep`: Creep, `partType`: BodyPartConstant): *boolean*

#### Parameters:

Name | Type |
------ | ------ |
`creep` | Creep |
`partType` | BodyPartConstant |

**Returns:** *boolean*

Defined in: [src/creeps.ts:633](https://github.com/Baelyk/screeps/blob/9bfed96/src/creeps.ts#L633)

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

Defined in: [src/creeps.ts:463](https://github.com/Baelyk/screeps/blob/9bfed96/src/creeps.ts#L463)
