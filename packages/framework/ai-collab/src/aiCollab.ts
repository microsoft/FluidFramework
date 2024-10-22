/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ImplicitFieldSchema } from "@fluidframework/tree";

import type {
	AiCollabErrorResponse,
	AiCollabOptions,
	AiCollabSuccessResponse,
} from "./aiCollabApi.js";
import { generateTreeEdits } from "./explicit-strategy/index.js";

/**
 * Calls an LLM to modify the provided SharedTree based on the provided users input.
 * @remarks This function is designed to be a controlled "all-in-one" function that handles the entire process of calling an LLM to collaborative edit a SharedTree.
 *
 * @alpha
 */
export async function aiCollab<TSchema extends ImplicitFieldSchema>(
	options: AiCollabOptions<TSchema>,
): Promise<AiCollabSuccessResponse | AiCollabErrorResponse> {
	const response = await generateTreeEdits({
		treeView: options.treeView,
		validator: options.validator,
		openAI: options.openAI,
		prompt: options.prompt,
		limiters: options.limiters,
		dumpDebugLog: options.dumpDebugLog,
		finalReviewStep: options.finalReviewStep,
	});

	return response;
}
