/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ImplicitFieldSchema, TreeNode } from "@fluidframework/tree";
import type { FactoryContentObject, ReadableField } from "@fluidframework/tree/alpha";

// This is used for doc links
// eslint-disable-next-line unused-imports/no-unused-imports
import type { SharedTreeSemanticAgent } from "./agent.js";

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
 * Options used to parameterize the creation of a {@link SharedTreeSemanticAgent}.
 * @alpha
 */
export interface SemanticAgentOptions {
	/**
	 * Additional information about the application domain that will be included in the context provided to the {@link SharedTreeChatModel | model}.
	 */
	domainHints?: string;
	/**
	 * Validates any generated JavaScript created by the {@link SharedTreeChatModel.editToolName | model's editing tool} before running it.
	 * @remarks If this returns false, then the edit will throw an error instead of attempting to execute the JavaScript.
	 */
	validator?: (js: string) => boolean;
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
 * @remarks
 * - `success`: The edit was successfully applied.
 * - `disabledError`: The model is not allowed to edit the tree (i.e. {@link SharedTreeChatModel.editToolName} was not provided).
 * - `validationError`: The provided JavaScript did not pass the optional {@link SemanticAgentOptions.validator} function.
 * - `compileError`: The provided JavaScript could not be parsed or compiled.
 * - `runtimeError`: An error was thrown while executing the provided JavaScript.
 * - `tooManyEditsError`: The {@link SharedTreeChatQuery.edit} function has been called more than the number of times specified by {@link SemanticAgentOptions.maximumSequentialEdits} for the same message.
 * - `expiredError`: The {@link SharedTreeChatQuery.edit} function was called after the issuing query has already completed.
 * @alpha
 */
export interface EditResult {
	type:
		| "success"
		| "disabledError"
		| "validationError"
		| "compileError"
		| "runtimeError"
		| "tooManyEditsError"
		| "expiredError";

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
	 */
	edit(js: string): Promise<EditResult>;
}

/**
 * A plugin interface that handles queries from a {@link SharedTreeSemanticAgent}.
 * @remarks This wraps an underlying communication with an LLM and receives all necessary {@link SharedTreeChatModel.appendContext | context} from the {@link SharedTreeSemanticAgent | agent} for the LLM to properly analyze and edit the tree.
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
