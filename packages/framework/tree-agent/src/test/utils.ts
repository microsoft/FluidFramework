/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { appendFileSync, openSync, closeSync } from "node:fs";

// eslint-disable-next-line import/no-internal-modules
import { unreachableCase } from "@fluidframework/core-utils/internal";
// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
// eslint-disable-next-line import/no-internal-modules
import { UsageError } from "@fluidframework/telemetry-utils/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	TreeViewConfiguration,
} from "@fluidframework/tree";
import {
	SharedTree,
	asTreeViewAlpha,
	type ReadableField,
	type TreeView,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";
import { ChatAnthropic } from "@langchain/anthropic";
// eslint-disable-next-line import/no-internal-modules
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

import { createEditingAgent } from "../editingAgent.js";
import { createFunctioningAgent } from "../functioningAgent.js";
import { failUsage } from "../utils.js";

/**
 * Validates that the error is a UsageError with the expected error message.
 */
export function validateUsageError(expectedErrorMsg: string | RegExp): (error: Error) => true {
	return (error: Error) => {
		assert(error instanceof UsageError);
		if (
			typeof expectedErrorMsg === "string"
				? error.message !== expectedErrorMsg
				: !expectedErrorMsg.test(error.message)
		) {
			throw new Error(
				`Unexpected assertion thrown\nActual: ${error.message}\nExpected: ${expectedErrorMsg}`,
			);
		}
		return true;
	};
}

/**
 * The LLM providers supported by {@link createLlmClient}.
 */
export type LlmProvider = "openai" | "anthropic" | "gemini";

/**
 * Creates a new instance of the LLM client based on the specified provider.
 */
export function createLlmClient(provider: LlmProvider): BaseChatModel {
	switch (provider) {
		case "openai": {
			return new ChatOpenAI({
				model: "o3-mini",
				apiKey:
					process.env.OPENAI_API_KEY ??
					failUsage("Missing OPENAI_API_KEY environment variable"),
				reasoningEffort: "high",
				maxTokens: 20000,
				metadata: {
					modelName: "OpenAI: o3 Mini",
				},
			});
		}
		case "anthropic": {
			return new ChatAnthropic({
				model: "claude-3-7-sonnet-20250219",
				apiKey:
					process.env.ANTHROPIC_API_KEY ??
					failUsage("Missing ANTHROPIC_API_KEY environment variable"),
				thinking: { type: "enabled", budget_tokens: 10000 },
				maxTokens: 20000,
				metadata: {
					modelName: "Anthropic: Claude 3.7 Sonnet",
				},
			});
		}
		case "gemini": {
			return new ChatGoogleGenerativeAI({
				model: "gemini-2.5-pro-exp-03-25",
				apiKey:
					process.env.GEMINI_API_KEY ??
					failUsage("Missing GOOGLE_API_KEY environment variable"),
				maxOutputTokens: 20000,
				metadata: {
					modelName: "Google GenAI: Gemini 2.5 Pro Exp",
				},
			});
		}
		default: {
			unreachableCase(provider);
		}
	}
}

/**
 * The type of LLM editing to leverage.
 */
export type LlmEditingType = "editing" | "functioning";

/**
 * Queries the LLM with the specified prompt and logs the results to a file.
 * @remarks Use the following environment variables to set the LLM API keys:
 * - `OPENAI_API_KEY` for OpenAI
 * - `ANTHROPIC_API_KEY` for Anthropic
 * - `GEMINI_API_KEY` for Gemini
 */
export async function queryDomain<TRoot extends ImplicitFieldSchema>(
	name: string,
	schema: TRoot,
	initialTree: InsertableTreeFieldFromImplicitField<TRoot>,
	provider: LlmProvider,
	editingType: LlmEditingType,
	prompt: string,
	options?: {
		domainHints?: string;
		treeToString?: (root: ReadableField<TRoot>) => string;
	},
): Promise<TreeView<TRoot>> {
	const tree = SharedTree.getFactory().create(
		new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
		"tree",
	);
	const view = tree.viewWith(new TreeViewConfiguration({ schema }));
	view.initialize(initialTree);
	const client = createLlmClient(provider);
	const createAgent = editingType === "editing" ? createEditingAgent : createFunctioningAgent;

	const agent = createAgent(client, asTreeViewAlpha(view), {
		log: (l) => appendFileSync(fd, l, { encoding: "utf8" }),
		domainHints: options?.domainHints,
		treeToString: options?.treeToString,
	});
	const timestamp = new Date()
		.toLocaleString("en-US", {
			timeZone: "America/Los_Angeles",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		})
		.replace(/[\s,/:]/g, "-");

	const fd = openSync(`${name}-${provider}-${editingType}-${timestamp}.md`, "w");
	await agent.query(prompt);
	closeSync(fd);
	return view;
}
