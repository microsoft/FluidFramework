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
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import type {
	DebugEventLogHandler,
	OpenAiClientOptions,
	TokenLimits,
	TokenUsage,
} from "../aiCollabApi.js";

import { applyAgentEdit } from "./agentEditReducer.js";
import type { EditWrapper, TreeEdit } from "./agentEditTypes.js";
import type {
	ApplyEditFailureDebugEvent,
	ApplyEditSuccessDebugEvent,
	GenerateTreeEditCompletedDebugEvent,
	GenerateTreeEditInitiatedDebugEvent,
	FinalReviewCompletedDebugEvent,
	FinalReviewInitiatedDebugEvent,
	LlmApiCallDebugEvent,
	PlanningPromptCompletedDebugEvent,
	PlanningPromptInitiatedDebugEvent,
} from "./debugEventLogTypes.js";
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
	debugEventLogHandler?: DebugEventLogHandler;
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

	const debugLogTraceId = uuidv4();

	try {
		for await (const edit of generateEdits(
			options,
			simpleSchema,
			idGenerator,
			editLog,
			options.limiters?.tokenLimits,
			tokensUsed,
			{
				eventLogHandler: options.debugEventLogHandler,
				traceId: debugLogTraceId,
			},
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

				options.debugEventLogHandler?.({
					id: uuidv4(),
					traceId: debugLogTraceId,
					eventName: "APPLIED_EDIT_SUCCESS",
					timestamp: new Date().toISOString(),
					edit,
				} satisfies ApplyEditSuccessDebugEvent);
			} catch (error: unknown) {
				if (error instanceof Error) {
					sequentialErrorCount += 1;
					editLog.push({ edit, error: error.message });
					options.debugEventLogHandler?.({
						id: uuidv4(),
						traceId: debugLogTraceId,
						eventName: "APPLIED_EDIT_FAILURE",
						timestamp: new Date().toISOString(),
						edit,
						errorMessage: error.message,
						sequentialErrorCount,
					} satisfies ApplyEditFailureDebugEvent);
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
	debugOptions?: {
		eventLogHandler?: DebugEventLogHandler;
		traceId?: string;
	},
): AsyncGenerator<TreeEdit> {
	const [types, rootTypeName] = generateGenericEditTypes(simpleSchema, true);

	let plan: string | undefined;
	if (options.planningStep !== undefined) {
		const planningPrompt = getPlanningSystemPrompt(
			options.treeNode,
			options.prompt.userAsk,
			options.prompt.systemRoleContext,
		);

		const debugEventSharedProps = {
			...(debugOptions?.traceId !== undefined && { traceId: debugOptions.traceId }),
			eventName: "GENERATE_PLANNING_PROMPT_LLM",
			prompt: planningPrompt,
		} as const;

		debugOptions?.eventLogHandler?.({
			id: uuidv4(),
			...debugEventSharedProps,
			eventFlowStatus: "INITIATED",
			timestamp: new Date().toISOString(),
		} satisfies PlanningPromptInitiatedDebugEvent);

		plan = await getStringFromLlm(planningPrompt, options.openAI, tokensUsed, debugOptions);
		debugOptions?.eventLogHandler?.({
			id: uuidv4(),
			...debugEventSharedProps,
			eventFlowStatus: "COMPLETED",
			timestamp: new Date().toISOString(),
			requestOutcome: plan === undefined ? "failure" : "success",
			llmGeneratedPlan: plan,
		} satisfies PlanningPromptCompletedDebugEvent);
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

		const schema = types[rootTypeName] ?? fail("Root type not found.");

		const debugEventSharedProps = {
			...(debugOptions?.traceId !== undefined && { traceId: debugOptions.traceId }),
			eventName: "GENERATE_TREE_EDIT_LLM",
			prompt: systemPrompt,
		} as const;

		debugOptions?.eventLogHandler?.({
			id: uuidv4(),
			...debugEventSharedProps,
			eventFlowStatus: "INITIATED",
			timestamp: new Date().toISOString(),
		} satisfies GenerateTreeEditInitiatedDebugEvent);

		const wrapper = await getStructuredOutputFromLlm<EditWrapper>(
			systemPrompt,
			options.openAI,
			schema,
			"A JSON object that represents an edit to a JSON tree.",
			tokensUsed,
			debugOptions,
		);

		debugOptions?.eventLogHandler?.({
			id: uuidv4(),
			...debugEventSharedProps,
			eventFlowStatus: "COMPLETED",
			timestamp: new Date().toISOString(),
			requestOutcome: wrapper === undefined ? "failure" : "success",
			...(wrapper !== undefined && { llmGeneratedEdit: wrapper.edit }),
		} satisfies GenerateTreeEditCompletedDebugEvent);

		if (wrapper === undefined) {
			return undefined;
		}

		if (wrapper.edit === null) {
			if ((options.finalReviewStep ?? false) && !hasReviewed) {
				const reviewResult = await reviewGoal();
				if (reviewResult === undefined) {
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

		const schema = z.object({
			goalAccomplished: z
				.enum(["yes", "no"])
				.describe('Whether the user\'s goal was met in the "after" tree.'),
		});

		const debugEventSharedProps = {
			...(debugOptions?.traceId !== undefined && { traceId: debugOptions.traceId }),
			eventName: "FINAL_REVIEW_LLM",
			prompt: systemPrompt,
		} as const;

		debugOptions?.eventLogHandler?.({
			id: uuidv4(),
			...debugEventSharedProps,
			eventFlowStatus: "INITIATED",
			timestamp: new Date().toISOString(),
		} satisfies FinalReviewInitiatedDebugEvent);

		const output = await getStructuredOutputFromLlm<ReviewResult>(
			systemPrompt,
			options.openAI,
			schema,
		);

		debugOptions?.eventLogHandler?.({
			id: uuidv4(),
			...debugEventSharedProps,
			eventFlowStatus: "COMPLETED",
			timestamp: new Date().toISOString(),
			status: output === undefined ? "failure" : "success",
			...(output !== undefined && { llmReviewResponse: output }),
		} satisfies FinalReviewCompletedDebugEvent);

		return output;
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
	debugOptions?: {
		eventLogHandler?: DebugEventLogHandler;
		traceId?: string;
	},
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

	debugOptions?.eventLogHandler?.({
		id: uuidv4(),
		...(debugOptions?.traceId !== undefined && { traceId: debugOptions.traceId }),
		eventName: "LLM_API_CALL",
		timestamp: new Date().toISOString(),
		modelName: openAi.modelName ?? "gpt-4o",
		requestParams: body,
		response: { ...result },
		...(result.usage && {
			tokenUsage: {
				promptTokens: result.usage.prompt_tokens,
				completionTokens: result.usage.completion_tokens,
			},
		}),
	} satisfies LlmApiCallDebugEvent);

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
	debugOptions?: {
		eventLogHandler?: DebugEventLogHandler;
		traceId?: string;
	},
): Promise<string | undefined> {
	const body: ChatCompletionCreateParams = {
		messages: [{ role: "system", content: prompt }],
		model: openAi.modelName ?? "gpt-4o",
	};

	const result = await openAi.client.chat.completions.create(body);

	debugOptions?.eventLogHandler?.({
		id: uuidv4(),
		...(debugOptions?.traceId !== undefined && { traceId: debugOptions.traceId }),
		eventName: "LLM_API_CALL",
		timestamp: new Date().toISOString(),
		modelName: openAi.modelName ?? "gpt-4o",
		requestParams: body,
		response: { ...result },
		...(result.usage && {
			tokenUsage: {
				promptTokens: result.usage.prompt_tokens,
				completionTokens: result.usage.completion_tokens,
			},
		}),
	} satisfies LlmApiCallDebugEvent);

	if (result.usage !== undefined && tokensUsed !== undefined) {
		tokensUsed.inputTokens += result.usage?.prompt_tokens;
		tokensUsed.outputTokens += result.usage?.completion_tokens;
	}

	return result.choices[0]?.message.content ?? undefined;
}

class TokenLimitExceededError extends Error {}
