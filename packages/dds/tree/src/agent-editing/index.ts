/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureOpenAI } from "openai";

import type {
	ChatCompletionCreateParams,
	ResponseFormatJSONSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "openai/resources/index.mjs";

import { assert } from "@fluidframework/core-utils/internal";

import type { ImplicitFieldSchema, TreeView } from "../simple-tree/index.js";
import { getSystemPrompt } from "./promptGeneration.js";
import { generateHandlers } from "./handlers.js";
import { createResponseHandler } from "../json-handler/index.js";

export { getSystemPrompt } from "./promptGeneration.js";
export { getResponse } from "./llmClient.js";

/**
 * Prompts the provided LLM client to generate valid tree edits.
 * Applies those edits to the provided tree branch before returning.
 *
 * @internal
 */
export async function generateTreeEdits<TSchema extends ImplicitFieldSchema>(
	client: AzureOpenAI,
	tree: TreeView<TSchema>,
	prompt: string,
): Promise<void> {
	const { systemPrompt, decoratedTreeJson } = getSystemPrompt(tree);

	const editSchema = generateHandlers(tree, decoratedTreeJson.idMap);
	const abortController = new AbortController();
	const responseHandler = createResponseHandler(editSchema, abortController);

	const llmJsonSchema: ResponseFormatJSONSchema.JSONSchema = {
		schema: responseHandler.jsonSchema(),
		name: "llm-response",
		strict: true, // Opt into structured output
	};

	const body: ChatCompletionCreateParams = {
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: prompt },
		],
		model: "gpt-4o",
		response_format: {
			type: "json_schema",
			json_schema: llmJsonSchema,
		},
		// TODO
		// stream: true, // Opt in to streaming responses.
		max_tokens: 4096,
	};

	const result = await client.chat.completions.create(body);
	assert(result.choices.length !== 0, "Response included no choices.");
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	assert(result.choices[0]!.finish_reason === "stop", "Response was unfinished.");
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	assert(result.choices[0]!.message.content !== null, "Response contained no contents.");

	await responseHandler.processResponse({
		async *[Symbol.asyncIterator](): AsyncGenerator<string, void> {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const content = result.choices[0]!.message.content!;
			KLUDGE += content;
			console.log(content);
			yield content;
		},
	});
}

export let KLUDGE = "";

/**
 * Creates an OpenAI Client session.
 * Depends on the following environment variables:
 *
 * - AZURE_OPENAI_API_KEY
 *
 * - AZURE_OPENAI_ENDPOINT
 *
 * - AZURE_OPENAI_DEPLOYMENT
 *
 * @internal
 */
export function initializeOpenAIClient(): AzureOpenAI {
	const apiKey = process.env.AZURE_OPENAI_API_KEY;
	if (apiKey === null || apiKey === undefined) {
		throw new Error("AZURE_OPENAI_API_KEY environment variable not set");
	}

	const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
	if (endpoint === null || endpoint === undefined) {
		throw new Error("AZURE_OPENAI_ENDPOINT environment variable not set");
	}

	const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
	if (deployment === null || deployment === undefined) {
		throw new Error("AZURE_OPENAI_DEPLOYMENT environment variable not set");
	}

	return new AzureOpenAI({
		endpoint,
		deployment,
		apiKey,
		apiVersion: "2024-08-01-preview",
		timeout: 1250000,
	});
}
