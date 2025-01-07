/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	getSimpleSchema,
	Tree,
	type SimpleTreeSchema,
	type TreeNode,
} from "@fluidframework/tree/internal";
// eslint-disable-next-line import/no-internal-modules
import { zodResponseFormat } from "openai/helpers/zod";
import type {
	ChatCompletionCreateParams,
	// eslint-disable-next-line import/no-internal-modules
} from "openai/resources/index.mjs";
import { z } from "zod";

import type { OpenAiClientOptions, TokenLimits, TokenUsage } from "../aiCollabApi.js";

import { applyAgentEdit } from "./agentEditReducer.js";
import type { EditWrapper, TreeEdit } from "./agentEditTypes.js";
import { IdGenerator } from "./idGenerator.js";
import {
	getEditingSystemPrompt,
	getPlanningSystemPrompt,
	getReviewSystemPrompt,
	toDecoratedJson,
	type EditLog,
} from "./promptGeneration.js";
import { generateGenericEditTypes } from "./typeGeneration.js";
import { fail } from "./utils.js";

const DEBUG_LOG: string[] = [];

/**
 * {@link generateTreeEdits} options.
 *
 * @internal
 */
export interface GenerateTreeEditsOptions {
	openAI: OpenAiClientOptions;
	treeNode: TreeNode;
	prompt: {
		systemRoleContext: string;
		userAsk: string;
	};
	limiters?: {
		abortController?: AbortController;
		maxSequentialErrors?: number;
		maxModelCalls?: number;
		tokenLimits?: TokenLimits;
	};
	finalReviewStep?: boolean;
	validator?: (newContent: TreeNode) => void;
	dumpDebugLog?: boolean;
	planningStep?: boolean;
}

interface GenerateTreeEditsSuccessResponse {
	status: "success";
	tokensUsed: TokenUsage;
}

interface GenerateTreeEditsErrorResponse {
	status: "failure" | "partial-failure";
	errorMessage: "tokenLimitExceeded" | "tooManyErrors" | "tooManyModelCalls" | "aborted";
	tokensUsed: TokenUsage;
}

/**
 * Prompts the provided LLM client to generate valid tree edits.
 * Applies those edits to the provided tree branch before returning.
 *
 * @remarks
 * - Optional root nodes are not supported
 * - Primitive root nodes are not supported
 *
 * @internal
 */
export async function generateTreeEdits(
	options: GenerateTreeEditsOptions,
): Promise<GenerateTreeEditsSuccessResponse | GenerateTreeEditsErrorResponse> {
	const idGenerator = new IdGenerator();
	const editLog: EditLog = [];
	let editCount = 0;
	let sequentialErrorCount = 0;

	const simpleSchema = getSimpleSchema(Tree.schema(options.treeNode));

	const tokensUsed = { inputTokens: 0, outputTokens: 0 };

	try {
		for await (const edit of generateEdits(
			options,
			simpleSchema,
			idGenerator,
			editLog,
			options.limiters?.tokenLimits,
			tokensUsed,
		)) {
			try {
				const result = applyAgentEdit(
					edit,
					idGenerator,
					simpleSchema.definitions,
					options.validator,
				);
				const explanation = result.explanation;
				editLog.push({ edit: { ...result, explanation } });
				sequentialErrorCount = 0;
			} catch (error: unknown) {
				if (error instanceof Error) {
					sequentialErrorCount += 1;
					editLog.push({ edit, error: error.message });
					DEBUG_LOG?.push(`Error: ${error.message}`);
				} else {
					throw error;
				}
			}

			const responseStatus =
				editCount > 0 && sequentialErrorCount < editCount ? "partial-failure" : "failure";

			if (options.limiters?.abortController?.signal.aborted === true) {
				return {
					status: responseStatus,
					errorMessage: "aborted",
					tokensUsed,
				};
			}

			if (
				sequentialErrorCount >
				(options.limiters?.maxSequentialErrors ?? Number.POSITIVE_INFINITY)
			) {
				return {
					status: responseStatus,
					errorMessage: "tooManyErrors",
					tokensUsed,
				};
			}

			if (++editCount >= (options.limiters?.maxModelCalls ?? Number.POSITIVE_INFINITY)) {
				return {
					status: responseStatus,
					errorMessage: "tooManyModelCalls",
					tokensUsed,
				};
			}
		}
	} catch (error: unknown) {
		if (error instanceof Error) {
			DEBUG_LOG?.push(`Error: ${error.message}`);
		}

		if (options.dumpDebugLog ?? false) {
			console.log(DEBUG_LOG.join("\n\n"));
			DEBUG_LOG.length = 0;
		}

		if (error instanceof TokenLimitExceededError) {
			return {
				status:
					editCount > 0 && sequentialErrorCount < editCount ? "partial-failure" : "failure",
				errorMessage: "tokenLimitExceeded",
				tokensUsed,
			};
		}
		throw error;
	}

	if (options.dumpDebugLog ?? false) {
		console.log(DEBUG_LOG.join("\n\n"));
		DEBUG_LOG.length = 0;
	}

	return {
		status: "success",
		tokensUsed,
	};
}

interface ReviewResult {
	goalAccomplished: "yes" | "no";
}

/**
 * Generates a single {@link TreeEdit} from an LLM.
 *
 * @remarks
 * The design of this async generator function is such that which each iteration of this functions values,
 * an LLM will be prompted to generate the next value (a {@link TreeEdit}) based on the users ask.
 * Once the LLM believes it has completed the user's ask, it will no longer return an edit and as a result
 * this generator will no longer yield a next value.
 */
async function* generateEdits(
	options: GenerateTreeEditsOptions,
	simpleSchema: SimpleTreeSchema,
	idGenerator: IdGenerator,
	editLog: EditLog,
	tokenLimits: TokenLimits | undefined,
	tokensUsed: TokenUsage,
): AsyncGenerator<TreeEdit> {
	const [types, rootTypeName] = generateGenericEditTypes(simpleSchema, true);

	let plan: string | undefined;
	if (options.planningStep !== undefined) {
		const planningPromt = getPlanningSystemPrompt(
			options.treeNode,
			options.prompt.userAsk,
			options.prompt.systemRoleContext,
		);
		DEBUG_LOG?.push(planningPromt);
		plan = await getStringFromLlm(planningPromt, options.openAI, tokensUsed);
		DEBUG_LOG?.push(`AI Generated the following plan: ${planningPromt}`);
	}

	const originalDecoratedJson =
		(options.finalReviewStep ?? false)
			? toDecoratedJson(idGenerator, options.treeNode)
			: undefined;
	// reviewed is implicitly true if finalReviewStep is false
	let hasReviewed = (options.finalReviewStep ?? false) ? false : true;
	async function getNextEdit(): Promise<TreeEdit | undefined> {
		const systemPrompt = getEditingSystemPrompt(
			options.prompt.userAsk,
			idGenerator,
			options.treeNode,
			editLog,
			options.prompt.systemRoleContext,
			plan,
		);

		DEBUG_LOG?.push(systemPrompt);

		const schema = types[rootTypeName] ?? fail("Root type not found.");
		const wrapper = await getStructuredOutputFromLlm<EditWrapper>(
			systemPrompt,
			options.openAI,
			schema,
			"A JSON object that represents an edit to a JSON tree.",
			tokensUsed,
		);

		// eslint-disable-next-line unicorn/no-null
		DEBUG_LOG?.push(JSON.stringify(wrapper, null, 2));
		if (wrapper === undefined) {
			DEBUG_LOG?.push("Failed to get response");
			return undefined;
		}

		if (wrapper.edit === null) {
			DEBUG_LOG?.push("No more edits.");
			if ((options.finalReviewStep ?? false) && !hasReviewed) {
				const reviewResult = await reviewGoal();
				if (reviewResult === undefined) {
					DEBUG_LOG?.push("Failed to get review response");
					return undefined;
				}
				// eslint-disable-next-line require-atomic-updates
				hasReviewed = true;
				if (reviewResult.goalAccomplished === "yes") {
					return undefined;
				} else {
					// eslint-disable-next-line require-atomic-updates
					editLog.length = 0;
					return getNextEdit();
				}
			}
		} else {
			return wrapper.edit;
		}
	}

	async function reviewGoal(): Promise<ReviewResult | undefined> {
		const systemPrompt = getReviewSystemPrompt(
			options.prompt.userAsk,
			idGenerator,
			options.treeNode,
			originalDecoratedJson ?? fail("Original decorated tree not provided."),
			options.prompt.systemRoleContext,
		);

		DEBUG_LOG?.push(systemPrompt);

		const schema = z.object({
			goalAccomplished: z
				.enum(["yes", "no"])
				.describe('Whether the user\'s goal was met in the "after" tree.'),
		});
		return getStructuredOutputFromLlm<ReviewResult>(systemPrompt, options.openAI, schema);
	}

	let edit = await getNextEdit();
	while (edit !== undefined) {
		yield edit;
		if (tokensUsed.inputTokens > (tokenLimits?.inputTokens ?? Number.POSITIVE_INFINITY)) {
			throw new TokenLimitExceededError("Input token limit exceeded.");
		}
		if (tokensUsed.outputTokens > (tokenLimits?.outputTokens ?? Number.POSITIVE_INFINITY)) {
			throw new TokenLimitExceededError("Output token limit exceeded.");
		}
		edit = await getNextEdit();
	}
}

/**
 * Calls the LLM to generate a structured output response based on the provided prompt.
 */
async function getStructuredOutputFromLlm<T>(
	prompt: string,
	openAi: OpenAiClientOptions,
	structuredOutputSchema: Zod.ZodTypeAny,
	description?: string,
	tokensUsed?: TokenUsage,
): Promise<T | undefined> {
	const response_format = zodResponseFormat(structuredOutputSchema, "SharedTreeAI", {
		description,
	});

	const body: ChatCompletionCreateParams = {
		messages: [{ role: "system", content: prompt }],
		model: openAi.modelName ?? "gpt-4o",
		response_format,
	};

	const result = await openAi.client.beta.chat.completions.parse(body);

	if (result.usage !== undefined && tokensUsed !== undefined) {
		tokensUsed.inputTokens += result.usage?.prompt_tokens;
		tokensUsed.outputTokens += result.usage?.completion_tokens;
	}

	// TODO: fix types so this isn't null and doesn't need a cast
	// The type should be derived from the zod schema
	return result.choices[0]?.message.parsed as T | undefined;
}

/**
 * Calls the LLM to generate a response based on the provided prompt.
 */
async function getStringFromLlm(
	prompt: string,
	openAi: OpenAiClientOptions,
	tokensUsed?: TokenUsage,
): Promise<string | undefined> {
	const body: ChatCompletionCreateParams = {
		messages: [{ role: "system", content: prompt }],
		model: openAi.modelName ?? "gpt-4o",
	};

	const result = await openAi.client.chat.completions.create(body);

	if (result.usage !== undefined && tokensUsed !== undefined) {
		tokensUsed.inputTokens += result.usage?.prompt_tokens;
		tokensUsed.outputTokens += result.usage?.completion_tokens;
	}

	return result.choices[0]?.message.content ?? undefined;
}

class TokenLimitExceededError extends Error {}
