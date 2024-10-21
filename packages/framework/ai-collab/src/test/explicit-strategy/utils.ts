/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import OpenAI from "openai";
import { AzureOpenAI } from "openai";

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
		return client;
	} else {
		const apiKey = process.env.OPENAI_API_KEY;
		if (apiKey === null || apiKey === undefined) {
			throw new Error("OPENAI_API_KEY environment variable not set");
		}

		const client = new OpenAI({ apiKey });
		return client;
	}
}
