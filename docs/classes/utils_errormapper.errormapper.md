[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / [utils/ErrorMapper](../modules/utils_errormapper.md) / ErrorMapper

# Class: ErrorMapper

[utils/ErrorMapper](../modules/utils_errormapper.md).ErrorMapper

## Hierarchy

* **ErrorMapper**

## Table of contents

### Constructors

- [constructor](utils_errormapper.errormapper.md#constructor)

### Properties

- [\_consumer](utils_errormapper.errormapper.md#_consumer)
- [cache](utils_errormapper.errormapper.md#cache)

### Accessors

- [consumer](utils_errormapper.errormapper.md#consumer)

### Methods

- [sourceMappedStackTrace](utils_errormapper.errormapper.md#sourcemappedstacktrace)
- [wrapLoop](utils_errormapper.errormapper.md#wraploop)

## Constructors

### constructor

\+ **new ErrorMapper**(): [*ErrorMapper*](utils_errormapper.errormapper.md)

**Returns:** [*ErrorMapper*](utils_errormapper.errormapper.md)

## Properties

### \_consumer

▪ `Private` `Optional` `Static` **\_consumer**: *undefined* \| *SourceMapConsumer*

Defined in: [src/utils/ErrorMapper.ts:6](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/ErrorMapper.ts#L6)

___

### cache

▪ `Static` **cache**: { [key: string]: *string*;  }

Defined in: [src/utils/ErrorMapper.ts:17](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/ErrorMapper.ts#L17)

## Accessors

### consumer

• `Static`**consumer**(): *SourceMapConsumer*

**Returns:** *SourceMapConsumer*

Defined in: [src/utils/ErrorMapper.ts:8](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/ErrorMapper.ts#L8)

## Methods

### sourceMappedStackTrace

▸ `Static`**sourceMappedStackTrace**(`error`: *string* \| Error): *string*

Generates a stack trace using a source map generate original symbol names.

WARNING - EXTREMELY high CPU cost for first call after reset - >30 CPU! Use sparingly!
(Consecutive calls after a reset are more reasonable, ~0.1 CPU/ea)

#### Parameters:

Name | Type | Description |
------ | ------ | ------ |
`error` | *string* \| Error | The error or original stack trace   |

**Returns:** *string*

The source-mapped stack trace

Defined in: [src/utils/ErrorMapper.ts:28](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/ErrorMapper.ts#L28)

___

### wrapLoop

▸ `Static`**wrapLoop**(`loop`: () => *void*): *function*

#### Parameters:

Name | Type |
------ | ------ |
`loop` | () => *void* |

**Returns:** *function*

Defined in: [src/utils/ErrorMapper.ts:72](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/ErrorMapper.ts#L72)
