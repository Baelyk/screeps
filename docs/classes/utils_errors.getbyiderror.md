[screeps-typescript-starter](../README.md) / [Exports](../modules.md) / [utils/errors](../modules/utils_errors.md) / GetByIdError

# Class: GetByIdError

[utils/errors](../modules/utils_errors.md).GetByIdError

## Hierarchy

* [*ScriptError*](utils_errors.scripterror.md)

  ↳ **GetByIdError**

## Table of contents

### Constructors

- [constructor](utils_errors.getbyiderror.md#constructor)

### Properties

- [displayName](utils_errors.getbyiderror.md#displayname)
- [message](utils_errors.getbyiderror.md#message)
- [name](utils_errors.getbyiderror.md#name)
- [prepareStackTrace](utils_errors.getbyiderror.md#preparestacktrace)
- [stack](utils_errors.getbyiderror.md#stack)
- [stackTraceLimit](utils_errors.getbyiderror.md#stacktracelimit)
- [type](utils_errors.getbyiderror.md#type)

### Methods

- [captureStackTrace](utils_errors.getbyiderror.md#capturestacktrace)
- [toString](utils_errors.getbyiderror.md#tostring)

## Constructors

### constructor

\+ **new GetByIdError**(`object`: *string* \| *Id*<StructureConstant\>, `objectType?`: *extension* \| *rampart* \| *road* \| *spawn* \| *link* \| *constructedWall* \| *storage* \| *tower* \| *observer* \| *powerSpawn* \| *extractor* \| *lab* \| *terminal* \| *container* \| *nuker* \| *factory* \| *keeperLair* \| *controller* \| *powerBank* \| *portal* \| *invaderCore* \| *construction site* \| *creep* \| *deposit* \| *mineral* \| *nuke* \| *power creep* \| *resource* \| *ruin* \| *source* \| *tombstone*, `message?`: *string*): [*GetByIdError*](utils_errors.getbyiderror.md)

#### Parameters:

Name | Type |
------ | ------ |
`object` | *string* \| *Id*<StructureConstant\> |
`objectType?` | *extension* \| *rampart* \| *road* \| *spawn* \| *link* \| *constructedWall* \| *storage* \| *tower* \| *observer* \| *powerSpawn* \| *extractor* \| *lab* \| *terminal* \| *container* \| *nuker* \| *factory* \| *keeperLair* \| *controller* \| *powerBank* \| *portal* \| *invaderCore* \| *construction site* \| *creep* \| *deposit* \| *mineral* \| *nuke* \| *power creep* \| *resource* \| *ruin* \| *source* \| *tombstone* |
`message?` | *string* |

**Returns:** [*GetByIdError*](utils_errors.getbyiderror.md)

Inherited from: [ScriptError](utils_errors.scripterror.md)

Defined in: [src/utils/errors.ts:44](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/errors.ts#L44)

## Properties

### displayName

• **displayName**: *string*= "Error"

Inherited from: [ScriptError](utils_errors.scripterror.md).[displayName](utils_errors.scripterror.md#displayname)

Defined in: [src/utils/errors.ts:10](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/errors.ts#L10)

___

### message

• **message**: *string*

Inherited from: [ScriptError](utils_errors.scripterror.md).[message](utils_errors.scripterror.md#message)

Defined in: node_modules/typescript/lib/lib.es5.d.ts:974

___

### name

• **name**: *string*

Inherited from: [ScriptError](utils_errors.scripterror.md).[name](utils_errors.scripterror.md#name)

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

Inherited from: [ScriptError](utils_errors.scripterror.md).[stack](utils_errors.scripterror.md#stack)

Defined in: node_modules/typescript/lib/lib.es5.d.ts:975

___

### stackTraceLimit

• **stackTraceLimit**: *number*

Defined in: node_modules/@types/node/globals.d.ts:142

___

### type

• **type**: default

Inherited from: [ScriptError](utils_errors.scripterror.md).[type](utils_errors.scripterror.md#type)

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

Defined in: node_modules/@types/node/globals.d.ts:133

___

### toString

▸ **toString**(): *string*

**Returns:** *string*

Inherited from: [ScriptError](utils_errors.scripterror.md)

Defined in: [src/utils/errors.ts:20](https://github.com/Baelyk/screeps/blob/c7b9358/src/utils/errors.ts#L20)
