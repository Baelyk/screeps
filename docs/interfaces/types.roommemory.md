[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / [types](../modules/types.md) / RoomMemory

# Interface: RoomMemory

[types](../modules/types.md).RoomMemory

## Hierarchy

* **RoomMemory**

## Table of contents

### Properties

- [constructionQueue](types.roommemory.md#constructionqueue)
- [level](types.roommemory.md#level)
- [links](types.roommemory.md#links)
- [planner](types.roommemory.md#planner)
- [populationLimit](types.roommemory.md#populationlimit)
- [repairQueue](types.roommemory.md#repairqueue)
- [sources](types.roommemory.md#sources)
- [spawn](types.roommemory.md#spawn)
- [storage](types.roommemory.md#storage)
- [tombs](types.roommemory.md#tombs)
- [towers](types.roommemory.md#towers)
- [wallRepairQueue](types.roommemory.md#wallrepairqueue)

## Properties

### constructionQueue

• **constructionQueue**: [*ConstructionQueue*](../modules/types.md#constructionqueue)

The construction queue: an array of ConstructionSite positions

Defined in: [src/types.d.ts:135](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L135)

___

### level

• **level**: *number*

Defined in: [src/types.d.ts:124](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L124)

___

### links

• **links**: [*RoomLinksMemory*](types.roomlinksmemory.md)

Defined in: [src/types.d.ts:132](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L132)

___

### planner

• **planner**: *undefined* \| [*PlannerMemory*](types.plannermemory.md)

Defined in: [src/types.d.ts:131](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L131)

___

### populationLimit

• **populationLimit**: [*MemoryPopulationLimit*](../modules/types.md#memorypopulationlimit)

Defined in: [src/types.d.ts:133](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L133)

___

### repairQueue

• **repairQueue**: [*RepairQueue*](../modules/types.md#repairqueue)

The repair queue: an array of Structure ids that need repairs, sorted by
least hits to most

Defined in: [src/types.d.ts:140](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L140)

___

### sources

• **sources**: *Id*<*Source*\>[]

Defined in: [src/types.d.ts:127](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L127)

___

### spawn

• **spawn**: *Id*<*StructureSpawn*\>

Defined in: [src/types.d.ts:125](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L125)

___

### storage

• **storage**: *undefined* \| *Id*<*StructureStorage*\>

Defined in: [src/types.d.ts:129](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L129)

___

### tombs

• **tombs**: *Id*<*Tombstone*\>[]

Defined in: [src/types.d.ts:128](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L128)

___

### towers

• **towers**: *Id*<*StructureTower*\>[]

Defined in: [src/types.d.ts:126](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L126)

___

### wallRepairQueue

• **wallRepairQueue**: *Id*<*StructureRampart* \| *StructureWall*\>[]

Defined in: [src/types.d.ts:130](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L130)
