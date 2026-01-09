/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A library for creating AI agents to interact with a {@link SharedTree | https://fluidframework.com/docs/data-structures/tree/}.
 *
 * @packageDocumentation
 */

export {
	SharedTreeSemanticAgent,
	createContext,
} from "./agent.js";
export type {
	EditResult,
	SharedTreeChatModel,
	SharedTreeChatQuery,
	Logger,
	SemanticAgentOptions,
	SynchronousEditor,
	AsynchronousEditor,
	TreeView,
	ViewOrTree,
	Context,
} from "./api.js";
export { llmDefault } from "./utils.js";
export {
	buildFunc,
	exposeMethodsSymbol,
	type ArgsTuple,
	type ExposedMethods,
	type Arg,
	type FunctionDef,
	type MethodKeys,
	type BindableSchema,
	type Ctor,
	type Infer,
	type InferZod,
	type InferArgsZod,
	type InferTypeFactory,
	type IExposedMethods,
} from "./methodBinding.js";
export type {
	exposePropertiesSymbol,
	PropertyDef,
	ExposedProperties,
	IExposedProperties,
	ExposableKeys,
	ReadOnlyRequirement,
	ReadonlyKeys,
	TypeMatchOrError,
	IfEquals,
} from "./propertyBinding.js";

/**
 * Custom type system for defining method and property types without zod dependency.
 * @alpha
 */
export {
	typeFactory,
	isTypeFactoryType,
	instanceOfsTypeFactory,
} from "./treeAgentTypes.js";

/**
 * Type interfaces for the type factory type system.
 * @alpha
 */
export type {
	TypeFactoryType,
	TypeFactoryTypeKind,
	TypeFactoryString,
	TypeFactoryNumber,
	TypeFactoryBoolean,
	TypeFactoryVoid,
	TypeFactoryUndefined,
	TypeFactoryNull,
	TypeFactoryUnknown,
	TypeFactoryArray,
	TypeFactoryObject,
	TypeFactoryRecord,
	TypeFactoryMap,
	TypeFactoryTuple,
	TypeFactoryUnion,
	TypeFactoryLiteral,
	TypeFactoryOptional,
	TypeFactoryReadonly,
	TypeFactoryInstanceOf,
} from "./treeAgentTypes.js";
