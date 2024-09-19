/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AzureOpenAI } from "openai";

import { oob } from "@fluidframework/core-utils/internal";
import type {
	ChatCompletion,
	ChatCompletionCreateParamsNonStreaming,
	ResponseFormatJSONSchema
	// eslint-disable-next-line import/no-internal-modules
} from "openai/resources/index.mjs";

import type { ImplicitFieldSchema, TreeView } from "../simple-tree/index.js";
import { getSystemPrompt } from "./promptGeneration.js";
import { generateHandlers } from "./handlers.js";
import { createResponseHandler } from "../json-handler/index.js";

export { getSystemPrompt } from "./promptGeneration.js";
export { getResponse } from "./llmClient.js";

export interface OpenAIContext<TSchema extends ImplicitFieldSchema> {
	readonly client: AzureOpenAI;
	readonly tree: TreeView<TSchema>;
}

/**
 * Prompts the provided LLM client to generate valid tree edits.
 * Applies those edits to the provided tree branch before returning.
 */
export async function applyGeneratedEdits<TSchema extends ImplicitFieldSchema>(
	{client, tree}: OpenAIContext<TSchema>,
	prompt: string,
): Promise<void> {
	const { systemPrompt, decoratedTreeJson } = getSystemPrompt(tree);

	// TODO: get edit schema
	const editSchema = generateHandlers(tree, decoratedTreeJson.idMap);
	const abortController = new AbortController();
	const responseHandler = createResponseHandler(editSchema, abortController);

	const responseSchema: ResponseFormatJSONSchema.JSONSchema = {
		schema: responseHandler.jsonSchema(),
		name: "llm-response",
		strict: true, // Opt into structured output
	};

	const body: ChatCompletionCreateParamsNonStreaming = {
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: prompt },
		],
		model: "gpt-4o",
		response_format: {
			type: "json_schema",
			json_schema: responseSchema,
		},
	};

	const result = await client.chat.completions.create(body);
	if (!result.created) {
		throw new Error("AI did not return result");
	}
	if (result.choices.length === 0) {
		throw new Error("AI result contained no choices");
	}

	const choice: ChatCompletion.Choice = result.choices[0] ?? oob();
	if (choice.finish_reason !== "stop") {
		return undefined;
	}

	if (choice.message.content === null) {
		throw new Error("AI result contained no content");
	}

	// TODO: invoke edit handlers based on response.
}

// TODO
// Depends on particular env variables
export function initializeOpenAIClient<TSchema extends ImplicitFieldSchema>(tree: TreeView<TSchema>): OpenAIContext<TSchema> {
	/* TODOs:
	1. Update the signature to take a TreeView<ImplicitFieldSchema>.
	2. Update body to call getSystemPrompt, cleanup imports/exports.
	3. Finish System prompt construction logic.
	*/
	console.log("Creating Azure OpenAI prompter");

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

	const client = new AzureOpenAI({
		endpoint,
		deployment,
		apiKey,
		apiVersion: "2024-08-01-preview",
	});

	return {
		client,
		tree,
	}
}
