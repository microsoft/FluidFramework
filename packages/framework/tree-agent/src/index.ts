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
