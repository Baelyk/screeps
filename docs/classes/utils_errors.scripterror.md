[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / [utils/errors](../modules/utils_errors.md) / ScriptError

# Class: ScriptError

[utils/errors](../modules/utils_errors.md).ScriptError

## Hierarchy

* *Error*

  ↳ **ScriptError**

  ↳↳ [*GetByIdError*](utils_errors.getbyiderror.md)

  ↳↳ [*GetPositionError*](utils_errors.getpositionerror.md)

## Table of contents

### Constructors

- [constructor](utils_errors.scripterror.md#constructor)

### Properties

- [displayName](utils_errors.scripterror.md#displayname)
- [message](utils_errors.scripterror.md#message)
- [name](utils_errors.scripterror.md#name)
- [stack](utils_errors.scripterror.md#stack)
- [type](utils_errors.scripterror.md#type)
- [prepareStackTrace](utils_errors.scripterror.md#preparestacktrace)
- [stackTraceLimit](utils_errors.scripterror.md#stacktracelimit)

### Methods

- [toString](utils_errors.scripterror.md#tostring)
- [captureStackTrace](utils_errors.scripterror.md#capturestacktrace)

## Constructors

### constructor

\+ **new ScriptError**(`message`: *string*, `type?`: default): [*ScriptError*](utils_errors.scripterror.md)

#### Parameters:

Name | Type |
------ | ------ |
`message` | *string* |
`type?` | default |

**Returns:** [*ScriptError*](utils_errors.scripterror.md)

Defined in: [src/utils/errors.ts:10](https://github.com/Baelyk/screeps/blob/94a340d/src/utils/errors.ts#L10)

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

### stack

• `Optional` **stack**: *undefined* \| *string*

Defined in: node_modules/typescript/lib/lib.es5.d.ts:975

___

### type

• **type**: default

Defined in: [src/utils/errors.ts:9](https://github.com/Baelyk/screeps/blob/94a340d/src/utils/errors.ts#L9)

___

### prepareStackTrace

▪ `Optional` `Static` **prepareStackTrace**: *undefined* \| (`err`: Error, `stackTraces`: CallSite[]) => *any*

Optional override for formatting stack traces

**`see`** https://github.com/v8/v8/wiki/Stack%20Trace%20API#customizing-stack-traces

Defined in: node_modules/@types/node/globals.d.ts:140

___

### stackTraceLimit

▪ `Static` **stackTraceLimit**: *number*

Defined in: node_modules/@types/node/globals.d.ts:142

## Methods

### toString

▸ **toString**(): *string*

**Returns:** *string*

Defined in: [src/utils/errors.ts:20](https://github.com/Baelyk/screeps/blob/94a340d/src/utils/errors.ts#L20)

___

### captureStackTrace

▸ `Static`**captureStackTrace**(`targetObject`: Object, `constructorOpt?`: Function): *void*

Create .stack property on a target object

#### Parameters:

Name | Type |
------ | ------ |
`targetObject` | Object |
`constructorOpt?` | Function |

**Returns:** *void*

Defined in: node_modules/@types/node/globals.d.ts:133
