/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	ImplicitFieldSchema,
	RestrictiveStringRecord,
	TreeFieldFromImplicitField,
	TreeObjectNode,
} from "@fluidframework/tree";
import { TreeNode, NodeKind, Tree } from "@fluidframework/tree";
import { getSimpleSchema } from "@fluidframework/tree/alpha";
import type {
	ObjectNodeSchema,
	ReadableField,
	TreeBranch,
	FactoryContentObject,
	InsertableContent,
	UnsafeUnknownSchema,
	ReadSchema,
} from "@fluidframework/tree/alpha";
import { normalizeFieldSchema, type TreeMapNode } from "@fluidframework/tree/internal";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models"; // eslint-disable-line import/no-internal-modules
import { HumanMessage, SystemMessage } from "@langchain/core/messages"; // eslint-disable-line import/no-internal-modules
import type { ToolMessage, AIMessage } from "@langchain/core/messages"; // eslint-disable-line import/no-internal-modules
import { tool } from "@langchain/core/tools"; // eslint-disable-line import/no-internal-modules
import { z } from "zod";

import { IdGenerator } from "./idGenerator.js";
import { Subtree } from "./subtree.js";
import { generateEditTypesForPrompt } from "./typeGeneration.js";
import {
	constructNode,
	fail,
	failUsage,
	getFriendlySchema,
	getFriendlySchemaName,
	getZodSchemaAsTypeScript,
	llmDefault,
	type SchemaDetails,
	type TreeView,
} from "./utils.js";

const functionName = "editTree";
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

/**
 * TODO
 */
export class FunctioningSemanticAgent<TRoot extends ImplicitFieldSchema>
	implements SharedTreeSemanticAgent
{
	#querying: typeof this.querying | undefined;
	#messages: (HumanMessage | AIMessage | ToolMessage)[] = [];
	#treeHasChangedSinceLastQuery = false;

	private get querying(): {
		readonly tree: Subtree<TRoot>;
		readonly idGenerator: IdGenerator;
	} {
		return this.#querying ?? fail("Not currently processing a prompt");
	}

	private setPrompting(): void {
		if (this.#querying !== undefined) {
			this.#querying.tree.branch.dispose();
		}

		this.#querying = {
			tree: this.tree.fork(),
			idGenerator: new IdGenerator(),
		};

		this.#querying.idGenerator.assignIds(this.querying.tree.field);
	}

	private readonly originalBranch: TreeBranch;
	private readonly tree: Subtree<TRoot>;

	public readonly systemPrompt: string;

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
		this.systemPrompt = this.getSystemPrompt(this.tree);
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
		this.#messages.push(new SystemMessage(this.systemPrompt));
		this.options?.log?.(`## System Prompt\n\n${this.systemPrompt}\n\n`);
	}

	private async edit(functionCode: string): Promise<string> {
		this.options?.log?.(`### Editing Tool Invoked\n\n`);
		this.options?.log?.(
			`#### Generated Code\n\n\`\`\`javascript\n${functionCode}\n\`\`\`\n\n`,
		);
		const { idGenerator, tree } = this.querying;
		const create: Record<string, (input: FactoryContentObject) => TreeNode> = {};
		visitObjectNodeSchema(tree.schema, (schema) => {
			const name =
				getFriendlySchemaName(schema.identifier) ??
				fail("Expected friendly name for object node schema");

			create[name] = (input: FactoryContentObject) => constructObjectNode(schema, input);
		});
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
			this.setPrompting();
			return `Running the function produced an error. The state of the tree will be reset to its initial state. Please try again. Here is the error: ${errorMessage}`;
		}
		this.options?.log?.(`#### New Tree State\n\n`);
		this.options?.log?.(
			`${
				this.options.treeToString?.(tree.field) ??
				`\`\`\`JSON\n${this.stringifyTree(tree.field, idGenerator)}\n\`\`\``
			}\n\n`,
		);
		return `After running the function, the new state of the tree is:\n\n\`\`\`JSON\n${this.stringifyTree(tree.field, idGenerator)}\n\`\`\``;
	}

	// eslint-disable-next-line unicorn/consistent-function-scoping
	private readonly editingTool = tool(async ({ functionCode }) => this.edit(functionCode), {
		name: "GenerateTreeEditingCode",
		description: `Invokes a JavaScript function \`${functionName}\` to edit a user's tree`,
		schema: z.object({
			functionCode: z
				.string()
				.describe(`The body of the \`${functionName}\` JavaScript function`),
		}),
	});

	private readonly getTreeTool = tool(
		// eslint-disable-next-line unicorn/consistent-function-scoping
		() => {
			const stringified = this.stringifyTree(
				this.querying.tree.field,
				this.querying.idGenerator,
			);
			this.options?.log?.(
				`${
					this.options?.treeToString?.(this.querying.tree.field) ??
					`\`\`\`JSON\n${stringified}\n\`\`\``
				}\n\n`,
			);
			return stringified;
		},
		{
			name: "getData",
			description:
				"Use this tool to get the current state of the tree. It will return the tree's data in a human-readable format.",

			schema: z.object({}),
		},
	);

	public async query(userPrompt: string): Promise<string | undefined> {
		this.tree.branch.rebaseOnto(this.originalBranch);
		this.setPrompting();
		this.options?.log?.(`## User Query\n\n${userPrompt}\n\n`);
		if (this.#treeHasChangedSinceLastQuery) {
			const stringified = this.stringifyTree(this.tree.field, this.querying.idGenerator);
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
						case this.getTreeTool.name: {
							this.#messages.push(await this.getTreeTool.invoke(toolCall));
							break;
						}
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
				this.tree.branch.merge(this.querying.tree.branch);
				this.originalBranch.merge(this.tree.branch, false);
				this.#querying = undefined;
				return responseMessage.text;
			}
		} while (iterations <= maxMessages);

		this.querying.tree.branch.dispose();
		this.#querying = undefined;
		throw new UsageError("LLM exceeded maximum number of messages");
	}

	private getSystemPrompt({ field, schema }: Subtree<TRoot>): string {
		const arrayInterfaceName = "TreeArray";
		const mapInterfaceName = "TreeMap";
		// TODO: Support for primitive values
		assert(typeof field === "object" && field !== null && !isFluidHandle(field), 0xc1c /*  */);
		const simpleSchema = getSimpleSchema(schema);

		const { domainTypes } = generateEditTypesForPrompt(schema, simpleSchema);
		for (const [key, value] of Object.entries(domainTypes)) {
			const friendlyKey = getFriendlySchemaName(key);
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete domainTypes[key];
			if (
				friendlyKey !== undefined &&
				friendlyKey !== "string" &&
				friendlyKey !== "number" &&
				friendlyKey !== "boolean"
			) {
				domainTypes[friendlyKey] = value;
			}
		}

		const treeObjects: { type: string; id: string }[] = [];
		const stringified = this.stringifyTree(field, new IdGenerator(), (object, id) => {
			const type =
				getFriendlySchemaName(Tree.schema(object).identifier) ??
				fail("Expected object schema to have a friendly name.");

			treeObjects.push({ type, id });
		});

		const details: SchemaDetails = { hasHelperMethods: false };
		const typescriptSchemaTypes = getZodSchemaAsTypeScript(domainTypes, details);

		const domainHints =
			this.options?.domainHints === undefined
				? ""
				: `\nThe application supplied the following additional instructions: ${this.options.domainHints}`;

		const helperMethodExplanation = details.hasHelperMethods
			? `Manipulating the data using the APIs described below is allowed, but when possible ALWAYS prefer to use the application helper methods exposed on the schema TypeScript types if the goal can be accomplished that way.
It will often not be possible to fully accomplish the goal using those helpers. When this is the case, mutate the objects as normal, taking into account the following guidance.`
			: "";

		const builderExplanation =
			treeObjects[0] === undefined
				? ""
				: `When constructing new objects, you should wrap them in the appropriate builder function rather than simply making a javascript object.
The builders are available on the "create" property on the first argument of the \`${functionName}\` function and are named according to the type that they create.
For example:

\`\`\`javascript
function ${functionName}({ root, create }) {
	// This creates a new ${treeObjects[0].type} object:
	const ${uncapitalize(treeObjects[0].type)} = create.${treeObjects[0].type}({ /* ...properties... */ });
	// Don't do this:
	// const ${uncapitalize(treeObjects[0].type)} = { /* ...properties... */ };
}
\`\`\`\n\n`;

		const rootTypes = [...simpleSchema.root.allowedTypesIdentifiers];
		const prompt = `You are a helpful assistant collaborating with the user on a document. The document state is a JSON tree, and you are able to analyze and edit it.
The JSON tree adheres to the following Typescript schema:

\`\`\`typescript
${typescriptSchemaTypes}
\`\`\`

If the user asks you a question about the tree, you should inspect the state of the tree and answer the question. When answering such a question, DO NOT answer with information that is not part of the document unless requested to do so.
If the user asks you to edit the tree, you should use the "${this.editingTool.name}" tool to accomplish the user-specified goal, following the instructions for editing detailed below.
After editing the tree, review the latest state of the tree to see if it satisfies the user's request.
If it does not, or if you receive an error, you may try again with a different approach.
Once the tree is in the desired state, you should inform the user that the request has been completed.

### Editing

If the user asks you to edit the document, you will use the "${this.editingTool.name}" tool to write a JavaScript function that mutates the data in-place to achieve the user's goal.
The function must be named "${functionName}".
It may be synchronous or asynchronous.
The ${functionName} function must have a first parameter which has a \`root\` property.
This \`root\` property holds the current state of the tree as shown above.
You may mutate any part of the tree as necessary, taking into account the caveats around arrays and maps detailed below.
You may also set the \`root\` property to be an entirely new value as long as it is one of the types allowed at the root of the tree (\`${rootTypes.map((t) => getFriendlySchemaName(t)).join(" | ")}\`).
${helperMethodExplanation}

#### Editing Arrays

The arrays in the tree are somewhat different than normal JavaScript \`Array\`s.
Read-only operations are generally the same - you can create them, read via index, and call non-mutating methods like \`concat\`, \`map\`, \`filter\`, \`find\`, \`forEach\`, \`indexOf\`, \`slice\`, \`join\`, etc.
However, write operations (e.g. index assignment, \`push\`, \`pop\`, \`splice\`, etc.) are not supported.
Instead, you must use the methods on the following interface to mutate the array:

\`\`\`typescript
${getTreeArrayNodeDocumentation(arrayInterfaceName)}
\`\`\`

#### Editing Maps

The maps in the tree are somewhat different than normal JavaScript \`Map\`s.
Map keys are always strings.
Read-only operations are generally the same - you can create them, read via \`get\`, and call non-mutating methods like \`has\`, \`forEach\`, \`entries\`, \`keys\`, \`values\`, etc. (note the subtle differences around return values and iteration order).
However, standard write operations (e.g. \`set\`, \`delete\`, etc.) are not supported.
Instead, you must use the methods on the following interface to mutate the map:

\`\`\`typescript
${getTreeMapNodeDocumentation(mapInterfaceName)}
\`\`\`

### Additional Notes

Before outputting the ${functionName} function, you should check that it is valid according to both the application TypeScript schema and the restrictions of the editing language (e.g. the array methods you are allowed to use).

When possible, ensure that the edits preserve the identity of objects already in the tree (for example, prefer \`array.moveToIndex\` or \`array.moveRange\` over \`array.removeAt\` + \`array.insertAt\`).

Once data has been removed from the tree (e.g. replaced via assignment, or removed from an array), that data cannot be re-inserted into the tree - instead, it must be deep cloned and recreated.

${builderExplanation}Finally, double check that the edits would accomplish the user's request (if it is possible).

### Application data

${domainHints}
The current state of the application tree (a \`${getFriendlySchema(field)}\`) is:

\`\`\`JSON
${stringified}
\`\`\``;
		return prompt;
	}

	private stringifyTree(
		tree: ReadableField<UnsafeUnknownSchema>,
		idGenerator: IdGenerator,
		visitNode?: (object: TreeNode, id: string) => void,
	): string {
		const indexReplacementKey = "_27bb216b474d45e6aaee14d1ec267b96";
		const mapReplacementKey = "_a0d98d22a1c644539f07828d3f064d71";
		idGenerator.assignIds(tree);
		const stringified = JSON.stringify(
			tree,
			(_, node: unknown) => {
				if (node instanceof TreeNode) {
					const schema = Tree.schema(node);

					if ([NodeKind.Object, NodeKind.Record, NodeKind.Map].includes(schema.kind)) {
						visitNode?.(
							node,
							idGenerator.getId(node) ??
								fail("Expected all non-array nodes in tree to have an ID."),
						);
						const key = Tree.key(node);
						const index = typeof key === "number" ? key : undefined;
						return schema.kind === NodeKind.Map
							? {
									[indexReplacementKey]: index,
									[mapReplacementKey]: "",
									...Object.fromEntries(node as TreeMapNode),
								}
							: {
									[indexReplacementKey]: index,
									...node,
								};
					}
				}
				return node;
			},
			2,
		);

		const replaced = stringified.replace(
			new RegExp(`"${indexReplacementKey}":`, "g"),
			`// Index:`,
		);
		return replaced.replace(
			new RegExp(`"${mapReplacementKey}": ""`, "g"),
			`// Note: This is a map that has been serialized to JSON. It is not a key-value object/record but is being printed as such.`,
		);
	}
}

const maxMessages = 20; // TODO: Allow caller to provide this

/**
 * Retrieves the documentation for the `TreeArrayNode` interface to feed to the LLM.
 * @remarks The documentation has been simplified in various ways to make it easier for the LLM to understand.
 * @privateRemarks TODO: How do we keep this in sync with the actual `TreeArrayNode` docs if/when those docs change?
 */
function getTreeArrayNodeDocumentation(typeName: string): string {
	return `/** A special type of array which implements 'readonly T[]' (i.e. it supports all read-only JS array methods) and provides custom array mutation APIs. */
export interface ${typeName}<T> extends ReadonlyArray<T> {
	/**
	 * Inserts new item(s) at a specified location.
	 * @param index - The index at which to insert \`value\`.
	 * @param value - The content to insert.
	 * @throws Throws if \`index\` is not in the range [0, \`array.length\`).
	 */
	insertAt(index: number, ...value: readonly T[]): void;

	/**
	 * Removes the item at the specified location.
	 * @param index - The index at which to remove the item.
	 * @throws Throws if \`index\` is not in the range [0, \`array.length\`).
	 */
	removeAt(index: number): void;

	/**
	 * Removes all items between the specified indices.
	 * @param start - The starting index of the range to remove (inclusive). Defaults to the start of the array.
	 * @param end - The ending index of the range to remove (exclusive). Defaults to \`array.length\`.
	 * @throws Throws if \`start\` is not in the range [0, \`array.length\`].
	 * @throws Throws if \`end\` is less than \`start\`.
	 * If \`end\` is not supplied or is greater than the length of the array, all items after \`start\` are removed.
	 *
	 * @remarks
	 * The default values for start and end are computed when this is called,
	 * and thus the behavior is the same as providing them explicitly, even with respect to merge resolution with concurrent edits.
	 * For example, two concurrent transactions both emptying the array with \`node.removeRange()\` then inserting an item,
	 * will merge to result in the array having both inserted items.
	 */
	removeRange(start?: number, end?: number): void;

	/**
	 * Moves the specified item to the desired location in the array.
	 *
	 * WARNING - This API is easily misused.
	 * Please read the documentation for the \`destinationGap\` parameter carefully.
	 *
	 * @param destinationGap - The location *between* existing items that the moved item should be moved to.
	 *
	 * WARNING - \`destinationGap\` describes a location between existing items *prior to applying the move operation*.
	 *
	 * For example, if the array contains items \`[A, B, C]\` before the move, the \`destinationGap\` must be one of the following:
	 *
	 * - \`0\` (between the start of the array and \`A\`'s original position)
	 * - \`1\` (between \`A\`'s original position and \`B\`'s original position)
	 * - \`2\` (between \`B\`'s original position and \`C\`'s original position)
	 * - \`3\` (between \`C\`'s original position and the end of the array)
	 *
	 * So moving \`A\` between \`B\` and \`C\` would require \`destinationGap\` to be \`2\`.
	 *
	 * This interpretation of \`destinationGap\` makes it easy to specify the desired destination relative to a sibling item that is not being moved,
	 * or relative to the start or end of the array:
	 *
	 * - Move to the start of the array: \`array.moveToIndex(0, ...)\` (see also \`moveToStart\`)
	 * - Move to before some item X: \`array.moveToIndex(indexOfX, ...)\`
	 * - Move to after some item X: \`array.moveToIndex(indexOfX + 1\`, ...)
	 * - Move to the end of the array: \`array.moveToIndex(array.length, ...)\` (see also \`moveToEnd\`)
	 *
	 * This interpretation of \`destinationGap\` does however make it less obvious how to move an item relative to its current position:
	 *
	 * - Move item B before its predecessor: \`array.moveToIndex(indexOfB - 1, ...)\`
	 * - Move item B after its successor: \`array.moveToIndex(indexOfB + 2, ...)\`
	 *
	 * Notice the asymmetry between \`-1\` and \`+2\` in the above examples.
	 * In such scenarios, it can often be easier to approach such edits by swapping adjacent items:
	 * If items A and B are adjacent, such that A precedes B,
	 * then they can be swapped with \`array.moveToIndex(indexOfA, indexOfB)\`.
	 *
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The optional source array to move the item out of (defaults to this array).
	 * @throws Throws if any of the source index is not in the range [0, \`array.length\`),
	 * or if the index is not in the range [0, \`array.length\`].
	 */
	moveToIndex(destinationGap: number, sourceIndex: number, source?: ${typeName}<T>): void;

	/**
	 * Moves the specified items to the desired location within the array.
	 *
	 * WARNING - This API is easily misused.
	 * Please read the documentation for the \`destinationGap\` parameter carefully.
	 *
	 * @param destinationGap - The location *between* existing items that the moved item should be moved to.
	 *
	 * WARNING - \`destinationGap\` describes a location between existing items *prior to applying the move operation*.
	 *
	 * For example, if the array contains items \`[A, B, C]\` before the move, the \`destinationGap\` must be one of the following:
	 *
	 * - \`0\` (between the start of the array and \`A\`'s original position)
	 * - \`1\` (between \`A\`'s original position and \`B\`'s original position)
	 * - \`2\` (between \`B\`'s original position and \`C\`'s original position)
	 * - \`3\` (between \`C\`'s original position and the end of the array)
	 *
	 * So moving \`A\` between \`B\` and \`C\` would require \`destinationGap\` to be \`2\`.
	 *
	 * This interpretation of \`destinationGap\` makes it easy to specify the desired destination relative to a sibling item that is not being moved,
	 * or relative to the start or end of the array:
	 *
	 * - Move to the start of the array: \`array.moveToIndex(0, ...)\` (see also \`moveToStart\`)
	 * - Move to before some item X: \`array.moveToIndex(indexOfX, ...)\`
	 * - Move to after some item X: \`array.moveToIndex(indexOfX + 1\`, ...)
	 * - Move to the end of the array: \`array.moveToIndex(array.length, ...)\` (see also \`moveToEnd\`)
	 *
	 * This interpretation of \`destinationGap\` does however make it less obvious how to move an item relative to its current position:
	 *
	 * - Move item B before its predecessor: \`array.moveToIndex(indexOfB - 1, ...)\`
	 * - Move item B after its successor: \`array.moveToIndex(indexOfB + 2, ...)\`
	 *
	 * Notice the asymmetry between \`-1\` and \`+2\` in the above examples.
	 * In such scenarios, it can often be easier to approach such edits by swapping adjacent items:
	 * If items A and B are adjacent, such that A precedes B,
	 * then they can be swapped with \`array.moveToIndex(indexOfA, indexOfB)\`.
	 *
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The optional source array to move items out of (defaults to this array).
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if any of the input indices are not in the range [0, \`array.length\`], or if \`sourceStart\` is greater than \`sourceEnd\`.
	 */
	moveRangeToIndex(
		destinationGap: number,
		sourceStart: number,
		sourceEnd: number,
		source?: ${typeName}<T>,
	): void;
}`;
}

/**
 * Retrieves the documentation for the `TreeMapNode` interface to feed to the LLM.
 * @remarks The documentation has been simplified in various ways to make it easier for the LLM to understand.
 * @privateRemarks TODO: How do we keep this in sync with the actual `TreeMapNode` docs if/when those docs change?
 */
function getTreeMapNodeDocumentation(typeName: string): string {
	return `/**
 * A map of string keys to tree objects.
 */
export interface ${typeName}<T> extends ReadonlyMap<string, T> {
	/**
	 * Adds or updates an entry in the map with a specified \`key\` and a \`value\`.
	 *
	 * @param key - The key of the element to add to the map.
	 * @param value - The value of the element to add to the map.
	 *
	 * @remarks
	 * Setting the value at a key to \`undefined\` is equivalent to calling {@link ${typeName}.delete} with that key.
	 */
	set(key: string, value: T | undefined): void;

	/**
	 * Removes the specified element from this map by its \`key\`.
	 *
	 * @remarks
	 * Note: unlike JavaScript's Map API, this method does not return a flag indicating whether or not the value was
	 * deleted.
	 *
	 * @param key - The key of the element to remove from the map.
	 */
	delete(key: string): void;

	/**
	 * Returns an iterable of keys in the map.
	 *
	 * @remarks
	 * Note: no guarantees are made regarding the order of the keys returned.
	 * If your usage scenario depends on consistent ordering, you will need to sort these yourself.
	 */
	keys(): IterableIterator<string>;

	/**
	 * Returns an iterable of values in the map.
	 *
	 * @remarks
	 * Note: no guarantees are made regarding the order of the values returned.
	 * If your usage scenario depends on consistent ordering, you will need to sort these yourself.
	 */
	values(): IterableIterator<T>;

	/**
	 * Returns an iterable of key/value pairs for every entry in the map.
	 *
	 * @remarks
	 * Note: no guarantees are made regarding the order of the entries returned.
	 * If your usage scenario depends on consistent ordering, you will need to sort these yourself.
	 */
	entries(): IterableIterator<[string, T]>;

	/**
	 * Executes the provided function once per each key/value pair in this map.
	 *
	 * @remarks
	 * Note: no guarantees are made regarding the order in which the function is called with respect to the map's entries.
	 * If your usage scenario depends on consistent ordering, you will need to sort these yourself.
	 */
	forEach(
		callbackfn: (
			value: T,
			key: string,
			map: ReadonlyMap<string, T>,
		) => void,
		thisArg?: any,
	): void;
}`;
}

function uncapitalize(str: string): string {
	return str.charAt(0).toLowerCase() + str.slice(1);
}

function visitObjectNodeSchema(
	schema: ImplicitFieldSchema,
	visitor: (schema: ObjectNodeSchema) => void,
): void {
	const normalizedSchema = normalizeFieldSchema(schema);
	for (const nodeSchema of normalizedSchema.allowedTypeSet) {
		if (nodeSchema.kind === NodeKind.Object) {
			visitor(nodeSchema as ObjectNodeSchema);
		}
		visitObjectNodeSchema([...nodeSchema.childTypes], visitor);
	}
}

function processLlmCode(code: string): string {
	// TODO: use a library like Acorn to analyze the code more robustly
	const regex = new RegExp(`function\\s+${functionName}\\s*\\(`);
	if (!regex.test(code)) {
		throw new Error(`Generated code does not contain a function named \`${functionName}\``);
	}

	return `${code}\n\n${functionName}(${paramsName});`;
}

/**
 * Creates an unhydrated object node and populates it with `llmDefault` values if they exist.
 */
function constructObjectNode(
	schema: ObjectNodeSchema,
	input: FactoryContentObject,
): TreeObjectNode<RestrictiveStringRecord<ImplicitFieldSchema>> {
	const inputWithDefaults: Record<string, InsertableContent | undefined> = {};
	for (const [key, field] of schema.fields) {
		if (input[key] === undefined) {
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
			inputWithDefaults[key] = input[key];
		}
	}
	return constructNode(schema, inputWithDefaults) as TreeObjectNode<
		RestrictiveStringRecord<ImplicitFieldSchema>
	>;
}
