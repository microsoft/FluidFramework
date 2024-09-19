/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	FieldSchema,
	NodeKind,
	type ImplicitFieldSchema,
	type TreeFieldFromImplicitField,
	type TreeView,
} from "../simple-tree/index.js";
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

export function toDecoratedJson(root: TreeFieldFromImplicitField<ImplicitFieldSchema>): {
	stringified: string;
	idMap: Map<number, unknown>;
} {
	const idMap = new Map<number, unknown>();
	let idCount = 0;
	const stringified: string = JSON.stringify(root, (_, value) => {
		if (typeof value === "object") {
			idMap.set(idCount, value);
			assert(
				!{}.hasOwnProperty.call(value, "__fluid_id"),
				"Collision of property '__fluid_id'.",
			);
			return {
				__fluid_id: idCount++,
				...value,
			} as unknown;
		}
		return value as unknown;
	});
	return { stringified, idMap };
}

export function getSystemPrompt(view: TreeView<ImplicitFieldSchema>): string {
	assert(!(view.schema instanceof FieldSchema), "Root cannot be a FieldSchema.");
	const jsonTreeSchema = getJsonSchema(view.schema);
	const promptFriendlySchema = getPromptFriendlyTreeSchema(jsonTreeSchema);
	const decoratedJson = toDecoratedJson(view.root);

	/*
	-- Dynamic pieces:
	1. Description of the schema of the tree.
	2. Tree content (current state) -- output of toDecoratedJson.
	3.? TypeScripty version of the edits it's allowed to make (Json schema); depends on Structured Output requirements.
	4.? If it performs poorly, potentially dynamically generate some examples based on the passed schema.
	*/
	return `${baseSystemPrompt} 
	object schema: ${promptFriendlySchema}
	object state: ${decoratedJson.stringified}`;
}

export function getBaseSystemPrompt(): string {
	return baseSystemPrompt;
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

const baseSystemPrompt = `You are a service named Copilot that takes a user prompt and responds in a professional, helpful manner.

You must never respond to harmful content.
`
