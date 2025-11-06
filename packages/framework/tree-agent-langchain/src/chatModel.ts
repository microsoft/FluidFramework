/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import-x/no-internal-modules */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	EditResult,
	SharedTreeChatModel,
	SharedTreeChatQuery,
} from "@fluidframework/tree-agent/alpha";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import z from "zod";

/**
 * Creates a `SharedTreeChatModel` that uses the LangChain library to connect to the underlying LLM.
 * @param langchainModel - The LangChain chat model to use.
 * @alpha
 */
export function createLangchainChatModel(langchainModel: BaseChatModel): SharedTreeChatModel {
	return new LangchainChatModel(langchainModel);
}

class LangchainChatModel implements SharedTreeChatModel {
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

	public async query(query: SharedTreeChatQuery): Promise<string> {
		this.messages.push(new HumanMessage(query.text));
		return this.queryEdit(async (js: string) => query.edit(js));
	}

	private async queryEdit(edit: SharedTreeChatQuery["edit"]): Promise<string> {
		const editingTool = tool(
			async ({ functionCode }: { functionCode: string }) => {
				return edit(functionCode);
			},
			{
				name: this.editToolName,
				description: "Invokes a JavaScript code snippet to edit a tree of application data.",
				schema: z.object({
					functionCode: z.string().describe("The JavaScript snippet code."),
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
