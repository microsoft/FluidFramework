/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type {
	ArrayNodeJsonSchema,
	FieldJsonSchema,
	JsonSchemaRef,
	JsonRefPath,
	LeafNodeJsonSchema,
	MapNodeJsonSchema,
	NodeJsonSchema,
	ObjectNodeJsonSchema,
	TreeJsonSchema,
} from "./jsonSchema.js";
import type {
	SimpleArrayNodeSchema,
	SimpleLeafNodeSchema,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectNodeSchema,
	SimpleTreeSchema,
} from "./simpleSchema.js";

// TODOs:
// - Throw an error when polymorphic schemas are ambiguous

/**
 * Generates a JSON schema representation from a simple tree schema.
 * @internal
 */
export function toJsonSchema(schema: SimpleTreeSchema): TreeJsonSchema {
	const definitions = convertDefinitions(schema.definitions);

	const anyOf: JsonSchemaRef[] = [];
	for (const allowedType of schema.allowedTypes) {
		anyOf.push(createSchemaRef(allowedType));
	}

	return {
		definitions,
		anyOf,
	};
}

function convertDefinitions(
	definitions: ReadonlyMap<string, SimpleNodeSchema>,
): Record<string, NodeJsonSchema> {
	const result: Record<string, NodeJsonSchema> = {};
	for (const [key, value] of definitions) {
		result[key] = convertNodeSchema(value);
	}
	return result;
}

function convertNodeSchema(schema: SimpleNodeSchema): NodeJsonSchema {
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

function convertArrayNodeSchema(schema: SimpleArrayNodeSchema): ArrayNodeJsonSchema {
	const allowedTypes: JsonSchemaRef[] = [];
	schema.allowedTypes.forEach((type) => {
		allowedTypes.push(createSchemaRef(type));
	});
	return {
		type: "array",
		kind: "array",
		items: {
			anyOf: allowedTypes,
		},
	};
}

function convertLeafNodeSchema(schema: SimpleLeafNodeSchema): LeafNodeJsonSchema {
	if (schema.type === "fluid-handle") {
		throw new Error("Fluid handles are not yet round-trip supported via JSON schema.");
	}

	return {
		type: schema.type,
		kind: "leaf",
	};
}

function convertObjectNodeSchema(schema: SimpleObjectNodeSchema): ObjectNodeJsonSchema {
	const properties: Record<string, FieldJsonSchema> = {};
	const required: string[] = [];
	for (const [key, value] of Object.entries(schema.fields)) {
		const anyOf: JsonSchemaRef[] = [];
		for (const allowedType of value.allowedTypes) {
			anyOf.push(createSchemaRef(allowedType));
		}

		properties[key] = {
			anyOf,
		};
		if (value.kind === "required") {
			required.push(key);
		}
	}
	return {
		type: "object",
		kind: "object",
		properties,
		required,
		additionalProperties: false, // TODO: get allowance from schema policy
	};
}

function convertMapNodeSchema(schema: SimpleMapNodeSchema): MapNodeJsonSchema {
	throw new Error("Map nodes are not yet round-trip supported via JSON schema.");

	// TODO: once map inputs can be simple records, we should be able to make this round-trip correctly.
	//
	// const allowedTypes: JsonDefinitionRef[] = [];
	// schema.allowedTypes.forEach((type) => {
	// 	allowedTypes.push(createRefNode(type));
	// });
	// return {
	// 	type: "object",
	// 	kind: "map",
	// 	patternProperties: {
	// 		"^.*$": {
	// 			anyOf: allowedTypes,
	// 		},
	// 	},
	// };
}

function createSchemaRef(schemaId: string): JsonSchemaRef {
	return {
		"$ref": createRefPath(schemaId),
	};
}

function createRefPath(schemaId: string): JsonRefPath {
	return `#/definitions/${schemaId}`;
}
