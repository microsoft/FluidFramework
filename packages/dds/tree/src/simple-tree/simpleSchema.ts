/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Kind of {@link TreeNodeSchema}.
 * @alpha
 */
export type SimpleNodeSchemaKind = "object" | "array" | "map" | "leaf";

/**
 * Kind of {@link FieldSchema}.
 */
export type SimpleFieldSchemaKind = "optional" | "required" | "identifier";

/**
 * Kind of leaf schema.
 */
export type SimpleLeafSchemaKind = "string" | "number" | "boolean" | "null" | "fluid-handle";

/**
 * Base interface for all {@link SimpleNodeSchema} implementations.
 */
export interface SimpleNodeSchemaBase<TNodeKind extends SimpleNodeSchemaKind> {
	/**
	 * The kind of {@link SimpleNodeSchema}.
	 *
	 * @remarks can be used to type-switch between implementations.
	 */
	readonly kind: TNodeKind;
}

/**
 * A {@link SimpleNodeSchema} for an object node.
 */
export interface SimpleObjectNodeSchema extends SimpleNodeSchemaBase<"object"> {
	/**
	 * Schemas for each of the object's fields, keyed off of schema's view keys.
	 */
	readonly fields: Record<string, SimpleFieldSchema>;
}

/**
 * A {@link SimpleNodeSchema} for an array node.
 */
export interface SimpleArrayNodeSchema extends SimpleNodeSchemaBase<"array"> {
	/**
	 * The types allowed in the array.
	 *
	 * @remarks Refers to the types by identifier.
	 * A {@link SimpleTreeSchema} is needed to resolve these identifiers to their schema {@link SimpleTreeSchema.definitions}.
	 */
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * A {@link SimpleNodeSchema} for a map node.
 */
export interface SimpleMapNodeSchema extends SimpleNodeSchemaBase<"map"> {
	/**
	 * The types allowed as values in the map.
	 *
	 * @remarks Refers to the types by identifier.
	 * A {@link SimpleTreeSchema} is needed to resolve these identifiers to their schema {@link SimpleTreeSchema.definitions}.
	 */
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * A {@link SimpleNodeSchema} for a leaf node.
 */
export interface SimpleLeafNodeSchema extends SimpleNodeSchemaBase<"leaf"> {
	/**
	 * The kind of leaf node.
	 */
	readonly leafKind: SimpleLeafSchemaKind;
}

/**
 * A simple, shallow representation of a schema for a node.
 *
 * @remarks This definition is incomplete, and references child types by identifiers.
 * To be useful, this generally needs to be used as a part of a complete {@link SimpleTreeSchema}, which
 * contains backing {@link SimpleTreeSchema.definitions} for each referenced identifier.
 */
export type SimpleNodeSchema =
	| SimpleLeafNodeSchema
	| SimpleMapNodeSchema
	| SimpleArrayNodeSchema
	| SimpleObjectNodeSchema;

/**
 * A simple, shallow representation of a schema for a field.
 *
 * @remarks This definition is incomplete, and references child types by identifiers.
 * To be useful, this generally needs to be used as a part of a complete {@link SimpleTreeSchema}, which
 * contains backing {@link SimpleTreeSchema.definitions} for each referenced identifier.
 */
export interface SimpleFieldSchema {
	/**
	 * The kind of object field.
	 */
	readonly kind: SimpleFieldSchemaKind;

	/**
	 * The types allowed under the field.
	 *
	 * @remarks Refers to the types by identifier.
	 * A {@link SimpleTreeSchema} is needed to resolve these identifiers to their schema {@link SimpleTreeSchema.definitions}.
	 */
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * A simplified representation of a schema for a tree.
 *
 * @remarks Contains the complete set of schema {@link SimpleTreeSchema.definitions} required to resolve references
 * by schema identifier.
 */
export interface SimpleTreeSchema {
	/**
	 * The complete set of node schema definitions recursively referenced by the tree's {@link SimpleTreeSchema.allowedTypes}.
	 *
	 * @remarks the keys are the schemas' {@link TreeNodeSchemaCore.identifier | identifiers}.
	 */
	readonly definitions: ReadonlyMap<string, SimpleNodeSchema>;

	/**
	 * The types allowed under the root of the tree.
	 *
	 * @remarks Refers to the types by identifier.
	 * {@link SimpleTreeSchema.definitions} can be used to resolve these identifiers to their associated schema definition.
	 */
	readonly allowedTypes: ReadonlySet<string>;
}
