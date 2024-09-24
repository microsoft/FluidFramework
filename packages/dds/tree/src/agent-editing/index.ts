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

import {
	getSimpleSchema,
	normalizeFieldSchema,
	type ImplicitFieldSchema,
	type SimpleTreeSchema,
	type TreeNode,
	type TreeView,
} from "../simple-tree/index.js";
import {
	getEditingSystemPrompt,
	getSuggestingSystemPrompt,
	type EditLog,
} from "./promptGeneration.js";
import { generateEditHandlers } from "./handlers.js";
import { createResponseHandler, JsonHandler, type JsonObject } from "../json-handler/index.js";
import type { EditWrapper, TreeEdit } from "./agentEditTypes.js";
import { IdGenerator } from "./idGenerator.js";
import { applyAgentEdit } from "./agentEditReducer.js";

const DEBUG_LOG: string[] | undefined = [];

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
	maxEdits: number;
	maxSequentialErrors?: number;
	validator?: (newContent: TreeNode) => void;
	dumpDebugLog?: boolean;
}

/**
 * Prompts the provided LLM client to generate valid tree edits.
 * Applies those edits to the provided tree branch before returning.
 *
 * @internal
 */
export async function generateTreeEdits(
	options: GenerateTreeEditsOptions<ImplicitFieldSchema>,
): Promise<"success" | "tooManyErrors" | "tooManyEdits" | "aborted"> {
	const idGenerator = new IdGenerator();
	const editLog: EditLog = [];
	let editCount = 0;
	let sequentialErrorCount = 0;
	const simpleSchema = getSimpleSchema(
		normalizeFieldSchema(options.treeView.schema).allowedTypes,
	);

	for await (const edit of generateEdits(options, simpleSchema, idGenerator, editLog)) {
		try {
			editLog.push({
				edit: applyAgentEdit(
					options.treeView,
					edit,
					idGenerator,
					simpleSchema.definitions,
					options.validator,
				),
			});
			sequentialErrorCount = 0;
		} catch (error: unknown) {
			if (error instanceof Error) {
				const { message } = error;
				sequentialErrorCount += 1;
				editLog.push({ edit, error: message });
				DEBUG_LOG?.push(`Error: ${message}`);
			} else {
				throw error;
			}
		}

		if (options.abortController?.signal.aborted === true) {
			return "aborted";
		}

		if (sequentialErrorCount > (options.maxSequentialErrors ?? Infinity)) {
			return "tooManyErrors";
		}

		if (++editCount >= options.maxEdits) {
			return "tooManyEdits";
		}
	}

	if (DEBUG_LOG !== undefined) {
		console.log(DEBUG_LOG.join("\n\n"));
		DEBUG_LOG.length = 0;
	}

	return "success";
}

async function* generateEdits<TSchema extends ImplicitFieldSchema>(
	options: GenerateTreeEditsOptions<TSchema>,
	simpleSchema: SimpleTreeSchema,
	idGenerator: IdGenerator,
	editLog: EditLog,
): AsyncGenerator<TreeEdit> {
	async function getNextEdit(): Promise<TreeEdit | undefined> {
		const systemPrompt = getEditingSystemPrompt(
			options.prompt,
			idGenerator,
			options.treeView,
			editLog,
		);

		DEBUG_LOG?.push(systemPrompt);

		return new Promise((resolve) => {
			const editHandler = generateEditHandlers(simpleSchema, (jsonObject: JsonObject) => {
				DEBUG_LOG?.push(JSON.stringify(jsonObject, null, 2));
				const wrapper = jsonObject as unknown as EditWrapper;
				if (wrapper.edit === null) {
					DEBUG_LOG?.push("No more edits.");
					return resolve(undefined);
				} else {
					return resolve(wrapper.edit);
				}
			});

			const responseHandler = createResponseHandler(
				editHandler,
				options.abortController ?? new AbortController(),
			);

			void responseHandler.processResponse(
				streamFromLlm(systemPrompt, responseHandler.jsonSchema(), options.openAIClient),
			);
		});
	}

	let edit = await getNextEdit();
	while (edit !== undefined) {
		yield edit;
		edit = await getNextEdit();
	}
}

/**
 * Prompts the provided LLM client to generate a list of suggested tree edits to perform.
 *
 * @internal
 */
export async function generateSuggestions(
	openAIClient: OpenAI,
	view: TreeView<ImplicitFieldSchema>,
	suggestionCount: number,
	guidance?: string,
	abortController = new AbortController(),
): Promise<string[]> {
	let suggestions: string[] | undefined;

	const editHandler = JsonHandler.object(() => ({
		properties: {
			edit: JsonHandler.array(() => ({
				description:
					"A list of changes that a user might want a collaborative agent to make to the tree.",
				items: JsonHandler.string(),
			}))(),
		},
		complete: (jsonObject: JsonObject) => {
			suggestions = (jsonObject as { edit: string[] }).edit;
		},
	}))();

	const responseHandler = createResponseHandler(editHandler, abortController);
	const systemPrompt = getSuggestingSystemPrompt(view, suggestionCount, guidance);
	await responseHandler.processResponse(
		streamFromLlm(systemPrompt, responseHandler.jsonSchema(), openAIClient),
	);
	assert(suggestions !== undefined, "No suggestions were generated.");
	return suggestions;
}

async function* streamFromLlm(
	systemPrompt: string,
	jsonSchema: JsonObject,
	openAIClient: OpenAI,
): AsyncGenerator<string> {
	const llmJsonSchema: ResponseFormatJSONSchema.JSONSchema = {
		schema: jsonSchema,
		name: "llm-response",
		strict: true, // Opt into structured output
	};

	const body: ChatCompletionCreateParams = {
		messages: [{ role: "system", content: systemPrompt }],
		model: clientModel.get(openAIClient) ?? "gpt-4o",
		response_format: {
			type: "json_schema",
			json_schema: llmJsonSchema,
		},
		// TODO
		// stream: true, // Opt in to streaming responses.
		max_tokens: 4096,
	};

	const result = await openAIClient.chat.completions.create(body);
	const choice = result.choices[0];
	assert(choice !== undefined, "Response included no choices.");
	assert(choice.finish_reason === "stop", "Response was unfinished.");
	assert(choice.message.content !== null, "Response contained no contents.");
	// TODO: There is only a single yield here because we're not actually streaming
	yield choice.message.content ?? "<error>";
}

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
