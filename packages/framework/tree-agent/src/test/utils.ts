/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { unreachableCase } from "@fluidframework/core-utils/internal";
// eslint-disable-next-line import/no-internal-modules
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { ChatAnthropic } from "@langchain/anthropic";
// eslint-disable-next-line import/no-internal-modules
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

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
 * Creates a new instance of the LLM client based on the specified provider.
 */
export function createLlmClient(provider: "openai" | "anthropic" | "gemini"): BaseChatModel {
	switch (provider) {
		case "openai": {
			return new ChatOpenAI({
				model: "o3-mini",
				apiKey:
					process.env.OPENAI_API_KEY ??
					failUsage("Missing OPENAI_API_KEY enviroment variable"),
				reasoningEffort: "high",
				maxTokens: 20000,
			});
		}
		case "anthropic": {
			return new ChatAnthropic({
				model: "claude-3-7-sonnet-20250219",
				apiKey:
					process.env.ANTHROPIC_API_KEY ??
					failUsage("Missing ANTHROPIC_API_KEY enviroment variable"),
				thinking: { type: "enabled", budget_tokens: 10000 },
				maxTokens: 20000,
			});
		}
		case "gemini": {
			return new ChatGoogleGenerativeAI({
				model: "gemini-2.5-pro-exp-03-25",
				apiKey:
					process.env.GEMINI_API_KEY ??
					failUsage("Missing GOOGLE_API_KEY enviroment variable"),
				maxOutputTokens: 20000,
			});
		}
		default: {
			unreachableCase(provider);
		}
	}
}
