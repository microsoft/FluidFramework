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
	buildFunc,
	exposeMethodsSymbol,
	type ExposedMethods,
	type Arg,
	type FunctionDef,
	type MethodKeys,
	type Ctor,
	type IExposedMethods,
} from "./methodBinding.js";

export {
	exposePropertiesSymbol,
	type ExposedProperties,
	type IExposedProperties,
} from "./propertyBinding.js";

export { typeFactory, isTypeFactoryType } from "./treeAgentTypes.js";

export type {
	TypeFactoryType,
	TypeFactoryTypeKind,
	TypeFactoryString,
	TypeFactoryNumber,
	TypeFactoryBoolean,
	TypeFactoryDate,
	TypeFactoryVoid,
	TypeFactoryUndefined,
	TypeFactoryNull,
	TypeFactoryUnknown,
	TypeFactoryArray,
	TypeFactoryPromise,
	TypeFactoryObject,
	TypeFactoryRecord,
	TypeFactoryMap,
	TypeFactoryTuple,
	TypeFactoryUnion,
	TypeFactoryIntersection,
	TypeFactoryLiteral,
	TypeFactoryOptional,
	TypeFactoryReadonly,
	TypeFactoryFunction,
	TypeFactoryFunctionParameter,
	TypeFactoryInstanceOf,
} from "./treeAgentTypes.js";
