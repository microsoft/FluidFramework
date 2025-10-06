/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	ImplicitFieldSchema,
	TreeFieldFromImplicitField,
	TreeNodeSchema,
} from "@fluidframework/tree";
import { TreeNode } from "@fluidframework/tree";
import type {
	ReadableField,
	FactoryContentObject,
	InsertableContent,
	ReadSchema,
} from "@fluidframework/tree/alpha";
import { ObjectNodeSchema, Tree } from "@fluidframework/tree/alpha";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models"; // eslint-disable-line import/no-internal-modules
import { HumanMessage, SystemMessage } from "@langchain/core/messages"; // eslint-disable-line import/no-internal-modules
import type { ToolMessage, AIMessage } from "@langchain/core/messages"; // eslint-disable-line import/no-internal-modules
import { tool } from "@langchain/core/tools"; // eslint-disable-line import/no-internal-modules
import { z } from "zod";

import { getPrompt, stringifyTree } from "./prompt.js";
import { Subtree } from "./subtree.js";
import {
	constructNode,
	getFriendlyName,
	llmDefault,
	type TreeView,
	findNamedSchemas,
} from "./utils.js";

/**
 * The default maximum number of sequential edits the LLM can make before we assume it's stuck in a loop.
 * @remarks This can be overridden by passing {@link SemanticAgentOptions.maximumSequentialEdits | maximumSequentialEdits} to {@link createSemanticAgent}.
 */
const defaultMaxSequentialEdits = 20;
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
 * Options used to parameterize the creation of a {@link SharedTreeSemanticAgent}.
 * @alpha
 */
export interface SemanticAgentOptions<TSchema extends ReadableField<ImplicitFieldSchema>> {
	domainHints?: string;
	validator?: (js: string) => boolean;
	/**
	 * The maximum number of sequential edits the LLM can make before we assume it's stuck in a loop.
	 */
	maximumSequentialEdits?: number;
	logger?: Logger<TSchema>;
}

/**
 * TODO doc
 * @alpha
 */
export function createSemanticAgent<TSchema extends ImplicitFieldSchema>(
	client: BaseChatModel,
	treeView: TreeView<TSchema>,
	options?: Readonly<SemanticAgentOptions<ReadableField<TSchema>>>,
): SharedTreeSemanticAgent;
/**
 * TODO doc
 * @alpha
 */
export function createSemanticAgent<T extends TreeNode>(
	client: BaseChatModel,
	node: T,
	options?: Readonly<SemanticAgentOptions<T>>,
): SharedTreeSemanticAgent;
/**
 * TODO doc
 * @alpha
 */
export function createSemanticAgent<TSchema extends ImplicitFieldSchema>(
	client: BaseChatModel,
	treeView: TreeView<TSchema> | (ReadableField<TSchema> & TreeNode),
	options?: Readonly<SemanticAgentOptions<ReadableField<TSchema>>>,
): SharedTreeSemanticAgent;
// eslint-disable-next-line jsdoc/require-jsdoc
export function createSemanticAgent<TSchema extends ImplicitFieldSchema>(
	client: BaseChatModel,
	treeView: TreeView<TSchema> | (ReadableField<TSchema> & TreeNode),
	options?: Readonly<SemanticAgentOptions<ReadableField<TSchema>>>,
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
 * Logger interface for logging events from a {@link SharedTreeSemanticAgent}.
 * @alpha
 */
export interface Logger<
	TTree extends ReadableField<ImplicitFieldSchema> = ReadableField<ImplicitFieldSchema>,
> {
	/**
	 * Log a message.
	 */
	log(message: string): void;
	/**
	 * Optional function to override the default tree stringification (JSON) when logging tree state.
	 */
	treeToString?(tree: TTree): string;
}

// eslint-disable-next-line jsdoc/require-jsdoc -- TODO: Add documentation
export class FunctioningSemanticAgent<TSchema extends ImplicitFieldSchema>
	implements SharedTreeSemanticAgent
{
	readonly #outerTree: Subtree<TSchema>;
	readonly #messages: (HumanMessage | AIMessage | ToolMessage)[] = [];
	/**
	 * Whether or not the outer tree has changed since the last query finished.
	 */
	#outerTreeIsDirty = false;

	public constructor(
		public readonly client: BaseChatModel,
		tree: TreeView<TSchema> | (ReadableField<TSchema> & TreeNode),
		private readonly options?: Readonly<SemanticAgentOptions<ReadableField<TSchema>>>,
	) {
		if (tree instanceof TreeNode) {
			Tree.on(tree, "treeChanged", () => (this.#outerTreeIsDirty = true));
		} else {
			tree.events.on("changed", () => (this.#outerTreeIsDirty = true));
		}

		this.#outerTree = new Subtree(tree);
		const prompt = getPrompt({
			subtree: this.#outerTree,
			editingToolName,
			editingFunctionName,
			domainHints: this.options?.domainHints,
		});
		this.options?.logger?.log(`# Fluid Framework SharedTree AI Agent Log\n\n`);
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
		this.options?.logger?.log(`Agent created: **${formattedDate}**\n\n`);
		if (this.client.metadata?.modelName !== undefined) {
			this.options?.logger?.log(`Model: **${this.client.metadata?.modelName}**\n\n`);
		}
		this.#messages.push(new SystemMessage(prompt));
		this.options?.logger?.log(`## System Prompt\n\n${prompt}\n\n`);
	}

	public async query(userPrompt: string): Promise<string | undefined> {
		this.options?.logger?.log(`## User Query\n\n${userPrompt}\n\n`);

		// Notify the llm if the tree has changed since the last query, and if so, provide the new state of the tree.
		if (this.#outerTreeIsDirty) {
			const stringified = stringifyTree(this.#outerTree.field);
			this.#messages.push(
				new SystemMessage(
					`The tree has changed since the last message. The new state of the tree is: \n\n\`\`\`JSON\n${stringified}\n\`\`\``,
				),
			);
			this.options?.logger?.log(
				`### Latest Tree State\n\nThe Tree was edited by a local or remote user since the previous query. The latest state is:\n\n\`\`\`JSON\n${stringified}\n\`\`\`\n\n`,
			);
		}

		this.#messages.push(
			new HumanMessage(
				`${userPrompt}${this.#outerTreeIsDirty ? "" : "(Note: The tree is the same as it was after the end of the previous query.)"}`,
			),
		);

		// Fork a branch that will live for the lifetime of this query (which can be multiple LLM calls if the there are errors or the LLM decides to take multiple steps to accomplish a task).
		// The branch will be merged back into the outer branch if and only if the query succeeds.
		const queryTree = this.#outerTree.fork();
		const editingTool = createEditingTool(
			queryTree,
			this.options?.validator,
			this.options?.logger,
		);

		const maxEditCount = this.options?.maximumSequentialEdits ?? defaultMaxSequentialEdits;
		let editCount = 0;
		do {
			const runnable = this.client.bindTools?.([editingTool], { tool_choice: "auto" });
			if (runnable === undefined) {
				throw new UsageError("LLM client must support function calling or tool use.");
			}

			const responseMessage = await runnable.invoke(this.#messages);
			this.#messages.push(responseMessage);
			this.options?.logger?.log(`## Response\n\n`);
			this.options?.logger?.log(`${responseMessage.text}\n\n`);

			if (responseMessage.tool_calls !== undefined && responseMessage.tool_calls.length > 0) {
				// If we receive a tool call (e.g. to edit the tree), we process it and then continue the loop to get another response from the LLM.
				for (const toolCall of responseMessage.tool_calls) {
					switch (toolCall.name) {
						case editingTool.name: {
							this.#messages.push(await editingTool.invoke(toolCall));
							editCount += 1;
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
				// If there is no tool call, we assume the LLM is done editing and awaiting the next query.
				this.#outerTree.branch.merge(queryTree.branch);
				this.#outerTreeIsDirty = false;
				return responseMessage.text;
			}
		} while (editCount <= maxEditCount);

		queryTree.branch.dispose();
		this.#outerTreeIsDirty = false;
		return `I've attempted to resolve your query, but it's taking too many iterations. Please try again, perhaps by rephrasing your request.`;
	}
}

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
function createEditingTool<TSchema extends ImplicitFieldSchema>(
	tree: Subtree<TSchema>,
	validator?: (js: string) => boolean,
	logger?: Logger<ReadableField<TSchema>>,
) {
	return tool(
		async ({ functionCode }) => {
			logger?.log(`### Editing Tool Invoked\n\n`);
			logger?.log(`#### Generated Code\n\n\`\`\`javascript\n${functionCode}\n\`\`\`\n\n`);

			const create: Record<string, (input: FactoryContentObject) => TreeNode> = {};
			for (const schema of findNamedSchemas(tree.schema)) {
				const name = getFriendlyName(schema);
				create[name] = (input: FactoryContentObject) => constructTreeNode(schema, input);
			}
			if (validator?.(functionCode) === false) {
				logger?.log(`#### Code Validation Failed\n\n`);
				return "Code validation failed";
			}

			// Fork a branch to edit. If the edit fails or produces an error, we discard this branch, otherwise we merge it.
			const editTree = tree.fork();
			const params = {
				get root(): TreeNode | ReadableField<TSchema> {
					return editTree.field;
				},
				set root(value: TreeFieldFromImplicitField<ReadSchema<TSchema>>) {
					editTree.field = value;
				},
				create,
			};
			const code = processLlmCode(functionCode);
			// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
			const fn = new Function(paramsName, code) as (p: typeof params) => Promise<void> | void;
			try {
				await fn(params);
			} catch (error: unknown) {
				logger?.log(`#### Error\n\n`);
				const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
				logger?.log(`\`\`\`JSON\n${errorMessage}\n\`\`\`\n\n`);
				editTree.branch.dispose();
				return `Running the function produced an error. The state of the tree will be reset to its previous state as it was before the function ran. Please try again. Here is the error: ${errorMessage}`;
			}

			tree.branch.merge(editTree.branch);
			logger?.log(`#### New Tree State\n\n`);
			logger?.log(
				`${
					logger?.treeToString?.(tree.field) ??
					`\`\`\`JSON\n${stringifyTree(tree.field)}\n\`\`\``
				}\n\n`,
			);
			return `After running the function, the new state of the tree is:\n\n\`\`\`JSON\n${stringifyTree(tree.field)}\n\`\`\``;
		},
		{
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
		},
	);
}
