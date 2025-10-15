/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

import type { SharedTreeChatModel, EditResult, SemanticAgentOptions, Logger } from "./api.js";
import { getPrompt, stringifyTree } from "./prompt.js";
import { Subtree } from "./subtree.js";
import {
	constructNode,
	getFriendlyName,
	llmDefault,
	type TreeView,
	findNamedSchemas,
	toErrorString,
} from "./utils.js";

/**
 * The default maximum number of sequential edits the LLM can make before we assume it's stuck in a loop.
 * @remarks
 * This can be overridden by passing {@link SemanticAgentOptions.maximumSequentialEdits | maximumSequentialEdits}
 * to {@link createSemanticAgent}.
 */
const defaultMaxSequentialEdits = 20;

/**
 * An agent that uses a {@link SharedTreeChatModel} to interact with a SharedTree.
 * @remarks
 * This class forwards user queries to the chat model, and handles the application of any edits to the tree that
 * the model requests.
 * @alpha @sealed
 */
export class SharedTreeSemanticAgent<TSchema extends ImplicitFieldSchema> {
	// Converted from ECMAScript private fields (#name) to TypeScript private members for easier debugger inspection.
	private readonly outerTree: Subtree<TSchema>;
	/**
	 * Whether or not the outer tree has changed since the last query finished.
	 */
	private outerTreeIsDirty = false;

	public constructor(
		private readonly client: SharedTreeChatModel,
		tree: TreeView<TSchema> | (ReadableField<TSchema> & TreeNode),
		private readonly options?: Readonly<SemanticAgentOptions>,
	) {
		if (tree instanceof TreeNode) {
			Tree.on(tree, "treeChanged", () => (this.outerTreeIsDirty = true));
		} else {
			tree.events.on("changed", () => (this.outerTreeIsDirty = true));
		}

		this.outerTree = new Subtree(tree);
		const prompt = getPrompt({
			subtree: this.outerTree,
			editToolName: this.client.editToolName,
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
		if (this.client.name !== undefined) {
			this.options?.logger?.log(`Model: **${this.client.name}**\n\n`);
		}
		this.client.appendContext?.(prompt);
		this.options?.logger?.log(`## System Prompt\n\n${prompt}\n\n`);
	}

	/**
	 * Given a user prompt, return a response.
	 *
	 * @param userPrompt - The prompt to send to the agent.
	 * @returns The agent's response.
	 */
	public async query(userPrompt: string): Promise<string> {
		this.options?.logger?.log(`## User Query\n\n${userPrompt}\n\n`);

		// Notify the llm if the tree has changed since the last query, and if so, provide the new state of the tree.
		if (this.outerTreeIsDirty) {
			const stringified = stringifyTree(this.outerTree.field);
			this.client.appendContext?.(
				`The tree has changed since the last query. The new state of the tree is: \n\n\`\`\`JSON\n${stringified}\n\`\`\``,
			);
			this.options?.logger?.log(
				`### Latest Tree State\n\nThe Tree was edited by a local or remote user since the previous query. ` +
				`The latest state is:\n\n\`\`\`JSON\n${stringified}\n\`\`\`\n\n`,
			);
		}

		// Fork a branch that will live for the lifetime of this query (which can be multiple LLM calls if the there
		// are errors or the LLM decides to take multiple steps to accomplish a task).
		// The branch will be merged back into the outer branch if and only if the query succeeds.
		const queryTree = this.outerTree.fork();
		const maxEditCount = this.options?.maximumSequentialEdits ?? defaultMaxSequentialEdits;
		let active = true;
		let editCount = 0;
		let rollbackEdits = false;
		const { editToolName } = this.client;
		const edit = async (editCode: string): Promise<EditResult> => {
			if (editToolName === undefined) {
				return {
					type: "disabledError",
					message: "Editing is not enabled for this model.",
				};
			}
			if (!active) {
				return {
					type: "expiredError",
					message: `The query has already completed. Further edits are not allowed.`,
				};
			}

			if (++editCount > maxEditCount) {
				rollbackEdits = true;
				return {
					type: "tooManyEditsError",
					message: `The maximum number of edits (${maxEditCount}) for this query has been exceeded.`,
				};
			}

			const editResult = await applyTreeFunction(
				queryTree,
				editCode,
				this.options?.validateEdit ?? defaultValidateEdit,
				this.options?.executeEdit ?? defaultExecuteEdit,
				this.options?.logger,
			);

			rollbackEdits = editResult.type !== "success";
			return editResult;
		};

		const responseMessage = await this.client.query({
			text: userPrompt,
			edit,
		});
		active = false;

		if (!rollbackEdits) {
			this.outerTree.branch.merge(queryTree.branch);
			this.outerTreeIsDirty = false;
		}
		this.options?.logger?.log(`## Response\n\n`);
		this.options?.logger?.log(`${responseMessage}\n\n`);
		return responseMessage;
	}
}

/**
 * Creates an unhydrated node of the given schema with the given value.
 * @remarks
 * If the schema is an object with {@link llmDefault | default values},
 * this function populates the node with those defaults.
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

/**
 * Applies the given function (as a string of JavaScript code or an actual function) to the given tree.
 */
async function applyTreeFunction<TSchema extends ImplicitFieldSchema>(
	tree: Subtree<TSchema>,
	editCode: string,
	validateEdit: Required<SemanticAgentOptions>["validateEdit"],
	executeEdit: Required<SemanticAgentOptions>["executeEdit"],
	logger: Logger | undefined,
): Promise<EditResult> {
	logger?.log(`### Editing Tool Invoked\n\n`);
	logger?.log(`#### Generated Code\n\n\`\`\`javascript\n${editCode}\n\`\`\`\n\n`);

	try {
		await validateEdit(editCode);
	} catch (error: unknown) {
		logger?.log(`#### Code Validation Failed\n\n`);
		logger?.log(`\`\`\`JSON\n${toErrorString(error)}\n\`\`\`\n\n`);
		return {
			type: "validationError",
			message: `The generated code did not pass validation: ${toErrorString(error)}`,
		};
	}

	// Stick the tree schema constructors on an object passed to the function so that the LLM can create new nodes.
	const create: Record<string, (input: FactoryContentObject) => TreeNode> = {};
	for (const schema of findNamedSchemas(tree.schema)) {
		const name = getFriendlyName(schema);
		create[name] = (input: FactoryContentObject) => constructTreeNode(schema, input);
	}

	// Fork a branch to edit. If the edit fails or produces an error, we discard this branch, otherwise we merge it.
	const editTree = tree.fork();
	const context = {
		get root(): ReadableField<TSchema> {
			return editTree.field;
		},
		set root(value: TreeFieldFromImplicitField<ReadSchema<TSchema>>) {
			editTree.field = value;
		},
		create,
	};

	try {
		await executeEdit(context, editCode);
	} catch (error: unknown) {
		logger?.log(`#### Error\n\n`);
		logger?.log(`\`\`\`JSON\n${toErrorString(error)}\n\`\`\`\n\n`);
		editTree.branch.dispose();
		return {
			type: "executionError",
			message: `Running the generated code produced an error. The state of the tree will be reset to its previous state as it was before the code ran. Please try again. Here is the error: ${toErrorString(error)}`,
		};
	}

	tree.branch.merge(editTree.branch);
	logger?.log(`#### New Tree State\n\n`);
	logger?.log(`${`\`\`\`JSON\n${stringifyTree(tree.field)}\n\`\`\``}\n\n`);
	return {
		type: "success",
		message: `After running the code, the new state of the tree is:\n\n\`\`\`JSON\n${stringifyTree(tree.field)}\n\`\`\``,
	};
}

const defaultValidateEdit: Required<SemanticAgentOptions>["validateEdit"] = () => {};

const defaultExecuteEdit: Required<SemanticAgentOptions>["executeEdit"] = async (
	context,
	code,
) => {
	// eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
	const fn = new Function("context", code);
	await fn(context);
};
