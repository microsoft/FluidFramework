/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SimpleNodeSchemaKind } from "./simpleSchema.js";

/**
 * TODO: document expected format.
 * @internal
 */
export type JsonSchemaId = string;

/**
 * @internal
 */
export type JsonSchemaType = "object" | "array" | JsonLeafSchemaType ;


/**
 * @internal
 */
export type JsonLeafSchemaType = "string" | "number" | "boolean" | "null" ;

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
export interface LeafNodeJsonSchema extends NodeJsonSchemaBase<"leaf", JsonLeafSchemaType> {
	readonly type: JsonLeafSchemaType;
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
	// TODO
	// json schema
	// $schema: "http://json-schema.org/draft-07/schema#",
	// json schema
	readonly definitions: Record<JsonSchemaId, NodeJsonSchema>;
}
