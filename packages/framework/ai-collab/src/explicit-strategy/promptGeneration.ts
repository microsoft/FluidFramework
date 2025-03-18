/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import {
	type ImplicitFieldSchema,
	type TreeFieldFromImplicitField,
	getSimpleSchema,
} from "@fluidframework/tree/internal";
// eslint-disable-next-line import/no-internal-modules
import { createZodJsonValidator } from "typechat/zod";

import {
	objectIdKey,
	typeField,
	type InsertIntoArray,
	type MoveArrayElement,
	type RemoveFromArray,
	type SetField,
	type TreeEdit,
} from "./agentEditTypes.js";
import type { IdGenerator } from "./idGenerator.js";
import { doesNodeContainArraySchema, generateEditTypesForPrompt } from "./typeGeneration.js";
import { fail, type View } from "./utils.js";

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
export function toDecoratedJson(
	idGenerator: IdGenerator,
	root: TreeFieldFromImplicitField<ImplicitFieldSchema>,
): string {
	idGenerator.assignIds(root);
	const stringified: string = JSON.stringify(
		root,
		(_, value) => {
			if (typeof value === "object" && !Array.isArray(value) && value !== null) {
				// TODO: SharedTree Team needs to either publish TreeNode as a class to use .instanceof() or a typeguard.
				// Uncomment this assertion back once we have a typeguard ready.
				// assert(isTreeNode(node), "Non-TreeNode value in tree.");
				const objId =
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					idGenerator.getId(value) ?? fail("ID of new node should have been assigned.");
				assert(
					!Object.prototype.hasOwnProperty.call(value, objectIdKey),
					0xa7b /* Collision of object id property. */,
				);
				return {
					[objectIdKey]: objId,
					...value,
				} as unknown;
			}
			return value as unknown;
		},
		2,
	);
	return stringified;
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
	view: View,
	idGenerator: IdGenerator,
	appGuidance?: string,
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
	const decoratedTreeJson = toDecoratedJson(idGenerator, view.root);

	const role = `You are a collaborative agent who interacts with a JSON tree by performing edits to achieve a user-specified goal.${
		appGuidance === undefined
			? ""
			: `\n\nThe application that owns the JSON tree has the following guidance about your role: \n\n${appGuidance}`
	}`;

	const treeSchemaString = createZodJsonValidator(editTypes, editRoot).getSchemaText();

	const setFieldType = "SetField" satisfies Capitalize<SetField["type"]>;
	const insertIntoArrayType = "InsertIntoArray" satisfies Capitalize<InsertIntoArray["type"]>;
	const topLevelEditWrapperDescription = doesNodeContainArraySchema(view.root)
		? `is one of the following interfaces: \`${setFieldType}\` for editing objects or one of \`${insertIntoArrayType}\`, \`${"RemoveFromArray" satisfies Capitalize<RemoveFromArray["type"]>}\`, \`${"MoveArrayElement" satisfies Capitalize<MoveArrayElement["type"]>}\` for editing arrays`
		: `is the interface \`${setFieldType}\``;

	const rootTypes = [...schema.allowedTypes];
	// TODO: security: user prompt in system prompt
	const systemPrompt = `${role}

Edits are JSON objects that conform to the schema described below. You produce an array of edits where each edit ${topLevelEditWrapperDescription}.
When creating new objects for \`${insertIntoArrayType}\` or \`${setFieldType}\`,
you may create an ID and put it in the \`${objectIdKey}\` property if you want to refer to the object in a later edit. For example, if you want to insert a new object into an array and (in a subsequent edit)
move another piece of content to after the newly inserted one, you can use the ID of the newly inserted object in the \`${"MoveArrayElement" satisfies Capitalize<MoveArrayElement["type"]>}\` edit.
For a \`${setFieldType}\` or \`${insertIntoArrayType}\` edit, you might insert an object into a location where it is ambiguous what the type of the object is from the data alone. In that case, supply the type in the \`${typeField}\` property of the object with a value that is the typescript type name of that object.

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
${decoratedTreeJson}.
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
// export function getFunctionSystemPrompt(
// 	idGenerator: IdGenerator,
// 	treeNode: TreeNode,
// 	appGuidance?: string,
// ): string {
// 	const schema = Tree.schema(treeNode);
// 	const decoratedTreeJson = toDecoratedJson(idGenerator, treeNode);

// 	const role = `You are a collaborative agent who edits a JSON tree to achieve a user-specified goal.${
// 		appGuidance === undefined
// 			? ""
// 			: `\nThe application that owns the JSON tree has the following guidance about your role: "${appGuidance}".`
// 	}`;

// 	// const treeSchemaString = createZodJsonValidator(
// 	// 	...generateGenericEditTypes(getSimpleSchema(schema), false),
// 	// ).getSchemaText();

// 	return `
// 	${role}
// 	The tree is a JSON object with the following schema: ${promptFriendlySchema}
// 	The current state of the tree is: ${decoratedTreeJson}.
// 	You should write a JavaScript function that mutates the tree object in order to accomplish the goal.
// 	Note that any arrays in the object are to be mutated in a different way than normal JavaScript arrays.
// 	Do not use any of the following methods: "copyWithin", "fill", "pop", "push", "reverse", "shift", "sort", "splice", or "unshift".
// 	Instead, use the following methods to do array mutations:

// 	`;
// }

/**
 * Converts a fully-qualified SharedTree schema name to a single-word name for use in textual TypeScript-style types.
 *
 * @remarks
 * - TODO: Determine what to do with user-provided names that include periods (e.g. "Foo.Bar").
 * - TODO: Should probably ensure name starts with an uppercase character.
 */
// export function getPromptFriendlyTreeSchema(jsonSchema: JsonTreeSchema): string {
// 	let stringifiedSchema = "";
// 	for (const [name, def] of Object.entries(jsonSchema.$defs)) {
// 		if (def.type !== "object" || def._treeNodeSchemaKind === NodeKind.Map) {
// 			continue;
// 		}

// 		let stringifiedEntry = `interface ${getFriendlySchemaName(name)} {`;

// 		for (const [fieldName, fieldSchema] of Object.entries(def.properties)) {
// 			let typeString: string;
// 			if (isJsonSchemaRef(fieldSchema)) {
// 				const nextFieldName = fieldSchema.$ref;
// 				const nextDef = getDef(jsonSchema.$defs, nextFieldName);
// 				typeString = `${getTypeString(jsonSchema.$defs, [nextFieldName, nextDef])}`;
// 			} else {
// 				typeString = `${getAnyOfTypeString(jsonSchema.$defs, fieldSchema.anyOf, true)}`;
// 			}
// 			if (def.required && !def.required.includes(fieldName)) {
// 				typeString = `${typeString} | undefined`;
// 			}
// 			stringifiedEntry += ` ${fieldName}: ${typeString};`;
// 		}

// 		stringifiedEntry += " }";

// 		stringifiedSchema += (stringifiedSchema === "" ? "" : " ") + stringifiedEntry;
// 	}
// 	return stringifiedSchema;
// }

// function getTypeString(
// 	defs: Record<string, JsonNodeSchema>,
// 	[name, currentDef]: [string, JsonNodeSchema],
// ): string {
// 	const { _treeNodeSchemaKind } = currentDef;
// 	if (_treeNodeSchemaKind === NodeKind.Leaf) {
// 		return currentDef.type;
// 	}
// 	if (_treeNodeSchemaKind === NodeKind.Object) {
// 		return getFriendlySchemaName(name);
// 	}
// 	if (_treeNodeSchemaKind === NodeKind.Array) {
// 		const items = currentDef.items;
// 		const innerType = isJsonSchemaRef(items)
// 			? getTypeString(defs, [items.$ref, getDef(defs, items.$ref)])
// 			: getAnyOfTypeString(defs, items.anyOf);
// 		return `${innerType}[]`;
// 	}
// 	fail("Non-object, non-leaf, non-array schema type.");
// }

// function getAnyOfTypeString(
// 	defs: Record<string, JsonNodeSchema>,
// 	refList: JsonSchemaRef[],
// 	topLevel = false,
// ): string {
// 	const typeNames: string[] = [];
// 	for (const ref of refList) {
// 		typeNames.push(getTypeString(defs, [ref.$ref, getDef(defs, ref.$ref)]));
// 	}
// 	const typeString = typeNames.join(" | ");
// 	return topLevel ? typeString : `(${typeString})`;
// }

// function isJsonSchemaRef(field: JsonFieldSchema): field is JsonSchemaRef {
// 	return (field as JsonSchemaRef).$ref !== undefined;
// }

// function getDef(defs: Record<string, JsonNodeSchema>, ref: string): JsonNodeSchema {
// 	// strip the "#/$defs/" prefix
// 	const strippedRef = ref.slice(8);
// 	const nextDef = defs[strippedRef];
// 	assert(nextDef !== undefined, 0xa7c /* Ref not found. */);
// 	return nextDef;
// }

/**
 * TBD
 */
export function getFriendlySchemaName(schemaName: string): string | undefined {
	// TODO: Kludge
	const arrayTypes = schemaName.match(/Array<\["(.*)"]>/);
	if (arrayTypes?.[1] !== undefined) {
		return undefined;
		// const types = arrayTypes[1].split(`","`);
		// if (types[0] !== undefined) {
		// 	return `${getFriendlySchemaName(types[0])}[]`;
		// }
		// return `(${types.map((type) => getFriendlySchemaName(type)).join(" | ")})[]`;
	}

	const matches = schemaName.match(/[^.]+$/);
	if (matches === null) {
		// empty scope
		return schemaName;
	}
	return matches[0];
}
