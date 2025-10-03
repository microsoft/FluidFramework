/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	ImplicitFieldSchema,
	TreeFieldFromImplicitField,
	TreeNode,
	TreeNodeSchema,
} from "@fluidframework/tree";
import type {
	ReadableField,
	TreeBranch,
	FactoryContentObject,
	InsertableContent,
	ReadSchema,
} from "@fluidframework/tree/alpha";
import { ObjectNodeSchema } from "@fluidframework/tree/alpha";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models"; // eslint-disable-line import/no-internal-modules
import { HumanMessage, SystemMessage } from "@langchain/core/messages"; // eslint-disable-line import/no-internal-modules
import type { ToolMessage, AIMessage } from "@langchain/core/messages"; // eslint-disable-line import/no-internal-modules
import { tool } from "@langchain/core/tools"; // eslint-disable-line import/no-internal-modules
import { z } from "zod";

import { getPrompt, stringifyTree } from "./prompt.js";
import { Subtree } from "./subtree.js";
import {
	constructNode,
	fail,
	failUsage,
	getFriendlyName,
	llmDefault,
	type TreeView,
	findNamedSchemas,
} from "./utils.js";

/**
 * The name of the Tool that the LLM should use to edit the tree.
 */
const editingToolName = "GenerateTreeEditingCode";

/**
 * The name of the function that the LLM should generate to edit the tree.
 */
const editingFunctionName = "editTree";

/**
 * The name of the parameter passed to the edit function.
 */
const paramsName = "params";

/**
 * TODO doc
 * @alpha
 */
export function createSemanticAgent<TSchema extends ImplicitFieldSchema>(
	client: BaseChatModel,
	treeView: TreeView<TSchema>,
	options?: {
		readonly domainHints?: string;
		readonly treeToString?: (root: ReadableField<TSchema>) => string;
		readonly validator?: (js: string) => boolean;
		readonly log?: Log;
	},
): SharedTreeSemanticAgent;
/**
 * TODO doc
 * @alpha
 */
export function createSemanticAgent<T extends TreeNode>(
	client: BaseChatModel,
	node: T,
	options?: {
		readonly domainHints?: string;
		readonly treeToString?: (root: T) => string;
		readonly validator?: (js: string) => boolean;
		readonly log?: Log;
	},
): SharedTreeSemanticAgent;
// eslint-disable-next-line jsdoc/require-jsdoc
export function createSemanticAgent<TSchema extends ImplicitFieldSchema>(
	client: BaseChatModel,
	treeView: TreeView<TSchema> | (ReadableField<TSchema> & TreeNode),
	options?: {
		readonly domainHints?: string;
		readonly treeToString?: (root: ReadableField<TSchema>) => string;
		readonly validator?: (js: string) => boolean;
		readonly log?: Log;
	},
): SharedTreeSemanticAgent {
	return new FunctioningSemanticAgent(client, treeView, options);
}

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

// eslint-disable-next-line jsdoc/require-jsdoc -- TODO: Add documentation
export class FunctioningSemanticAgent<TRoot extends ImplicitFieldSchema>
	implements SharedTreeSemanticAgent
{
	#querying?: Subtree<TRoot>;
	readonly #messages: (HumanMessage | AIMessage | ToolMessage)[] = [];
	#treeHasChangedSinceLastQuery = false;

	private get queryTree(): Subtree<TRoot> {
		return this.#querying ?? fail("Not currently processing a prompt");
	}

	private startQuerying(): void {
		if (this.#querying !== undefined) {
			this.#querying.branch.dispose();
		}

		this.tree.branch.rebaseOnto(this.originalBranch);
		this.#querying = this.tree.fork();
	}

	private readonly originalBranch: TreeBranch;
	private readonly tree: Subtree<TRoot>;
	private readonly editingTool = createEditingTool(this.edit.bind(this));

	public constructor(
		public readonly client: BaseChatModel,
		tree: TreeView<TRoot> | (ReadableField<TRoot> & TreeNode),
		private readonly options?: {
			readonly domainHints?: string;
			readonly treeToString?: (root: ReadableField<TRoot>) => string;
			readonly validator?: (js: string) => boolean;
			readonly log?: Log;
		},
	) {
		const originalSubtree = new Subtree(tree);
		this.originalBranch = originalSubtree.branch;
		this.tree = originalSubtree.fork();
		const prompt = getPrompt({
			subtree: this.tree,
			editingToolName: this.editingTool.name,
			editingFunctionName,
			domainHints: this.options?.domainHints,
		});
		this.options?.log?.(`# Fluid Framework SharedTree AI Agent Log\n\n`);
		const now = new Date();
		const formattedDate = now.toLocaleString(undefined, {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
			second: "2-digit",
		});
		this.options?.log?.(`Agent created: **${formattedDate}**\n\n`);
		if (this.client.metadata?.modelName !== undefined) {
			this.options?.log?.(`Model: **${this.client.metadata?.modelName}**\n\n`);
		}
		this.#messages.push(new SystemMessage(prompt));
		this.options?.log?.(`## System Prompt\n\n${prompt}\n\n`);
	}

	private async edit(functionCode: string): Promise<string> {
		this.options?.log?.(`### Editing Tool Invoked\n\n`);
		this.options?.log?.(
			`#### Generated Code\n\n\`\`\`javascript\n${functionCode}\n\`\`\`\n\n`,
		);
		const tree = this.queryTree;
		const create: Record<string, (input: FactoryContentObject) => TreeNode> = {};
		for (const schema of findNamedSchemas(tree.schema)) {
			const name = getFriendlyName(schema);
			create[name] = (input: FactoryContentObject) => constructTreeNode(schema, input);
		}
		if (this.options?.validator?.(functionCode) === false) {
			this.options?.log?.(`#### Code Validation Failed\n\n`);
			return "Code validation failed";
		}

		const params = {
			get root(): TreeNode | ReadableField<TRoot> {
				return tree.field;
			},
			set root(value: TreeFieldFromImplicitField<ReadSchema<TRoot>>) {
				tree.field = value;
			},
			create,
		};
		const code = processLlmCode(functionCode);
		// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
		const fn = new Function(paramsName, code) as (p: typeof params) => Promise<void> | void;
		try {
			await fn(params);
		} catch (error: unknown) {
			this.options?.log?.(`#### Error\n\n`);
			const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
			this.options?.log?.(`\`\`\`JSON\n${errorMessage}\n\`\`\`\n\n`);
			this.startQuerying();
			return `Running the function produced an error. The state of the tree will be reset to its initial state. Please try again. Here is the error: ${errorMessage}`;
		}
		this.options?.log?.(`#### New Tree State\n\n`);
		this.options?.log?.(
			`${
				this.options.treeToString?.(tree.field) ??
				`\`\`\`JSON\n${stringifyTree(tree.field)}\n\`\`\``
			}\n\n`,
		);
		return `After running the function, the new state of the tree is:\n\n\`\`\`JSON\n${stringifyTree(tree.field)}\n\`\`\``;
	}

	public async query(userPrompt: string): Promise<string | undefined> {
		this.startQuerying();
		this.options?.log?.(`## User Query\n\n${userPrompt}\n\n`);
		if (this.#treeHasChangedSinceLastQuery) {
			const stringified = stringifyTree(this.tree.field);
			this.#messages.push(
				new HumanMessage(
					`The tree has changed since the last message. The new state of the tree is: \n\n\`\`\`JSON\n${stringified}\n\`\`\``,
				),
			);
			this.options?.log?.(
				`### Latest Tree State\n\nThe Tree was edited by a local or remote user since the previous query. The latest state is:\n\n\`\`\`JSON\n${stringified}\n\`\`\`\n\n`,
			);
			this.#treeHasChangedSinceLastQuery = false;
		}
		this.#messages.push(
			new HumanMessage(
				`${this.#treeHasChangedSinceLastQuery ? "" : "The tree has not changed since your last message. "}${userPrompt}`,
			),
		);

		let loggedChainOfThought = false;
		let responseMessage: AIMessage;
		let iterations = 0;
		do {
			iterations += 1;
			responseMessage =
				(await this.client
					.bindTools?.([this.editingTool], { tool_choice: "auto" })
					?.invoke(this.#messages)) ??
				failUsage("LLM client must support function calling or tool use.");

			this.#messages.push(responseMessage);

			// We start with one message, and then add two more for each subsequent correspondence
			this.options?.log?.(`## Response ${(this.#messages.length - 1) / 2}\n\n`);

			// This is a special case for Claude Sonnet, the only supported model that exposes its Chain of Thought.
			if (!loggedChainOfThought) {
				for (const c of responseMessage.content) {
					if (typeof c === "object" && c.type === "thinking") {
						this.options?.log?.(`${c.thinking}\n\n----\n\n`);
						loggedChainOfThought = true;
						break;
					}
				}
			}

			this.options?.log?.(`${responseMessage.text}\n\n`);
			if (responseMessage.tool_calls !== undefined && responseMessage.tool_calls.length > 0) {
				for (const toolCall of responseMessage.tool_calls) {
					switch (toolCall.name) {
						case this.editingTool.name: {
							this.#messages.push(await this.editingTool.invoke(toolCall));
							break;
						}
						default: {
							this.#messages.push(
								new HumanMessage(`Unrecognized tool call: ${toolCall.name}`),
							);
						}
					}
				}
			} else {
				this.tree.branch.merge(this.queryTree.branch);
				this.originalBranch.merge(this.tree.branch, false);
				this.#querying = undefined;
				return responseMessage.text;
			}
		} while (iterations <= maxMessages);

		this.queryTree.branch.dispose();
		this.#querying = undefined;
		throw new UsageError("LLM exceeded maximum number of messages");
	}
}

const maxMessages = 20; // TODO: Allow caller to provide this

function processLlmCode(code: string): string {
	// TODO: use a library like Acorn to analyze the code more robustly
	const regex = new RegExp(`function\\s+${editingFunctionName}\\s*\\(`);
	if (!regex.test(code)) {
		throw new Error(
			`Generated code does not contain a function named \`${editingFunctionName}\``,
		);
	}

	return `${code}\n\n${editingFunctionName}(${paramsName});`;
}

/**
 * Creates an unhydrated node of the given schema with the given value.
 * @remarks If the schema is an object with {@link llmDefault | default values}, this function populates the node with those defaults.
 */
function constructTreeNode(schema: TreeNodeSchema, value: FactoryContentObject): TreeNode {
	if (schema instanceof ObjectNodeSchema) {
		const inputWithDefaults: Record<string, InsertableContent | undefined> = {};
		for (const [key, field] of schema.fields) {
			if (value[key] === undefined) {
				if (
					typeof field.metadata.custom === "object" &&
					field.metadata.custom !== null &&
					llmDefault in field.metadata.custom
				) {
					const defaulter = field.metadata.custom[llmDefault];
					if (typeof defaulter === "function") {
						const defaultValue: unknown = defaulter();
						if (defaultValue !== undefined) {
							inputWithDefaults[key] = defaultValue;
						}
					}
				}
			} else {
				inputWithDefaults[key] = value[key];
			}
		}
		return constructNode(schema, inputWithDefaults);
	}
	return constructNode(schema, value);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createEditingTool(edit: (functionCode: string) => Promise<string>) {
	return tool(async ({ functionCode }) => edit(functionCode), {
		name: editingToolName,
		description: `Invokes a JavaScript function \`${editingFunctionName}\` to edit a user's tree`,
		schema: z.object({
			functionCode: z
				.string()
				.describe(`The code of the \`${editingFunctionName}\` JavaScript function.
					For example:
					\`\`\`javascript
					function ${editingFunctionName}({ root, create }) {
						const newNode = create.MyNodeType({ myField: 123 });
						root.myArrayField.insertAtEnd(newNode);
					}
					\`\`\`
				`),
		}),
	});
}
