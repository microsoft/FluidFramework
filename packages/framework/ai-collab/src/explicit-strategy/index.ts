/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Anthropic } from "@anthropic-ai/sdk";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	getSimpleSchema,
	Tree,
	type ImplicitFieldSchema,
	type ReadableField,
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
import { getEditingSystemPrompt } from "./promptGeneration.js";
import { generateEditTypesForInsertion } from "./typeGeneration.js";
import { fail, type View } from "./utils.js";

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

export { type View } from "./utils.js";

/**
 * {@link generateTreeEdits} options.
 *
 * @internal
 */
export interface GenerateTreeEditsOptions {
	clientOptions: OpenAiClientOptions | ClaudeClientOptions;
	treeView: View;
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
	toString?: (node: ReadableField<ImplicitFieldSchema>) => string;
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
			options.limiters?.tokenLimits,
			tokensUsed,
			options.debugEventLogHandler && {
				eventLogHandler: options.debugEventLogHandler,
				traceId: debugLogTraceId,
			},
		)) {
			try {
				applyAgentEdit(
					options.treeView,
					generateEditResult.edit,
					idGenerator,
					options.validator,
				);
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

interface RetryState {
	readonly thinking:
		| Anthropic.Beta.BetaThinkingBlock
		| Anthropic.Beta.BetaRedactedThinkingBlock;
	readonly errors: {
		readonly error: UsageError;
		readonly editIndex: number;
		readonly toolUse: Anthropic.Beta.BetaToolUseBlock;
	}[];
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
	tokenLimits: TokenLimits | undefined,
	tokensUsed: TokenUsage,
	debugOptions?: {
		eventLogHandler: DebugEventLogHandler;
		traceId: string;
	},
): AsyncGenerator<{ edit: TreeEdit; eventFlowTraceId: string }> {
	const editTypes = generateEditTypesForInsertion(simpleSchema);

	const systemPrompt = getEditingSystemPrompt(
		options.treeView,
		idGenerator,
		options.prompt.systemRoleContext,
	);

	const generateTreeEditEventFlowId = uuidv4();
	debugOptions?.eventLogHandler?.({
		...generateDebugEvent("GENERATE_TREE_EDIT_STARTED", debugOptions.traceId),
		eventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
		eventFlowStatus: "STARTED",
		eventFlowTraceId: generateTreeEditEventFlowId,
		llmPrompt: systemPrompt,
	} satisfies GenerateTreeEditStarted);

	let edits: TreeEdit[] | undefined;
	if (isOpenAiClientOptions(options.clientOptions)) {
		edits = (await getStructuredOutputFromOpenAI(
			systemPrompt,
			options.prompt.userAsk,
			options.clientOptions,
			editTypes,
			"A JSON object that represents an edit to a JSON tree.",
			tokensUsed,
			debugOptions && {
				...debugOptions,
				triggeringEventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
				eventFlowTraceId: generateTreeEditEventFlowId,
			},
		)) as TreeEdit[] | undefined;
	} else {
		throw new Error("Unsupported client type.");
	}

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

/**
 * Options for {@link clod}.
 * @alpha
 */
export interface ClodOptions<TRoot extends ImplicitFieldSchema> {
	clientOptions: OpenAiClientOptions | ClaudeClientOptions;
	treeView: View;
	treeNode: ReadableField<TRoot>;
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
	toString?: (node: ReadableField<TRoot>) => string;
}

/**
 * TODO
 * @alpha
 */
export async function clod(
	options: ClodOptions<ImplicitFieldSchema>,
): Promise<string | undefined> {
	const idGenerator = new IdGenerator();
	if (typeof options.treeNode !== "object" || options.treeNode === null) {
		throw new UsageError("Primitive root nodes are not yet supported.");
	}
	const simpleSchema = getSimpleSchema(Tree.schema(options.treeNode));
	const systemPrompt = getEditingSystemPrompt(
		options.treeView,
		idGenerator,
		options.prompt.systemRoleContext,
	);

	if (isOpenAiClientOptions(options.clientOptions)) {
		throw new Error("OpenAI client not supported.");
	}
	const client = options.clientOptions.client;

	// TODO: use langchain library to get this for free
	// TODO: respect description, tokensUsed, and debugOptions
	const toolWrapper = z.object({
		edits: z.array(z.unknown()).describe(`An array of well-formed TreeEdits`),
	});
	const input_schema = zodToJsonSchema(toolWrapper, { name: "foo" }).definitions
		?.foo as Anthropic.Tool.InputSchema;

	const max_tokens = options.limiters?.tokenLimits?.outputTokens ?? 20000;

	let log = "";
	if (options.toString !== undefined) {
		log += `# Initial Tree State\n\n`;
		log += `${
			options.toString?.(options.treeNode) ??
			`\`\`\`JSON\n${JSON.stringify(options.treeNode, undefined, 2)}\n\`\`\``
		}\n\n`;
	}
	log += `# System Prompt\n\n${systemPrompt}\n\n`;
	log += `# User Prompt\n\n"${options.prompt.userAsk}"\n\n`;

	async function queryClod(
		messages2: Anthropic.Beta.Messages.BetaMessageParam[],
	): Promise<Anthropic.Beta.Messages.BetaMessage> {
		const message = await client.beta.messages.create({
			betas: ["token-efficient-tools-2025-02-19"],
			model: "claude-3-7-sonnet-latest",
			thinking: { type: "enabled", budget_tokens: max_tokens / 2 },
			stream: false,
			max_tokens,
			tools: [
				{
					name: "EditJsonTree",
					description: "An array of edits to a user's SharedTree domain",
					input_schema,
				},
			],
			tool_choice: { type: "auto" },
			messages: messages2,
			system: `${systemPrompt} You must use the EditJsonTree tool to respond.`,
		});

		return message;
	}

	const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
		{ role: "user", content: options.prompt.userAsk },
	];
	let response = await queryClod(messages);

	const thinking =
		response.content.find(
			(c): c is Anthropic.Beta.BetaThinkingBlock => c.type === "thinking",
		) ?? fail("Expected thinking block");

	log += `# Chain of Thought\n\n${thinking.type === "thinking" ? thinking.thinking : "-- Redacted by LLM --"}\n\n`;

	const retryState: RetryState = {
		thinking,
		errors: [],
	};

	const wrapper = z.object({
		edits: generateEditTypesForInsertion(simpleSchema),
	});

	log += `# Results\n\n`;

	while (retryState.errors.length <= (options.limiters?.maxSequentialErrors ?? 3)) {
		const toolUse =
			response.content.find(
				(v): v is Anthropic.Beta.BetaToolUseBlock => v.type === "tool_use",
			) ?? fail("Expected tool use block");

		log += `## Result${retryState.errors.length > 0 ? ` Attempt ${retryState.errors.length + 1}` : ""}\n\n\`\`\`JSON\n${JSON.stringify(toolUse.input, undefined, 2)}\n\`\`\`\n\n`;

		const branch = options.treeView.fork();
		const parse = wrapper.safeParse(toolUse.input);
		if (parse.success) {
			const edits = parse.data.edits as TreeEdit[];

			let editIndex = 0;
			try {
				while (editIndex < edits.length) {
					const edit = edits[editIndex] ?? fail("Expected edit");
					applyAgentEdit(branch, edit, idGenerator, options.validator);
					log += `### Applied Edit ${editIndex + 1}\n\n`;
					log += `The new state of the tree is:\n\n`;
					log += `${
						options.toString?.(options.treeNode) ??
						`\`\`\`JSON\n${JSON.stringify(options.treeNode, undefined, 2)}\n\`\`\``
					}\n\n`;
					editIndex += 1;
				}

				options.treeView.merge(branch);
				return log;
			} catch (error: unknown) {
				log += `### Error Applying Edit ${editIndex + 1}\n\n`;
				log += `\`${(error as Error)?.message}\`\n\n`;
				log += `LLM will be queried again.\n\n`;
				branch.dispose();
				if (error instanceof UsageError) {
					retryState.errors.push({
						editIndex,
						error,
						toolUse,
					});
				} else {
					throw error;
				}
			}
		} else {
			log += `### Error Parsing Result\n\n`;
			log += `\`${parse.error.message}\`\n\n`;
			log += `LLM will be queried again.\n\n`;
			retryState.errors.push({
				error: new UsageError(parse.error.message),
				editIndex: -1,
				toolUse,
			});
			branch.dispose();
		}

		const retryMessages: Anthropic.Beta.Messages.BetaMessageParam[] = [...messages];
		for (const retry of retryState.errors) {
			retryMessages.push(
				{ role: "assistant", content: [retryState.thinking, retry.toolUse] },
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: retry.toolUse.id,
							content:
								retry.editIndex >= 0
									? `Error: "${retry.error.message}" when applying TreeEdit at index ${retry.editIndex}.`
									: `Error: "${retry.error.message}" when attempting to parse edits.`,
						},
					],
				},
			);
		}

		response = await queryClod(retryMessages);
	}

	return log;
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
