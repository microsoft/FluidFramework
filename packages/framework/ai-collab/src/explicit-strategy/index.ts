/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Anthropic } from "@anthropic-ai/sdk";
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
	ChatCompletionCreateParamsNonStreaming,
	// eslint-disable-next-line import/no-internal-modules
} from "openai/resources/index.mjs";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
	isOpenAiClientOptions,
	type ClaudeClientOptions,
	type DebugEventLogHandler,
	type OpenAiClientOptions,
	type TokenLimits,
	type TokenUsage,
} from "../aiCollabApi.js";

import { applyAgentEdit } from "./agentEditReducer.js";
import type { TreeEdit } from "./agentEditTypes.js";
import {
	type ApplyEditFailure,
	type ApplyEditSuccess,
	type GenerateTreeEditCompleted,
	type GenerateTreeEditStarted,
	type LlmApiCallDebugEvent,
	type CoreEventLoopStarted,
	type CoreEventLoopCompleted,
	generateDebugEvent,
	type EventFlowDebugName,
	EventFlowDebugNames,
} from "./debugEvents.js";
import { IdGenerator } from "./idGenerator.js";
import { getEditingSystemPrompt, type EditLog } from "./promptGeneration.js";
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
	clientOptions: OpenAiClientOptions | ClaudeClientOptions;
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
				editLog.push({ edit: { ...result } });
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

	const systemPrompt = getEditingSystemPrompt(
		idGenerator,
		options.treeNode,
		editLog,
		options.prompt.systemRoleContext,
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

	const edits = isOpenAiClientOptions(options.clientOptions)
		? ((await getStructuredOutputFromOpenAI(
				systemPrompt,
				options.prompt.userAsk,
				options.clientOptions,
				schema,
				"A JSON object that represents an edit to a JSON tree.",
				tokensUsed,
				debugOptions && {
					...debugOptions,
					triggeringEventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
					eventFlowTraceId: generateTreeEditEventFlowId,
				},
			)) as TreeEdit[] | undefined)
		: ((await getStructuredOutputFromClaude(
				systemPrompt,
				options.prompt.userAsk,
				options.clientOptions,
				schema,
				types,
				"A JSON object that represents an edit to a JSON tree.",
				tokensUsed,
				debugOptions && {
					...debugOptions,
					triggeringEventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
					eventFlowTraceId: generateTreeEditEventFlowId,
				},
			)) as TreeEdit[] | undefined);

	if (edits === undefined) {
		return undefined;
	}

	for (const edit of edits) {
		yield { edit, eventFlowTraceId: generateTreeEditEventFlowId };
		if (tokensUsed.inputTokens > (tokenLimits?.inputTokens ?? Number.POSITIVE_INFINITY)) {
			throw new TokenLimitExceededError("Input token limit exceeded.");
		}
		if (tokensUsed.outputTokens > (tokenLimits?.outputTokens ?? Number.POSITIVE_INFINITY)) {
			throw new TokenLimitExceededError("Output token limit exceeded.");
		}
		debugOptions?.eventLogHandler?.({
			...generateDebugEvent("GENERATE_TREE_EDIT_COMPLETED", debugOptions.traceId),
			eventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
			eventFlowStatus: "COMPLETED",
			eventFlowTraceId: generateTreeEditEventFlowId,
			isLlmResponseValid: true,
			llmGeneratedEdit: edit as unknown as Record<string, unknown>, // TODO: Safe cast? Why did this work before?
		} satisfies GenerateTreeEditCompleted);
	}
}

async function getStructuredOutputFromClaude(
	systemPrompt: string,
	userPrompt: string,
	claude: ClaudeClientOptions,
	structuredOutputSchema: Zod.ZodTypeAny,
	types: Record<string, Zod.ZodTypeAny>,
	description?: string,
	tokensUsed?: TokenUsage,
	debugOptions?: {
		eventLogHandler: DebugEventLogHandler;
		traceId: string;
		triggeringEventFlowName: EventFlowDebugName;
		eventFlowTraceId: string;
	},
): Promise<unknown> {
	// TODO: use langchain library to get this for free
	// TODO: respect description, tokensUsed, and debugOptions
	const wrapper = z.object({ edits: structuredOutputSchema });
	const jsonSchema = zodToJsonSchema(wrapper, {
		name: "schema",
		definitions: types,
		$refStrategy: "none",
	});
	// jsonSchema.$schema = "http://json-schema.org/draft/2020-12/schema#";
	const input_schema = jsonSchema.definitions?.schema as
		| Anthropic.Tool.InputSchema
		| undefined;

	if (input_schema === undefined) {
		throw new UsageError("Failed to generate JSON schema for structured output.");
	}
	const response = await claude.client.beta.messages.create({
		betas: ["token-efficient-tools-2025-02-19"],
		model: "claude-3-7-sonnet-latest",
		thinking: { type: "enabled", budget_tokens: 10000 },
		stream: false,
		max_tokens: 20000,
		tools: [
			{
				name: "EditJsonTree",
				description: "An array of edits to a user's SharedTree domain",
				input_schema,
			},
		],
		tool_choice: { type: "auto" },
		messages: [{ role: "user", content: userPrompt }],
		system: `${systemPrompt} You must use the EditJsonTree tool to respond.`,
	});

	const r = response.content.find((v) => v.type === "tool_use");
	if (r?.type !== "tool_use") {
		console.error(response);
		throw new Error("Unexpected response from LLM API.");
	}

	const result = wrapper.safeParse(r.input);

	if (result.success === false) {
		console.error(result.error);
		throw new Error("Response did not conform to provided schema.");
	}

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return result.data.edits;
}

/**
 * Calls the LLM to generate a structured output response based on the provided prompt.
 */
async function getStructuredOutputFromOpenAI(
	systemPrompt: string,
	userPrompt: string,
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
): Promise<unknown> {
	const wrapper = z.object({ edits: structuredOutputSchema });
	const response_format = zodResponseFormat(wrapper, "SharedTreeAI", {
		description,
	});

	const body: ChatCompletionCreateParamsNonStreaming = {
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userPrompt },
		],
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
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
	return (result.choices[0]?.message.parsed as any).wrapped.edits;
}

class TokenLimitExceededError extends Error {}
