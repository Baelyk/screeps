[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / [utils/errors](../modules/utils_errors.md) / CreepMemoryError

# Class: CreepMemoryError

[utils/errors](../modules/utils_errors.md).CreepMemoryError

## Hierarchy

* *MemoryError*

  ↳ **CreepMemoryError**

  ↳↳ [*CreepRoleMemoryError*](utils_errors.creeprolememoryerror.md)

## Table of contents

### Constructors

- [constructor](utils_errors.creepmemoryerror.md#constructor)

### Properties

- [displayName](utils_errors.creepmemoryerror.md#displayname)
- [message](utils_errors.creepmemoryerror.md#message)
- [name](utils_errors.creepmemoryerror.md#name)
- [prepareStackTrace](utils_errors.creepmemoryerror.md#preparestacktrace)
- [stack](utils_errors.creepmemoryerror.md#stack)
- [stackTraceLimit](utils_errors.creepmemoryerror.md#stacktracelimit)
- [type](utils_errors.creepmemoryerror.md#type)

### Methods

- [captureStackTrace](utils_errors.creepmemoryerror.md#capturestacktrace)
- [toString](utils_errors.creepmemoryerror.md#tostring)

## Constructors

### constructor

\+ **new CreepMemoryError**(`creep`: *Creep*, `invalidField`: *string* \| *number*, `message?`: *string*): [*CreepMemoryError*](utils_errors.creepmemoryerror.md)

#### Parameters:

Name | Type |
------ | ------ |
`creep` | *Creep* |
`invalidField` | *string* \| *number* |
`message?` | *string* |

**Returns:** [*CreepMemoryError*](utils_errors.creepmemoryerror.md)

Defined in: [src/utils/errors.ts:68](https://github.com/Baelyk/screeps/blob/94a340d/src/utils/errors.ts#L68)

## Properties

### displayName

• **displayName**: *string*= "Error"

Defined in: [src/utils/errors.ts:10](https://github.com/Baelyk/screeps/blob/94a340d/src/utils/errors.ts#L10)

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

Defined in: [src/utils/errors.ts:9](https://github.com/Baelyk/screeps/blob/94a340d/src/utils/errors.ts#L9)

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

Defined in: [src/utils/errors.ts:20](https://github.com/Baelyk/screeps/blob/94a340d/src/utils/errors.ts#L20)
