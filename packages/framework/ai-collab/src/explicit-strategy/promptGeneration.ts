/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	NodeKind,
	normalizeFieldSchema,
	type ImplicitFieldSchema,
	type TreeFieldFromImplicitField,
	type TreeView,
	getJsonSchema,
	type JsonFieldSchema,
	type JsonNodeSchema,
	type JsonSchemaRef,
	type JsonTreeSchema,
	type TreeNode,
} from "@fluidframework/tree/internal";

import { objectIdKey, type TreeEdit } from "./agentEditTypes.js";
import { IdGenerator } from "./idGenerator.js";
import { fail } from "./utils.js";

/**
 * The log of edits produced by an LLM that have been performed on the Shared tree.
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
	const stringified: string = JSON.stringify(root, (_, value) => {
		if (typeof value === "object" && !Array.isArray(value) && value !== null) {
			// TODO: SharedTree Team needs to either publish TreeNode as a class to use .instanceof() or a typeguard.
			// Uncomment this assertion back once we have a typeguard ready.
			// assert(isTreeNode(node), "Non-TreeNode value in tree.");
			const objId =
				idGenerator.getId(value as TreeNode) ??
				fail("ID of new node should have been assigned.");
			assert(
				!Object.prototype.hasOwnProperty.call(value, objectIdKey),
				`Collision of object id property.`,
			);
			return {
				[objectIdKey]: objId,
				...value,
			} as unknown;
		}
		return value as unknown;
	});
	return stringified;
}

/**
 * TBD
 */
export function getSuggestingSystemPrompt(
	view: TreeView<ImplicitFieldSchema>,
	suggestionCount: number,
	userGuidance?: string,
): string {
	const schema = normalizeFieldSchema(view.schema);
	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema.allowedTypes));
	const decoratedTreeJson = toDecoratedJson(new IdGenerator(), view.root);
	const guidance =
		userGuidance === undefined
			? ""
			: `Additionally, the user has provided some guidance to help you refine your suggestions. Here is that guidance: ${userGuidance}`;

	// TODO: security: user prompt in system prompt
	return `
	You are a collaborative agent who suggests possible changes to a JSON tree that follows a specific schema.
	For example, for a schema of a digital whiteboard application, you might suggest things like "Change the color of all sticky notes to blue" or "Align all the handwritten text vertically".
	Or, for a schema of a calendar application, you might suggest things like "Move the meeting with Alice to 3pm" or "Add a new event called 'Lunch with Bob' on Friday".
	The tree that you are suggesting for is a JSON object with the following schema: ${promptFriendlySchema}
	The current state of the tree is: ${decoratedTreeJson}.
	${guidance}
	Please generate exactly ${suggestionCount} suggestions for changes to the tree that you think would be useful.`;
}

/**
 * Creates a prompt containing unique instructions necessary for the LLM to generate explicit edits to the Shared Tree
 */
export function getEditingSystemPrompt(
	userPrompt: string,
	idGenerator: IdGenerator,
	view: TreeView<ImplicitFieldSchema>,
	log: EditLog,
	appGuidance?: string,
): string {
	const schema = normalizeFieldSchema(view.schema);
	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema.allowedTypes));
	const decoratedTreeJson = toDecoratedJson(idGenerator, view.root);

	function createEditList(edits: EditLog): string {
		return edits
			.map((edit, index) => {
				const error =
					edit.error === undefined
						? ""
						: ` This edit produced an error, and was discarded. The error message was: ${edit.error}`;
				return `${index + 1}. ${JSON.stringify(edit.edit)}${error}`;
			})
			.join("\n");
	}

	const role = `You are a collaborative agent who interacts with a JSON tree by performing edits to achieve a user-specified goal.${
		appGuidance === undefined
			? ""
			: `
			The application that owns the JSON tree has the following guidance about your role: ${appGuidance}`
	}`;

	// TODO: security: user prompt in system prompt
	const systemPrompt = `
	${role}
	Edits are composed of the following primitives:
	- ObjectTarget: a reference to an object (as specified by objectId).
	- Place: either before or after a ObjectTarget (only makes sense for objects in arrays).
	- ArrayPlace: either the "start" or "end" of an array, as specified by a "parent" ObjectTarget and a "field" name under which the array is stored.
	- Range: a range of objects within the same array specified by a "start" and "end" Place. The range MUST be in the same array.
	- Selection: a ObjectTarget or a Range.
	The edits you may perform are:
	- SetRoot: replaces the tree with a specific value. This is useful for initializing the tree or replacing the state entirely if appropriate.
	- Insert: inserts a new object at a specific Place or ArrayPlace.
	- Modify: sets a field on a specific ObjectTarget.
	- Remove: deletes a Selection from the tree.
	- Move: moves a Selection to a new Place or ArrayPlace.
	The tree is a JSON object with the following schema: ${promptFriendlySchema}
	${
		log.length === 0
			? ""
			: `You have already performed the following edits:
			${createEditList(log)}
			This means that the current state of the tree reflects these changes.`
	}
	The current state of the tree is: ${decoratedTreeJson}.
	Before you made the above edits, the user requested you accomplish the following goal:
	${userPrompt}
	If the goal is now completed, you should return null.
	Otherwise, you should create an edit that makes progress towards the goal. It should have an english description ("explanation") of what edit to perform (specifying one of the allowed edit types).`;
	return systemPrompt;
}

/**
 * Creates a prompt asking the LLM to confirm whether the edits it has performed has successfully accomplished the user's goal.
 * @remarks This is a form of self-assessment for the LLM to evaluate its work for correctness.
 */
export function getReviewSystemPrompt(
	userPrompt: string,
	idGenerator: IdGenerator,
	view: TreeView<ImplicitFieldSchema>,
	originalDecoratedJson: string,
	appGuidance?: string,
): string {
	const schema = normalizeFieldSchema(view.schema);
	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema.allowedTypes));
	const decoratedTreeJson = toDecoratedJson(idGenerator, view.root);

	const role = `You are a collaborative agent who interacts with a JSON tree by performing edits to achieve a user-specified goal.${
		appGuidance === undefined
			? ""
			: `
			The application that owns the JSON tree has the following guidance: ${appGuidance}`
	}`;

	// TODO: security: user prompt in system prompt
	const systemPrompt = `
	${role}
	You have performed a number of actions already to accomplish a user request.
	You must review the resulting state to determine if the actions you performed successfully accomplished the user's goal.
	The tree is a JSON object with the following schema: ${promptFriendlySchema}
	The state of the tree BEFORE changes was: ${originalDecoratedJson}.
	The state of the tree AFTER changes is: ${decoratedTreeJson}.
	The user requested that the following goal should be accomplished:
	${userPrompt}
	Was the goal accomplished?`;
	return systemPrompt;
}

/**
 * TBD
 */
export function getPromptFriendlyTreeSchema(jsonSchema: JsonTreeSchema): string {
	let stringifiedSchema = "";
	Object.entries(jsonSchema.$defs).forEach(([name, def]) => {
		if (def.type !== "object" || def._treeNodeSchemaKind === NodeKind.Map) {
			return;
		}

		let stringifiedEntry = `interface ${getFriendlySchemaName(name)} {`;

		Object.entries(def.properties).forEach(([fieldName, fieldSchema]) => {
			let typeString: string;
			if (isJsonSchemaRef(fieldSchema)) {
				const nextFieldName = fieldSchema.$ref;
				const nextDef = getDef(jsonSchema.$defs, nextFieldName);
				typeString = `${getTypeString(jsonSchema.$defs, [nextFieldName, nextDef])}`;
			} else {
				typeString = `${getAnyOfTypeString(jsonSchema.$defs, fieldSchema.anyOf, true)}`;
			}
			if (def.required && !def.required.includes(fieldName)) {
				typeString = `${typeString} | undefined`;
			}
			stringifiedEntry += ` ${fieldName}: ${typeString};`;
		});

		stringifiedEntry += " }";

		stringifiedSchema += (stringifiedSchema === "" ? "" : " ") + stringifiedEntry;
	});
	return stringifiedSchema;
}

function getTypeString(
	defs: Record<string, JsonNodeSchema>,
	[name, currentDef]: [string, JsonNodeSchema],
): string {
	const { _treeNodeSchemaKind } = currentDef;
	if (_treeNodeSchemaKind === NodeKind.Leaf) {
		return currentDef.type;
	}
	if (_treeNodeSchemaKind === NodeKind.Object) {
		return getFriendlySchemaName(name);
	}
	if (_treeNodeSchemaKind === NodeKind.Array) {
		const items = currentDef.items;
		const innerType = isJsonSchemaRef(items)
			? getTypeString(defs, [items.$ref, getDef(defs, items.$ref)])
			: getAnyOfTypeString(defs, items.anyOf);
		return `${innerType}[]`;
	}
	fail("Non-object, non-leaf, non-array schema type.");
}

function getAnyOfTypeString(
	defs: Record<string, JsonNodeSchema>,
	refList: JsonSchemaRef[],
	topLevel = false,
): string {
	const typeNames: string[] = [];
	refList.forEach((ref) => {
		typeNames.push(getTypeString(defs, [ref.$ref, getDef(defs, ref.$ref)]));
	});
	const typeString = typeNames.join(" | ");
	return topLevel ? typeString : `(${typeString})`;
}

function isJsonSchemaRef(field: JsonFieldSchema): field is JsonSchemaRef {
	return (field as JsonSchemaRef).$ref !== undefined;
}

function getDef(defs: Record<string, JsonNodeSchema>, ref: string): JsonNodeSchema {
	// strip the "#/$defs/" prefix
	const strippedRef = ref.slice(8);
	const nextDef = defs[strippedRef];
	assert(nextDef !== undefined, "Ref not found.");
	return nextDef;
}

function getFriendlySchemaName(schemaName: string): string {
	const matches = schemaName.match(/[^.]+$/);
	if (matches === null) {
		// empty scope
		return schemaName;
	}
	return matches[0];
}
