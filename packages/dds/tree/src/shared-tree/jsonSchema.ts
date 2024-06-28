/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SimpleLeafSchemaKind, SimpleNodeSchemaKind } from "./simpleSchema.js";

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
	readonly properties: Record<string, JsonSchemaId>;
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
	readonly items: JsonSchemaId[];
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
	readonly properties: Record<string, JsonSchemaId>;
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
export interface TreeJsonSchema {
	readonly rootSchema: NodeJsonSchema;
	readonly definitions: Record<JsonSchemaId, NodeJsonSchema>;
}
