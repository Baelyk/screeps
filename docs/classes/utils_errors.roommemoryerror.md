[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / [utils/errors](../modules/utils_errors.md) / RoomMemoryError

# Class: RoomMemoryError

[utils/errors](../modules/utils_errors.md).RoomMemoryError

## Hierarchy

* *MemoryError*

  ↳ **RoomMemoryError**

## Table of contents

### Constructors

- [constructor](utils_errors.roommemoryerror.md#constructor)

### Properties

- [displayName](utils_errors.roommemoryerror.md#displayname)
- [message](utils_errors.roommemoryerror.md#message)
- [name](utils_errors.roommemoryerror.md#name)
- [prepareStackTrace](utils_errors.roommemoryerror.md#preparestacktrace)
- [stack](utils_errors.roommemoryerror.md#stack)
- [stackTraceLimit](utils_errors.roommemoryerror.md#stacktracelimit)
- [type](utils_errors.roommemoryerror.md#type)

### Methods

- [captureStackTrace](utils_errors.roommemoryerror.md#capturestacktrace)
- [toString](utils_errors.roommemoryerror.md#tostring)

## Constructors

### constructor

\+ **new RoomMemoryError**(`room`: Room, `invalidField`: *spawn* \| *storage* \| *level* \| *towers* \| *sources* \| *tombs* \| *wallRepairQueue* \| *planner* \| *links*, `message?`: *string*): [*RoomMemoryError*](utils_errors.roommemoryerror.md)

#### Parameters:

Name | Type |
------ | ------ |
`room` | Room |
`invalidField` | *spawn* \| *storage* \| *level* \| *towers* \| *sources* \| *tombs* \| *wallRepairQueue* \| *planner* \| *links* |
`message?` | *string* |

**Returns:** [*RoomMemoryError*](utils_errors.roommemoryerror.md)

Defined in: [src/utils/errors.ts:141](https://github.com/Baelyk/screeps/blob/9bfed96/src/utils/errors.ts#L141)

## Properties

### displayName

• **displayName**: *string*= "Error"

Defined in: [src/utils/errors.ts:10](https://github.com/Baelyk/screeps/blob/9bfed96/src/utils/errors.ts#L10)

___

### message

• **message**: *string*

Defined in: node_modules/typescript/lib/lib.es5.d.ts:974

___

### name

• **name**: *string*

Defined in: node_modules/typescript/lib/lib.es5.d.ts:973

___

### prepareStackTrace

• `Optional` **prepareStackTrace**: *undefined* \| (`err`: Error, `stackTraces`: CallSite[]) => *any*

Optional override for formatting stack traces

**`see`** https://github.com/v8/v8/wiki/Stack%20Trace%20API#customizing-stack-traces

Defined in: node_modules/@types/node/globals.d.ts:140

___

### stack

• `Optional` **stack**: *undefined* \| *string*

Defined in: node_modules/typescript/lib/lib.es5.d.ts:975

___

### stackTraceLimit

• **stackTraceLimit**: *number*

Defined in: node_modules/@types/node/globals.d.ts:142

___

### type

• **type**: default

Defined in: [src/utils/errors.ts:9](https://github.com/Baelyk/screeps/blob/9bfed96/src/utils/errors.ts#L9)

## Methods

### captureStackTrace

▸ **captureStackTrace**(`targetObject`: Object, `constructorOpt?`: Function): *void*

Create .stack property on a target object

#### Parameters:

Name | Type |
------ | ------ |
`targetObject` | Object |
`constructorOpt?` | Function |

**Returns:** *void*

Defined in: node_modules/@types/node/globals.d.ts:133

___

### toString

▸ **toString**(): *string*

**Returns:** *string*

Defined in: [src/utils/errors.ts:20](https://github.com/Baelyk/screeps/blob/9bfed96/src/utils/errors.ts#L20)
