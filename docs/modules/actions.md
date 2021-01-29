[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / actions

# Module: actions

## Table of contents

### Functions

- [build](actions.md#build)
- [depositEnergy](actions.md#depositenergy)
- [getEnergy](actions.md#getenergy)
- [harvestEnergy](actions.md#harvestenergy)
- [haul](actions.md#haul)
- [idle](actions.md#idle)
- [recoverEnergy](actions.md#recoverenergy)
- [repair](actions.md#repair)
- [storeEnergy](actions.md#storeenergy)
- [upgradeController](actions.md#upgradecontroller)

## Functions

### build

▸ **build**(`creep`: Creep, `building?`: ConstructionSite): *void*

Builds or moves to the creep's assigned construction site

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`creep` | Creep | The creep    |
`building?` | ConstructionSite | - |

**Returns:** *void*

Defined in: [src/actions.ts:330](https://github.com/Baelyk/screeps/blob/9bfed96/src/actions.ts#L330)

___

### depositEnergy

▸ **depositEnergy**(`creep`: Creep, `disableUpgrading?`: *boolean*): *boolean*

Deposit energy in the room's first spawn/extension/tower

#### Parameters:

Name | Type | Default value | Description |
------ | ------ | ------ | ------ |
`creep` | Creep | - | The creep to deposit the energy   |
`disableUpgrading` | *boolean* | false | Whether to disable upgrading if no deposit locations   |

**Returns:** *boolean*

True if depositing, false if not depositing and not upgrading

Defined in: [src/actions.ts:160](https://github.com/Baelyk/screeps/blob/9bfed96/src/actions.ts#L160)

___

### getEnergy

▸ **getEnergy**(`creep`: Creep, `target?`: Structure \| Tombstone \| Ruin): ScreepsReturnCode

Get energy from a structure that can give out energy or harvestEnergy

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`creep` | Creep | The creep to get the energy    |
`target?` | Structure \| Tombstone \| Ruin | - |

**Returns:** ScreepsReturnCode

Defined in: [src/actions.ts:72](https://github.com/Baelyk/screeps/blob/9bfed96/src/actions.ts#L72)

___

### harvestEnergy

▸ **harvestEnergy**(`creep`: Creep, `source?`: Source): *void*

Harvest energy from a specified Source or find the first Source in the room.

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`creep` | Creep | The creep to harvest the energy   |
`source?` | Source | The Source, or undefined    |

**Returns:** *void*

Defined in: [src/actions.ts:13](https://github.com/Baelyk/screeps/blob/9bfed96/src/actions.ts#L13)

___

### haul

▸ **haul**(`creep`: Creep, `target`: Creep \| PowerCreep \| Structure): *void*

#### Parameters:

Name | Type |
------ | ------ |
`creep` | Creep |
`target` | Creep \| PowerCreep \| Structure |

**Returns:** *void*

Defined in: [src/actions.ts:405](https://github.com/Baelyk/screeps/blob/9bfed96/src/actions.ts#L405)

___

### idle

▸ **idle**(`creep`: Creep, `position?`: RoomPosition): *void*

#### Parameters:

Name | Type |
------ | ------ |
`creep` | Creep |
`position?` | RoomPosition |

**Returns:** *void*

Defined in: [src/actions.ts:396](https://github.com/Baelyk/screeps/blob/9bfed96/src/actions.ts#L396)

___

### recoverEnergy

▸ **recoverEnergy**(`creep`: Creep, `range?`: *number*): ScreepsReturnCode

Recover energy from tombs or resource piles within range.

#### Parameters:

Name | Type | Default value | Description |
------ | ------ | ------ | ------ |
`creep` | Creep | - | The creep to recover   |
`range` | *number* | 1 | The range to look in, default 1   |

**Returns:** ScreepsReturnCode

The response code to the action take or ERR_NOT_FOUND if no valid
  tombs/piles were found

Defined in: [src/actions.ts:430](https://github.com/Baelyk/screeps/blob/9bfed96/src/actions.ts#L430)

___

### repair

▸ **repair**(`creep`: Creep, `repair?`: Structure): *void*

Repairs or moves to the creep's assigned repair site

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`creep` | Creep | The creep   |
`repair?` | Structure | The structure to repair    |

**Returns:** *void*

Defined in: [src/actions.ts:364](https://github.com/Baelyk/screeps/blob/9bfed96/src/actions.ts#L364)

___

### storeEnergy

▸ **storeEnergy**(`creep`: Creep, `target?`: Structure): *void*

Store energy in container or storage within range.

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`creep` | Creep | The creep storing energy   |
`target?` | Structure | - |

**Returns:** *void*

Defined in: [src/actions.ts:247](https://github.com/Baelyk/screeps/blob/9bfed96/src/actions.ts#L247)

___

### upgradeController

▸ **upgradeController**(`creep`: Creep): *void*

Upgrades the controller

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`creep` | Creep | The creep to upgrade the controller    |

**Returns:** *void*

Defined in: [src/actions.ts:306](https://github.com/Baelyk/screeps/blob/9bfed96/src/actions.ts#L306)
