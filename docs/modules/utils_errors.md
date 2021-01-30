[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / utils/errors

# Module: utils/errors

## Table of contents

### Classes

- [CreepMemoryError](../classes/utils_errors.creepmemoryerror.md)
- [CreepRoleMemoryError](../classes/utils_errors.creeprolememoryerror.md)
- [GetByIdError](../classes/utils_errors.getbyiderror.md)
- [GetPositionError](../classes/utils_errors.getpositionerror.md)
- [InvalidCreepRoleError](../classes/utils_errors.invalidcreeproleerror.md)
- [InvalidCreepTaskError](../classes/utils_errors.invalidcreeptaskerror.md)
- [RoomMemoryError](../classes/utils_errors.roommemoryerror.md)
- [ScriptError](../classes/utils_errors.scripterror.md)
- [SpawnMemoryError](../classes/utils_errors.spawnmemoryerror.md)

### Functions

- [wrapper](utils_errors.md#wrapper)

## Functions

### wrapper

▸ **wrapper**(`fn`: () => *void*, `message?`: *string*, `final?`: () => *void*): *void*

A wrapper around a function that may throw an error.

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`fn` | () => *void* | The function to wrap   |
`message?` | *string* | - |
`final?` | () => *void* | - |

**Returns:** *void*

Defined in: [src/utils/errors.ts:173](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/errors.ts#L173)
