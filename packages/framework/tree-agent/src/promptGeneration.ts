/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import {
	type ImplicitFieldSchema,
	Tree,
	type TreeFieldFromImplicitField,
	type TreeNode,
	getSimpleSchema,
} from "@fluidframework/tree/internal";
// eslint-disable-next-line import/no-internal-modules
import { createZodJsonValidator } from "typechat/zod";

import {
	objectIdKey,
	objectIdType,
	typeField,
	type InsertIntoArray,
	type MoveArrayElement,
	type RemoveFromArray,
	type SetField,
	type TreeEdit,
} from "./agentEditTypes.js";
import { IdGenerator } from "./idGenerator.js";
import { doesNodeContainArraySchema, generateEditTypesForPrompt } from "./typeGeneration.js";
import { fail, type TreeView } from "./utils.js";

/**
 * A log of edits that have been made to a tree.
 * @remarks This is primarily used to help an LLM keep track of the active changes it has made.
 */
export type EditLog = {
	edit: TreeEdit;
	error?: string;
}[];

/**
 * TBD
 */
export function stringifyWithIds(
	idGenerator: IdGenerator,
	root: TreeFieldFromImplicitField<ImplicitFieldSchema>,
): {
	stringified: string;
	objectsWithIds: {
		type: string;
		id: string;
	}[];
} {
	idGenerator.assignIds(root);
	const objectsWithIds: ReturnType<typeof stringifyWithIds>["objectsWithIds"] = [];
	const stringified: string = JSON.stringify(
		root,
		(_, value) => {
			if (typeof value === "object" && !Array.isArray(value) && value !== null) {
				// TODO: SharedTree Team needs to either publish TreeNode as a class to use .instanceof() or a typeguard.
				// Uncomment this assertion back once we have a typeguard ready.
				// assert(isTreeNode(node), "Non-TreeNode value in tree.");
				const id =
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					idGenerator.getId(value) ?? fail("ID of new node should have been assigned.");
				assert(
					!Object.prototype.hasOwnProperty.call(value, objectIdKey),
					0xa7b /* Collision of object id property. */,
				);
				const type =
					getFriendlySchemaName(Tree.schema(value as TreeNode).identifier) ??
					fail("Expected object schema to have a friendly name.");
				objectsWithIds.push({ id, type });
				return {
					[objectIdKey]: id,
					...value,
				} as unknown;
			}
			return value as unknown;
		},
		2,
	);
	return {
		stringified,
		objectsWithIds,
	};
}

/**
 * Generates a prompt that provides a history of the edits an LLM has made to a SharedTree as well as any errors that occured from attemping to apply each respsecitve edit to the tree.
 */
export function createEditListHistoryPrompt(edits: EditLog): string {
	return edits
		.map((edit, index) => {
			const error =
				edit.error === undefined
					? ""
					: ` This edit produced an error, and was discarded. The error message was: "${edit.error}"`;
			return `${index + 1}. ${JSON.stringify(edit.edit)}${error}`;
		})
		.join("\n");
}

/**
 * Generates the main prompt of this explicit strategy.
 * This prompt is designed to give an LLM instructions on how it can modify a SharedTree using specific types of {@link TreeEdit}'s
 * and provides with both a serialized version of the current state of the provided tree node as well as  the interfaces that compromise said tree nodes data.
 */
export function getEditingSystemPrompt(
	view: Omit<TreeView<ImplicitFieldSchema>, "fork" | "merge">,
): string {
	// TODO: Support for non-object roots
	assert(typeof view.root === "object" && view.root !== null && !isFluidHandle(view.root), "");
	const schema = getSimpleSchema(view.schema);
	const { editTypes, editRoot, domainTypes, domainRoot } = generateEditTypesForPrompt(schema);
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
	const domainSchema = createZodJsonValidator(domainTypes, domainRoot);
	const domainSchemaString = domainSchema.getSchemaText();
	const { stringified } = stringifyWithIds(new IdGenerator(), view.root);
	const treeSchemaString = createZodJsonValidator(editTypes, editRoot).getSchemaText();
	const setFieldType = "SetField" satisfies Capitalize<SetField["type"]>;
	const insertIntoArrayType = "InsertIntoArray" satisfies Capitalize<InsertIntoArray["type"]>;
	const topLevelEditWrapperDescription = doesNodeContainArraySchema(view.root)
		? `is one of the following interfaces: \`${setFieldType}\` for editing objects or one of \`${insertIntoArrayType}\`, \`${"RemoveFromArray" satisfies Capitalize<RemoveFromArray["type"]>}\`, \`${"MoveArrayElement" satisfies Capitalize<MoveArrayElement["type"]>}\` for editing arrays`
		: `is the interface \`${setFieldType}\``;

	const rootTypes = [...schema.allowedTypesIdentifiers];
	// TODO: security: user prompt in system prompt
	const systemPrompt = `You are a collaborative agent who interacts with a JSON tree by performing edits to achieve a user-specified goal.
Edits are JSON objects that conform to the schema described below. You produce an array of edits where each edit ${topLevelEditWrapperDescription}.
When creating new objects for \`${insertIntoArrayType}\` or \`${setFieldType}\`, you may create an ${objectIdType} and put it in the \`${objectIdKey}\` property if you want to refer to the object in a later edit.
For example, if you want to insert a new object into an array and (in a subsequent edit) move another piece of content to after the newly inserted one, you can use the ${objectIdType} of the newly inserted object in the \`${"MoveArrayElement" satisfies Capitalize<MoveArrayElement["type"]>}\` edit.
New ${objectIdType}s must be unique, i.e. a new object cannot have the same ${objectIdType} as any object that has existed before.
${objectIdType}s are optional; do not supply them unless you need to refer to the object in a later edit.
For a \`${setFieldType}\` or \`${insertIntoArrayType}\` edit, you might insert an object into a location where it is ambiguous what the type of the object is from the data alone.
In that case, supply the type in the \`${typeField}\` property of the object with a value that is the typescript type name of that object.

The schema definitions for an edit are:

\`\`\`typescript
${treeSchemaString}
\`\`\`

The tree is a JSON object with the following schema:

\`\`\`typescript
${domainSchemaString}
\`\`\`

The type${rootTypes.length > 1 ? "s" : ""} allowable at the root of the tree ${rootTypes.length > 1 ? "are" : "is"} \`${rootTypes.map((t) => getFriendlySchemaName(t)).join(" | ")}\`.
The current state of the tree is

\`\`\`JSON
${stringified}
\`\`\`

Your final output should be an array of one or more edits that accomplishes the goal, or an empty array if the task can't be accomplished.
Before returning the edits, you should check that they are valid according to both the application schema and the editing language schema.
When possible, ensure that the edits preserve the identity of objects already in the tree (for example, prefer move operations over removal and reinsertion).
Do not put \`${objectIdKey}\` properties on new objects that you create unless you are going to refer to them in a later edit.
Finally, double check that the edits would accomplish the user's request (if it is possible).`;

	return systemPrompt;
}

/**
 * TODO
 */
export function getFunctioningSystemPrompt(
	view: Omit<TreeView<ImplicitFieldSchema>, "fork" | "merge">,
	editFunctionName: string,
): string {
	const arrayInterfaceName = "TreeArray";
	// TODO: Support for non-object roots
	assert(typeof view.root === "object" && view.root !== null && !isFluidHandle(view.root), "");
	const schema = getSimpleSchema(view.schema);

	const { domainTypes, domainRoot } = generateEditTypesForPrompt(schema);
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
	const domainSchema = createZodJsonValidator(domainTypes, domainRoot);
	const domainSchemaString = domainSchema.getSchemaText();
	const { stringified, objectsWithIds } = stringifyWithIds(new IdGenerator(), view.root);

	const objectIdExplanation =
		objectsWithIds[0] === undefined
			? ""
			: `All objects within the initial tree above have a unique ${objectIdType} in the \`${objectIdKey}\` property.
You never supply the ${objectIdKey} property when making a new object yourself because the ${objectIdKey} property is only used to refer to objects that exist in the initial tree, not objects that are created later.
You can use the ${objectIdType} as the lookup key in the readonly JavaScript Map<${objectIdKey}, object>, which is provided via the "idMap" property to the first argument of the ${editFunctionName} function.
For example:

\`\`\`javascript
function ${editFunctionName}({ root, idMap, create }) {
	// This retrieves the ${objectsWithIds[0].type} object with the ${objectIdKey} "${objectsWithIds[0].id}" in the initial tree.
	const ${uncapitalize(objectsWithIds[0].type)} = idMap.get("${objectsWithIds[0].id}");
	// ...
}
\`\`\`\n\n`;

	const builderExplanation =
		objectsWithIds[0] === undefined
			? ""
			: `When constructing new objects, you should wrap them in the appropriate builder function rather than simply making a javascript object.
The builders are available on the "create" property on the first argument of the ${editFunctionName} function and are named according to the type that they create.
For example:

\`\`\`javascript
function ${editFunctionName}({ root, idMap, create }) {
	// This creates a new ${objectsWithIds[0].type} object:
	const ${uncapitalize(objectsWithIds[0].type)} = create.${objectsWithIds[0].type}({ /* ...properties... */ });
	// Don't do this:
	// const ${uncapitalize(objectsWithIds[0].type)} = { /* ...properties... */ };
}
\`\`\`\n\n`;

	const rootTypes = [...schema.allowedTypesIdentifiers];
	// TODO: security: user prompt in system prompt
	const prompt = `You are a collaborative agent who interacts with a JSON tree by performing edits to achieve a user-specified goal.
The tree is a JSON object with the following Typescript schema:

\`\`\`typescript
${domainSchemaString}
\`\`\`

Your job is to write a JavaScript function that mutates this object in-place to achieve a user-specified goal.
The function must be named "${editFunctionName}".
The ${editFunctionName} function must have a first parameter which has a \`root\` property that is the JSON object you are to mutate.
The current state of the \`root\` object is:

\`\`\`JSON
${stringified}
\`\`\`

You may set the \`root\` property to be a new root object if necessary, but you must ensure that the new object is one of the types allowed at the root of the tree (\`${rootTypes.map((t) => getFriendlySchemaName(t)).join(" | ")}\`).

${objectIdExplanation}There is a notable restriction: the arrays in the tree cannot be mutated in the normal way.
Instead, they must be mutated via methods on the following TypeScript interface:

\`\`\`typescript
${getTreeArrayNodeDocumentation(arrayInterfaceName)}
\`\`\`

Outside of mutation, they behave like normal JavaScript arrays - you can create them, read from them, and call non-mutating methods on them (e.g. \`concat\`, \`map\`, \`filter\`, \`find\`, \`forEach\`, \`indexOf\`, \`slice\`, \`join\`, etc.).

Before outputting the ${editFunctionName} function, you should check that it is valid according to both the application tree's schema and the restrictions of the editing language (e.g. the array methods you are allowed to use).

When possible, ensure that the edits preserve the identity of objects already in the tree (for example, prefer \`array.moveToIndex\` or \`array.moveRange\` over \`array.removeAt\` + \`array.insertAt\`).

Once data has been removed from the tree (e.g. replaced via assignment, or removed from an array), that data cannot be re-inserted into the tree - instead, it must be deep cloned and recreated.

${builderExplanation}Finally, double check that the edits would accomplish the user's request (if it is possible).`;

	return prompt;
}

/**
 * TODO
 * @remarks Returns undefined if the schema should not be included in the prompt (and therefore should not ever be seen by the LLM).
 */
export function getFriendlySchemaName(schemaName: string): string | undefined {
	// TODO: Kludge
	const arrayTypes = schemaName.match(/Array<\["(.*)"]>/);
	if (arrayTypes?.[1] !== undefined) {
		return undefined;
	}

	const matches = schemaName.match(/[^.]+$/);
	if (matches === null) {
		// empty scope
		return schemaName;
	}
	return matches[0];
}

/**
 * Retrieves the documentation for the `TreeArrayNode` interface to feed to the LLM.
 * @remarks The documentation has been simplified in various ways to make it easier for the LLM to understand.
 * @privateRemarks TODO: How do we keep this in sync with the actual `TreeArrayNode` docs if/when those docs change?
 */
function getTreeArrayNodeDocumentation(typeName: string): string {
	return `/** A special array which implements 'readonly T[]' and provides custom array mutation APIs. */
export interface ${typeName}<T> extends ReadonlyArray<T> {
	/**
	 * Inserts new item(s) at a specified location.
	 * @param index - The index at which to insert \`value\`.
	 * @param value - The content to insert.
	 * @throws Throws if \`index\` is not in the range [0, \`array.length\`).
	 */
	insertAt(index: number, ...value: readonly T[]): void;

	/**
	 * Inserts new item(s) at the start of the array.
	 * @param value - The content to insert.
	 */
	insertAtStart(...value: readonly T[]): void;

	/**
	 * Inserts new item(s) at the end of the array.
	 * @param value - The content to insert.
	 */
	insertAtEnd(...value: readonly T[]): void;

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
	 * Moves the specified item to the start of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if \`sourceIndex\` is not in the range [0, \`array.length\`).
	 */
	moveToStart(sourceIndex: number): void;

	/**
	 * Moves the specified item to the start of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source array to move the item out of.
	 * @throws Throws if \`sourceIndex\` is not in the range [0, \`array.length\`).
	 */
	moveToStart(sourceIndex: number, source: ${typeName}<T>): void;

	/**
	 * Moves the specified item to the end of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if \`sourceIndex\` is not in the range [0, \`array.length\`).
	 */
	moveToEnd(sourceIndex: number): void;

	/**
	 * Moves the specified item to the end of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source array to move the item out of.
	 * @throws Throws if \`sourceIndex\` is not in the range [0, \`array.length\`).
	 */
	moveToEnd(sourceIndex: number, source: ${typeName}<T>): void;

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
	 * For example, if the array contains items \`[(A, B, C)]\` before the move, the \`destinationGap\` must be one of the following:
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
	 * - Move to after some item X: \`array.moveToIndex(indexOfX + 1, ...)\`
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
	 * @throws Throws if any of the input indices are not in the range [0, \`array.length\`).
	 */
	moveToIndex(destinationGap: number, sourceIndex: number): void;

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
	 * @param source - The source array to move the item out of.
	 * @throws Throws if any of the source index is not in the range [0, \`array.length\`),
	 * or if the index is not in the range [0, \`array.length\`].
	 */
	moveToIndex(destinationGap: number, sourceIndex: number, source: ${typeName}<T>): void;

	/**
	 * Moves the specified items to the start of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if either of the input indices are not in the range [0, \`array.length\`) or if \`sourceStart\` is greater than \`sourceEnd\`.
	 * if any of the input indices are not in the range [0, \`array.length\`], or if \`sourceStart\` is greater than \`sourceEnd\`.
	 */
	moveRangeToStart(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the start of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source array to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if either of the input indices are not in the range [0, \`array.length\`) or if \`sourceStart\` is greater than \`sourceEnd\`.
	 * if any of the input indices are not in the range [0, \`array.length\`], or if \`sourceStart\` is greater than \`sourceEnd\`.
	 */
	moveRangeToStart(sourceStart: number, sourceEnd: number, source: ${typeName}<T>): void;

	/**
	 * Moves the specified items to the end of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if either of the input indices are not in the range [0, \`array.length\`) or if \`sourceStart\` is greater than \`sourceEnd\`.
	 * if any of the input indices are not in the range [0, \`array.length\`], or if \`sourceStart\` is greater than \`sourceEnd\`.
	 */
	moveRangeToEnd(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the end of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source array to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if either of the input indices are not in the range [0, \`array.length\`) or if \`sourceStart\` is greater than \`sourceEnd\`.
	 * if any of the input indices are not in the range [0, \`array.length\`], or if \`sourceStart\` is greater than \`sourceEnd\`.
	 */
	moveRangeToEnd(sourceStart: number, sourceEnd: number, source: ${typeName}<T>): void;

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
	 * @throws Throws if any of the input indices are not in the range [0, \`array.length\`) or if \`sourceStart\` is greater than \`sourceEnd\`.
	 * if any of the input indices are not in the range [0, \`array.length\`], or if \`sourceStart\` is greater than \`sourceEnd\`.
	 */
	moveRangeToIndex(destinationGap: number, sourceStart: number, sourceEnd: number): void;

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
	 * @param source - The source array to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if any of the input indices are not in the range [0, \`array.length\`], or if \`sourceStart\` is greater than \`sourceEnd\`.
	 */
	moveRangeToIndex(
		destinationGap: number,
		sourceStart: number,
		sourceEnd: number,
		source: ${typeName}<T>,
	): void;

	/**
	 * Returns a custom IterableIterator which throws usage errors if concurrent editing and iteration occurs.
	 */
	values(): IterableIterator<T>;
}`;
}

function uncapitalize(str: string): string {
	return str.charAt(0).toLowerCase() + str.slice(1);
}
