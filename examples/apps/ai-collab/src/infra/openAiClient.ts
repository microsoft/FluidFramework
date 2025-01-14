/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { OpenAI } from "openai";

let OPEN_AI_SINGLETON: OpenAI;

/**
 * Returns a singleton instance of the OpenAI client.
 */
export function getOpenAiClient(): OpenAI {
	const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

	if (apiKey === undefined) {
		throw new Error(
			`Cannot create OpenAI client:- No Open AI API key found. Please set the NEXT_PUBLIC_OPENAI_API_KEY environment variable.`,
		);
	}

	if (OPEN_AI_SINGLETON === undefined) {
		OPEN_AI_SINGLETON = new OpenAI({
			apiKey,
			// Because this example app makes calls to OpenAi from the browser client, which exposes our API key, we have to set this flag to true.
			// In a real app, you would want to make these calls from a server to avoid exposing your API key.
			dangerouslyAllowBrowser: true,
		});
	}

	return OPEN_AI_SINGLETON;
}
