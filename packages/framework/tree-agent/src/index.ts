/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A library for creating AI agents to interact with a {@link SharedTree | https://fluidframework.com/docs/data-structures/tree/}.
 *
 * @packageDocumentation
 */

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
} from "@fluidframework/type-factory/alpha";
// Re-export APIs that were moved to @fluidframework/type-factory to avoid breaking changes.
export {
	type Arg,
	type ArgsTuple,
	buildFunc,
	type Ctor,
	type ExposedMethods,
	type ExposedProperties,
	exposeMethodsSymbol,
	type exposePropertiesSymbol,
	type FunctionDef,
	type IExposedMethods,
	type IExposedProperties,
	isTypeFactoryType,
	type MethodKeys,
} from "@fluidframework/type-factory/alpha";

export {
	createContext,
	createTreeAgent,
	executeSemanticEditing,
	SharedTreeSemanticAgent,
} from "./agent.js";
export type {
	AsynchronousEditor,
	Context,
	// Existing API
	EditResult,
	ExecuteSemanticEditingOptions,
	Logger,
	SemanticAgentOptions,
	SharedTreeChatModel,
	SharedTreeChatQuery,
	SynchronousEditor,
	// New API
	TreeAgent,
	TreeAgentAssistantMessage,
	TreeAgentChatMessage,
	TreeAgentChatResponse,
	TreeAgentOptions,
	TreeAgentSystemMessage,
	TreeAgentToolCallMessage,
	TreeAgentToolResultMessage,
	TreeAgentUserMessage,
	TreeView,
	ViewOrTree,
} from "./api.js";
export { type BindableSchema } from "./methodBinding.js";
export { type PropertyDef } from "./propertyBinding.js";
export { typeFactory } from "./treeAgentTypes.js";
export { llmDefault } from "./utils.js";
