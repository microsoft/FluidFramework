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
import { type ZodLazy, type ZodType, type ZodTypeAny, z as Zod } from "zod";
import { fail } from "../util/index.js";

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
	for (const [key, value] of definitions) {
		result.set(
			key,
			convertNodeSchema(value, (_childKey) =>
				Zod.lazy(() => {
					const childSchema = result.get(_childKey);
					if (childSchema === undefined) {
						fail(`No child schema definition created for "${_childKey}".`);
					}
					return childSchema;
				}),
			),
		);
	}
	return result;
}

function convertNodeSchema(
	schema: SimpleNodeSchema,
	getChildSchema: (key: string) => ZodLazy<ZodType>,
): ZodType {
	switch (schema.kind) {
		case "array":
			return convertArrayNodeSchema(schema, getChildSchema);
		case "leaf":
			return convertLeafNodeSchema(schema);
		case "map":
			return convertMapNodeSchema(schema, getChildSchema);
		case "object":
			return convertObjectNodeSchema(schema, getChildSchema);
		default:
			throw new TypeError(`Unknown node schema kind: ${(schema as SimpleNodeSchema).kind}`);
	}
}

function mapChildTypes(
	allowedTypes: ReadonlySet<string>,
	getChildSchema: (key: string) => ZodLazy<ZodType>,
): ZodType {
	const mappedAllowedTypes = [...allowedTypes].map(getChildSchema);
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
	getChildSchema: (key: string) => ZodLazy<ZodType>,
): ZodType {
	const childSchema = mapChildTypes(schema.allowedTypes, getChildSchema);

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
	getChildSchema: (key: string) => ZodLazy<ZodType>,
): ZodType {
	const childSchema = mapChildTypes(schema.allowedTypes, getChildSchema);
	return Zod.array(childSchema);
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

function convertObjectNodeSchema(
	schema: SimpleObjectNodeSchema,
	getChildSchema: (key: string) => ZodLazy<ZodType>,
): ZodType {
	const properties: Record<string, ZodType> = {};
	for (const [key, value] of Object.entries(schema.fields)) {
		properties[key] = convertFieldSchema(value, getChildSchema);
	}

	return Zod.object(properties);
}

function convertMapNodeSchema(
	schema: SimpleMapNodeSchema,
	getChildSchema: (key: string) => ZodLazy<ZodType>,
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
