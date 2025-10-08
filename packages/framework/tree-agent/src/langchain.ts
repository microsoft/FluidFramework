/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { ImplicitFieldSchema, ReadableField, TreeNode } from "@fluidframework/tree/alpha";
// eslint-disable-next-line import/no-internal-modules
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
// eslint-disable-next-line import/no-internal-modules
import type { AIMessage, ToolMessage } from "@langchain/core/messages";
import {
	HumanMessage,
	SystemMessage,
	// eslint-disable-next-line import/no-internal-modules
} from "@langchain/core/messages";
// eslint-disable-next-line import/no-internal-modules
import { tool } from "@langchain/core/tools";
import z from "zod";

import { SharedTreeSemanticAgent } from "./agent.js";
import {
	isEditResult,
	type SemanticAgentOptions,
	type SharedTreeChatModel,
	type SharedTreeChatQuery,
} from "./api.js";
import type { TreeView } from "./utils.js";

/**
 * An implementation of {@link SharedTreeChatModel} that wraps a Langchain chat model.
 * @remarks This class is responsible for managing the conversation history and interacting with the Langchain model (e.g. via Tool use for editing).
 * @alpha
 */
export class LangchainChatModel implements SharedTreeChatModel {
	private readonly messages: (HumanMessage | AIMessage | ToolMessage)[] = [];
	public constructor(private readonly model: BaseChatModel) {}

	public readonly editToolName = "GenerateTreeEditingCode";

	public get name(): string | undefined {
		const name = this.model.metadata?.modelName;
		return typeof name === "string" ? name : undefined;
	}

	public appendContext(text: string): void {
		this.messages.push(new SystemMessage(text));
	}

	public async query(query: SharedTreeChatQuery): Promise<string> {
		this.messages.push(new HumanMessage(query.text));
		return this.queryEdit(async (js) => query.edit(js));
	}

	private async queryEdit(edit: SharedTreeChatQuery["edit"]): Promise<string> {
		const editingTool = tool(
			async ({ functionCode }) => {
				return edit(functionCode);
			},
			{
				name: this.editToolName,
				description: `Invokes a JavaScript function to edit a user's tree`,
				schema: z.object({
					functionCode: z.string().describe(`The code of the JavaScript function.
For example: "function editTree({ root, create }) { /* your code here */ }"`),
				}),
			},
		);
		const runnable = this.model.bindTools?.([editingTool], { tool_choice: "auto" });
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
						// This call will either terminate the edit chain (if the LLM decides not to edit further) or continue it if more edits are required.
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

// #region Legacy APIs

/**
 * Create a {@link SharedTreeSemanticAgent} using a Langchain chat model.
 * @alpha
 * @deprecated Use {@link SharedTreeSemanticAgent} with a {@link LangchainChatModel} instead.
 */
export function createSemanticAgent<TSchema extends ImplicitFieldSchema>(
	client: BaseChatModel,
	treeView: TreeView<TSchema>,
	options?: Readonly<SemanticAgentOptions>,
): SharedTreeSemanticAgent<TSchema>;
/**
 * Create a {@link SharedTreeSemanticAgent} using a Langchain chat model.
 * @alpha
 * @deprecated Use {@link SharedTreeSemanticAgent} with a {@link LangchainChatModel} instead.
 */
export function createSemanticAgent<TSchema extends ImplicitFieldSchema>(
	client: BaseChatModel,
	node: ReadableField<TSchema> & TreeNode,
	options?: Readonly<SemanticAgentOptions>,
): SharedTreeSemanticAgent<TSchema>;
/**
 * Create a {@link SharedTreeSemanticAgent} using a Langchain chat model.
 * @alpha
 * @deprecated Use {@link SharedTreeSemanticAgent} with a {@link LangchainChatModel} instead.
 */
export function createSemanticAgent<TSchema extends ImplicitFieldSchema>(
	client: BaseChatModel,
	treeView: TreeView<TSchema> | (ReadableField<TSchema> & TreeNode),
	options?: Readonly<SemanticAgentOptions>,
): SharedTreeSemanticAgent<TSchema>;
/**
 * Create a {@link SharedTreeSemanticAgent} using a Langchain chat model.
 * @alpha
 * @deprecated Use {@link SharedTreeSemanticAgent} with a {@link LangchainChatModel} instead.
 */
export function createSemanticAgent<TSchema extends ImplicitFieldSchema>(
	client: BaseChatModel,
	treeView: TreeView<TSchema> | (ReadableField<TSchema> & TreeNode),
	options?: Readonly<SemanticAgentOptions>,
): SharedTreeSemanticAgent<TSchema> {
	return new SharedTreeSemanticAgent(new LangchainChatModel(client), treeView, options);
}

// #endregion Legacy APIs
