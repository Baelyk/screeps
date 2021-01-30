[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / [types](../modules/types.md) / Memory

# Interface: Memory

[types](../modules/types.md).Memory

## Hierarchy

* **Memory**

## Table of contents

### Properties

- [creeps](types.memory.md#creeps)
- [debug](types.memory.md#debug)
- [flags](types.memory.md#flags)
- [initialSpawn](types.memory.md#initialspawn)
- [powerCreeps](types.memory.md#powercreeps)
- [rooms](types.memory.md#rooms)
- [spawns](types.memory.md#spawns)
- [uninitialized](types.memory.md#uninitialized)
- [watch](types.memory.md#watch)

## Properties

### creeps

• **creeps**: { [name: string]: [*CreepMemory*](types.creepmemory.md);  }

Defined in: node_modules/@types/screeps/index.d.ts:3196

___

### debug

• **debug**: [*DebugMemory*](types.debugmemory.md)

Defined in: [src/types.d.ts:11](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L11)

___

### flags

• **flags**: { [name: string]: FlagMemory;  }

Defined in: node_modules/@types/screeps/index.d.ts:3198

___

### initialSpawn

• **initialSpawn**: *string*

The name of the spawn to use when Initializing.

E.g., Game.spawns[Memory.initialSpawn]

Defined in: [src/types.d.ts:9](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L9)

___

### powerCreeps

• **powerCreeps**: { [name: string]: PowerCreepMemory;  }

Defined in: node_modules/@types/screeps/index.d.ts:3197

___

### rooms

• **rooms**: { [name: string]: [*RoomMemory*](types.roommemory.md);  }

Defined in: node_modules/@types/screeps/index.d.ts:3199

___

### spawns

• **spawns**: { [name: string]: [*SpawnMemory*](types.spawnmemory.md);  }

Defined in: node_modules/@types/screeps/index.d.ts:3200

___

### uninitialized

• **uninitialized**: *boolean*

Whether the colony needs to be initialized

Defined in: [src/types.d.ts:3](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L3)

___

### watch

• **watch**: [*ScreepsMultimeterWatch*](types.screepsmultimeterwatch.md)

Defined in: [src/types.d.ts:10](https://github.com/Baelyk/screeps/blob/c7b9358/src/types.d.ts#L10)
