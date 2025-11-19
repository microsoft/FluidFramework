/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ImplicitFieldSchema,
	TreeFieldFromImplicitField,
	TreeNodeSchema,
} from "@fluidframework/tree";
import { NodeKind, TreeNode } from "@fluidframework/tree";
import type {
	ReadableField,
	FactoryContentObject,
	InsertableContent,
	ReadSchema,
} from "@fluidframework/tree/alpha";
import { ObjectNodeSchema, Tree, TreeAlpha } from "@fluidframework/tree/alpha";

import type {
	SharedTreeChatModel,
	EditResult,
	SemanticAgentOptions,
	Logger,
	AsynchronousEditor,
	Context,
	SynchronousEditor,
	ViewOrTree,
} from "./api.js";
import { getPrompt, stringifyTree } from "./prompt.js";
import { Subtree } from "./subtree.js";
import {
	llmDefault,
	findSchemas,
	toErrorString,
	unqualifySchema,
	isNamedSchema,
} from "./utils.js";

/**
 * The default maximum number of sequential edits the LLM can make before we assume it's stuck in a loop.
 * @remarks This can be overridden by passing {@link SemanticAgentOptions.maximumSequentialEdits | maximumSequentialEdits} to {@link createSemanticAgent}.
 */
const defaultMaxSequentialEdits = 20;

/**
 * An agent that uses a {@link SharedTreeChatModel} to interact with a SharedTree.
 * @remarks This class forwards user queries to the chat model, and handles the application of any edits to the tree that the model requests.
 * @alpha @sealed
 */
export class SharedTreeSemanticAgent<TSchema extends ImplicitFieldSchema> {
	// Converted from ECMAScript private fields (#name) to TypeScript private members for easier debugger inspection.
	private readonly outerTree: Subtree<TSchema>;
	private readonly editor: SynchronousEditor<TSchema> | AsynchronousEditor<TSchema>;
	/**
	 * Whether or not the outer tree has changed since the last query finished.
	 */
	private outerTreeIsDirty = false;

	public constructor(
		private readonly client: SharedTreeChatModel,
		tree: ViewOrTree<TSchema>,
		private readonly options?: Readonly<SemanticAgentOptions<TSchema>>,
	) {
		if (tree instanceof TreeNode) {
			Tree.on(tree, "treeChanged", () => (this.outerTreeIsDirty = true));
		} else {
			tree.events.on("changed", () => (this.outerTreeIsDirty = true));
		}

		this.outerTree = new Subtree(tree);
		this.editor = this.options?.editor ?? createDefaultEditor();
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
				`### Latest Tree State\n\nThe Tree was edited by a local or remote user since the previous query. The latest state is:\n\n\`\`\`JSON\n${stringified}\n\`\`\`\n\n`,
			);
		}

		// Fork a branch that will live for the lifetime of this query (which can be multiple LLM calls if the there are errors or the LLM decides to take multiple steps to accomplish a task).
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
				this.editor,
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
 * @remarks If the schema is an object with {@link llmDefault | default values}, this function populates the node with those defaults.
 */
function constructTreeNode(schema: TreeNodeSchema, content: FactoryContentObject): TreeNode {
	let toInsert = content;
	if (schema instanceof ObjectNodeSchema) {
		const contentWithDefaults: Record<string, InsertableContent | undefined> = {};
		for (const [key, field] of schema.fields) {
			if (content[key] === undefined) {
				if (
					typeof field.metadata.custom === "object" &&
					field.metadata.custom !== null &&
					llmDefault in field.metadata.custom
				) {
					const defaulter = field.metadata.custom[llmDefault];
					if (typeof defaulter === "function") {
						const defaultValue: unknown = defaulter();
						if (defaultValue !== undefined) {
							contentWithDefaults[key] = defaultValue;
						}
					}
				}
			} else {
				contentWithDefaults[key] = content[key];
			}
		}
		toInsert = contentWithDefaults;
	}

	// Cast to never because tagContentSchema is typed to only accept InsertableContent, but we know that 'toInsert' (either the original content or contentWithDefaults) produces valid content for the schema.
	return TreeAlpha.tagContentSchema(schema, toInsert as never);
}

/**
 * Applies the given function (as a string of JavaScript code or an actual function) to the given tree.
 */
async function applyTreeFunction<TSchema extends ImplicitFieldSchema>(
	tree: Subtree<TSchema>,
	editCode: string,
	editor: SynchronousEditor<TSchema> | AsynchronousEditor<TSchema>,
	logger: Logger | undefined,
): Promise<EditResult> {
	logger?.log(`### Editing Tool Invoked\n\n`);
	logger?.log(`#### Generated Code\n\n\`\`\`javascript\n${editCode}\n\`\`\`\n\n`);

	// Fork a branch to edit. If the edit fails or produces an error, we discard this branch, otherwise we merge it.
	const editTree = tree.fork();
	try {
		await editor(editTree.viewOrTree, editCode);
	} catch (error: unknown) {
		logger?.log(`#### Error\n\n`);
		logger?.log(`\`\`\`JSON\n${toErrorString(error)}\n\`\`\`\n\n`);
		editTree.branch.dispose();
		return {
			type: "editingError",
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

function createDefaultEditor<
	TSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
>(): AsynchronousEditor<TSchema> {
	return async (tree, code) => {
		const context = createContext(tree);
		// eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
		const fn = new Function("context", code);
		await fn(context);
	};
}

/**
 * Creates a {@link Context} for the given subtree.
 * @alpha
 */
export function createContext<TSchema extends ImplicitFieldSchema>(
	tree: ViewOrTree<TSchema>,
): Context<TSchema> {
	const subTree = new Subtree(tree);
	// Stick the tree schema constructors on an object passed to the function so that the LLM can create new nodes.
	const create: Record<string, (input: FactoryContentObject) => TreeNode> = {};
	const is: Record<string, <T extends TreeNode>(input: unknown) => input is T> = {};
	for (const schema of findSchemas(subTree.schema, (s) => isNamedSchema(s.identifier))) {
		const name = unqualifySchema(schema.identifier);
		create[name] = (input: FactoryContentObject) => constructTreeNode(schema, input);
		is[name] = <T extends TreeNode>(input: unknown): input is T => Tree.is(input, schema);
	}

	return {
		get root(): ReadableField<TSchema> {
			return subTree.field;
		},
		set root(value: TreeFieldFromImplicitField<ReadSchema<TSchema>>) {
			subTree.field = value;
		},
		create,
		is,
		isArray(node) {
			if (Array.isArray(node)) {
				return true;
			}
			if (node instanceof TreeNode) {
				const schema = Tree.schema(node);
				return schema.kind === NodeKind.Array;
			}
			return false;
		},
		isMap(node) {
			if (node instanceof Map) {
				return true;
			}
			if (node instanceof TreeNode) {
				const schema = Tree.schema(node);
				return schema.kind === NodeKind.Map;
			}
			return false;
		},
		parent: (child: TreeNode): TreeNode | undefined => Tree.parent(child),
		key: (child: TreeNode): string | number => Tree.key(child),
	} satisfies Context<TSchema>;
}
