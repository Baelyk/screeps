[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / types

# Module: types

## Table of contents

### Enumerations

- [CreepRole](../enums/types.creeprole.md)
- [CreepTask](../enums/types.creeptask.md)
- [InfoType](../enums/types.infotype.md)
- [LinkMode](../enums/types.linkmode.md)
- [LinkType](../enums/types.linktype.md)

### Interfaces

- [Coord](../interfaces/types.coord.md)
- [CreepMemory](../interfaces/types.creepmemory.md)
- [DebugEnergyHarvested](../interfaces/types.debugenergyharvested.md)
- [DebugMemory](../interfaces/types.debugmemory.md)
- [LinkMemory](../interfaces/types.linkmemory.md)
- [LogSettings](../interfaces/types.logsettings.md)
- [Memory](../interfaces/types.memory.md)
- [PlannerCoord](../interfaces/types.plannercoord.md)
- [PlannerMemory](../interfaces/types.plannermemory.md)
- [PlannerStructurePlan](../interfaces/types.plannerstructureplan.md)
- [RoomLinksMemory](../interfaces/types.roomlinksmemory.md)
- [RoomMemory](../interfaces/types.roommemory.md)
- [ScreepsMultimeterWatch](../interfaces/types.screepsmultimeterwatch.md)
- [SpawnMemory](../interfaces/types.spawnmemory.md)
- [StatusMemory](../interfaces/types.statusmemory.md)
- [TowerMemory](../interfaces/types.towermemory.md)

### Type aliases

- [ConstructionQueue](types.md#constructionqueue)
- [MemoryPopulationLimit](types.md#memorypopulationlimit)
- [PlannerPlan](types.md#plannerplan)
- [RepairQueue](types.md#repairqueue)

### Variables

- [Memory](types.md#memory)

## Type aliases

### ConstructionQueue

Ƭ **ConstructionQueue**: RoomPosition[]

Defined in: [src/types.d.ts:59](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L59)

___

### MemoryPopulationLimit

Ƭ **MemoryPopulationLimit**: { [key in CreepRole]?: number}

Defined in: [src/types.d.ts:27](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L27)

___

### PlannerPlan

Ƭ **PlannerPlan**: { [key in BuildableStructureConstant]?: PlannerStructurePlan}

Defined in: [src/types.d.ts:154](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L154)

___

### RepairQueue

Ƭ **RepairQueue**: *Id*<Structure\>[]

Defined in: [src/types.d.ts:60](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L60)

## Variables

### Memory

• **Memory**: [*Memory*](types.md#memory)

Defined in: node_modules/@types/screeps/index.d.ts:3209
