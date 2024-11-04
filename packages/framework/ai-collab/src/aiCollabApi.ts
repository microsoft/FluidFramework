/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeNode } from "@fluidframework/tree";
// eslint-disable-next-line import/no-named-as-default
import type OpenAI from "openai";

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
	openAI: OpenAiClientOptions;
	/**
	 * The specific tree node you want the AI to collaborate on. Pass the root node of your tree if you intend
	 * for the AI to work on the entire tree.
	 * @remarks
	 * - Optional root nodes are not supported
	 * - Primitive root nodes are not supported
	 */
	treeNode: TreeNode;
	prompt: {
		/**
		 * The context to give the LLM about its role in the collaboration.
		 */
		systemRoleContext: string;
		/**
		 * The request from the users to the LLM.
		 */
		userAsk: string;
	};
	/**
	 * Limiters are various optional ways to limit this library's usage of the LLM.
	 */
	limiters?: {
		abortController?: AbortController;
		/**
		 * The maximum number of sequential errors the LLM can make before aborting the collaboration.
		 */
		maxSequentialErrors?: number;
		/**
		 * The maximum number of model calls the LLM can make before aborting the collaboration.
		 */
		maxModelCalls?: number;
		/**
		 * The maximum token usage limits for the LLM.
		 */
		tokenLimits?: TokenUsage;
	};
	/**
	 * When enabled, the LLM will be prompted to first produce a plan based on the user's ask before generating changes to your applications data
	 */
	planningStep?: boolean;
	/**
	 * When enabled, the LLM will be prompted with a final review of the changes they made to confimr their validity.
	 */
	finalReviewStep?: boolean;
	/**
	 * An optional validator function that can be used to validate the new content produced by the LLM.
	 */
	validator?: (newContent: TreeNode) => void;
	/**
	 * When enabled, the library will console.log information useful for debugging the AI collaboration.
	 */
	dumpDebugLog?: boolean;
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
	status: "success";
	/**
	 * {@inheritDoc TokenUsage}
	 */
	tokenUsage: TokenUsage;
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
	status: "failure" | "partial-failure";
	/**
	 * The type of known error that occured
	 * - 'tokenLimitExceeded' indicates that the LLM exceeded the token limits set by the user
	 * - 'tooManyErrors' indicates that the LLM made too many errors in a row
	 * - 'tooManyModelCalls' indicates that the LLM made too many model calls
	 * - 'aborted' indicates that the AI collaboration was aborted by the user or a limiter
	 */
	errorMessage: "tokenLimitExceeded" | "tooManyErrors" | "tooManyModelCalls" | "aborted";
	/**
	 * {@inheritDoc TokenUsage}
	 */
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
