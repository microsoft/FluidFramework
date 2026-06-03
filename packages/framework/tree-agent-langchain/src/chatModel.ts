/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	EditResult,
	SharedTreeChatModel,
	SharedTreeChatQuery, // eslint-disable-line import-x/no-deprecated
	TreeAgentChatMessage,
	TreeAgentChatResponse,
} from "@fluidframework/tree-agent/alpha";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models"; // eslint-disable-line import-x/no-internal-modules
import type { BaseMessage } from "@langchain/core/messages"; // eslint-disable-line import-x/no-internal-modules
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages"; // eslint-disable-line import-x/no-internal-modules
import { tool } from "@langchain/core/tools"; // eslint-disable-line import-x/no-internal-modules

// #region New stateless implementation

/**
 * Creates a stateless {@link @fluidframework/tree-agent#SharedTreeChatModel} backed by LangChain.
 * @remarks Use with {@link @fluidframework/tree-agent#createTreeAgent | createTreeAgent}.
 * @param langchainModel - The LangChain chat model to use.
 * @alpha
 */
export function createLangchainChatModel(langchainModel: BaseChatModel): SharedTreeChatModel {
	return new LangchainChatModel(langchainModel);
}

/**
 * Stateless LangChain adapter for {@link @fluidframework/tree-agent#SharedTreeChatModel}.
 * @remarks This class does not maintain internal message history. All context is provided
 * via the `history` parameter to {@link LangchainChatModel.invoke}.
 */
class LangchainChatModel implements SharedTreeChatModel {
	public readonly editToolName = "GenerateTreeEditingCode";

	public constructor(private readonly model: BaseChatModel) {}

	public get name(): string | undefined {
		const name = this.model.metadata?.modelName;
		return typeof name === "string" ? name : undefined;
	}

	public async invoke(
		history: readonly TreeAgentChatMessage[],
	): Promise<TreeAgentChatResponse> {
		// Convert TreeAgentChatMessage[] to LangChain BaseMessage[]
		const messages: BaseMessage[] = convertToLangchainMessages(history);

		// Create a placeholder tool definition so the LLM knows the tool exists.
		// The actual execution is handled by the agent's edit loop — this tool
		// is never directly invoked, it only tells the LLM the tool signature.
		const editingTool = tool(async (js: string) => js, {
			name: this.editToolName,
			description: "Invokes a JavaScript code snippet to edit a tree of application data.",
		});

		const runnable = this.model.bindTools?.([editingTool], {
			tool_choice: "auto",
		});
		if (runnable === undefined) {
			throw new UsageError("LLM client must support function calling or tool use.");
		}

		const responseMessage = await runnable.invoke(messages);

		// Parse the response into TreeAgentChatResponse.
		// Return the first tool call as a tool_call message, preserving the raw args.
		// Arg parsing (extracting code) is the agent's responsibility.
		const firstToolCall =
			responseMessage.tool_calls !== undefined && responseMessage.tool_calls.length > 0
				? responseMessage.tool_calls[0]
				: undefined;
		if (firstToolCall !== undefined) {
			return {
				role: "tool_call",
				toolCallId: firstToolCall.id,
				toolName: firstToolCall.name,
				toolArgs: firstToolCall.args,
			};
		}

		const content =
			typeof responseMessage.text === "string"
				? responseMessage.text
				: typeof responseMessage.content === "string"
					? responseMessage.content
					: JSON.stringify(responseMessage.content);
		return { role: "assistant", content };
	}
}

/**
 * Converts an array of {@link TreeAgentChatMessage} to LangChain {@link BaseMessage} format.
 */
function convertToLangchainMessages(history: readonly TreeAgentChatMessage[]): BaseMessage[] {
	const messages: BaseMessage[] = [];
	for (const msg of history) {
		switch (msg.role) {
			case "system": {
				messages.push(new SystemMessage(msg.content));
				break;
			}
			case "user": {
				messages.push(new HumanMessage(msg.content));
				break;
			}
			case "assistant": {
				messages.push(new AIMessage(msg.content));
				break;
			}
			case "tool_call": {
				messages.push(
					new AIMessage({
						content: "",
						tool_calls: [
							{
								id: msg.toolCallId,
								name: msg.toolName,
								args: msg.toolArgs,
							},
						],
					}),
				);
				break;
			}
			case "tool_result": {
				messages.push(
					new ToolMessage({
						content: msg.content,
						tool_call_id: msg.toolCallId ?? "",
					}),
				);
				break;
			}
			// No default
		}
	}
	return messages;
}

// #endregion

// #region Legacy stateful implementation

/**
 * Creates a legacy stateful {@link @fluidframework/tree-agent#SharedTreeChatModel} backed by LangChain.
 * @remarks This implementation maintains internal message history and manages the edit loop via the
 * {@link @fluidframework/tree-agent#SharedTreeChatQuery.edit | edit} callback pattern.
 * Use with {@link @fluidframework/tree-agent#SharedTreeSemanticAgent}.
 * @param langchainModel - The LangChain chat model to use.
 * @deprecated Use {@link createLangchainChatModel} with
 * {@link @fluidframework/tree-agent#createTreeAgent | createTreeAgent} instead.
 * @alpha
 */
export function createLegacyLangchainChatModel(
	langchainModel: BaseChatModel,
): SharedTreeChatModel {
	return new LegacyLangchainChatModel(langchainModel);
}

class LegacyLangchainChatModel implements SharedTreeChatModel {
	private readonly messages: BaseMessage[] = [];

	public constructor(private readonly model: BaseChatModel) {}

	public readonly editToolName = "GenerateTreeEditingCode";

	public get name(): string | undefined {
		const name = this.model.metadata?.modelName;
		return typeof name === "string" ? name : undefined;
	}

	public appendContext(text: string): void {
		this.messages.push(new SystemMessage(text));
	}

	// eslint-disable-next-line import-x/no-deprecated
	public async query(query: SharedTreeChatQuery): Promise<string> {
		this.messages.push(new HumanMessage(query.text));
		return this.queryEdit(async (js: string) => query.edit(js));
	}

	private async queryEdit(
		edit: SharedTreeChatQuery["edit"], // eslint-disable-line import-x/no-deprecated
	): Promise<string> {
		const editingTool = tool(edit, {
			name: this.editToolName,
			description: "Invokes a JavaScript code snippet to edit a tree of application data.",
		});
		const runnable = this.model.bindTools?.([editingTool], {
			tool_choice: "auto",
		});
		if (runnable === undefined) {
			throw new UsageError("LLM client must support function calling or tool use.");
		}

		const responseMessage = await runnable.invoke(this.messages);
		this.messages.push(responseMessage);

		if (responseMessage.tool_calls !== undefined && responseMessage.tool_calls.length > 0) {
			for (const toolCall of responseMessage.tool_calls) {
				switch (toolCall.name) {
					case editingTool.name: {
						const toolResult = await editingTool.invoke(toolCall);
						this.messages.push(toolResult);
						const editResult: unknown = JSON.parse(toolResult.text);
						if (isEditResult(editResult) && editResult.type === "tooManyEditsError") {
							return editResult.message;
						}
						return this.queryEdit(edit);
					}
					default: {
						this.messages.push(new HumanMessage(`Unrecognized tool call: ${toolCall.name}`));
					}
				}
			}
		}

		return responseMessage.text;
	}
}

/**
 * Type guard for {@link EditResult}.
 */
function isEditResult(value: unknown): value is EditResult {
	if (value === null || typeof value !== "object") {
		return false;
	}
	return (
		typeof (value as EditResult).type === "string" &&
		typeof (value as EditResult).message === "string"
	);
}

// #endregion
