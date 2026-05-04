/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	SharedTreeChatModel,
	SharedTreeChatQuery,
} from "@fluidframework/tree-agent/alpha";
import { AzureOpenAI } from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/index";

/**
 * The default Azure OpenAI endpoint for the eval framework.
 */
export const AZURE_OPENAI_ENDPOINT = "https://eval-framework-resource.openai.azure.com/";

/**
 * The default Azure OpenAI deployment name.
 */
export const AZURE_OPENAI_DEPLOYMENT = "gpt-4o-mini";

/**
 * The default Azure OpenAI API version.
 */
export const AZURE_OPENAI_API_VERSION = "2024-10-21";

/**
 * Options for creating an {@link OpenAiChatModel}.
 */
export interface OpenAiChatModelOptions {
	/**
	 * Token provider for Azure AD authentication.
	 */
	azureADTokenProvider: () => Promise<string>;

	/**
	 * Azure OpenAI endpoint URL. Defaults to {@link AZURE_OPENAI_ENDPOINT}.
	 */
	endpoint?: string;

	/**
	 * Azure OpenAI deployment name. Defaults to {@link AZURE_OPENAI_DEPLOYMENT}.
	 */
	deployment?: string;

	/**
	 * Azure OpenAI API version. Defaults to {@link AZURE_OPENAI_API_VERSION}.
	 */
	apiVersion?: string;

	/**
	 * Maximum number of tokens in the response.
	 */
	maxTokens?: number;
}

/**
 * A {@link SharedTreeChatModel} implementation that uses the Azure OpenAI API directly.
 */
export class OpenAiChatModel implements SharedTreeChatModel {
	private readonly client: AzureOpenAI;
	private readonly deployment: string;
	private readonly maxTokens: number;
	public readonly messages: ChatCompletionMessageParam[] = [];

	public readonly editToolName = "GenerateTreeEditingCode";

	public get name(): string {
		return this.deployment;
	}

	public constructor(options: OpenAiChatModelOptions) {
		this.deployment = options.deployment ?? AZURE_OPENAI_DEPLOYMENT;
		this.client = new AzureOpenAI({
			endpoint: options.endpoint ?? AZURE_OPENAI_ENDPOINT,
			apiVersion: options.apiVersion ?? AZURE_OPENAI_API_VERSION,
			azureADTokenProvider: options.azureADTokenProvider,
			dangerouslyAllowBrowser: true,
		});
		this.maxTokens = options.maxTokens ?? 16384;
	}

	public appendContext(text: string): void {
		this.messages.push({ role: "system", content: text });
	}

	public async query(query: SharedTreeChatQuery): Promise<string> {
		this.messages.push({ role: "user", content: query.text });
		return this.queryEdit(async (js: string) => query.edit(js));
	}

	private static readonly MAX_TOOL_CALL_ROUNDS = 20;

	private async queryEdit(
		edit: SharedTreeChatQuery["edit"],
		depth: number = 0,
	): Promise<string> {
		if (depth >= OpenAiChatModel.MAX_TOOL_CALL_ROUNDS) {
			return "Error: Maximum tool call rounds reached.";
		}
		const tool: ChatCompletionTool = {
			type: "function",
			function: {
				name: this.editToolName,
				description: "Invokes a JavaScript code snippet to edit a tree of application data.",
				parameters: {
					type: "object",
					properties: {
						js: {
							type: "string",
							description: "The JavaScript code to execute for editing the tree.",
						},
					},
					required: ["js"],
				},
			},
		};

		const response = await this.client.chat.completions.create({
			model: this.deployment,
			max_tokens: this.maxTokens,
			messages: this.messages,
			tools: [tool],
			tool_choice: "auto",
		});

		const choice = response.choices[0];
		if (choice === undefined) {
			return "No response from model.";
		}

		const assistantMessage = choice.message;

		// Push assistant response to message history
		this.messages.push(assistantMessage);

		// Check for tool calls
		if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
			for (const toolCall of assistantMessage.tool_calls) {
				if (toolCall.function.name === this.editToolName) {
					let args: { js: string };
					try {
						args = JSON.parse(toolCall.function.arguments) as { js: string };
					} catch {
						this.messages.push({
							role: "tool",
							tool_call_id: toolCall.id,
							content: `Error parsing tool call arguments: invalid JSON`,
						});
						continue;
					}

					if (typeof args.js !== "string") {
						this.messages.push({
							role: "tool",
							tool_call_id: toolCall.id,
							content: "Invalid argument type: js should be a string",
						});
						continue;
					}

					const editResult = await edit(args.js);

					this.messages.push({
						role: "tool",
						tool_call_id: toolCall.id,
						content: JSON.stringify(editResult),
					});

					if (editResult.type === "tooManyEditsError") {
						return editResult.message;
					}
				} else {
					this.messages.push({
						role: "tool",
						tool_call_id: toolCall.id,
						content: `Unrecognized tool call: ${toolCall.function.name}`,
					});
				}
			}

			// Recurse to let the model continue
			return this.queryEdit(edit, depth + 1);
		}

		// No tool calls - return text response
		return assistantMessage.content ?? "";
	}
}
