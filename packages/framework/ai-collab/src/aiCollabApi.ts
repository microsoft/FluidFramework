/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeNode, TreeView, ImplicitFieldSchema } from "@fluidframework/tree";
// eslint-disable-next-line import/no-named-as-default
import type OpenAI from "openai";

/**
 * OpenAI client options for the {@link AiCollabOptions} interface.
 *
 * @alpha
 */
export interface OpenAiClientOptions {
	client: OpenAI;
	modelName?: string;
}

/**
 * Options for the AI collaboration.
 *
 * @alpha
 */
export interface AiCollabOptions<TSchema extends ImplicitFieldSchema> {
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

/**
 * A successful response from the AI collaboration.
 *
 * @alpha
 */
export interface AiCollabSuccessResponse {
	status: "success";
	tokenUsage: TokenUsage;
}

/**
 * An error response from the AI collaboration.
 *
 * @alpha
 */
export interface AiCollabErrorResponse {
	status: "failure" | "partial-failure";
	errorMessage: "tokenLimitExceeded" | "tooManyErrors" | "tooManyModelCalls" | "aborted";
	tokenUsage: TokenUsage;
}

/**
 * Usage of tokens by an LLM.
 * @remarks This interface is used for both tracking token usage and for setting token limits.
 *
 * @alpha
 */
export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
}
