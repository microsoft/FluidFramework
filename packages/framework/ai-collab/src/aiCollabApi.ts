/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeNode } from "@fluidframework/tree";
// eslint-disable-next-line import/no-named-as-default
import type OpenAI from "openai";

/**
 * Core Debug event type for the ai-collab
 * @alpha
 */
export interface DebugEvent {
	/**
	 * The unique id of the debug event.
	 */
	id: string;
	/**
	 * An id that will be shared across all debug events that originate from the same single execution of ai-collab.
	 * @remarks This is intended to be used to correlate all debug events that originate from the same execution
	 */
	traceId?: string;
	/**
	 * The name of the debug event.
	 */
	eventName?: string;
	/**
	 * The date and time at which the debug event was created.
	 */
	timestamp: string;
}

/**
 * A Debug event that marks the start or end of a single core logic flow, such as generated tree edits, planning prompt, etc.
 * @alpha
 */
export interface EventFlowDebugEvent extends DebugEvent {
	/**
	 * The name of the particular event flow.
	 */
	eventFlowName: string;
	/**
	 * The status of the particular event flow.
	 */
	eventFlowStatus: "STARTED" | "COMPLETED";
	/**
	 * A unique id that will be shared across all debug events that are part of the same event flow.
	 */
	eventFlowTraceId: string;
}

/**
 * A callback function that can be used to handle debug events that occur during the AI collaboration process.
 * @alpha
 */
export type DebugEventLogHandler = <T extends DebugEvent>(event: T) => unknown;

/**
 * OpenAI client options for the {@link AiCollabOptions} interface.
 *
 * @alpha
 */
export interface OpenAiClientOptions {
	/**
	 * The OpenAI client to use for the AI collaboration.
	 */
	client: OpenAI;
	/**
	 * The name of the target OpenAI model to use for the AI collaboration.
	 */
	modelName?: string;
}

/**
 * Options for the AI collaboration.
 *
 * @alpha
 */
export interface AiCollabOptions {
	/**
	 * The OpenAI client options to use for the LLM based AI collaboration.
	 */
	readonly openAI: OpenAiClientOptions;
	/**
	 * The specific tree node you want the AI to collaborate on. Pass the root node of your tree if you intend
	 * for the AI to work on the entire tree.
	 * @remarks
	 * - Optional root nodes are not supported
	 * - Primitive root nodes are not supported
	 */
	readonly treeNode: TreeNode;
	/**
	 * The prompt context to give the LLM in order to collaborate with your applications data.
	 */
	readonly prompt: {
		/**
		 * The context to give the LLM about its role in the collaboration.
		 * @remarks It's highly recommended to give context about your applications data model and the LLM's role in the collaboration.
		 */
		readonly systemRoleContext: string;
		/**
		 * The request from the users to the LLM.
		 */
		readonly userAsk: string;
	};
	/**
	 * Limiters are various optional ways to limit this library's usage of the LLM.
	 */
	readonly limiters?: {
		/**
		 * An optional AbortController that can be used to abort the AI collaboration while it is still in progress.
		 */
		readonly abortController?: AbortController;
		/**
		 * The maximum number of sequential errors the LLM can make before aborting the collaboration.
		 * If the maximum number of sequential errors is reached, the AI collaboration will be aborted and return with the errorMessage 'tooManyErrors'.
		 * Leaving this undefined will disable this limiter.
		 */
		readonly maxSequentialErrors?: number;
		/**
		 * The maximum number of model calls the LLM can make before aborting the collaboration.
		 * If the maximum number of model calls is reached, the AI collaboration will be aborted and return with the errorMessage 'tooManyModelCalls'.
		 * Leaving this undefined will disable this limiter.
		 */
		readonly maxModelCalls?: number;
		/**
		 * The maximum token usage limits for the LLM.
		 * If the LLM exceeds the token limits, the AI collaboration will be aborted and return with the errorMessage 'tokenLimitExceeded'.
		 * This happens after the first model call's token usage is calculated, meaning that the limits set may be exceeded by a certain amount.
		 * Leaving this undefined will disable this limiter.
		 */
		readonly tokenLimits?: TokenLimits;
	};
	/**
	 * When set to true, the LLM will be asked to first produce a plan, based on the user's ask, before generating any changes to your applications data.
	 * This can help the LLM produce better results.
	 * When set to false, the LLM will not be asked to produce a plan.
	 */
	readonly planningStep?: boolean;
	/**
	 * When set to true, the LLM will be asked to complete a final review of the changes and determine if any additional changes need to be made.
	 * When set to false, the LLM will not be asked to complete a final review.
	 */
	readonly finalReviewStep?: boolean;
	/**
	 * An optional validator function that can be used to validate the new content produced by the LLM.
	 */
	readonly validator?: (newContent: TreeNode) => void;
	/**
	 * An optional handler for debug events that occur during the AI collaboration.
	 */
	readonly debugEventLogHandler?: DebugEventLogHandler;
}

/**
 * A successful response from the AI collaboration.
 *
 * @alpha
 */
export interface AiCollabSuccessResponse {
	/**
	 * The status of the Ai Collaboration.
	 * A 'success' status indicates that the AI collaboration was successful at creating changes.
	 */
	readonly status: "success";
	/**
	 * {@inheritDoc TokenUsage}
	 */
	readonly tokensUsed: TokenUsage;
}

/**
 * An error response from the AI collaboration.
 *
 * @alpha
 */
export interface AiCollabErrorResponse {
	/**
	 * The status of the Ai Collaboration.
	 * - A 'partial-failure' status indicates that the AI collaboration was partially successful, but was aborted due to a limiter or other error
	 * - A "failure" status indicates that the AI collaboration was not successful at creating any changes.
	 */
	readonly status: "failure" | "partial-failure";
	/**
	 * The type of known error that occured
	 * - 'tokenLimitExceeded' indicates that the LLM exceeded the token limits set by the user
	 * - 'tooManyErrors' indicates that the LLM made too many errors in a row
	 * - 'tooManyModelCalls' indicates that the LLM made too many model calls
	 * - 'aborted' indicates that the AI collaboration was aborted by the user or a limiter
	 * - 'unexpectedError' indicates that an unexpected error occured
	 */
	readonly errorMessage:
		| "tokenLimitExceeded"
		| "tooManyErrors"
		| "tooManyModelCalls"
		| "aborted"
		| "unexpectedError";
	/**
	 * {@inheritDoc TokenUsage}
	 */
	tokensUsed: TokenUsage;
}

/**
 * Total usage of tokens by an LLM.
 *
 * @alpha
 */
export interface TokenUsage {
	/**
	 * The total number of tokens used by the LLM for input.
	 */
	inputTokens: number;
	/**
	 * The total number of tokens used by the LLM for output.
	 */
	outputTokens: number;
}

/**
 * Maximum limits for the total tokens that can be used by an llm
 *
 * @alpha
 */
export interface TokenLimits {
	/**
	 * The maximum number of tokens that can be used by the LLM for input.
	 */
	readonly inputTokens?: number;
	/**
	 * The maximum number of tokens that can be used by the LLM for output.
	 */
	readonly outputTokens?: number;
}
