/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	NodeKind,
	normalizeFieldSchema,
	type ImplicitFieldSchema,
	type TreeArrayNode,
	type TreeFieldFromImplicitField,
	type TreeView,
} from "../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { TreeNode } from "../simple-tree/core/index.js";
import {
	getJsonSchema,
	type JsonFieldSchema,
	type JsonNodeSchema,
	type JsonSchemaRef,
	type JsonTreeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../simple-tree/api/index.js";
// eslint-disable-next-line import/no-internal-modules
import { fail } from "../util/utils.js";
import { objectIdKey, type TreeEdit } from "./agentEditTypes.js";
import { Tree } from "../shared-tree/index.js";

export function toDecoratedJson(
	idCount: { current: number },
	idToNode: Map<number, TreeNode>,
	nodeToId: Map<TreeNode, number>,
	root: TreeFieldFromImplicitField<ImplicitFieldSchema>,
): string {
	assignIds(root, idCount, idToNode, nodeToId);
	const stringified: string = JSON.stringify(root, (_, value) => {
		if (typeof value === "object" && !Array.isArray(value) && value !== null) {
			assert(value instanceof TreeNode, "Non-TreeNode value in tree.");
			const objId = nodeToId.get(value) ?? fail("ID of new node should have been assigned.");
			return {
				[objectIdKey]: objId,
				...value,
			} as unknown;
		}
		return value as unknown;
	});
	return stringified;
}

export function assignIds(
	node: unknown,
	idCount: { current: number },
	idToNode: Map<number, TreeNode>,
	nodeToId: Map<TreeNode, number>,
): number | undefined {
	if (typeof node === "object" && node !== null) {
		const schema = Tree.schema(node as unknown as TreeNode);
		if (schema.kind === NodeKind.Array) {
			(node as unknown as TreeArrayNode).forEach((element) => {
				assignIds(element, idCount, idToNode, nodeToId);
			});
		} else {
			assert(node instanceof TreeNode, "Non-TreeNode value in tree.");
			let objId = nodeToId.get(node);
			if (objId === undefined) {
				objId = idCount.current++;
			}
			idToNode.set(objId, node);
			nodeToId.set(node, objId);
			assert(!{}.hasOwnProperty.call(node, objectIdKey), `Collision of object id property.`);
			Object.keys(node).forEach((key) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assignIds((node as unknown as any)[key], idCount, idToNode, nodeToId);
			});
			return objId;
		}
	}
	return undefined;
}

export function getSystemPrompt(
	userPrompt: string,
	idCount: { current: number },
	idToNode: Map<number, TreeNode>,
	nodeToId: Map<TreeNode, number>,
	view: TreeView<ImplicitFieldSchema>,
	log: TreeEdit[],
): string {
	const schema = normalizeFieldSchema(view.schema);
	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema.allowedTypes));
	const decoratedTreeJson = toDecoratedJson(idCount, idToNode, nodeToId, view.root);

	function createEditList(edits: TreeEdit[]): string {
		return edits.map((edit, index) => `${index + 1}. ${JSON.stringify(edit)}`).join("\n");
	}

	// TODO: security: user prompt in system prompt
	const systemPrompt = `
	You are a collaborative agent who interacts with a tree by performing edits.
	You should make the minimum number of edits to the tree to achieve the desired outcome, and do it in as granular a way as possible to ensure good merge outcomes.
	Edits are made using the following primitives:
	- ObjectTarget: a reference to an object (as specified by objectId).
	- Place: either before or after a ObjectTarget (only makes sense for objects in arrays).
	- ArrayPlace: either the "start" or "end" of an array, as specified by a "parent" ObjectTarget and a "field" name under which the array is stored.
	- Selection: a ObjectTarget or a range of objects specified by a "start" and "end" Place.
	The allowed edits are:
	- SetRoot: sets the root to a specific value.
	- Insert: inserts a new object at a specific Place or ArrayPlace.
	- Modify: sets a field on a specific ObjectTarget.
	- Remove: deletes a Selection from the tree.
	- Move: moves a Selection to a new Place or ArrayPlace.
	The tree is a JSON object with the following schema: ${promptFriendlySchema}
	The current state of the tree is: ${decoratedTreeJson}.
	The user has requested that, after you have performed your series of actions, the following goal should be accomplished:
	${userPrompt}
	${
		log.length === 0
			? "You have not performed any actions to accomplish this goal yet."
			: `You have already performed the following actions to accomplish this goal thus far:
			${createEditList(log)}
			This means that the current state of the tree already reflects your prior changes being applied.`
	}
	You should produce one of the following things:
	1. An english description ("explanation") of the next edit to perform (using one of the allowed edit types) that makes progress towards accomplishing the user's request as well as a JSON object representing the edit you want to perform.
	2. null if the tree is now in the desired state or if the goal cannot be accomplished.`;
	return systemPrompt;
}

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
		const innerType = !isJsonSchemaRef(items)
			? getAnyOfTypeString(defs, items.anyOf)
			: getTypeString(defs, [items.$ref, getDef(defs, items.$ref)]);
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
