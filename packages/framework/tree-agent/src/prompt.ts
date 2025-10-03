/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NodeKind, Tree, TreeNode } from "@fluidframework/tree";
import type { ImplicitFieldSchema, TreeMapNode } from "@fluidframework/tree";
import type { ReadableField, UnsafeUnknownSchema } from "@fluidframework/tree/alpha";
import { getSimpleSchema } from "@fluidframework/tree/alpha";
import { normalizeFieldSchema } from "@fluidframework/tree/internal";

import type { Subtree } from "./subtree.js";
import { generateEditTypesForPrompt } from "./typeGeneration.js";
import {
	getFriendlyName,
	getZodSchemaAsTypeScript,
	isNamedSchema,
	communize,
	unqualifySchema,
	type SchemaDetails,
} from "./utils.js";

/**
 * Produces a "system" prompt for the tree agent, based on the provided subtree.
 */
export function getPrompt<TRoot extends ImplicitFieldSchema>(args: {
	subtree: Subtree<TRoot>;
	editingToolName: string;
	editingFunctionName: string;
	domainHints?: string;
}): string {
	const { editingToolName, editingFunctionName, subtree, domainHints } = args;
	const { field, schema } = subtree;
	const arrayInterfaceName = "TreeArray";
	const mapInterfaceName = "TreeMap";
	const simpleSchema = getSimpleSchema(schema);
	// Inspect the schema to determine what kinds of nodes are possible - this will affect  how much information we need to include in the prompt.
	let hasArrays = false;
	let hasMaps = false;
	let exampleObjectName: string | undefined;
	for (const [definition, nodeSchema] of simpleSchema.definitions) {
		switch (nodeSchema.kind) {
			case NodeKind.Array: {
				hasArrays = true;
				break;
			}
			case NodeKind.Map: {
				hasMaps = true;
				break;
			}
			case NodeKind.Object: {
				exampleObjectName ??= unqualifySchema(definition);
				break;
			}
			// No default
		}
	}

	const { domainTypes } = generateEditTypesForPrompt(schema, simpleSchema);
	for (const [key, value] of Object.entries(domainTypes)) {
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		delete domainTypes[key];
		if (isNamedSchema(key)) {
			const friendlyKey = unqualifySchema(key);
			domainTypes[friendlyKey] = value;
		}
	}

	const stringified = stringifyTree(field);
	const details: SchemaDetails = { hasHelperMethods: false };
	const typescriptSchemaTypes = getZodSchemaAsTypeScript(domainTypes, details);
	const helperMethodExplanation = details.hasHelperMethods
		? `Manipulating the data using the APIs described below is allowed, but when possible ALWAYS prefer to use the application helper methods exposed on the schema TypeScript types if the goal can be accomplished that way.
It will often not be possible to fully accomplish the goal using those helpers. When this is the case, mutate the objects as normal, taking into account the following guidance.`
		: "";

	const builderExplanation =
		exampleObjectName === undefined
			? ""
			: `When constructing new objects, you should wrap them in the appropriate builder function rather than simply making a javascript object.
The builders are available on the "create" property on the first argument of the \`${editingFunctionName}\` function and are named according to the type that they create.
For example:

\`\`\`javascript
function ${editingFunctionName}({ root, create }) {
	// This creates a new ${exampleObjectName} object:
	const ${communize(exampleObjectName)} = create.${exampleObjectName}({ /* ...properties... */ });
	// Don't do this:
	// const ${communize(exampleObjectName)} = { /* ...properties... */ };
}
\`\`\`\n\n`;

	const arrayEditing = `#### Editing Arrays

The arrays in the tree are somewhat different than normal JavaScript \`Array\`s.
Read-only operations are generally the same - you can create them, read via index, and call non-mutating methods like \`concat\`, \`map\`, \`filter\`, \`find\`, \`forEach\`, \`indexOf\`, \`slice\`, \`join\`, etc.
However, write operations (e.g. index assignment, \`push\`, \`pop\`, \`splice\`, etc.) are not supported.
Instead, you must use the methods on the following interface to mutate the array:

\`\`\`typescript
${getTreeArrayNodeDocumentation(arrayInterfaceName)}
\`\`\`

When possible, ensure that the edits preserve the identity of objects already in the tree.
For example, prefer \`array.moveToIndex\` over \`array.removeAt\` + \`array.insertAt\` and prefer \`array.moveRangeToIndex\` over \`array.removeRange\` + \`array.insertAt\`.

`;

	const mapEditing = `#### Editing Maps

The maps in the tree are somewhat different than normal JavaScript \`Map\`s.
Map keys are always strings.
Read-only operations are generally the same - you can create them, read via \`get\`, and call non-mutating methods like \`has\`, \`forEach\`, \`entries\`, \`keys\`, \`values\`, etc. (note the subtle differences around return values and iteration order).
However, write operations (e.g. \`set\`, \`delete\`, etc.) are not supported.
Instead, you must use the methods on the following interface to mutate the map:

\`\`\`typescript
${getTreeMapNodeDocumentation(mapInterfaceName)}
\`\`\`

`;

	const rootTypes = normalizeFieldSchema(schema).allowedTypeSet;
	const prompt = `You are a helpful assistant collaborating with the user on a document. The document state is a JSON tree, and you are able to analyze and edit it.
The JSON tree adheres to the following Typescript schema:

\`\`\`typescript
${typescriptSchemaTypes}
\`\`\`

If the user asks you a question about the tree, you should inspect the state of the tree and answer the question. When answering such a question, DO NOT answer with information that is not part of the document unless requested to do so.
If the user asks you to edit the tree, you should use the "${editingToolName}" tool to accomplish the user-specified goal, following the instructions for editing detailed below.
After editing the tree, review the latest state of the tree to see if it satisfies the user's request.
If it does not, or if you receive an error, you may try again with a different approach.
Once the tree is in the desired state, you should inform the user that the request has been completed.

### Editing

If the user asks you to edit the document, you will use the "${editingToolName}" tool to write a JavaScript function that mutates the data in-place to achieve the user's goal.
The function must be named "${editingFunctionName}".
It may be synchronous or asynchronous.
The ${editingFunctionName} function must have a first parameter which has a \`root\` property.
This \`root\` property holds the current state of the tree as shown above.
You may mutate any part of the tree as necessary, taking into account the caveats around arrays and maps detailed below.
You may also set the \`root\` property to be an entirely new value as long as it is one of the types allowed at the root of the tree (\`${Array.from(rootTypes.values(), (t) => getFriendlyName(t)).join(" | ")}\`).
${helperMethodExplanation}

${hasArrays ? arrayEditing : ""}${hasMaps ? mapEditing : ""}### Additional Notes

Before outputting the ${editingFunctionName} function, you should check that it is valid according to both the application tree's schema and any restrictions of the editing APIs described above.

Once data has been removed from the tree (e.g. replaced via assignment, or removed from an array), that data cannot be re-inserted into the tree - instead, it must be deep cloned and recreated.

${builderExplanation}Finally, double check that the edits would accomplish the user's request (if it is possible).

### Application data

${
	domainHints === undefined
		? ""
		: `\nThe application supplied the following additional instructions: ${domainHints}`
}
The current state of the application tree (a \`${field === undefined ? "undefined" : getFriendlyName(Tree.schema(field))}\`) is:

\`\`\`JSON
${stringified}
\`\`\``;
	return prompt;
}

/**
 * Serializes tree data e.g. to include in a prompt or message.
 * @remarks This includes some extra metadata to make it easier to understand the structure of the tree.
 */
export function stringifyTree(tree: ReadableField<UnsafeUnknownSchema>): string {
	const typeReplacementKey = "_e944da5a5fd04ea2b8b2eb6109e089ed";
	const indexReplacementKey = "_27bb216b474d45e6aaee14d1ec267b96";
	const mapReplacementKey = "_a0d98d22a1c644539f07828d3f064d71";
	const stringified = JSON.stringify(
		tree,
		(_, node: unknown) => {
			if (node instanceof TreeNode) {
				const key = Tree.key(node);
				const index = typeof key === "number" ? key : undefined;
				const schema = Tree.schema(node);
				switch (schema.kind) {
					case NodeKind.Object: {
						return {
							[typeReplacementKey]: getFriendlyName(schema),
							[indexReplacementKey]: index,
							...node,
						};
					}
					case NodeKind.Map: {
						return {
							[indexReplacementKey]: index,
							[mapReplacementKey]: "",
							...Object.fromEntries(node as TreeMapNode),
						};
					}
					default: {
						return {
							[indexReplacementKey]: index,
							...node,
						};
					}
				}
			}
			return node;
		},
		2,
	);

	return stringified
		.replace(new RegExp(`"${typeReplacementKey}":`, "g"), `// Type:`)
		.replace(new RegExp(`"${indexReplacementKey}":`, "g"), `// Index:`)
		.replace(
			new RegExp(`"${mapReplacementKey}": ""`, "g"),
			`// Note: This is a map that has been serialized to JSON. It is not a key-value object/record but is being printed as such.`,
		);
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
