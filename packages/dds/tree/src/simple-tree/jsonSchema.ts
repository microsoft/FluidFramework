/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SimpleNodeSchemaKind } from "./simpleSchema.js";

/**
 * The fully-qualified {@link TreeNodeSchemaCore.identifier}.
 * @alpha
 */
export type JsonSchemaId = string;

/**
 * Reference string pointing to a definition in the schema.
 * Should be the fully-qualified {@link TreeNodeSchemaCore.identifier}.
 * @remarks Of the form `#/$defs/<schema-identifier>`, where the `schema-identifier` is the fully-qualified {@link TreeNodeSchemaCore.identifier}.
 * @example Schema `com.myapp.foo` would be referenced via `#/$defs/com.myapp.foo`.
 * @alpha
 */
export type JsonRefPath = `#/$defs/${JsonSchemaId}`;

/**
 * JSON entity type.
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 * @alpha
 */
export type JsonSchemaType = "object" | "array" | JsonLeafSchemaType;

/**
 * JSON primitive types.
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 * @alpha
 */
export type JsonLeafSchemaType = "string" | "number" | "boolean" | "null";

/**
 * Base interface for node schemas represented in {@link https://json-schema.org/draft/2020-12/json-schema-core | JSON Schema} format.
 * @alpha
 */
export interface NodeJsonSchemaBase<
	TNodeKind extends SimpleNodeSchemaKind,
	TJsonSchemaType extends JsonSchemaType,
> {
	/**
	 * Kind of {@link TreeNodeSchema} this JSON Schema entry represents.
	 *
	 * @remarks There is not a 1:1 mapping between {@link TreeNodeSchema} types and JSON Schema types.
	 * This is used to disambiguate the type of {@link TreeNodeSchema} this JSON Schema maps to.
	 *
	 * Note: This property name is not a part of the JSON Schema spec. This is a Fluid-specific extension.
	 */
	readonly _kind: TNodeKind;

	/**
	 * {@inheritDoc JsonSchemaType}
	 */
	readonly type: TJsonSchemaType;
}

/**
 * JSON Schema for an object node.
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 * @alpha
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
 * @alpha
 */
export interface ArrayNodeJsonSchema extends NodeJsonSchemaBase<"array", "array"> {
	/**
	 * The kinds of items allowed under the array.
	 * @remarks Always represented via references to {@link TreeJsonSchema.$defs}.
	 *
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-items}.
	 */
	readonly items: {
		/**
		 * The kinds of items allowed under the array.
		 * @remarks Always represented via references to {@link TreeJsonSchema.$defs}.
		 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-anyof}.
		 */
		anyOf: JsonSchemaRef[];
	};
}

/**
 * JSON Schema for a map node.
 * @remarks Special case for map nodes, which do not have a native JSON schema corollary.
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 * @alpha
 */
export interface MapNodeJsonSchema extends NodeJsonSchemaBase<"map", "object"> {
	/**
	 * Used to control the types of properties that can appear in the "object" representation of the map.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-patternproperties}.
	 */
	readonly patternProperties: {
		/**
		 * Types allowed in the map.
		 * @remarks This format allows for any (JSON-compliant) key, but restricts the allowed types to only those specified.
		 */
		"^.*$": FieldJsonSchema;
	};
}

/**
 * JSON Schema for a leaf node.
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 * @alpha
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
 * @alpha
 */
export interface JsonSchemaRef {
	/**
	 * Reference to a definition in the schema.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-direct-references-with-ref}.
	 */
	$ref: JsonRefPath;
}

/**
 * {@link https://json-schema.org/draft/2020-12/json-schema-core | JSON Schema} representation of a {@link TreeNodeSchema}.
 * @alpha
 */
export type NodeJsonSchema =
	| LeafNodeJsonSchema
	| MapNodeJsonSchema
	| ArrayNodeJsonSchema
	| ObjectNodeJsonSchema;

/**
 *{@link https://json-schema.org/draft/2020-12/json-schema-core | JSON Schema} representation of a {@link FieldSchema}.
 * @alpha
 */
export interface FieldJsonSchema {
	/**
	 * The kinds of items allowed under the field.
	 * @remarks Always represented via references to {@link TreeJsonSchema.$defs}.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-anyof}.
	 */
	readonly anyOf: JsonSchemaRef[];
}

/**
 * {@link https://json-schema.org/draft/2020-12/json-schema-core | JSON Schema} representation of a tree schema.
 *
 * @remarks
 * Includes the complete set of definitions reachable from the "root" schema.
 *
 * Note: This representation only uses a limited subset of supported JSON Schema features.
 * It is scoped to a format that can be used to sufficiently represent supported SharedTree schema.
 *
 * Also note that this schema format contains Fluid-specific extensions, such as the {@link NodeJsonSchemaBase._kind}
 * property, meaning that it is not a *strict* subset.
 * When using these schemas with validation tools (for example, {@link https://ajv.js.org/}), you will need to opt out
 * of *strict* validation to ensure extra properties are allowed.
 *
 * @privateRemarks
 * Extending JSON Schema is permitted by the spec.
 * See {@link https://json-schema.org/draft/2020-12/json-schema-core#name-extending-json-schema}.
 *
 * @alpha
 */
export interface TreeJsonSchema extends FieldJsonSchema {
	/**
	 * The set of definitions reachable from this schema's root.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-schema-re-use-with-defs}
	 */
	readonly $defs: Record<JsonSchemaId, NodeJsonSchema>;
}
