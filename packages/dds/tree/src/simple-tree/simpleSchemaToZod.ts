/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type {
	SimpleArrayNodeSchema,
	SimpleFieldSchema,
	SimpleLeafNodeSchema,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectNodeSchema,
	SimpleTreeSchema,
} from "./simpleSchema.js";
import  {type ZodType, z as Zod } from "zod";

// TODOs:
// - Throw an error when polymorphic schemas are ambiguous

interface ZodTreeSchema {
	readonly definitions: Record<string, ZodType>;
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * Generates a JSON schema representation from a simple tree schema.
 * @internal
 */
export function toZodSchema(schema: SimpleTreeSchema): ZodTreeSchema {
	const definitions = convertDefinitions(schema.definitions);

	return {
		definitions,
		allowedTypes: schema.allowedTypes,
	}
}

function convertDefinitions(
	definitions: ReadonlyMap<string, SimpleNodeSchema>,
): Record<string, Zod.Schema> {
	const result: Record<string, Zod.Schema> = {};
	for (const [key, value] of definitions) {
		result[key] = convertNodeSchema(value);
	}
	return result;
}

function convertNodeSchema(schema: SimpleNodeSchema, definitions: Record<string, Zod.Schema>): ZodType {
	switch (schema.kind) {
		case "array":
			return convertArrayNodeSchema(schema);
		case "leaf":
			return convertLeafNodeSchema(schema);
		case "map":
			return convertMapNodeSchema(schema);
		case "object":
			return convertObjectNodeSchema(schema);
		default:
			throw new TypeError(`Unknown node schema kind: ${(schema as SimpleNodeSchema).kind}`);
	}
}

function convertFieldSchema(schema: SimpleFieldSchema, definitions: Record<string, Zod.Schema>): ZodType {
	const mappedAllowedTypes = [...schema.allowedTypes].map((schemaIdentifier) => {
		return Zod.lazy(() => definitions[schemaIdentifier]);
	});

	assert(mappedAllowedTypes.length > 0);
	const mappedFieldChild = mappedAllowedTypes.length === 1 ? mappedAllowedTypes[0] : Zod.union(mappedAllowedTypes);

	switch(schema.kind) {
		case "required":
		case "identifier":
			return mappedFieldChild;
		case "optional":
			return Zod.optional(mappedFieldChild);
	}
}

function convertArrayNodeSchema(schema: SimpleArrayNodeSchema): ZodType {
	// const allowedTypes: JsonDefinitionRef[] = [];
	// schema.allowedTypes.forEach((type) => {
	// 	allowedTypes.push(createRefNode(type));
	// });
	// return {
	// 	type: "array",
	// 	kind: "array",
	// 	items: {
	// 		anyOf: allowedTypes,
	// 	},
	// };
}

function convertLeafNodeSchema(schema: SimpleLeafNodeSchema): ZodType {
	if (schema.type === "fluid-handle") {
		throw new Error("Fluid handles are not yet round-trip supported via JSON schema.");
	}

	switch (schema.type) {
		case "string":
			return Zod.string();
		case "number":
			return Zod.number();
		case "boolean":
			return Zod.boolean();
		case "null":
			return Zod.null();
		default:
			unreachableCase(schema.type);
	}
}

function convertObjectNodeSchema(schema: SimpleObjectNodeSchema): ZodType {
	const properties: Record<string, ZodType> = {};
	// const required: string[] = [];
	for (const [key, value] of Object.entries(schema.fields)) {
		for (const allowedType of value.allowedTypes) {
			properties[key] = convertField
		}

	// 	properties[key] = {
	// 		anyOf,
	// 	};
	// 	if (value.kind === "required") {
	// 		required.push(key);
	// 	}
	// }
	// return {
	// 	type: "object",
	// 	kind: "object",
	// 	properties,
	// 	required,
	// 	additionalProperties: false, // TODO: get allowance from schema policy
	// };
}

function convertMapNodeSchema(schema: SimpleMapNodeSchema): ZodType {
	throw new Error("Map nodes are not yet round-trip supported via Zod schema.");
	// const allowedTypes: JsonDefinitionRef[] = [];
	// schema.allowedTypes.forEach((type) => {
	// 	allowedTypes.push(createRefNode(type));
	// });
	// return {
	// 	type: "object",
	// 	kind: "map",
	// 	patternProperties: {
	// 		"^(.*)+$": {
	// 			anyOf: allowedTypes,
	// 		},
	// 	},
	// };
}
