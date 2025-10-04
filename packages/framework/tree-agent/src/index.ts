/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A library for creating AI agents to interact with a {@link SharedTree | https://fluidframework.com/docs/data-structures/tree/}.
 *
 * @packageDocumentation
 */

export { createSemanticAgent } from "./agent.js";
export type { Logger, SemanticAgentOptions, SharedTreeSemanticAgent } from "./agent.js";
export { type TreeView, llmDefault } from "./utils.js";
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
