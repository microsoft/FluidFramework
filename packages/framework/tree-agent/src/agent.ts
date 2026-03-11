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
	TreeAgentChatMessage,
	TreeAgent,
	TreeAgentOptions,
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

// #region Shared utilities

/**
 * Logs the agent creation header with formatted date and model name.
 */
function logAgentHeader(logger: Logger | undefined, modelName: string | undefined): void {
	logger?.log(`# Fluid Framework SharedTree AI Agent Log\n\n`);
	const formattedDate = new Date().toLocaleString(undefined, {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
	});
	logger?.log(`Agent created: **${formattedDate}**\n\n`);
	if (modelName !== undefined) {
		logger?.log(`Model: **${modelName}**\n\n`);
	}
}

/**
 * The tree-changed notification text used when the tree has been externally modified.
 */
function treeChangedText(stringified: string): string {
	return `The tree has changed since the last query. The new state of the tree is: \n\n\`\`\`JSON\n${stringified}\n\`\`\``;
}

// #endregion

/**
 * An agent that uses a {@link SharedTreeChatModel} to interact with a SharedTree.
 * @remarks This class forwards user queries to the chat model, and handles the application of any edits to the tree that the model requests.
 * @alpha @sealed
 */
export class SharedTreeSemanticAgent<TSchema extends ImplicitFieldSchema> {
	private readonly outerTree: Subtree<TSchema>;
	private readonly editor: SynchronousEditor<TSchema> | AsynchronousEditor<TSchema>;
	private isDirty = false;

	public constructor(
		private readonly client: SharedTreeChatModel,
		tree: ViewOrTree<TSchema>,
		private readonly options?: Readonly<SemanticAgentOptions<TSchema>>,
	) {
		this.outerTree = new Subtree(tree);
		this.outerTree.onTreeChanged(() => {
			this.isDirty = true;
		});
		this.editor = this.options?.editor ?? createDefaultEditor();

		const prompt = getPrompt({
			subtree: this.outerTree,
			editToolName: this.client.editToolName,
			domainHints: this.options?.domainHints,
		});

		logAgentHeader(this.options?.logger, this.client.name);
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

		if (this.isDirty) {
			const stringified = stringifyTree(this.outerTree.field);
			const text = treeChangedText(stringified);
			this.client.appendContext?.(text);
			this.options?.logger?.log(
				`### Latest Tree State\n\nThe Tree was edited by a local or remote user since the previous query. The latest state is:\n\n\`\`\`JSON\n${stringified}\n\`\`\`\n\n`,
			);
			this.isDirty = false;
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

		if (this.client.query === undefined) {
			throw new UsageError(
				"The provided SharedTreeChatModel does not implement query(). Use createTreeAgent instead.",
			);
		}
		const responseMessage = await this.client.query({
			text: userPrompt,
			edit,
		});
		active = false;

		if (rollbackEdits) {
			queryTree.branch.dispose();
		} else {
			this.outerTree.branch.merge(queryTree.branch);
			this.isDirty = false;
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
						// eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
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

// #region Factory functions

/**
 * Internal implementation of the {@link TreeAgent} interface.
 */
class TreeAgentImpl<TSchema extends ImplicitFieldSchema> implements TreeAgent {
	readonly #model: SharedTreeChatModel;
	readonly #outerTree: Subtree<TSchema>;
	readonly #history: TreeAgentChatMessage[];
	readonly #editor: SynchronousEditor<TSchema> | AsynchronousEditor<TSchema>;
	readonly #maxEditCount: number;
	readonly #editToolName: string;
	readonly #options?: TreeAgentOptions<TSchema>;
	readonly #offTreeChanged: () => void;
	#isDirty = false;

	public constructor(
		model: SharedTreeChatModel,
		tree: ViewOrTree<TSchema>,
		options?: TreeAgentOptions<TSchema>,
	) {
		if (model.invoke === undefined) {
			throw new UsageError(
				"The provided SharedTreeChatModel does not implement invoke(). Provide a model that implements invoke(), such as the one returned by createLangchainChatModel from @fluidframework/tree-agent-langchain.",
			);
		}

		const editToolName = model.editToolName;
		if (editToolName === undefined) {
			throw new UsageError(
				"The provided SharedTreeChatModel does not have an editToolName. Editing requires a model with editToolName set.",
			);
		}

		this.#model = model;
		this.#options = options;
		this.#editToolName = editToolName;
		this.#outerTree = new Subtree(tree);
		this.#editor = options?.editor ?? createDefaultEditor();
		this.#maxEditCount = options?.maximumSequentialEdits ?? defaultMaxSequentialEdits;

		const prompt = getPrompt({
			subtree: this.#outerTree,
			editToolName: this.#editToolName,
			domainHints: options?.domainHints,
		});

		logAgentHeader(options?.logger, model.name);
		options?.logger?.log(`## System Prompt\n\n${prompt}\n\n`);

		this.#history = [{ role: "system", content: prompt }];

		this.#offTreeChanged = this.#outerTree.onTreeChanged(() => {
			this.#isDirty = true;
		});
	}

	public dispose(): void {
		this.#offTreeChanged();
	}

	public async message(prompt: string): Promise<string> {
		this.#options?.logger?.log(`## User Query\n\n${prompt}\n\n`);
		if (this.#isDirty) {
			const stringified = stringifyTree(this.#outerTree.field);
			const text = treeChangedText(stringified);
			this.#history.push({ role: "system", content: text });
			this.#options?.logger?.log(
				`### Latest Tree State\n\nThe Tree was edited by a local or remote user since the previous query. The latest state is:\n\n\`\`\`JSON\n${stringified}\n\`\`\`\n\n`,
			);
			this.#isDirty = false;
		}
		this.#history.push({ role: "user", content: prompt });

		// Fork a branch for this edit session
		const queryTree = this.#outerTree.fork();
		const maxEditCount = this.#maxEditCount;
		const maxTurns = maxEditCount + 2;
		let editLoopTurns = 0;
		let rollbackEdits = false;

		const pushToolResult = (toolCallId: string | undefined, content: string): void => {
			this.#history.push({ role: "tool_result", toolCallId, content });
		};

		const finalizeEdits = (): void => {
			if (rollbackEdits) {
				queryTree.branch.dispose();
				return;
			}
			this.#outerTree.branch.merge(queryTree.branch);
			this.#isDirty = false;
		};

		try {
			while (true) {
				editLoopTurns++;
				// Allow for two extra turns: one for a last tool error message, and one for a final response from the llm.
				if (editLoopTurns > maxTurns) {
					const cutoffMessage = `The model failed to produce a response within ${maxEditCount} edits.`;
					this.#history.push({ role: "assistant", content: cutoffMessage });
					this.#options?.logger?.log(`## Cancel\n\n${cutoffMessage}\n\n`);
					queryTree.branch.dispose();
					return cutoffMessage;
				}
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const response = await this.#model.invoke!(this.#history);

				if (response.role === "assistant") {
					this.#history.push(response);
					finalizeEdits();
					this.#options?.logger?.log(`## Response\n\n${response.content}\n\n`);
					return response.content;
				}

				// response.role === "tool_call"
				this.#history.push(response);

				// Extract the code string from the tool call args.
				// We expect exactly one string-valued argument (e.g. { js: "..." } or { code: "..." }).
				const code = extractCodeFromToolArgs(response.toolArgs);
				if (code === undefined) {
					rollbackEdits = true;
					const errorMessage = `Expected a single string argument in the tool call, but received: ${JSON.stringify(response.toolArgs)}`;
					pushToolResult(response.toolCallId, errorMessage);
					continue;
				}

				// Every loop turn roughly corresponds to one edit attempt, since the loop terminates when the llm produces a non-tool response.
				if (editLoopTurns > maxEditCount) {
					rollbackEdits = true;
					const errorMessage = `The maximum number of edits (${maxEditCount}) for this query has been exceeded.`;
					pushToolResult(response.toolCallId, errorMessage);
					continue;
				}

				const editResult = await applyTreeFunction(
					queryTree,
					code,
					this.#editor,
					this.#options?.logger,
				);

				rollbackEdits = editResult.type !== "success";
				pushToolResult(response.toolCallId, editResult.message);
			}
		} catch (error) {
			queryTree.branch.dispose();
			throw error;
		}
	}
}

/**
 * Extracts the JavaScript code string from a tool call's args record.
 * @returns The single string value if args contains exactly one string-valued property, or `undefined` otherwise.
 */
function extractCodeFromToolArgs(args: Record<string, unknown>): string | undefined {
	let code: string | undefined;
	for (const value of Object.values(args)) {
		if (typeof value !== "string") {
			continue;
		}
		if (code !== undefined) {
			return undefined;
		}
		code = value;
	}
	return code;
}

/**
 * Creates an agent that can analyze and edit a SharedTree.
 * @param model - The chat model. Must implement {@link SharedTreeChatModel.invoke} and have {@link SharedTreeChatModel.editToolName} set.
 * @param tree - The tree or subtree to edit.
 * @param options - Optional configuration.
 * @returns A {@link TreeAgent}.
 * @alpha
 */
export function createTreeAgent<TSchema extends ImplicitFieldSchema>(
	model: SharedTreeChatModel,
	tree: ViewOrTree<TSchema>,
	options?: TreeAgentOptions<TSchema>,
): TreeAgent {
	return new TreeAgentImpl(model, tree, options);
}

// #endregion
