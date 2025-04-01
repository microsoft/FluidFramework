/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	ImplicitFieldSchema,
	ReadableField,
	TreeBranch,
	TreeViewAlpha,
} from "@fluidframework/tree/internal";
// eslint-disable-next-line import/no-internal-modules
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
// eslint-disable-next-line import/no-internal-modules
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
// eslint-disable-next-line import/no-internal-modules
import type { ToolMessage, AIMessage } from "@langchain/core/messages";
// eslint-disable-next-line import/no-internal-modules
import { tool, type StructuredTool } from "@langchain/core/tools";
// eslint-disable-next-line import/no-internal-modules
import { createZodJsonValidator } from "typechat/zod";
import { z } from "zod";

import { IdGenerator } from "./idGenerator.js";
import { fail, failUsage, stringifyWithIds, type TreeView } from "./utils.js";

/**
 * @alpha
 */
export interface SharedTreeSemanticAgent {
	/**
	 * Given a user prompt, return a response.
	 *
	 * @param userPrompt - The prompt to send to the agent.
	 * @returns The agent's response.
	 */
	query(userPrompt: string): Promise<string | undefined>;
}

/**
 * @alpha
 */
export type Log = (message: string) => void;

/**
 * TODO
 */
export abstract class SharedTreeSemanticAgentBase<TRoot extends ImplicitFieldSchema>
	implements SharedTreeSemanticAgent
{
	#prompting: typeof this.prompting | undefined;

	protected get prompting(): {
		readonly branch: TreeViewAlpha<TRoot> & TreeBranch;
		readonly idGenerator: IdGenerator;
	} {
		return this.#prompting ?? fail("Not currently processing a prompt");
	}

	protected constructor(
		public readonly client: BaseChatModel,
		public readonly treeView: TreeView<TRoot>,
		protected readonly editingTool: StructuredTool,
		protected readonly options:
			| {
					readonly domainHints?: string;
					readonly treeToString?: (root: ReadableField<TRoot>) => string;
					readonly log?: Log;
			  }
			| undefined,
	) {}

	protected thinkingTool = tool(
		// eslint-disable-next-line unicorn/consistent-function-scoping
		({ thoughts }) => thoughts,
		{
			name: "think",
			description:
				"Use this tool to think about something. It will not obtain new information or change any data, but just append the thought to the log. Use it when complex reasoning or some cache memory is needed.",

			schema: z.object({
				thoughts: z.string().describe("A thought to think about."),
			}),
		},
	);

	protected getTreeTool = tool(
		// eslint-disable-next-line unicorn/consistent-function-scoping
		() => stringifyWithIds(this.prompting.branch.root, this.prompting.idGenerator),
		{
			name: "getData",
			description:
				"Use this tool to get the current state of the tree. It will return the tree's data in a human-readable format.",

			schema: z.object({}),
		},
	);

	public async query(userPrompt: string): Promise<string | undefined> {
		this.#prompting = {
			branch: this.treeView.fork(),
			idGenerator: new IdGenerator(),
		};
		this.#prompting.idGenerator.assignIds(this.#prompting.branch.root);

		const systemPrompt = this.getSystemPrompt(this.treeView);
		const messages: (HumanMessage | AIMessage | ToolMessage)[] = [];
		messages.push(new SystemMessage(systemPrompt));
		messages.push(
			new HumanMessage(
				`${
					this.options?.domainHints === undefined
						? ""
						: `Here is some information about my application domain: ${this.options?.domainHints}\n\n`
				}${userPrompt}`,
			),
		);

		this.options?.log?.(`# System Prompt\n\n${systemPrompt}\n\n`);
		this.options?.log?.(`# User Prompt\n\n`);
		if (this.options?.domainHints === undefined) {
			this.options?.log?.(`"userPrompt"\n\n`);
		} else {
			this.options?.log?.(`## Domain Hints\n\n"${this.options?.domainHints}"\n\n`);
			this.options?.log?.(`## Prompt\n\n"${userPrompt}"\n\n`);
		}

		let responseMessage: AIMessage;
		do {
			responseMessage =
				(await this.client
					.bindTools?.([this.editingTool, this.thinkingTool], { tool_choice: "auto" })
					?.invoke(messages)) ??
				failUsage("LLM client must support function calling or tool use.");

			messages.push(responseMessage);
			// We start with one message, and then add two more for each subsequent correspondence
			this.options?.log?.(`# LLM Response ${Math.ceil(messages.length / 2)}\n\n`);
			this.options?.log?.(`${responseMessage.text}\n\n`);
			if (responseMessage.tool_calls !== undefined && responseMessage.tool_calls.length > 0) {
				for (const toolCall of responseMessage.tool_calls) {
					switch (toolCall.name) {
						case this.thinkingTool.name: {
							const result = (await this.thinkingTool.invoke(toolCall)) as ToolMessage;
							this.options?.log?.(`## Thinking Tool Invoked\n\n${result.text}\n\n`);
							break;
						}
						case this.editingTool.name: {
							const result = (await this.editingTool.invoke(toolCall)) as ToolMessage;
							messages.push(result);
							break;
						}
						default: {
							messages.push(new HumanMessage(`Unrecognized tool call: ${toolCall.name}`));
						}
					}
				}
			} else {
				this.treeView.merge(this.prompting.branch);
				this.#prompting = undefined;
				return responseMessage.text;
			}
		} while (messages.length < maxMessages + 1);

		this.#prompting?.branch.dispose();
		this.#prompting = undefined;
		throw new UsageError("LLM exceeded maximum number of messages");
	}

	protected abstract getSystemPrompt(view: Omit<TreeView<TRoot>, "fork" | "merge">): string;

	protected getSystemPromptPreamble(
		domainTypes: Record<string, z.ZodTypeAny>,
		domainRoot: string,
	): string {
		const domainSchema = createZodJsonValidator(domainTypes, domainRoot);
		const domainSchemaString = domainSchema.getSchemaText();

		return `You are a collaborative agent who assists a user with editing and analyzing a JSON tree.
		The tree is a JSON object with the following Typescript schema:
		
		\`\`\`typescript
		${domainSchemaString}
		\`\`\`
		
		If the user asks you a question about the tree, you should inspect the state of the tree and answer the question.
		If the user asks you to edit the tree, you should use the ${this.editingTool.name} tool to accomplish the user-specified goal.
		You may also use the ${this.thinkingTool.name} tool to help you reason through complex data manipulation tasks before finally invoking the ${this.editingTool.name} tool.`;
	}
}

const maxMessages = 10; // TODO: Allow caller to provide this
