[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / [utils/errors](../modules/utils_errors.md) / InvalidCreepRoleError

# Class: InvalidCreepRoleError

[utils/errors](../modules/utils_errors.md).InvalidCreepRoleError

## Hierarchy

* [*CreepRoleMemoryError*](utils_errors.creeprolememoryerror.md)

  ↳ **InvalidCreepRoleError**

## Table of contents

### Constructors

- [constructor](utils_errors.invalidcreeproleerror.md#constructor)

### Properties

- [displayName](utils_errors.invalidcreeproleerror.md#displayname)
- [message](utils_errors.invalidcreeproleerror.md#message)
- [name](utils_errors.invalidcreeproleerror.md#name)
- [prepareStackTrace](utils_errors.invalidcreeproleerror.md#preparestacktrace)
- [stack](utils_errors.invalidcreeproleerror.md#stack)
- [stackTraceLimit](utils_errors.invalidcreeproleerror.md#stacktracelimit)
- [type](utils_errors.invalidcreeproleerror.md#type)

### Methods

- [captureStackTrace](utils_errors.invalidcreeproleerror.md#capturestacktrace)
- [toString](utils_errors.invalidcreeproleerror.md#tostring)

## Constructors

### constructor

\+ **new InvalidCreepRoleError**(`creep`: *Creep*, `validRoles?`: [*CreepRole*](../enums/types.creeprole.md)[], `message?`: *string*): [*InvalidCreepRoleError*](utils_errors.invalidcreeproleerror.md)

#### Parameters:

Name | Type |
------ | ------ |
`creep` | *Creep* |
`validRoles?` | [*CreepRole*](../enums/types.creeprole.md)[] |
`message?` | *string* |

**Returns:** [*InvalidCreepRoleError*](utils_errors.invalidcreeproleerror.md)

Inherited from: [CreepRoleMemoryError](utils_errors.creeprolememoryerror.md)

Defined in: [src/utils/errors.ts:107](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/errors.ts#L107)

## Properties

### displayName

• **displayName**: *string*= "Error"

Inherited from: [CreepRoleMemoryError](utils_errors.creeprolememoryerror.md).[displayName](utils_errors.creeprolememoryerror.md#displayname)

Defined in: [src/utils/errors.ts:10](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/errors.ts#L10)

___

### message

• **message**: *string*

Inherited from: [CreepRoleMemoryError](utils_errors.creeprolememoryerror.md).[message](utils_errors.creeprolememoryerror.md#message)

Defined in: node_modules/typescript/lib/lib.es5.d.ts:974

___

### name

• **name**: *string*

Inherited from: [CreepRoleMemoryError](utils_errors.creeprolememoryerror.md).[name](utils_errors.creeprolememoryerror.md#name)

Defined in: node_modules/typescript/lib/lib.es5.d.ts:973

___

### prepareStackTrace

• `Optional` **prepareStackTrace**: *undefined* \| (`err`: Error, `stackTraces`: CallSite[]) => *any*

Optional override for formatting stack traces

**`see`** https://github.com/v8/v8/wiki/Stack%20Trace%20API#customizing-stack-traces

Inherited from: [CreepRoleMemoryError](utils_errors.creeprolememoryerror.md).[prepareStackTrace](utils_errors.creeprolememoryerror.md#preparestacktrace)

Defined in: node_modules/@types/node/globals.d.ts:140

___

### stack

• `Optional` **stack**: *undefined* \| *string*

Inherited from: [CreepRoleMemoryError](utils_errors.creeprolememoryerror.md).[stack](utils_errors.creeprolememoryerror.md#stack)

Defined in: node_modules/typescript/lib/lib.es5.d.ts:975

___

### stackTraceLimit

• **stackTraceLimit**: *number*

Inherited from: [CreepRoleMemoryError](utils_errors.creeprolememoryerror.md).[stackTraceLimit](utils_errors.creeprolememoryerror.md#stacktracelimit)

Defined in: node_modules/@types/node/globals.d.ts:142

___

### type

• **type**: default

Inherited from: [CreepRoleMemoryError](utils_errors.creeprolememoryerror.md).[type](utils_errors.creeprolememoryerror.md#type)

Defined in: [src/utils/errors.ts:9](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/errors.ts#L9)

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

Inherited from: [CreepRoleMemoryError](utils_errors.creeprolememoryerror.md)

Defined in: node_modules/@types/node/globals.d.ts:133

___

### toString

▸ **toString**(): *string*

**Returns:** *string*

Inherited from: [CreepRoleMemoryError](utils_errors.creeprolememoryerror.md)

Defined in: [src/utils/errors.ts:20](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/errors.ts#L20)
