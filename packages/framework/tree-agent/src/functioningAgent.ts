/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import {
	type ImplicitFieldSchema,
	type InsertableField,
	type ReadableField,
	type TreeFieldFromImplicitField,
	type TreeNode,
	type InsertableContent,
	normalizeFieldSchema,
	type ObjectNodeSchema,
	NodeKind,
	getSimpleSchema,
	type ReadSchema,
	type RestrictiveStringRecord,
	type TreeObjectNode,
	Tree,
	type FactoryContentObject,
} from "@fluidframework/tree/internal";
// eslint-disable-next-line import/no-internal-modules
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
// eslint-disable-next-line import/no-internal-modules
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
	SharedTreeSemanticAgentBase,
	type Log,
	type SharedTreeSemanticAgent,
} from "./agent.js";
import { IdGenerator } from "./idGenerator.js";
import { generateEditTypesForPrompt } from "./typeGeneration.js";
import {
	constructNode,
	fail,
	getFriendlySchemaName,
	llmDefault,
	type TreeView,
} from "./utils.js";

const functionName = "editTree";
const paramsName = "params";

/**
 * TODO doc
 * @alpha
 */
export function createFunctioningAgent<TRoot extends ImplicitFieldSchema>(
	client: BaseChatModel,
	treeView: TreeView<TRoot>,
	options?: {
		readonly domainHints?: string;
		readonly treeToString?: (root: ReadableField<TRoot>) => string;
		readonly validator?: (js: string) => boolean;
		readonly log?: Log;
	},
): SharedTreeSemanticAgent {
	return new SharedTreeFunctioningAgent(client, treeView, options);
}

class SharedTreeFunctioningAgent<
	TRoot extends ImplicitFieldSchema,
> extends SharedTreeSemanticAgentBase<TRoot> {
	public constructor(
		client: BaseChatModel,
		treeView: TreeView<TRoot>,
		options?: {
			readonly domainHints?: string;
			readonly treeToString?: (root: ReadableField<TRoot>) => string;
			readonly validator?: (js: string) => boolean;
			readonly log?: Log;
		},
	) {
		const editingTool = tool(
			async ({ functionCode }) => {
				this.options?.log?.(`### Editing Tool Invoked\n\n`);
				this.options?.log?.(
					`#### Generated Code\n\n\`\`\`javascript\n${functionCode}\n\`\`\`\n\n`,
				);
				const { branch, idGenerator } = this.prompting;
				const create: Record<string, (input: FactoryContentObject) => TreeNode> = {};
				visitObjectNodeSchema(this.treeView.schema, (schema) => {
					const name =
						getFriendlySchemaName(schema.identifier) ??
						fail("Expected friendly name for object node schema");

					create[name] = (input: FactoryContentObject) => constructObjectNode(schema, input);
				});
				if (options?.validator?.(functionCode) === false) {
					this.options?.log?.(`#### Code Validation Failed\n\n`);
					return "Code validation failed";
				}
				const params = {
					get root(): TreeFieldFromImplicitField<TRoot> {
						return branch.root;
					},
					set root(value: InsertableField<TRoot>) {
						branch.root = value;
					},
					create,
				};
				const code = processLlmCode(functionCode);
				// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
				const fn = new Function(paramsName, code) as (
					p: typeof params,
				) => Promise<void> | void;
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
						this.options.treeToString?.(branch.root) ??
						`\`\`\`JSON\n${this.stringifyTree(branch.root, idGenerator)}\n\`\`\``
					}\n\n`,
				);
				return `After running the function, the new state of the tree is:\n\n\`\`\`JSON\n${this.stringifyTree(branch.root, idGenerator)}\n\`\`\``;
			},
			{
				name: "GenerateTreeEditingCode",
				description: `Invokes a JavaScript function \`${functionName}\` to edit a user's tree`,
				schema: z.object({
					functionCode: z
						.string()
						.describe(`The body of the \`${functionName}\` JavaScript function`),
				}),
			},
		);
		super(client, treeView, editingTool, options);
	}

	protected override getSystemPrompt(view: Omit<TreeView<TRoot>, "fork" | "merge">): string {
		const arrayInterfaceName = "TreeArray";
		// TODO: Support for non-object roots
		assert(
			typeof view.root === "object" && view.root !== null && !isFluidHandle(view.root),
			"",
		);
		const schema = getSimpleSchema(view.schema);

		const { domainTypes, domainRoot } = generateEditTypesForPrompt(schema, false);
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
		const stringified = this.stringifyTree(view.root, new IdGenerator(), (object, id) => {
			const type =
				getFriendlySchemaName(Tree.schema(object).identifier) ??
				fail("Expected object schema to have a friendly name.");

			treeObjects.push({ type, id });
		});

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

		const rootTypes = [...schema.root.allowedTypesIdentifiers];
		const prompt = `${this.getSystemPromptPreamble(domainTypes, domainRoot)}

### Editing

If the user asks you to edit the data, you will use the ${this.editingTool.name} tool to write a JavaScript function that mutates the data in-place to achieve the user's goal.
The function must be named "${functionName}".
It may be synchronous or asynchronous.
The ${functionName} function must have a first parameter which has a \`root\` property that is the JSON object you are to mutate.
The current state of the \`root\` object is:

\`\`\`JSON
${stringified}
\`\`\`

You may set the \`root\` property to be a new root object if necessary, but you must ensure that the new object is one of the types allowed at the root of the tree (\`${rootTypes.map((t) => getFriendlySchemaName(t)).join(" | ")}\`).

#### Editing Arrays

There is a notable restriction: the arrays in the tree cannot be mutated in the normal way.
Instead, they must be mutated via methods on the following TypeScript interface:

\`\`\`typescript
${getTreeArrayNodeDocumentation(arrayInterfaceName)}
\`\`\`

Outside of mutation, they behave like normal JavaScript arrays - you can create them, read from them, and call non-mutating methods on them (e.g. \`concat\`, \`map\`, \`filter\`, \`find\`, \`forEach\`, \`indexOf\`, \`slice\`, \`join\`, etc.).

### Additional Notes

Before outputting the ${functionName} function, you should check that it is valid according to both the application tree's schema and the restrictions of the editing language (e.g. the array methods you are allowed to use).

When possible, ensure that the edits preserve the identity of objects already in the tree (for example, prefer \`array.moveToIndex\` or \`array.moveRange\` over \`array.removeAt\` + \`array.insertAt\`).

Once data has been removed from the tree (e.g. replaced via assignment, or removed from an array), that data cannot be re-inserted into the tree - instead, it must be deep cloned and recreated.

${builderExplanation}Finally, double check that the edits would accomplish the user's request (if it is possible).`;

		return prompt;
	}

	protected override stringifyTree(
		root: TreeFieldFromImplicitField<ReadSchema<TRoot>>,
		idGenerator: IdGenerator,
		visitObject?: (
			object: TreeObjectNode<RestrictiveStringRecord<ImplicitFieldSchema>>,
			id: string,
		) => object | void,
	): string {
		const indexReplacementKey = "_27bb216b474d45e6aaee14d1ec267b96";
		const stringified = super.stringifyTree(root, idGenerator, (object, id) => {
			const key = Tree.key(object);
			return {
				[indexReplacementKey]: typeof key === "number" ? key : undefined,
				...(visitObject?.(object, id) ?? object),
			};
		});

		return stringified.replace(new RegExp(`"${indexReplacementKey}":`, "g"), `// Index:`);
	}
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

function uncapitalize(str: string): string {
	return str.charAt(0).toLowerCase() + str.slice(1);
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
