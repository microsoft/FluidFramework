/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	getSimpleSchema,
	normalizeFieldSchema,
	// Tree,
	type ImplicitFieldSchema,
	type SimpleTreeSchema,
	type TreeNode,
	type TreeView,
} from "@fluidframework/tree/internal";
import type {
	ChatCompletionCreateParams,
	ResponseFormatJSONSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "openai/resources/index.mjs";

import type { OpenAiClientOptions, TokenUsage } from "../aiCollabApi.js";

import { applyAgentEdit } from "./agentEditReducer.js";
import type { EditWrapper, TreeEdit } from "./agentEditTypes.js";
import { generateEditHandlers } from "./handlers.js";
import { IdGenerator } from "./idGenerator.js";
import { createResponseHandler, JsonHandler, type JsonObject } from "./json-handler/index.js";
import {
	getEditingSystemPrompt,
	getReviewSystemPrompt,
	getSuggestingSystemPrompt,
	toDecoratedJson,
	type EditLog,
} from "./promptGeneration.js";
import { fail } from "./utils.js";

const DEBUG_LOG: string[] = [];

/**
 * {@link generateTreeEdits} options.
 *
 * @internal
 */
export interface GenerateTreeEditsOptions<TSchema extends ImplicitFieldSchema> {
	openAI: OpenAiClientOptions;
	treeView: TreeView<TSchema>;
	prompt: {
		systemRoleContext: string;
		userAsk: string;
	};
	limiters?: {
		abortController?: AbortController;
		maxSequentialErrors?: number;
		maxModelCalls?: number;
		tokenLimits?: TokenUsage;
	};
	finalReviewStep?: boolean;
	validator?: (newContent: TreeNode) => void;
	dumpDebugLog?: boolean;
}

interface GenerateTreeEditsSuccessResponse {
	status: "success";
	tokenUsage: TokenUsage;
}

interface GenerateTreeEditsErrorResponse {
	status: "failure" | "partial-failure";
	errorMessage: "tokenLimitExceeded" | "tooManyErrors" | "tooManyModelCalls" | "aborted";
	tokenUsage: TokenUsage;
}

/**
 * Prompts the provided LLM client to generate valid tree edits.
 * Applies those edits to the provided tree branch before returning.
 *
 * @internal
 */
export async function generateTreeEdits(
	options: GenerateTreeEditsOptions<ImplicitFieldSchema>,
): Promise<GenerateTreeEditsSuccessResponse | GenerateTreeEditsErrorResponse> {
	const idGenerator = new IdGenerator();
	const editLog: EditLog = [];
	let editCount = 0;
	let sequentialErrorCount = 0;
	const simpleSchema = getSimpleSchema(
		normalizeFieldSchema(options.treeView.schema).allowedTypes,
	);

	// const simpleSchema = getSimpleSchema(Tree.schema(options.treeNode));

	const tokenUsage = { inputTokens: 0, outputTokens: 0 };

	for await (const edit of generateEdits(
		options,
		simpleSchema,
		idGenerator,
		editLog,
		options.limiters?.tokenLimits,
		tokenUsage,
	)) {
		try {
			const result = applyAgentEdit(
				options.treeView,
				edit,
				idGenerator,
				simpleSchema.definitions,
				options.validator,
			);
			editLog.push({ edit: result });
			sequentialErrorCount = 0;
		} catch (error: unknown) {
			if (error instanceof Error) {
				const { message } = error;
				sequentialErrorCount += 1;
				editLog.push({ edit, error: message });
				DEBUG_LOG?.push(`Error: ${message}`);

				if (error instanceof TokenLimitExceededError) {
					return {
						status: "failure",
						errorMessage: "tokenLimitExceeded",
						tokenUsage,
					};
				}
			} else {
				throw error;
			}
		}

		if (options.limiters?.abortController?.signal.aborted === true) {
			return {
				status: "failure",
				errorMessage: "aborted",
				tokenUsage,
			};
		}

		if (
			sequentialErrorCount >
			(options.limiters?.maxSequentialErrors ?? Number.POSITIVE_INFINITY)
		) {
			return {
				status: "failure",
				errorMessage: "tooManyErrors",
				tokenUsage,
			};
		}

		if (++editCount >= (options.limiters?.maxModelCalls ?? Number.POSITIVE_INFINITY)) {
			return {
				status: "failure",
				errorMessage: "tooManyModelCalls",
				tokenUsage,
			};
		}
	}

	if (options.dumpDebugLog ?? false) {
		console.log(DEBUG_LOG.join("\n\n"));
		DEBUG_LOG.length = 0;
	}

	return {
		status: "success",
		tokenUsage,
	};
}

interface ReviewResult {
	goalAccomplished: "yes" | "no";
}

async function* generateEdits<TSchema extends ImplicitFieldSchema>(
	options: GenerateTreeEditsOptions<TSchema>,
	simpleSchema: SimpleTreeSchema,
	idGenerator: IdGenerator,
	editLog: EditLog,
	tokenLimits: TokenUsage | undefined,
	tokenUsage: TokenUsage,
): AsyncGenerator<TreeEdit> {
	const originalDecoratedJson =
		(options.finalReviewStep ?? false)
			? toDecoratedJson(idGenerator, options.treeView.root)
			: undefined;
	// reviewed is implicitly true if finalReviewStep is false
	let hasReviewed = (options.finalReviewStep ?? false) ? false : true;

	async function getNextEdit(): Promise<TreeEdit | undefined> {
		const systemPrompt = getEditingSystemPrompt(
			options.prompt.userAsk,
			idGenerator,
			options.treeView,
			editLog,
			options.prompt.systemRoleContext,
		);

		DEBUG_LOG?.push(systemPrompt);

		return new Promise((resolve: (value: TreeEdit | undefined) => void) => {
			const editHandler = generateEditHandlers(simpleSchema, (jsonObject: JsonObject) => {
				// eslint-disable-next-line unicorn/no-null
				DEBUG_LOG?.push(JSON.stringify(jsonObject, null, 2));
				const wrapper = jsonObject as unknown as EditWrapper;
				if (wrapper.edit === null) {
					DEBUG_LOG?.push("No more edits.");
					return resolve(undefined);
				} else {
					return resolve(wrapper.edit);
				}
			});

			const responseHandler = createResponseHandler(
				editHandler,
				options.limiters?.abortController ?? new AbortController(),
			);

			// eslint-disable-next-line no-void
			void responseHandler.processResponse(
				streamFromLlm(systemPrompt, responseHandler.jsonSchema(), options.openAI, tokenUsage),
			);
		}).then(async (result): Promise<TreeEdit | undefined> => {
			if (result === undefined && (options.finalReviewStep ?? false) && !hasReviewed) {
				const reviewResult = await reviewGoal();
				// eslint-disable-next-line require-atomic-updates
				hasReviewed = true;
				if (reviewResult.goalAccomplished === "yes") {
					return undefined;
				} else {
					editLog.length = 0;
					return getNextEdit();
				}
			} else {
				return result;
			}
		});
	}

	async function reviewGoal(): Promise<ReviewResult> {
		const systemPrompt = getReviewSystemPrompt(
			options.prompt.userAsk,
			idGenerator,
			options.treeView,
			originalDecoratedJson ?? fail("Original decorated tree not provided."),
			options.prompt.systemRoleContext,
		);

		DEBUG_LOG?.push(systemPrompt);

		return new Promise((resolve: (value: ReviewResult) => void) => {
			const reviewHandler = JsonHandler.object(() => ({
				properties: {
					goalAccomplished: JsonHandler.enum({
						description:
							'Whether the difference the user\'s goal was met in the "after" tree.',
						values: ["yes", "no"],
					}),
				},
				complete: (jsonObject: JsonObject) => {
					// eslint-disable-next-line unicorn/no-null
					DEBUG_LOG?.push(`Review result: ${JSON.stringify(jsonObject, null, 2)}`);
					resolve(jsonObject as unknown as ReviewResult);
				},
			}))();

			const responseHandler = createResponseHandler(
				reviewHandler,
				options.limiters?.abortController ?? new AbortController(),
			);

			// eslint-disable-next-line no-void
			void responseHandler.processResponse(
				streamFromLlm(systemPrompt, responseHandler.jsonSchema(), options.openAI, tokenUsage),
			);
		});
	}

	let edit = await getNextEdit();
	while (edit !== undefined) {
		yield edit;
		if (tokenUsage.inputTokens > (tokenLimits?.inputTokens ?? Number.POSITIVE_INFINITY)) {
			throw new TokenLimitExceededError("Input token limit exceeded.");
		}
		if (tokenUsage.outputTokens > (tokenLimits?.outputTokens ?? Number.POSITIVE_INFINITY)) {
			throw new TokenLimitExceededError("Output token limit exceeded.");
		}
		edit = await getNextEdit();
	}
}

class TokenLimitExceededError extends Error {}

/**
 * Prompts the provided LLM client to generate a list of suggested tree edits to perform.
 *
 * @internal
 */
export async function generateSuggestions(
	openAIClient: OpenAiClientOptions,
	view: TreeView<ImplicitFieldSchema>,
	suggestionCount: number,
	tokenUsage?: TokenUsage,
	guidance?: string,
	abortController = new AbortController(),
): Promise<string[]> {
	let suggestions: string[] | undefined;

	const suggestionsHandler = JsonHandler.object(() => ({
		properties: {
			edit: JsonHandler.array(() => ({
				description:
					"A list of changes that a user might want a collaborative agent to make to the tree.",
				items: JsonHandler.string(),
			}))(),
		},
		complete: (jsonObject: JsonObject) => {
			suggestions = (jsonObject as { edit: string[] }).edit;
		},
	}))();

	const responseHandler = createResponseHandler(suggestionsHandler, abortController);
	const systemPrompt = getSuggestingSystemPrompt(view, suggestionCount, guidance);
	await responseHandler.processResponse(
		streamFromLlm(systemPrompt, responseHandler.jsonSchema(), openAIClient, tokenUsage),
	);
	assert(suggestions !== undefined, "No suggestions were generated.");
	return suggestions;
}

async function* streamFromLlm(
	systemPrompt: string,
	jsonSchema: JsonObject,
	openAI: OpenAiClientOptions,
	tokenUsage?: TokenUsage,
): AsyncGenerator<string> {
	const llmJsonSchema: ResponseFormatJSONSchema.JSONSchema = {
		schema: jsonSchema,
		name: "llm-response",
		strict: true, // Opt into structured output
	};

	const body: ChatCompletionCreateParams = {
		messages: [{ role: "system", content: systemPrompt }],
		model: openAI.modelName ?? "gpt-4o",
		response_format: {
			type: "json_schema",
			json_schema: llmJsonSchema,
		},
		// TODO
		// stream: true, // Opt in to streaming responses.
		max_tokens: 4096,
	};

	const result = await openAI.client.chat.completions.create(body);
	const choice = result.choices[0];

	if (result.usage !== undefined && tokenUsage !== undefined) {
		tokenUsage.inputTokens += result.usage?.prompt_tokens;
		tokenUsage.outputTokens += result.usage?.completion_tokens;
	}

	assert(choice !== undefined, "Response included no choices.");
	assert(choice.finish_reason === "stop", "Response was unfinished.");
	assert(choice.message.content !== null, "Response contained no contents.");
	// TODO: There is only a single yield here because we're not actually streaming
	yield choice.message.content ?? "<error>";
}
