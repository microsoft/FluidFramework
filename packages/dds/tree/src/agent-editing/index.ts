/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureOpenAI, OpenAI } from "openai";

import type {
	ChatCompletionCreateParams,
	ResponseFormatJSONSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "openai/resources/index.mjs";

import { assert } from "@fluidframework/core-utils/internal";

import type { ImplicitFieldSchema, TreeNode, TreeView } from "../simple-tree/index.js";
import { getSystemPrompt } from "./promptGeneration.js";
import { generateHandlers } from "./handlers.js";
import {
	createResponseHandler,
	type JsonObject,
	type StreamedType,
} from "../json-handler/index.js";
import type { EditWrapper, TreeEdit } from "./agentEditTypes.js";
import { fail } from "../util/index.js";

/**
 * {@link generateTreeEdits} options.
 *
 * @internal
 */
export interface GenerateTreeEditsOptions<TSchema extends ImplicitFieldSchema> {
	openAIClient: OpenAI;
	treeView: TreeView<TSchema>;
	prompt: string;
	abortController?: AbortController;
}

/**
 * Prompts the provided LLM client to generate valid tree edits.
 * Applies those edits to the provided tree branch before returning.
 *
 * @internal
 */
export async function generateTreeEdits<TSchema extends ImplicitFieldSchema>(
	options: GenerateTreeEditsOptions<TSchema>,
): Promise<void> {
	const log: TreeEdit[] = [];
	const idCount = { current: 0 };
	const idToNode = new Map<number, TreeNode>();
	const nodeToId = new Map<TreeNode, number>();
	const debugLog: string[] = [];

	async function doNextEdit(): Promise<void> {
		const systemPrompt = getSystemPrompt(
			options.prompt,
			idCount,
			idToNode,
			nodeToId,
			options.treeView,
			log,
		);

		debugLog.push(systemPrompt);

		let done = false;

		const editHandler = generateHandlers(
			options.treeView,
			idToNode,
			(jsonObject: JsonObject) => {
				const wrapper = jsonObject as unknown as EditWrapper;
				if (wrapper.edit !== null) {
					log.push(wrapper.edit);
				} else {
					done = true;
					debugLog.push("No more edits.");
				}
			},
			debugLog,
		);

		return doEdit(systemPrompt, editHandler, options).then(async () => {
			if (!done) {
				await doNextEdit();
			}
		});
	}

	return doNextEdit()
		.catch((error) => {
			debugLog.push(`Error: ${error}`);
		})
		.finally(() => {
			const dump = debugLog.join("\n\n");
			console.error(dump);
		});
}

async function doEdit<TSchema extends ImplicitFieldSchema>(
	systemPrompt: string,
	editHandler: StreamedType,
	{ openAIClient, abortController }: GenerateTreeEditsOptions<TSchema>,
): Promise<void> {
	const responseHandler = createResponseHandler(
		editHandler,
		abortController ?? new AbortController(),
	);

	const llmJsonSchema: ResponseFormatJSONSchema.JSONSchema = {
		schema: responseHandler.jsonSchema(),
		name: "llm-response",
		strict: true, // Opt into structured output
	};

	const body: ChatCompletionCreateParams = {
		messages: [{ role: "system", content: systemPrompt }],
		model: clientModel.get(openAIClient) ?? fail("Model not set"),
		response_format: {
			type: "json_schema",
			json_schema: llmJsonSchema,
		},
		// TODO
		// stream: true, // Opt in to streaming responses.
		max_tokens: 4096,
	};

	const result = await openAIClient.chat.completions.create(body);
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
 * If using the OpenAI API:
 * - OPENAI_API_KEY
 *
 * If using the Azure OpenAI API:
 * - AZURE_OPENAI_API_KEY
 * - AZURE_OPENAI_ENDPOINT
 * - AZURE_OPENAI_DEPLOYMENT
 *
 * @internal
 */
export function initializeOpenAIClient(service: "openai" | "azure"): OpenAI {
	if (service === "azure") {
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
			timeout: 2500000,
		});
		clientModel.set(client, "gpt-4o");
		return client;
	} else {
		const apiKey = process.env.OPENAI_API_KEY;
		if (apiKey === null || apiKey === undefined) {
			throw new Error("OPENAI_API_KEY environment variable not set");
		}

		const client = new OpenAI({ apiKey });
		clientModel.set(client, "gpt-4o-2024-08-06");
		return client;
	}
}

const clientModel = new WeakMap<OpenAI, string>();
