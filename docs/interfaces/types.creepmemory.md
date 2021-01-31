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

Defined in: [src/types.d.ts:58](https://github.com/Baelyk/screeps/blob/94a340d/src/types.d.ts#L58)

___

### assignedRepairs

• `Optional` **assignedRepairs**: *undefined* \| *Id*<*Structure*<StructureConstant\>\>

A structuring needing repairs that this creep is repairing

Defined in: [src/types.d.ts:60](https://github.com/Baelyk/screeps/blob/94a340d/src/types.d.ts#L60)

___

### assignedSource

• `Optional` **assignedSource**: *undefined* \| *Id*<*Source*\>

A source assigned to this creep by id

Defined in: [src/types.d.ts:56](https://github.com/Baelyk/screeps/blob/94a340d/src/types.d.ts#L56)

___

### noRenew

• `Optional` **noRenew**: *undefined* \| *boolean*

Whether to prevent this creep from being renewed

Defined in: [src/types.d.ts:64](https://github.com/Baelyk/screeps/blob/94a340d/src/types.d.ts#L64)

___

### role

• **role**: [*CreepRole*](../enums/types.creeprole.md)

Defined in: [src/types.d.ts:51](https://github.com/Baelyk/screeps/blob/94a340d/src/types.d.ts#L51)

___

### room

• **room**: *undefined* \| *string*

Defined in: [src/types.d.ts:54](https://github.com/Baelyk/screeps/blob/94a340d/src/types.d.ts#L54)

___

### spot

• `Optional` **spot**: *undefined* \| RoomPosition

A spot assigned to this creep

Defined in: [src/types.d.ts:62](https://github.com/Baelyk/screeps/blob/94a340d/src/types.d.ts#L62)

___

### task

• **task**: [*CreepTask*](../enums/types.creeptask.md)

Defined in: [src/types.d.ts:52](https://github.com/Baelyk/screeps/blob/94a340d/src/types.d.ts#L52)
