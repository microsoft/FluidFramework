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
	/**
	 * The view of your Shared Tree.
	 * @remarks Its is recommended to pass a branch of your current tree view so the AI has a separate canvas to work on
	 * and merge said branch back to the main tree when the AI is done and the user accepts
	 */
	treeView: TreeView<TSchema>;
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
