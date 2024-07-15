/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type {
	ArrayNodeJsonSchema,
	FieldJsonSchema,
	JsonDefinitionRef,
	JsonSchemaId,
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

/**
 * Generates a JSON schema representation from a simple tree schema.
 * @internal
 */
export function toJsonSchema(schema: SimpleTreeSchema): TreeJsonSchema {
	const definitions = convertDefinitions(schema.definitions);

	const anyOf: JsonDefinitionRef[] = [];
	for (const allowedType of schema.allowedTypes) {
		anyOf.push(createRefNode(allowedType));
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
	const allowedTypes: JsonDefinitionRef[] = [];
	schema.allowedTypes.forEach((type) => {
		allowedTypes.push(createRefNode(type));
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
	return {
		type: schema.type,
		kind: "leaf",
	};
}

function convertObjectNodeSchema(schema: SimpleObjectNodeSchema): ObjectNodeJsonSchema {
	const properties: Record<string, FieldJsonSchema> = {};
	const required: string[] = [];
	for (const [key, value] of Object.entries(schema.fields)) {
		const anyOf: JsonDefinitionRef[] = [];
		for (const allowedType of value.allowedTypes) {
			anyOf.push(createRefNode(allowedType));
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
	const allowedTypes: JsonDefinitionRef[] = [];
	schema.allowedTypes.forEach((type) => {
		allowedTypes.push(createRefNode(type));
	});
	return {
		type: "object",
		kind: "map",
		patternProperties: {
			"^(.*)+$": {
				anyOf: allowedTypes,
			},
		},
	};
}

function createRefNode(schemaId: string): JsonDefinitionRef {
	return {
		"$ref": createRefString(schemaId),
	};
}

function createRefString(schemaId: string): JsonSchemaId {
	return `#/definitions/${schemaId}`;
}
