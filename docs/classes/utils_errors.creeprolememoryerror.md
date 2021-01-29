[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / [utils/errors](../modules/utils_errors.md) / CreepRoleMemoryError

# Class: CreepRoleMemoryError

[utils/errors](../modules/utils_errors.md).CreepRoleMemoryError

## Hierarchy

* [*CreepMemoryError*](utils_errors.creepmemoryerror.md)

  ↳ **CreepRoleMemoryError**

  ↳↳ [*InvalidCreepTaskError*](utils_errors.invalidcreeptaskerror.md)

  ↳↳ [*InvalidCreepRoleError*](utils_errors.invalidcreeproleerror.md)

## Table of contents

### Constructors

- [constructor](utils_errors.creeprolememoryerror.md#constructor)

### Properties

- [displayName](utils_errors.creeprolememoryerror.md#displayname)
- [message](utils_errors.creeprolememoryerror.md#message)
- [name](utils_errors.creeprolememoryerror.md#name)
- [prepareStackTrace](utils_errors.creeprolememoryerror.md#preparestacktrace)
- [stack](utils_errors.creeprolememoryerror.md#stack)
- [stackTraceLimit](utils_errors.creeprolememoryerror.md#stacktracelimit)
- [type](utils_errors.creeprolememoryerror.md#type)

### Methods

- [captureStackTrace](utils_errors.creeprolememoryerror.md#capturestacktrace)
- [toString](utils_errors.creeprolememoryerror.md#tostring)

## Constructors

### constructor

\+ **new CreepRoleMemoryError**(`creep`: *Creep*, `invalidField`: *string* \| *number*, `message?`: *string*): [*CreepRoleMemoryError*](utils_errors.creeprolememoryerror.md)

#### Parameters:

Name | Type |
------ | ------ |
`creep` | *Creep* |
`invalidField` | *string* \| *number* |
`message?` | *string* |

**Returns:** [*CreepRoleMemoryError*](utils_errors.creeprolememoryerror.md)

Inherited from: [CreepMemoryError](utils_errors.creepmemoryerror.md)

Defined in: [src/utils/errors.ts:78](https://github.com/Baelyk/screeps/blob/9bfed96/src/utils/errors.ts#L78)

## Properties

### displayName

• **displayName**: *string*= "Error"

Inherited from: [CreepMemoryError](utils_errors.creepmemoryerror.md).[displayName](utils_errors.creepmemoryerror.md#displayname)

Defined in: [src/utils/errors.ts:10](https://github.com/Baelyk/screeps/blob/9bfed96/src/utils/errors.ts#L10)

___

### message

• **message**: *string*

Inherited from: [CreepMemoryError](utils_errors.creepmemoryerror.md).[message](utils_errors.creepmemoryerror.md#message)

Defined in: node_modules/typescript/lib/lib.es5.d.ts:974

___

### name

• **name**: *string*

Inherited from: [CreepMemoryError](utils_errors.creepmemoryerror.md).[name](utils_errors.creepmemoryerror.md#name)

Defined in: node_modules/typescript/lib/lib.es5.d.ts:973

___

### prepareStackTrace

• `Optional` **prepareStackTrace**: *undefined* \| (`err`: Error, `stackTraces`: CallSite[]) => *any*

Optional override for formatting stack traces

**`see`** https://github.com/v8/v8/wiki/Stack%20Trace%20API#customizing-stack-traces

Inherited from: [CreepMemoryError](utils_errors.creepmemoryerror.md).[prepareStackTrace](utils_errors.creepmemoryerror.md#preparestacktrace)

Defined in: node_modules/@types/node/globals.d.ts:140

___

### stack

• `Optional` **stack**: *undefined* \| *string*

Inherited from: [CreepMemoryError](utils_errors.creepmemoryerror.md).[stack](utils_errors.creepmemoryerror.md#stack)

Defined in: node_modules/typescript/lib/lib.es5.d.ts:975

___

### stackTraceLimit

• **stackTraceLimit**: *number*

Inherited from: [CreepMemoryError](utils_errors.creepmemoryerror.md).[stackTraceLimit](utils_errors.creepmemoryerror.md#stacktracelimit)

Defined in: node_modules/@types/node/globals.d.ts:142

___

### type

• **type**: default

Inherited from: [CreepMemoryError](utils_errors.creepmemoryerror.md).[type](utils_errors.creepmemoryerror.md#type)

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

Inherited from: [CreepMemoryError](utils_errors.creepmemoryerror.md)

Defined in: node_modules/@types/node/globals.d.ts:133

___

### toString

▸ **toString**(): *string*

**Returns:** *string*

Inherited from: [CreepMemoryError](utils_errors.creepmemoryerror.md)

Defined in: [src/utils/errors.ts:20](https://github.com/Baelyk/screeps/blob/9bfed96/src/utils/errors.ts#L20)
