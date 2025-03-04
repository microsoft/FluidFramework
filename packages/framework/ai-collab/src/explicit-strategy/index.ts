/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
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
	ChatCompletionCreateParamsNonStreaming,
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
import {
	type ApplyEditFailure,
	type ApplyEditSuccess,
	type GenerateTreeEditCompleted,
	type GenerateTreeEditStarted,
	type FinalReviewCompleted,
	type FinalReviewStarted,
	type LlmApiCallDebugEvent,
	type PlanningPromptCompleted,
	type CoreEventLoopStarted,
	type CoreEventLoopCompleted,
	generateDebugEvent,
	type PlanningPromptStarted,
	type EventFlowDebugName,
	EventFlowDebugNames,
} from "./debugEvents.js";
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

// TODO: Create a proper index file and move the logic of this file to a new location
export type {
	ApplyEditFailure,
	ApplyEditSuccess,
	CoreEventLoopCompleted,
	CoreEventLoopStarted,
	FinalReviewCompleted,
	FinalReviewStarted,
	GenerateTreeEditCompleted,
	GenerateTreeEditStarted,
	LlmApiCallDebugEvent,
	PlanningPromptCompleted,
	PlanningPromptStarted,
	LlmTreeEdit,
	EventFlowDebugName,
	EventFlowDebugNames,
} from "./debugEvents.js";

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
	errorMessage:
		| "tokenLimitExceeded"
		| "tooManyErrors"
		| "tooManyModelCalls"
		| "aborted"
		| "unexpectedError";
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

	const coreEventFlowTraceId = uuidv4();
	options.debugEventLogHandler?.({
		...generateDebugEvent("CORE_EVENT_LOOP_STARTED", debugLogTraceId),
		eventFlowName: EventFlowDebugNames.CORE_EVENT_LOOP,
		eventFlowStatus: "STARTED",
		eventFlowTraceId: coreEventFlowTraceId,
	} satisfies CoreEventLoopStarted);

	try {
		for await (const generateEditResult of generateEdits(
			options,
			simpleSchema,
			idGenerator,
			editLog,
			options.limiters?.tokenLimits,
			tokensUsed,
			options.debugEventLogHandler && {
				eventLogHandler: options.debugEventLogHandler,
				traceId: debugLogTraceId,
			},
		)) {
			try {
				const result = applyAgentEdit(
					generateEditResult.edit,
					idGenerator,
					simpleSchema.definitions,
					options.validator,
				);
				const explanation = result.explanation;
				editLog.push({ edit: { ...result, explanation } });
				sequentialErrorCount = 0;

				options.debugEventLogHandler?.({
					...generateDebugEvent("APPLIED_EDIT_SUCCESS", debugLogTraceId),
					eventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
					eventFlowStatus: "IN_PROGRESS",
					eventFlowTraceId: generateEditResult.eventFlowTraceId,
					edit: generateEditResult.edit as unknown as Record<string, unknown>,
				} satisfies ApplyEditSuccess);
			} catch (error: unknown) {
				options.debugEventLogHandler?.({
					...generateDebugEvent("APPLIED_EDIT_FAILURE", debugLogTraceId),
					eventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
					eventFlowStatus: "IN_PROGRESS",
					eventFlowTraceId: generateEditResult.eventFlowTraceId,
					edit: generateEditResult.edit as unknown as Record<string, unknown>,
					errorMessage: (error as Error)?.message,
					sequentialErrorCount,
				} satisfies ApplyEditFailure);

				if (error instanceof UsageError) {
					sequentialErrorCount += 1;
					editLog.push({ edit: generateEditResult.edit, error: error.message });
				} else {
					throw error;
				}
			}

			let shouldExitEarly = false;
			const completionResponse: GenerateTreeEditsErrorResponse = {
				status:
					editCount > 0 && sequentialErrorCount < editCount ? "partial-failure" : "failure",
				errorMessage: "unexpectedError",
				tokensUsed,
			};

			if (options.limiters?.abortController?.signal.aborted === true) {
				completionResponse.errorMessage = "aborted";
				shouldExitEarly = true;
			} else if (
				sequentialErrorCount >
				(options.limiters?.maxSequentialErrors ?? Number.POSITIVE_INFINITY)
			) {
				completionResponse.errorMessage = "tooManyErrors";
				shouldExitEarly = true;
			} else if (
				++editCount >= (options.limiters?.maxModelCalls ?? Number.POSITIVE_INFINITY)
			) {
				completionResponse.errorMessage = "tooManyModelCalls";
				shouldExitEarly = true;
			}

			if (shouldExitEarly) {
				options.debugEventLogHandler?.({
					...generateDebugEvent("CORE_EVENT_LOOP_COMPLETED", debugLogTraceId),
					eventFlowName: EventFlowDebugNames.CORE_EVENT_LOOP,
					eventFlowStatus: "COMPLETED",
					status: "failure",
					failureReason: completionResponse.errorMessage,
					eventFlowTraceId: coreEventFlowTraceId,
				} satisfies CoreEventLoopCompleted);

				return completionResponse;
			}
		}
	} catch (error: unknown) {
		options.debugEventLogHandler?.({
			...generateDebugEvent("CORE_EVENT_LOOP_COMPLETED", debugLogTraceId),
			eventFlowName: EventFlowDebugNames.CORE_EVENT_LOOP,
			eventFlowStatus: "COMPLETED",
			status: "failure",
			eventFlowTraceId: coreEventFlowTraceId,
			failureReason:
				error instanceof TokenLimitExceededError ? "tokenLimitExceeded" : "unexpectedError",
			errorMessage: (error as Error)?.message,
		} satisfies CoreEventLoopCompleted);

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

	options.debugEventLogHandler?.({
		...generateDebugEvent("CORE_EVENT_LOOP_COMPLETED", debugLogTraceId),
		eventFlowName: EventFlowDebugNames.CORE_EVENT_LOOP,
		eventFlowStatus: "COMPLETED",
		eventFlowTraceId: coreEventFlowTraceId,
		status: "success",
	} satisfies CoreEventLoopCompleted);

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
		eventLogHandler: DebugEventLogHandler;
		traceId: string;
	},
): AsyncGenerator<{ edit: TreeEdit; eventFlowTraceId: string }> {
	const [types, rootTypeName] = generateGenericEditTypes(simpleSchema, true);

	let plan: string | undefined;
	if (options.planningStep !== undefined) {
		const planningPrompt = getPlanningSystemPrompt(
			options.treeNode,
			options.prompt.userAsk,
			options.prompt.systemRoleContext,
		);

		const generatePlanningPromptEventFlowId = uuidv4();
		debugOptions?.eventLogHandler?.({
			...generateDebugEvent("GENERATE_PLANNING_PROMPT_STARTED", debugOptions.traceId),
			eventFlowName: EventFlowDebugNames.GENERATE_PLANNING_PROMPT,
			eventFlowTraceId: generatePlanningPromptEventFlowId,
			eventFlowStatus: "STARTED",
		} satisfies PlanningPromptStarted);

		plan = await getStringFromLlm(
			planningPrompt,
			options.openAI,
			tokensUsed,
			debugOptions && {
				...debugOptions,
				triggeringEventFlowName: EventFlowDebugNames.GENERATE_PLANNING_PROMPT,
				eventFlowTraceId: generatePlanningPromptEventFlowId,
			},
		);

		debugOptions?.eventLogHandler?.({
			...generateDebugEvent("GENERATE_PLANNING_PROMPT_COMPLETED", debugOptions.traceId),
			eventFlowName: EventFlowDebugNames.GENERATE_PLANNING_PROMPT,
			eventFlowStatus: "COMPLETED",
			eventFlowTraceId: generatePlanningPromptEventFlowId,
			isLlmResponseValid: plan !== undefined,
			llmGeneratedPlan: plan,
		} satisfies PlanningPromptCompleted);
	}

	const originalDecoratedJson =
		(options.finalReviewStep ?? false)
			? toDecoratedJson(idGenerator, options.treeNode)
			: undefined;
	// reviewed is implicitly true if finalReviewStep is false
	let hasReviewed = (options.finalReviewStep ?? false) ? false : true;
	async function getNextEdit(): Promise<
		{ edit: TreeEdit; eventFlowTraceId: string } | undefined
	> {
		const systemPrompt = getEditingSystemPrompt(
			options.prompt.userAsk,
			idGenerator,
			options.treeNode,
			editLog,
			options.prompt.systemRoleContext,
			plan,
		);

		const schema = types[rootTypeName] ?? fail("Root type not found.");

		const generateTreeEditEventFlowId = uuidv4();
		debugOptions?.eventLogHandler?.({
			...generateDebugEvent("GENERATE_TREE_EDIT_STARTED", debugOptions.traceId),
			eventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
			eventFlowStatus: "STARTED",
			eventFlowTraceId: generateTreeEditEventFlowId,
			llmPrompt: systemPrompt,
		} satisfies GenerateTreeEditStarted);

		const wrapper = await getStructuredOutputFromLlm<EditWrapper>(
			systemPrompt,
			options.openAI,
			schema,
			"A JSON object that represents an edit to a JSON tree.",
			tokensUsed,
			debugOptions && {
				...debugOptions,
				triggeringEventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
				eventFlowTraceId: generateTreeEditEventFlowId,
			},
		);

		debugOptions?.eventLogHandler?.({
			...generateDebugEvent("GENERATE_TREE_EDIT_COMPLETED", debugOptions.traceId),
			eventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
			eventFlowStatus: "COMPLETED",
			eventFlowTraceId: generateTreeEditEventFlowId,
			isLlmResponseValid: wrapper?.edit !== undefined,
			llmGeneratedEdit: wrapper?.edit as Record<string, unknown> | null,
		} satisfies GenerateTreeEditCompleted);

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
			return { edit: wrapper.edit, eventFlowTraceId: generateTreeEditEventFlowId };
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

		const finalReviewEventFlowTraceId = uuidv4();
		debugOptions?.eventLogHandler?.({
			...generateDebugEvent("FINAL_REVIEW_STARTED", debugOptions.traceId),
			eventFlowName: EventFlowDebugNames.FINAL_REVIEW,
			eventFlowStatus: "STARTED",
			eventFlowTraceId: finalReviewEventFlowTraceId,
			llmPrompt: systemPrompt,
		} satisfies FinalReviewStarted);

		// TODO: In the future, when using structured output isn't guarenteed, we will
		// need to add a custom type guard to ensure that output is in the right shape.
		const output = await getStructuredOutputFromLlm<ReviewResult>(
			systemPrompt,
			options.openAI,
			schema,
			undefined,
			tokensUsed,
			debugOptions && {
				...debugOptions,
				triggeringEventFlowName: EventFlowDebugNames.FINAL_REVIEW,
				eventFlowTraceId: finalReviewEventFlowTraceId,
			},
		);

		debugOptions?.eventLogHandler?.({
			...generateDebugEvent("FINAL_REVIEW_COMPLETED", debugOptions.traceId),
			eventFlowName: EventFlowDebugNames.FINAL_REVIEW,
			eventFlowStatus: "COMPLETED",
			eventFlowTraceId: finalReviewEventFlowTraceId,
			isLlmResponseValid: output !== undefined,
			didLlmAccomplishGoal: output?.goalAccomplished,
		} satisfies FinalReviewCompleted);

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
		eventLogHandler: DebugEventLogHandler;
		traceId: string;
		triggeringEventFlowName: EventFlowDebugName;
		eventFlowTraceId: string;
	},
): Promise<T | undefined> {
	const response_format = zodResponseFormat(structuredOutputSchema, "SharedTreeAI", {
		description,
	});

	const body: ChatCompletionCreateParamsNonStreaming = {
		messages: [{ role: "system", content: prompt }],
		response_format,
		...openAi.options,
	};

	const result = await openAi.client.beta.chat.completions.parse(body);

	debugOptions?.eventLogHandler?.({
		...generateDebugEvent("LLM_API_CALL", debugOptions.traceId),
		triggeringEventFlowName: debugOptions.triggeringEventFlowName,
		eventFlowTraceId: debugOptions.eventFlowTraceId,
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
	// TODO: Determine why this value would be undefined.
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
		eventLogHandler: DebugEventLogHandler;
		traceId: string;
		triggeringEventFlowName: EventFlowDebugName;
		eventFlowTraceId: string;
	},
): Promise<string | undefined> {
	const body: ChatCompletionCreateParams = {
		messages: [{ role: "system", content: prompt }],
		model: openAi.modelName ?? "gpt-4o",
	};

	const result = await openAi.client.chat.completions.create(body);

	debugOptions?.eventLogHandler?.({
		...generateDebugEvent("LLM_API_CALL", debugOptions.traceId),
		triggeringEventFlowName: debugOptions.triggeringEventFlowName,
		eventFlowTraceId: debugOptions.eventFlowTraceId,
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
