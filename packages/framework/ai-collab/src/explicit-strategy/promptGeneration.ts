/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	NodeKind,
	type ImplicitFieldSchema,
	type TreeFieldFromImplicitField,
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

import { objectIdKey, type TreeEdit } from "./agentEditTypes.js";
import type { IdGenerator } from "./idGenerator.js";
import { doesNodeContainArraySchema, generateGenericEditTypes } from "./typeGeneration.js";
import { fail } from "./utils.js";

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
				0xa7b /* Collision of object id property. */,
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
 * Generates a prompt designed to make an LLM produce a plan to edit the SharedTree to accomplish a user-specified goal.
 */
export function getPlanningSystemPrompt(
	treeNode: TreeNode,
	userPrompt: string,
	systemRoleContext?: string,
): string {
	const schema = Tree.schema(treeNode);

	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema));
	const role = `I'm an agent who makes plans for another agent to achieve a user-specified goal to update the state of an application.${
		systemRoleContext === undefined
			? ""
			: `
			The other agent follows this guidance: ${systemRoleContext}`
	}`;

	const editOptions = `modifying ${doesNodeContainArraySchema(treeNode) ? "as well as inserting, removing, or moving" : ""} elements in the tree`;

	const systemPrompt = `
	${role}
	The application state tree is a JSON object with the following schema: ${promptFriendlySchema}
	The current state is: ${JSON.stringify(treeNode)}.
	The user requested that I accomplish the following goal:
	"${userPrompt}"
	I've made a plan to accomplish this goal by doing a sequence of edits to the tree.
	Edits can include ${editOptions}.
	Here is my plan:`;

	return systemPrompt;
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
	userPrompt: string,
	idGenerator: IdGenerator,
	treeNode: TreeNode,
	log: EditLog,
	appGuidance?: string,
	plan?: string,
): string {
	const schema = Tree.schema(treeNode);
	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema));
	const decoratedTreeJson = toDecoratedJson(idGenerator, treeNode);

	const role = `You are a collaborative agent who interacts with a JSON tree by performing edits to achieve a user-specified goal.${
		appGuidance === undefined
			? ""
			: `\nThe application that owns the JSON tree has the following guidance about your role: "${appGuidance}".`
	}`;

	const treeSchemaString = createZodJsonValidator(
		...generateGenericEditTypes(getSimpleSchema(schema), false),
	).getSchemaText();

	const topLevelEditWrapperDescription = doesNodeContainArraySchema(treeNode)
		? `contains one of the following interfaces: "Modify", null or an array node only edit: "Insert", "Remove", "Move"`
		: `contains the interface "Modify" or null`;

	// TODO: security: user prompt in system prompt
	const systemPrompt = `
	${role}\nEdits are JSON objects that conform to the schema described below. The top-level object you produce for a given edit is an "EditWrapper" object which ${topLevelEditWrapperDescription}.
	\nHere are the schema definitions for an edit:\n${treeSchemaString}\n
	The tree is a JSON object with the following schema: ${promptFriendlySchema}
	${plan === undefined ? "" : `You have made a plan to accomplish the user's goal. The plan is: "${plan}". You will perform one or more edits that correspond to that plan to accomplish the goal.`}
	${
		log.length === 0
			? ""
			: `You have already performed the following edits:
			${createEditListHistoryPrompt(log)}
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
 * Generates a prompt designed to make an LLM review the edits it created and applied to a SharedTree based
 * on a user-specified goal. This prompt is designed to give the LLM's ability to correct for mistakes and improve the accuracy/fidelity of its final set of tree edits
 */
export function getReviewSystemPrompt(
	userPrompt: string,
	idGenerator: IdGenerator,
	treeNode: TreeNode,
	originalDecoratedJson: string,
	appGuidance?: string,
): string {
	const schema = Tree.schema(treeNode);
	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema));
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
 * Converts a fully-qualified SharedTree schema name to a single-word name for use in textual TypeScript-style types.
 *
 * @remarks
 * - TODO: Determine what to do with user-provided names that include periods (e.g. "Foo.Bar").
 * - TODO: Should probably ensure name starts with an uppercase character.
 */
export function getPromptFriendlyTreeSchema(jsonSchema: JsonTreeSchema): string {
	let stringifiedSchema = "";
	for (const [name, def] of Object.entries(jsonSchema.$defs)) {
		if (def.type !== "object" || def._treeNodeSchemaKind === NodeKind.Map) {
			continue;
		}

		let stringifiedEntry = `interface ${getFriendlySchemaName(name)} {`;

		for (const [fieldName, fieldSchema] of Object.entries(def.properties)) {
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
		}

		stringifiedEntry += " }";

		stringifiedSchema += (stringifiedSchema === "" ? "" : " ") + stringifiedEntry;
	}
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
	for (const ref of refList) {
		typeNames.push(getTypeString(defs, [ref.$ref, getDef(defs, ref.$ref)]));
	}
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
	assert(nextDef !== undefined, 0xa7c /* Ref not found. */);
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
