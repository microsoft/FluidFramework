/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChatMessage, ILLMClient, LLMResponse } from "@fluidframework/eval-framework";
import { AzureOpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index";

import {
	AZURE_OPENAI_ENDPOINT,
	AZURE_OPENAI_DEPLOYMENT,
	AZURE_OPENAI_API_VERSION,
} from "./openAiChatModel.js";

export interface OpenAiJudgeClientOptions {
	azureADTokenProvider: () => Promise<string>;
	endpoint?: string;
	deployment?: string;
	apiVersion?: string;
}

/**
 * An {@link ILLMClient} implementation that uses the Azure OpenAI API for LLM-as-judge evaluation.
 */
export class OpenAiJudgeClient implements ILLMClient {
	private readonly client: AzureOpenAI;
	private readonly deployment: string;

	public constructor(options: OpenAiJudgeClientOptions) {
		this.deployment = options.deployment ?? AZURE_OPENAI_DEPLOYMENT;
		this.client = new AzureOpenAI({
			endpoint: options.endpoint ?? AZURE_OPENAI_ENDPOINT,
			apiVersion: options.apiVersion ?? AZURE_OPENAI_API_VERSION,
			azureADTokenProvider: options.azureADTokenProvider,
		});
	}

	public async chatCompletion(messages: ChatMessage[]): Promise<LLMResponse> {
		const openAiMessages = messages.map((msg): ChatCompletionMessageParam => {
			const msgContent =
				typeof msg.content === "string"
					? msg.content
					: msg.content.map((block) => {
							if (block.type === "text") {
								return { type: "text" as const, text: block.text };
							}
							return {
								type: "image_url" as const,
								image_url: {
									url: `data:${block.mediaType};base64,${block.data}`,
								},
							};
						});

			switch (msg.role) {
				case "system": {
					return {
						role: "system",
						content:
							typeof msgContent === "string"
								? msgContent
								: msgContent.map((c) => (c.type === "text" ? c : { type: "text", text: "" })),
					};
				}
				case "assistant": {
					return {
						role: "assistant",
						content:
							typeof msgContent === "string"
								? msgContent
								: msgContent.map((c) => (c.type === "text" ? c : { type: "text", text: "" })),
					};
				}
				case "user": {
					return { role: "user", content: msgContent };
				}
				default: {
					throw new Error(`Unsupported message role: ${msg.role}`);
				}
			}
		});

		const response = await this.client.chat.completions.create({
			model: this.deployment,
			messages: openAiMessages,
		});

		const content = response.choices[0]?.message?.content ?? "";
		return { content };
	}
}
