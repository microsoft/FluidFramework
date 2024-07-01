/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { SimpleArrayNodeSchema, SimpleLeafNodeSchema, SimpleLeafSchemaKind, SimpleMapNodeSchema, SimpleNodeSchema, SimpleNodeSchemaKind, SimpleObjectNodeSchema, SimpleTreeSchema } from "./simpleSchema.js";

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
export interface NodeJsonSchemaBase<TNodeKind extends SimpleNodeSchemaKind, TJsonSchemaType extends JsonSchemaType> {
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
	readonly properties: Record<string, JsonDefinitionRef>;
	// json schema
	readonly required: string[];
	// json schema
	// TODO: derive from policy
	readonly additionalProperties: boolean;
}

/**
 * @internal
 */
export interface ArrayNodeJsonSchema extends NodeJsonSchemaBase<"array", "array"> {
	// json schema
	// Always refs to "definitions"
	readonly items: JsonDefinitionRef[];
	// json schema
	readonly additionalProperties: false;
}

/**
 * @remarks Special case for map nodes, which do not have a native JSON schema corollary.
 * @internal
 */
export interface MapNodeJsonSchema extends NodeJsonSchemaBase<"map", "object"> {
	// json schema
	// Always refs to "definitions"
	readonly properties: Record<string, JsonDefinitionRef>;
	// json schema
	readonly additionalProperties: false;
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
export type TreeJsonSchema = ObjectNodeJsonSchema & {
	readonly definitions: Record<JsonSchemaId, NodeJsonSchema>;
}

export function simpleTreeSchemaToJsonSchema(tree: SimpleTreeSchema): TreeJsonSchema {
	const definitions = convertDefinitions(tree.definitions);
	const allowedTypes: JsonDefinitionRef[] = tree.rootFieldSchema.allowedTypes.map(type => ({ $ref: `#/definitions/${type}`}));
	return {
		definitions,
		properties: {

		}
	}
}

function convertDefinitions(definitions: ReadonlyMap<string, SimpleNodeSchema>): Record<string, JSONSchemaType<unknown>> {
	const result: Record<string, JSONSchemaType<unknown>> = {};
	for (const [key, value] of definitions) {
		result[key] = convertNodeSchema(value);
	}
	return result;
}

function convertNodeSchema(schema: SimpleNodeSchema): JSONSchemaType<unknown> {
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

function convertArrayNodeSchema(schema: SimpleArrayNodeSchema): JSONSchemaType<any> {
	const itemTypes = schema.allowedTypes.map(type => `#/definitions/${type}`);
	return {
		type: ["array"],
        items: {
          type: itemTypes
        },
	}
}

function convertLeafNodeSchema(schema: SimpleLeafNodeSchema): JSONSchemaType<unknown> {

}

function convertObjectNodeSchema(schema: SimpleObjectNodeSchema): JSONSchemaType<unknown> {

}

function convertMapNodeSchema(schema: SimpleMapNodeSchema): JSONSchemaType<unknown> {

}
