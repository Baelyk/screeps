[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / [types](../modules/types.md) / Memory

# Interface: Memory

[types](../modules/types.md).Memory

## Hierarchy

* **Memory**

## Table of contents

### Properties

- [constructionQueue](types.memory.md#constructionqueue)
- [creeps](types.memory.md#creeps)
- [debug](types.memory.md#debug)
- [flags](types.memory.md#flags)
- [initialSpawn](types.memory.md#initialspawn)
- [populationLimit](types.memory.md#populationlimit)
- [powerCreeps](types.memory.md#powercreeps)
- [repairQueue](types.memory.md#repairqueue)
- [rooms](types.memory.md#rooms)
- [spawns](types.memory.md#spawns)
- [status](types.memory.md#status)
- [uninitialized](types.memory.md#uninitialized)
- [watch](types.memory.md#watch)

## Properties

### constructionQueue

• **constructionQueue**: [*ConstructionQueue*](../modules/types.md#constructionqueue)

The construction queue: an array of ConstructionSite positions

Defined in: [src/types.d.ts:11](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L11)

___

### creeps

• **creeps**: { [name: string]: [*CreepMemory*](types.creepmemory.md);  }

Defined in: node_modules/@types/screeps/index.d.ts:3196

___

### debug

• **debug**: [*DebugMemory*](types.debugmemory.md)

Defined in: [src/types.d.ts:18](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L18)

___

### flags

• **flags**: { [name: string]: FlagMemory;  }

Defined in: node_modules/@types/screeps/index.d.ts:3198

___

### initialSpawn

• **initialSpawn**: *string*

The name of the spawn to use when Initializing.

E.g., Game.spawns[Memory.initialSpawn]

Defined in: [src/types.d.ts:9](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L9)

___

### populationLimit

• **populationLimit**: [*MemoryPopulationLimit*](../modules/types.md#memorypopulationlimit)

Defined in: [src/types.d.ts:19](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L19)

___

### powerCreeps

• **powerCreeps**: { [name: string]: PowerCreepMemory;  }

Defined in: node_modules/@types/screeps/index.d.ts:3197

___

### repairQueue

• **repairQueue**: [*RepairQueue*](../modules/types.md#repairqueue)

The repair queue: an array of Structure ids that need repairs, sorted by
least hits to most

Defined in: [src/types.d.ts:16](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L16)

___

### rooms

• **rooms**: { [name: string]: [*RoomMemory*](types.roommemory.md);  }

Defined in: node_modules/@types/screeps/index.d.ts:3199

___

### spawns

• **spawns**: { [name: string]: [*SpawnMemory*](types.spawnmemory.md);  }

Defined in: node_modules/@types/screeps/index.d.ts:3200

___

### status

• **status**: [*StatusMemory*](types.statusmemory.md)

Defined in: [src/types.d.ts:20](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L20)

___

### uninitialized

• **uninitialized**: *boolean*

Whether the colony needs to be initialized

Defined in: [src/types.d.ts:3](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L3)

___

### watch

• **watch**: [*ScreepsMultimeterWatch*](types.screepsmultimeterwatch.md)

Defined in: [src/types.d.ts:17](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L17)
