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
	type TreeView,
} from "../simple-tree/index.js";
import { getSystemPrompt, type EditLog } from "./promptGeneration.js";
import { generateHandlers } from "./handlers.js";
import {
	createResponseHandler,
	type JsonObject,
	type StreamedType,
} from "../json-handler/index.js";
import type { EditWrapper, TreeEdit } from "./agentEditTypes.js";
import { fail } from "../util/index.js";
import { IdGenerator } from "./idGenerator.js";
import { applyAgentEdit } from "./agentEditReducer.js";

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
	const debugLog: string[] = [];
	let editCount = 0;
	let sequentialErrorCount = 0;
	const fieldSchema = normalizeFieldSchema(options.treeView.schema);
	const simpleSchema = getSimpleSchema(fieldSchema.allowedTypes);

	const editGenerator = generateEdits(options, idGenerator, editLog, debugLog);
	for await (const edit of editGenerator) {
		try {
			applyAgentEdit(options.treeView, edit, idGenerator, simpleSchema.definitions);
			sequentialErrorCount = 0;
			editLog.push({ edit });
		} catch (e: unknown) {
			if (e instanceof Error) {
				const error = e.message;
				sequentialErrorCount += 1;
				editLog.push({ edit, error });
				debugLog.push(`Error: ${error}`);
			} else {
				throw e;
			}
		}

		if (options.abortController?.signal.aborted === true) {
			return "aborted";
		}

		if (
			options.maxSequentialErrors !== undefined &&
			sequentialErrorCount > options.maxSequentialErrors
		) {
			return "tooManyErrors";
		}

		if (++editCount >= options.maxEdits) {
			return "tooManyEdits";
		}
	}

	// debugLog.join("\n\n");
	return "success";
}

async function* generateEdits<TSchema extends ImplicitFieldSchema>(
	options: GenerateTreeEditsOptions<TSchema>,
	idGenerator: IdGenerator,
	editLog: EditLog,
	debugLog?: string[],
): AsyncGenerator<TreeEdit> {
	const fieldSchema = normalizeFieldSchema(options.treeView.schema);
	const simpleSchema = getSimpleSchema(fieldSchema.allowedTypes);

	async function getNextEdit(): Promise<TreeEdit | undefined> {
		return new Promise((resolve) => {
			const editHandler = generateHandlers(
				options.treeView,
				simpleSchema,
				(jsonObject: JsonObject) => {
					debugLog?.push(JSON.stringify(jsonObject, null, 2));
					const wrapper = jsonObject as unknown as EditWrapper;
					if (wrapper.edit === null) {
						debugLog?.push("No more edits.");
						return resolve(undefined);
					} else {
						return resolve(wrapper.edit);
					}
				},
			);

			const systemPrompt = getSystemPrompt(
				options.prompt,
				idGenerator,
				options.treeView,
				editLog,
			);

			debugLog?.push(systemPrompt);
			void handleEditFromLlm(systemPrompt, editHandler, options);
		});
	}

	while (true) {
		const edit = await getNextEdit();
		if (edit === undefined) {
			break;
		}
		yield edit;
	}
}

async function handleEditFromLlm<TSchema extends ImplicitFieldSchema>(
	systemPrompt: string,
	editHandler: StreamedType,
	options: GenerateTreeEditsOptions<TSchema>,
): Promise<void> {
	const responseHandler = createResponseHandler(
		editHandler,
		options.abortController ?? new AbortController(),
	);

	await responseHandler.processResponse(
		streamFromLlm(systemPrompt, responseHandler.jsonSchema(), options),
	);
}

async function* streamFromLlm(
	systemPrompt: string,
	jsonSchema: JsonObject,
	{ openAIClient }: GenerateTreeEditsOptions<ImplicitFieldSchema>,
): AsyncGenerator<string> {
	const llmJsonSchema: ResponseFormatJSONSchema.JSONSchema = {
		schema: jsonSchema,
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
