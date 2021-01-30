[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / utils/logger

# Module: utils/logger

## Table of contents

### Functions

- [error](utils_logger.md#error)
- [errorConstant](utils_logger.md#errorconstant)
- [info](utils_logger.md#info)
- [stringifyBody](utils_logger.md#stringifybody)
- [tick](utils_logger.md#tick)
- [warn](utils_logger.md#warn)

## Functions

### error

▸ **error**(`msg?`: *any*): *void*

Logs a message in red

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`msg?` | *any* | The message    |

**Returns:** *void*

Defined in: [src/utils/logger.ts:79](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/logger.ts#L79)

___

### errorConstant

▸ **errorConstant**(`error`: ScreepsReturnCode): *string*

Return the name of the error code, i.e. it's constant name

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`error` | ScreepsReturnCode | The error code   |

**Returns:** *string*

The constant name of the error code, or an empty string if the
  error code does not exist

Defined in: [src/utils/logger.ts:10](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/logger.ts#L10)

___

### info

▸ **info**(`msg?`: *any*, `type?`: [*InfoType*](../enums/types.infotype.md)): *void*

Logs a message in blue

#### Parameters:

Name | Type | Default value | Description |
------ | ------ | ------ | ------ |
`msg?` | *any* | - | The message    |
`type` | [*InfoType*](../enums/types.infotype.md) | ... | - |

**Returns:** *void*

Defined in: [src/utils/logger.ts:68](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/logger.ts#L68)

___

### stringifyBody

▸ **stringifyBody**(`body`: BodyPartConstant[]): *string*

Creates a string from a provided BodyPartConstant array

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`body` | BodyPartConstant[] | The BodyPartConstant[]   |

**Returns:** *string*

A string representing the body

Defined in: [src/utils/logger.ts:98](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/logger.ts#L98)

___

### tick

▸ **tick**(`format?`: *string*): *void*

Log the current tick

#### Parameters:

Name | Type |
------ | ------ |
`format?` | *string* |

**Returns:** *void*

Defined in: [src/utils/logger.ts:119](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/logger.ts#L119)

___

### warn

▸ **warn**(`msg?`: *any*): *void*

Logs a message in yellow

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`msg?` | *any* | The message    |

**Returns:** *void*

Defined in: [src/utils/logger.ts:88](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/logger.ts#L88)
