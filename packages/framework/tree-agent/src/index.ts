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
	createTreeAgent,
	executeSemanticEditing,
} from "./agent.js";
export type {
	// New API
	TreeAgent,
	TreeAgentChatMessage,
	TreeAgentSystemMessage,
	TreeAgentUserMessage,
	TreeAgentAssistantMessage,
	TreeAgentToolCallMessage,
	TreeAgentToolResultMessage,
	TreeAgentChatResponse,
	TreeAgentOptions,
	ExecuteSemanticEditingOptions,
	// Existing API
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
export { type BindableSchema } from "./methodBinding.js";
export { typeFactory } from "./treeAgentTypes.js";

// Re-export APIs that were moved to @fluidframework/type-factory to avoid breaking changes.
export {
	buildFunc,
	exposeMethodsSymbol,
	isTypeFactoryType,
	type ExposedMethods,
	type Arg,
	type ArgsTuple,
	type FunctionDef,
	type MethodKeys,
	type Ctor,
	type IExposedMethods,
	type ExposedProperties,
	type IExposedProperties,
	type exposePropertiesSymbol,
} from "@fluidframework/type-factory/alpha";

export { type PropertyDef } from "./propertyBinding.js";

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
} from "@fluidframework/type-factory/alpha";
