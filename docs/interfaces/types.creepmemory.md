[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / [types](../modules/types.md) / CreepMemory

# Interface: CreepMemory

[types](../modules/types.md).CreepMemory

## Hierarchy

* **CreepMemory**

## Indexable

▪ [key: *string*]: *any*

## Table of contents

### Properties

- [assignedConstruction](types.creepmemory.md#assignedconstruction)
- [assignedRepairs](types.creepmemory.md#assignedrepairs)
- [assignedSource](types.creepmemory.md#assignedsource)
- [noRenew](types.creepmemory.md#norenew)
- [role](types.creepmemory.md#role)
- [room](types.creepmemory.md#room)
- [spot](types.creepmemory.md#spot)
- [task](types.creepmemory.md#task)

## Properties

### assignedConstruction

• `Optional` **assignedConstruction**: *undefined* \| *string*

A construction site assigned to this creep by id

Defined in: [src/types.d.ts:71](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L71)

___

### assignedRepairs

• `Optional` **assignedRepairs**: *undefined* \| *Id*<*Structure*<StructureConstant\>\>

A structuring needing repairs that this creep is repairing

Defined in: [src/types.d.ts:73](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L73)

___

### assignedSource

• `Optional` **assignedSource**: *undefined* \| *Id*<*Source*\>

A source assigned to this creep by id

Defined in: [src/types.d.ts:69](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L69)

___

### noRenew

• `Optional` **noRenew**: *undefined* \| *boolean*

Whether to prevent this creep from being renewed

Defined in: [src/types.d.ts:77](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L77)

___

### role

• **role**: [*CreepRole*](../enums/types.creeprole.md)

Defined in: [src/types.d.ts:64](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L64)

___

### room

• **room**: *undefined* \| *string*

Defined in: [src/types.d.ts:67](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L67)

___

### spot

• `Optional` **spot**: *undefined* \| RoomPosition

A spot assigned to this creep

Defined in: [src/types.d.ts:75](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L75)

___

### task

• **task**: [*CreepTask*](../enums/types.creeptask.md)

Defined in: [src/types.d.ts:65](https://github.com/Baelyk/screeps/blob/9bfed96/src/types.d.ts#L65)
