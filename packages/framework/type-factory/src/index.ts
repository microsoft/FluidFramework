/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared types for exposing schema methods and properties to an LLM agent.
 *
 * @packageDocumentation
 */

export {
	type Arg,
	type ArgsTuple,
	buildFunc,
	type Ctor,
	type ExposedMethods,
	exposeMethodsSymbol,
	type FunctionDef,
	type IExposedMethods,
	type MethodKeys,
} from "./methodBinding.js";
export {
	type ExposedProperties,
	exposePropertiesSymbol,
	type IExposedProperties,
} from "./propertyBinding.js";
export type {
	TypeFactoryArray,
	TypeFactoryBoolean,
	TypeFactoryDate,
	TypeFactoryFunction,
	TypeFactoryFunctionParameter,
	TypeFactoryInstanceOf,
	TypeFactoryIntersection,
	TypeFactoryLiteral,
	TypeFactoryMap,
	TypeFactoryNull,
	TypeFactoryNumber,
	TypeFactoryObject,
	TypeFactoryOptional,
	TypeFactoryPromise,
	TypeFactoryReadonly,
	TypeFactoryRecord,
	TypeFactoryString,
	TypeFactoryTuple,
	TypeFactoryType,
	TypeFactoryTypeKind,
	TypeFactoryUndefined,
	TypeFactoryUnion,
	TypeFactoryUnknown,
	TypeFactoryVoid,
} from "./treeAgentTypes.js";
export { isTypeFactoryType, typeFactory } from "./treeAgentTypes.js";
