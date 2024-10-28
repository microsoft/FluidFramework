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
	getSimpleSchema,
	Tree,
	type TreeNode,
} from "@fluidframework/tree/internal";
// eslint-disable-next-line import/no-internal-modules
import { createZodJsonValidator } from "typechat/zod";

import {
	objectIdKey,
	type ObjectTarget,
	type TreeEdit,
	type TreeEditValue,
	type Range,
} from "./agentEditTypes.js";
import type { IdGenerator } from "./idGenerator.js";
import { generateGenericEditTypes } from "./typeGeneration.js";
import { fail } from "./utils.js";

/**
 *
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
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				idGenerator.getId(value) ?? fail("ID of new node should have been assigned.");
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
export function getPlanningSystemPrompt<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
	treeNode: TreeNode,
	userPrompt: string,
	systemRoleContext?: string,
): string {
	const isRootNode = Tree.parent(treeNode) === undefined;
	const schema = isRootNode
		? normalizeFieldSchema(view.schema)
		: normalizeFieldSchema(Tree.schema(treeNode));

	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema.allowedTypes));
	const role = `I'm an agent who makes plans for another agent to achieve a user-specified goal to update the state of an application.${
		systemRoleContext === undefined
			? ""
			: `
			The other agent follows this guidance: ${systemRoleContext}`
	}`;

	const systemPrompt = `
	${role}
	The application state tree is a JSON object with the following schema: ${promptFriendlySchema}
	The current state is: ${JSON.stringify(treeNode)}.
	The user requested that I accomplish the following goal:
	"${userPrompt}"
	I've made a plan to accomplish this goal by doing a sequence of edits to the tree.
	Edits can include setting the root, inserting, modifying, removing, or moving elements in the tree.
	Here is my plan:`;

	return systemPrompt;
}

/**
 * TBD
 */
export function getEditingSystemPrompt<TSchema extends ImplicitFieldSchema>(
	userPrompt: string,
	idGenerator: IdGenerator,
	view: TreeView<TSchema>,
	treeNode: TreeNode,
	log: EditLog,
	appGuidance?: string,
	plan?: string,
): string {
	const isRootNode = Tree.parent(treeNode) === undefined;
	const schema = isRootNode
		? normalizeFieldSchema(view.schema)
		: normalizeFieldSchema(Tree.schema(treeNode));
	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema.allowedTypes));
	const decoratedTreeJson = toDecoratedJson(idGenerator, treeNode);

	function createEditList(edits: EditLog): string {
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

	const role = `You are a collaborative agent who interacts with a JSON tree by performing edits to achieve a user-specified goal.${
		appGuidance === undefined
			? ""
			: `
			The application that owns the JSON tree has the following guidance about your role: ${appGuidance}`
	}`;

	const treeSchemaString = createZodJsonValidator(
		...generateGenericEditTypes(getSimpleSchema(schema), false),
	).getSchemaText();

	// TODO: security: user prompt in system prompt
	const systemPrompt = `
	${role}
	Edits are JSON objects that conform to the following schema.
	The top level object you produce is an "EditWrapper" object which contains one of "SetRoot", "Insert", "Modify", "Remove", "Move", or null.
	${treeSchemaString}
	The tree is a JSON object with the following schema: ${promptFriendlySchema}
	${plan === undefined ? "" : `You have made a plan to accomplish the user's goal. The plan is: "${plan}". You will perform one or more edits that correspond to that plan to accomplish the goal.`}
	${
		log.length === 0
			? ""
			: `You have already performed the following edits:
			${createEditList(log)}
			This means that the current state of the tree reflects these changes.`
	}
	The current state of the tree is: ${decoratedTreeJson}.
	${log.length > 0 ? "Before you made the above edits t" : "T"}he user requested you accomplish the following goal:
	"${userPrompt}"
	If the goal is now completed or is impossible, you should return null.
	Otherwise, you should create an edit that makes progress towards the goal. It should have an English description ("explanation") of which edit to perform (specifying one of the allowed edit types).`;
	return systemPrompt;
}

/**
 * TBD
 */
export function getReviewSystemPrompt<TSchema extends ImplicitFieldSchema>(
	userPrompt: string,
	idGenerator: IdGenerator,
	view: TreeView<TSchema>,
	treeNode: TreeNode,
	originalDecoratedJson: string,
	appGuidance?: string,
): string {
	const isRootNode = Tree.parent(treeNode) === undefined;
	const schema = isRootNode
		? normalizeFieldSchema(view.schema)
		: normalizeFieldSchema(Tree.schema(treeNode));
	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema.allowedTypes));
	const decoratedTreeJson = toDecoratedJson(idGenerator, treeNode);

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

function printContent(content: TreeEditValue, idGenerator: IdGenerator): string {
	switch (typeof content) {
		case "boolean":
			return content ? "true" : "false";
		case "number":
			return content.toString();
		case "string":
			return `"${truncateString(content, 32)}"`;
		case "object": {
			if (Array.isArray(content)) {
				// TODO: Describe the types of the array contents
				return "a new array";
			}
			if (content === null) {
				return "null";
			}
			const id = content[objectIdKey];
			assert(typeof id === "string", "Object content has no id.");
			const node = idGenerator.getNode(id) ?? fail("Node not found.");
			const schema = Tree.schema(node);
			return `a new ${getFriendlySchemaName(schema.identifier)}`;
		}
		default:
			fail("Unexpected content type.");
	}
}

/**
 * TBD
 */
export function describeEdit(edit: TreeEdit, idGenerator: IdGenerator): string {
	switch (edit.type) {
		case "setRoot":
			return `Set the root of the tree to ${printContent(edit.content, idGenerator)}.`;
		case "insert": {
			if (edit.destination.type === "arrayPlace") {
				return `Insert ${printContent(edit.content, idGenerator)} at the ${edit.destination.location} of the array that is under the "${edit.destination.field}" property of ${edit.destination.parentId}.`;
			} else {
				const target =
					idGenerator.getNode(edit.destination.target) ?? fail("Target node not found.");
				const array = Tree.parent(target) ?? fail("Target node has no parent.");
				const container = Tree.parent(array);
				if (container === undefined) {
					return `Insert ${printContent(edit.content, idGenerator)} into the array at the root of the tree. Insert it ${edit.destination.place} ${edit.destination.target}.`;
				}
				return `Insert ${printContent(edit.content, idGenerator)} into the array that is under the "${Tree.key(array)}" property of ${idGenerator.getId(container)}. Insert it ${edit.destination.place} ${edit.destination.target}.`;
			}
		}
		case "modify":
			return `Set the "${edit.field}" field of ${edit.target.target} to ${printContent(edit.modification, idGenerator)}.`;
		case "remove":
			return isObjectTarget(edit.source)
				? `Remove "${edit.source.target}" from the containing array.`
				: `Remove all elements from ${edit.source.from.place} ${edit.source.from.target} to ${edit.source.to.place} ${edit.source.to.target} in their containing array.`;
		case "move":
			if (edit.destination.type === "arrayPlace") {
				const suffix = `to the ${edit.destination.location} of the array that is under the "${edit.destination.field}" property of ${edit.destination.parentId}`;
				return isObjectTarget(edit.source)
					? `Move ${edit.source.target} ${suffix}.`
					: `Move all elements from ${edit.source.from.place} ${edit.source.from.target} to ${edit.source.to.place} ${edit.source.to.target} ${suffix}.`;
			} else {
				const suffix = `to ${edit.destination.place} ${edit.destination.target}`;
				return isObjectTarget(edit.source)
					? `Move ${edit.source.target} ${suffix}.`
					: `Move all elements from ${edit.source.from.place} ${edit.source.from.target} to ${edit.source.to.place} ${edit.source.to.target} ${suffix}.`;
			}
		default:
			return "Unknown edit type.";
	}
}

function isObjectTarget(value: ObjectTarget | Range): value is ObjectTarget {
	return (value as Partial<ObjectTarget>).target !== undefined;
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

/**
 * TBD
 */
export function getFriendlySchemaName(schemaName: string): string {
	const matches = schemaName.match(/[^.]+$/);
	if (matches === null) {
		// empty scope
		return schemaName;
	}
	return matches[0];
}

function truncateString(str: string, maxLength: number): string {
	if (str.length > maxLength) {
		// eslint-disable-next-line unicorn/prefer-string-slice
		return `${str.substring(0, maxLength - 3)}...`;
	}
	return str;
}
