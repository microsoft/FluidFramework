/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NodeKind } from "../core/index.js";

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
 *
 * @sealed
 * @alpha
 */
export interface JsonNodeSchemaBase<
	TNodeKind extends NodeKind,
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
	readonly _treeNodeSchemaKind: TNodeKind;

	/**
	 * {@inheritDoc JsonSchemaType}
	 */
	readonly type: TJsonSchemaType;

	/**
	 * Description of the node schema.
	 * @remarks Derived from {@link NodeSchemaMetadata.description}.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation#name-title-and-description}
	 */
	readonly description?: string | undefined;
}

/**
 * JSON Schema for an object node.
 *
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 *
 * @sealed
 * @alpha
 */
export interface JsonObjectNodeSchema extends JsonNodeSchemaBase<NodeKind.Object, "object"> {
	/**
	 * Object fields.
	 * @remarks Required fields should have a corresponding entry in {@link JsonObjectNodeSchema.required}.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-properties}.
	 */
	readonly properties: Record<string, JsonFieldSchema>;

	/**
	 * List of keys for required fields.
	 *
	 * @remarks
	 * Optional fields should not be included in this list.
	 * Each key specified must have an entry in {@link JsonObjectNodeSchema.properties}.
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
 *
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 *
 * @sealed
 * @alpha
 */
export interface JsonArrayNodeSchema extends JsonNodeSchemaBase<NodeKind.Array, "array"> {
	/**
	 * The kinds of items allowed under the array.
	 *
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-items}.
	 */
	readonly items: JsonFieldSchema;
}

/**
 * JSON Schema for a map node.
 *
 * @remarks Special case for map nodes, which do not have a native JSON schema corollary.
 *
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 *
 * @sealed
 * @alpha
 */
export interface JsonMapNodeSchema extends JsonNodeSchemaBase<NodeKind.Map, "object"> {
	/**
	 * Used to control the types of properties that can appear in the "object" representation of the map.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-patternproperties}.
	 */
	readonly patternProperties: {
		/**
		 * Types allowed in the map.
		 * @remarks This format allows for any (JSON-compliant) key, but restricts the allowed types to only those specified.
		 */
		"^.*$": JsonFieldSchema;
	};
}

/**
 * JSON Schema for a leaf node.
 *
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
 *
 * @sealed
 * @alpha
 */
export interface JsonLeafNodeSchema
	extends JsonNodeSchemaBase<NodeKind.Leaf, JsonLeafSchemaType> {
	/**
	 * Primitive type.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-instance-data-model}.
	 */
	readonly type: JsonLeafSchemaType;
}

/**
 * Type entry containing a reference to a definition in the schema.
 *
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-schema-references}.
 *
 * @sealed
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
 *
 * @alpha
 */
export type JsonNodeSchema =
	| JsonLeafNodeSchema
	| JsonMapNodeSchema
	| JsonArrayNodeSchema
	| JsonObjectNodeSchema;

/**
 *{@link https://json-schema.org/draft/2020-12/json-schema-core | JSON Schema} representation of a {@link FieldSchema}.
 *
 * @sealed
 * @alpha
 */
export type JsonFieldSchema = {
	/**
	 * Description of the field.
	 * @remarks Derived from {@link FieldSchemaMetadata.description}.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation#name-title-and-description}
	 */
	readonly description?: string | undefined;
} & (
	| {
			/**
			 * The kinds of items allowed under the field, for polymorphic types.
			 * @remarks Always represented via references to {@link JsonTreeSchema.$defs}.
			 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-anyof}.
			 */
			readonly anyOf: JsonSchemaRef[];
	  }
	| JsonSchemaRef
);

/**
 * {@link https://json-schema.org/draft/2020-12/json-schema-core | JSON Schema} representation of a tree schema.
 *
 * @remarks
 * Includes the complete set of definitions reachable from the "root" schema.
 *
 * Note: This representation only uses a limited subset of supported JSON Schema features.
 * It is scoped to a format that can be used to sufficiently represent supported SharedTree schema.
 *
 * Also note that this schema format contains Fluid-specific extensions, such as the {@link JsonNodeSchemaBase._treeNodeSchemaKind}
 * property, meaning that it is not a *strict* subset.
 * When using these schemas with validation tools (for example, {@link https://ajv.js.org/}), you will need to opt out
 * of *strict* validation to ensure extra properties are allowed.
 *
 * @privateRemarks
 * Extending JSON Schema is permitted by the spec.
 * See {@link https://json-schema.org/draft/2020-12/json-schema-core#name-extending-json-schema}.
 *
 * @sealed
 * @alpha
 */
export type JsonTreeSchema = JsonFieldSchema & {
	/**
	 * The set of definitions reachable from this schema's root.
	 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core#name-schema-re-use-with-defs}
	 */
	readonly $defs: Record<JsonSchemaId, JsonNodeSchema>;
};
