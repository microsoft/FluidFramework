/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SimpleNodeSchemaKind } from "./simpleSchema.js";

// TODOs:
// - Type-assertions to guarantee JSON schema correctness.

/**
 * The fully-qualified {@link TreeNodeSchemaCore.identifier}.
 * @example Schema `com.myapp.foo` would be referenced via `#/definitions/com.myapp.foo`.
 * @internal
 */
export type JsonSchemaId = string;

/**
 * Reference string pointing to a definition in the schema.
 * Should be the fully-qualified {@link TreeNodeSchemaCore.identifier}.
 * @remarks Of the form `#/definitions/<schema-identifier>`, where the `schema-identifier` is the fully-qualified {@link TreeNodeSchemaCore.identifier}.
 * @example Schema `com.myapp.foo` would be referenced via `#/definitions/com.myapp.foo`.
 * @internal
 */
export type JsonRefPath = `#/definitions/${JsonSchemaId}`;

/**
 * @internal
 */
export type JsonSchemaType = "object" | "array" | JsonLeafSchemaType;

/**
 * @internal
 */
export type JsonLeafSchemaType = "string" | "number" | "boolean" | "null";

/**
 * @internal
 */
export interface NodeJsonSchemaBase<
	TNodeKind extends SimpleNodeSchemaKind,
	TJsonSchemaType extends JsonSchemaType,
> {
	// TODO: represent this differently to ensure no conflict with actual JSON schema
	readonly kind: TNodeKind;
	/**
	 * TODO
	 */
	readonly type: TJsonSchemaType;
}

/**
 * JSON Schema for an object node.
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 * @internal
 */
export interface ObjectNodeJsonSchema extends NodeJsonSchemaBase<"object", "object"> {
	/**
	 * Object fields.
	 * @remarks Required fields should have a corresponding entry in {@link ObjectNodeJsonSchema.required}.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-properties}.
	 */
	readonly properties: Record<string, FieldJsonSchema>;
	/**
	 * List of keys for required fields.
	 *
	 * @remarks
	 * Optional fields should not be included in this list.
	 * Each key specified must have an entry in {@link ObjectNodeJsonSchema.properties}.
	 *
	 * @see TODO
	 */
	readonly required?: string[];
	/**
	 * Whether or not additional properties (properties not specified by the schema) are allowed in objects of this type.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-additionalproperties}.
	 */
	readonly additionalProperties?: boolean;
}

/**
 * JSON Schema for an array node.
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 * @internal
 */
export interface ArrayNodeJsonSchema extends NodeJsonSchemaBase<"array", "array"> {
	/**
	 * The kinds of items allowed under the array.
	 * @remarks Always represented via references to {@link TreeJsonSchema.definitions}.
	 *
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-items}.
	 */
	readonly items: {
		/**
		 * The kinds of items allowed under the array.
		 * @remarks Always represented via references to {@link TreeJsonSchema.definitions}.
		 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-anyof}.
		 */
		anyOf: JsonSchemaRef[];
	};
}

/**
 * JSON Schema for a map node.
 * @remarks Special case for map nodes, which do not have a native JSON schema corollary.
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 * @internal
 */
export interface MapNodeJsonSchema extends NodeJsonSchemaBase<"map", "object"> {
	/**
	 * Used to control the types of properties that can appear in the "object" representation of the map.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-patternproperties}.
	 */
	readonly patternProperties: {
		// TODO: document this pattern
		"^(.*)+$": FieldJsonSchema;
	};
}

/**
 * JSON Schema for a leaf node.
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 * @internal
 */
export interface LeafNodeJsonSchema extends NodeJsonSchemaBase<"leaf", JsonLeafSchemaType> {
	/**
	 * Primitive type.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
	 */
	readonly type: JsonLeafSchemaType;
}

/**
 * Type entry containing a reference to a definition in the schema.
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-schema-references}.
 * @internal
 */
export interface JsonSchemaRef {
	/**
	 * Reference to a definition in the schema.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-direct-references-with-ref}.
	 */
	$ref: JsonRefPath;
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
	/**
	 * The kinds of items allowed under the array.
	 * @remarks Always represented via references to {@link TreeJsonSchema.definitions}.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-anyof}.
	 */
	readonly anyOf: JsonSchemaRef[];
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
