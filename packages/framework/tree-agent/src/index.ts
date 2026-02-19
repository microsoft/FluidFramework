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
	createContext,
	SharedTreeSemanticAgent,
} from "./agent.js";
export type {
	AsynchronousEditor,
	Context,
	EditResult,
	Logger,
	SemanticAgentOptions,
	SharedTreeChatModel,
	SharedTreeChatQuery,
	SynchronousEditor,
	TreeView,
	ViewOrTree,
} from "./api.js";
export {
	type Arg,
	type ArgsTuple,
	type BindableSchema,
	buildFunc,
	type Ctor,
	type ExposedMethods,
	exposeMethodsSymbol,
	type FunctionDef,
	type IExposedMethods,
	type MethodKeys,
} from "./methodBinding.js";
export type {
	ExposedProperties,
	exposePropertiesSymbol,
	IExposedProperties,
	PropertyDef,
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
export {
	isTypeFactoryType,
	typeFactory,
} from "./treeAgentTypes.js";
export { llmDefault } from "./utils.js";
