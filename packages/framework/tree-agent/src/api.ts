/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ImplicitFieldSchema, TreeNode } from "@fluidframework/tree";
// These are used for doc links
import type { FactoryContentObject, ReadableField } from "@fluidframework/tree/alpha";

// This is used for doc links
// eslint-disable-next-line unused-imports/no-unused-imports
import type { bindEditor, defaultEditor } from "./agent.js";

/**
 * Logger interface for logging events from a {@link SharedTreeSemanticAgent}.
 * @alpha
 */
export interface Logger {
	/**
	 * Log a message.
	 */
	log(message: string): void;
}

/**
 * A synchronous function that executes a string of JavaScript code to perform an edit within a {@link SharedTreeSemanticAgent}.
 * @param context - An object that must be provided to the generated code as a variable named "context" in its top-level scope.
 * @param code - The JavaScript code that should be executed.
 * @remarks To simulate the execution of an editor outside of an {@link SharedTreeSemanticAgent | agent}, you can use {@link bindEditor | bindEditor} to bind an editor to a specific subtree.
 * @alpha
 */
export type SynchronousEditor = (context: Record<string, unknown>, code: string) => void;
/**
 * An asynchronous function that executes a string of JavaScript code to perform an edit within a {@link SharedTreeSemanticAgent}.
 * @param context - An object that must be provided to the generated code as a variable named "context" in its top-level scope.
 * @param code - The JavaScript code that should be executed.
 * @remarks To simulate the execution of an editor outside of an {@link SharedTreeSemanticAgent | agent}, you can use {@link bindEditor | bindEditor} to bind an editor to a specific subtree.
 * @alpha
 */
export type AsynchronousEditor = (
	context: Record<string, unknown>,
	code: string,
) => Promise<void>;

/**
 * Options used to parameterize the creation of a {@link SharedTreeSemanticAgent}.
 * @alpha
 */
export interface SemanticAgentOptions {
	/**
	 * Additional information about the application domain that will be included in the context provided to the {@link SharedTreeChatModel | model}.
	 */
	domainHints?: string;
	/**
	 * Executes any generated JavaScript created by the {@link SharedTreeChatModel.editToolName | model's editing tool}.
	 * @remarks If an error is thrown while executing the code, it will be caught and the message will be forwarded to the {@link SharedTreeChatModel | model} for debugging.
	 * @remarks If this function is not provided, the generated code will be executed using a {@link defaultEditor | simple default} which may not provide sufficient security guarantees for some environments.
	 * Use a library such as SES to provide a more secure implementation - see `@fluidframework/tree-agent-ses` for a drop-in implementation.
	 *
	 * To simulate the execution of an editor outside of an {@link SharedTreeSemanticAgent | agent}, you can use {@link bindEditor | bindEditor} to bind an editor to a specific subtree.
	 */
	editor?: SynchronousEditor | AsynchronousEditor;
	/**
	 * The maximum number of sequential edits the LLM can make before we assume it's stuck in a loop.
	 */
	maximumSequentialEdits?: number;
	/**
	 * If supplied, generates human-readable markdown text describing the actions taken by the {@link SharedTreeSemanticAgent | agent} as it performs queries.
	 */
	logger?: Logger;
}

/**
 * A result from an edit attempt via the {@link SharedTreeChatQuery.edit} function.
 * @alpha
 */
export interface EditResult {
	/**
	 * The type of the edit result.
	 * @remarks
	 * - `success`: The edit was successfully applied.
	 * - `disabledError`: The model is not allowed to edit the tree (i.e. {@link SharedTreeChatModel.editToolName} was not provided).
	 * - `editingError`: An error was thrown while parsing or executing the provided JavaScript.
	 * - `tooManyEditsError`: The {@link SharedTreeChatQuery.edit} function has been called more than the number of times specified by {@link SemanticAgentOptions.maximumSequentialEdits} for the same message.
	 * - `expiredError`: The {@link SharedTreeChatQuery.edit} function was called after the issuing query has already completed.
	 */
	type: "success" | "disabledError" | "editingError" | "tooManyEditsError" | "expiredError";

	/**
	 * A human-readable message describing the result of the edit attempt.
	 * @remarks In the case of an error, this message is appropriate to include in a model's chat history.
	 */
	message: string;
}

/**
 * Type guard for {@link EditResult}.
 */
export function isEditResult(value: unknown): value is EditResult {
	if (value === null || typeof value !== "object") {
		return false;
	}
	return (
		typeof (value as EditResult).type === "string" &&
		typeof (value as EditResult).message === "string"
	);
}

/**
 * A query from a user to a {@link SharedTreeSemanticAgent}.
 * @remarks Processing a query may involve editing the SharedTree via the provided {@link SharedTreeChatQuery.edit} function.
 * @alpha
 */
export interface SharedTreeChatQuery {
	/**
	 * The user's query.
	 */
	text: string;
	/**
	 * Edit the tree with the provided JavaScript function code.
	 * @remarks Attempting an edit may fail for a variety of reasons which are captured in the {@link EditResult | returned object}.
	 * If an edit fails, the tree will not be modified and the model may attempt another edit if desired.
	 * When the query ends, if the last edit attempt was successful, all edits made during the query will be merged into the agent's SharedTree.
	 * Otherwise, all edits made during the query will be discarded.
	 */
	edit(js: string): Promise<EditResult>;
}

/**
 * A plugin interface that handles queries from a {@link SharedTreeSemanticAgent}.
 * @remarks This wraps an underlying communication with an LLM and receives all necessary {@link SharedTreeChatModel.appendContext | context} from the {@link SharedTreeSemanticAgent | agent} for the LLM to properly analyze and edit the tree.
 * See `@fluidframework/tree-agent-langchain` for a drop-in implementation based on the LangChain library.
 * @alpha
 */
export interface SharedTreeChatModel {
	/**
	 * A optional name of this chat model.
	 * @remarks If supplied, this may be used in logging or debugging information.
	 * @example "gpt-5"
	 */
	name?: string;
	/**
	 * The name of the tool that the model should use to edit the tree.
	 * @remarks If supplied, this will be mentioned in the context provided to the model so that the underlying LLM will be encouraged to use it when a user query requires an edit.
	 * The model should "implement" the tool by registering it with the underlying LLM API.
	 * The tool should take an LLM-generated JavaScript function as input and supply it to the {@link SharedTreeChatQuery.edit | edit} function.
	 * Instructions for generating the proper function signature and implementation will be provided by the {@link SharedTreeSemanticAgent | agent} via {@link SharedTreeChatModel.appendContext | context}.
	 * If not supplied, the model will not be able to edit the tree (running the {@link SharedTreeChatQuery.edit | edit} function will fail).
	 */
	editToolName?: string;
	/**
	 * Add contextual information to the model that may be relevant to future queries.
	 * @remarks In practice, this may be implemented by e.g. appending a "system" message to an LLM's chat/message history.
	 * This context must be present in the context window of every {@link SharedTreeChatModel.query | query} for e.g. {@link SharedTreeChatModel.editToolName | editing} to work.
	 * @param text - The message or context to append.
	 */
	appendContext?(text: string): void;
	/**
	 * Queries the chat model with a request from the user.
	 * @remarks This model may simply return a text response to the query, or it may first call the {@link SharedTreeChatQuery.edit} function (potentially multiple times) to modify the tree in response to the query.
	 */
	query(message: SharedTreeChatQuery): Promise<string>;
}

/**
 * A function that edits a SharedTree.
 */
export type EditFunction<TSchema extends ImplicitFieldSchema> = ({
	root,
	create,
}: {
	root: ReadableField<TSchema>;
	create: Record<string, (input: FactoryContentObject) => TreeNode>;
}) => void | Promise<void>;
