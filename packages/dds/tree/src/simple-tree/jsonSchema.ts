/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type {
	SimpleArrayNodeSchema,
	SimpleLeafNodeSchema,
	SimpleLeafSchemaKind,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleNodeSchemaKind,
	SimpleObjectNodeSchema,
	SimpleTreeSchema,
} from "./simpleSchema.js";

// TODOs:
// "ajv" library for at least testing, maybe type defs as well.

/**
 * TODO: document expected format.
 * @internal
 */
export type JsonSchemaId = string;

/**
 * @internal
 */
export type JsonSchemaType = "object" | "array" | SimpleLeafSchemaKind;

/**
 * @internal
 */
export interface NodeJsonSchemaBase<
	TNodeKind extends SimpleNodeSchemaKind,
	TJsonSchemaType extends JsonSchemaType,
> {
	// TODO: represent this differently to ensure no conflict with actual JSON schema
	readonly kind: TNodeKind;
	// json schema
	readonly type: TJsonSchemaType;
}

/**
 * @internal
 */
export interface ObjectNodeJsonSchema extends NodeJsonSchemaBase<"object", "object"> {
	// json schema
	// Always refs to "definitions"
	readonly properties: Record<string, FieldJsonSchema>;
	// json schema
	// Default: all are optional
	readonly required?: string[];
	// json schema
	// default: false?
	readonly additionalProperties?: boolean;
}

/**
 * @internal
 */
export interface ArrayNodeJsonSchema extends NodeJsonSchemaBase<"array", "array"> {
	// json schema
	// Always refs to "definitions"
	readonly items: {
		anyOf: JsonDefinitionRef[];
	};
}

/**
 * @remarks Special case for map nodes, which do not have a native JSON schema corollary.
 * @internal
 */
export interface MapNodeJsonSchema extends NodeJsonSchemaBase<"map", "object"> {
	// json schema
	// Used to control the types of properties that can appear in the "object" representation of the map
	// Always refs to "definitions"
	readonly patternProperties: {
		"^(.*)+$": FieldJsonSchema;
	};
}

/**
 * @internal
 */
export interface LeafNodeJsonSchema extends NodeJsonSchemaBase<"leaf", SimpleLeafSchemaKind> {
	readonly type: SimpleLeafSchemaKind;
}

/**
 * @internal
 */
export interface JsonDefinitionRef {
	$ref: JsonSchemaId;
}

/**
 * @internal
 */
export type NodeJsonSchema =
	| LeafNodeJsonSchema
	| MapNodeJsonSchema
	| ArrayNodeJsonSchema
	| ObjectNodeJsonSchema;

/**
 * TODO
 * @internal
 */
export interface FieldJsonSchema {
	// json schema
	readonly anyOf: JsonDefinitionRef[];
}

/**
 * TODO
 * @internal
 */
export interface TreeJsonSchema extends FieldJsonSchema {
	// json schema
	readonly definitions: Record<JsonSchemaId, NodeJsonSchema>;
}

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
