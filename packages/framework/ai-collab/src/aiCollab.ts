/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AiCollabErrorResponse,
	AiCollabOptions,
	AiCollabSuccessResponse,
} from "./aiCollabApi.js";
import { generateTreeEdits } from "./explicit-strategy/index.js";

/**
 * Calls an LLM to modify the provided SharedTree in a series of real time edits based on the provided users prompt input.
 * @remarks This function is designed to be a controlled "all-in-one" function that handles the entire process of calling an LLM to collaborative edit a SharedTree.
 *
 * @example
 * ```typescript
 * import {
 * 	SchemaFactory,
 * 	TreeViewConfiguration,
 * 	type TreeView
 * } from "@fluidframework/tree";
 *
 * const sf = new SchemaFactory("todo-app");
 *
 * class TodoTask extends sf.object("TodoTask", {
 * 	title: sf.string,
 * 	description: sf.string,
 * }) {}
 *
 * class TodoAppState extends sf.object("TodoAppState", {
 * 	tasks: sf.array(TodoTask),
 * }) {}
 *
 * // Initialize your SharedTree
 * const treeView: TreeView = tree.viewWith(new TreeViewConfiguration({ schema: TodoAppState }));
 * treeView.initialize({ tasks: [] });
 *
 * // Collaborate with AI in realtime in just one function call.
 * const response = await aiCollab({
 * 		openAI: {
 * 			client: new OpenAI({
 * 				apiKey: OPENAI_API_KEY,
 * 			}),
 * 			modelName: "gpt-4o",
 * 		},
 * 		treeNode: view.root,
 * 		prompt: {
 * 			systemRoleContext:
 * 				"You are an helpful assistant managing a todo list for a user.",
 * 			userAsk: "Create a set of new todos to plan a vacation to Cancun.",
 * 		},
 * 		planningStep: true,
 * 		finalReviewStep: true,
 * 	});
 * ```
 *
 * @remarks Known Limitiations:
 * - Root level array nodes are not supported
 * - Nested arrays are not supported
 * - Primitive nodes are not supported, e.g. 'string', 'number', 'boolean'
 * - Your application's Shared Tree schema must have no more than 4 levels of nesting
 * - Optional nodes are not supported in the Shared Tree schema
 * - Union types are not supported in the Shared Tree schema
 * - See README for more details.
 *
 * @alpha
 */
export async function aiCollab(
	options: AiCollabOptions,
): Promise<AiCollabSuccessResponse | AiCollabErrorResponse> {
	const response = await generateTreeEdits({
		treeNode: options.treeNode,
		validator: options.validator,
		clientOptions: options.openAI,
		prompt: options.prompt,
		limiters: options.limiters,
		planningStep: options.planningStep,
		finalReviewStep: options.finalReviewStep,
		debugEventLogHandler: options.debugEventLogHandler,
	});

	return response;
}
