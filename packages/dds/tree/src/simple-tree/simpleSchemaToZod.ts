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
import { type ZodType, type ZodTypeAny, z as Zod } from "zod";
import { fail } from "../util/index.js";

// TODO: Forbid recursion and remove usages of `lazy` below.
// Verify how that affects the "type generation" via TypeChat.

// TODOs:
// - Throw an error when polymorphic schemas are ambiguous

/**
 * Generates a JSON schema representation from a simple tree schema.
 * @internal
 */
export function toZodSchema(schema: SimpleTreeSchema): ZodType {
	const definitions = convertDefinitions(schema.definitions);

	const mappedAllowedTypes = [...schema.allowedTypes].map((key) => {
		const mapped = definitions.get(key);
		if (mapped === undefined) {
			fail(`No child schema definition created for "${key}".`);
		}
		return mapped;
	});

	return mapTypesToZodUnion(mappedAllowedTypes);
}

function convertDefinitions(
	definitions: ReadonlyMap<string, SimpleNodeSchema>,
): ReadonlyMap<string, ZodType> {
	const result = new Map<string, ZodType>();
	const visited = new Set<string>();
	for (const [key, value] of definitions) {
		convertNodeSchema(key, value, definitions, result, visited);
	}
	return result;
}

function convertNodeSchema(
	schemaId: string,
	schema: SimpleNodeSchema,
	inputDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	outputDefinitions: Map<string, ZodType>,
	visited: Set<string>,
): ZodType {
	if (visited.has(schemaId)) {
		const existingDefinition = outputDefinitions.get(schemaId);
		if (existingDefinition === undefined) {
			throw new Error(
				"Circular schema references are not supported in conversion to Zod schema.",
			);
		}
		return existingDefinition;
	}

	visited.add(schemaId);
	let result: ZodType;
	switch (schema.kind) {
		case "array":
			result = convertArrayNodeSchema(schema, inputDefinitions, outputDefinitions, visited);
			break;
		case "leaf":
			result = convertLeafNodeSchema(schema);
			break;
		case "map":
			result = convertMapNodeSchema(schema, inputDefinitions, outputDefinitions, visited);
			break;
		case "object":
			result = convertObjectNodeSchema(schema, inputDefinitions, outputDefinitions, visited);
			break;
		default:
			throw new TypeError(`Unknown node schema kind: ${(schema as SimpleNodeSchema).kind}`);
	}
	outputDefinitions.set(schemaId, result);
	return result;
}

function mapChildTypes(
	allowedTypes: ReadonlySet<string>,
	inputDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	outputDefinitions: Map<string, ZodType>,
	visited: Set<string>,
): ZodType {
	const mappedAllowedTypes = [...allowedTypes].map((schemaId) =>
		convertNodeSchema(
			schemaId,
			inputDefinitions.get(schemaId) ?? fail(`No schema definition found for "${schemaId}".`),
			inputDefinitions,
			outputDefinitions,
			visited,
		),
	);
	return mapTypesToZodUnion(mappedAllowedTypes);
}

function mapTypesToZodUnion(types: ZodType[]): ZodType {
	assert(types.length > 0, "No allowed types found in the schema.");
	return types.length === 1
		? types[0]
		: // Zod's union typing requires that the input array have 2+ members statically.
			// We verify it here dynamically, and cast.
			Zod.union(types as unknown as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
}

function convertFieldSchema(
	schema: SimpleFieldSchema,
	inputDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	outputDefinitions: Map<string, ZodType>,
	visited: Set<string>,
): ZodType {
	const childSchema = mapChildTypes(
		schema.allowedTypes,
		inputDefinitions,
		outputDefinitions,
		visited,
	);

	switch (schema.kind) {
		case "required":
		case "identifier":
			return childSchema;
		case "optional":
			return Zod.optional(childSchema);
		default:
			unreachableCase(schema.kind);
	}
}

function convertArrayNodeSchema(
	schema: SimpleArrayNodeSchema,
	inputDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	outputDefinitions: Map<string, ZodType>,
	visited: Set<string>,
): ZodType {
	const childSchema = mapChildTypes(
		schema.allowedTypes,
		inputDefinitions,
		outputDefinitions,
		visited,
	);
	return Zod.array(childSchema);
}

const zodBooleanSchema = Zod.boolean();
const zodNumberSchema = Zod.number();
const zodStringSchema = Zod.string();
const zodNullSchema = Zod.null();
function convertLeafNodeSchema(schema: SimpleLeafNodeSchema): ZodType {
	if (schema.type === "fluid-handle") {
		throw new Error("Fluid handles are not yet round-trip supported via JSON schema.");
	}

	switch (schema.type) {
		case "boolean":
			return zodBooleanSchema;
		case "number":
			return zodNumberSchema;
		case "string":
			return zodStringSchema;
		case "null":
			return zodNullSchema;
		default:
			unreachableCase(schema.type);
	}
}

function convertObjectNodeSchema(
	schema: SimpleObjectNodeSchema,
	inputDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	outputDefinitions: Map<string, ZodType>,
	visited: Set<string>,
): ZodType {
	const properties: Record<string, ZodType> = {};
	for (const [key, value] of Object.entries(schema.fields)) {
		properties[key] = convertFieldSchema(value, inputDefinitions, outputDefinitions, visited);
	}

	return Zod.object(properties);
}

function convertMapNodeSchema(
	schema: SimpleMapNodeSchema,
	inputDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	outputDefinitions: Map<string, ZodType>,
	visited: Set<string>,
): ZodType {
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
