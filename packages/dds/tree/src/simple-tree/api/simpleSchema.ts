/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ValueSchema } from "../../core/index.js";
import type { NodeKind } from "../core/index.js";
import type { FieldKind } from "../schemaTypes.js";

/**
 * Base interface for all {@link SimpleNodeSchema} implementations.
 *
 * @sealed
 */
export interface SimpleNodeSchemaBase<TNodeKind extends NodeKind> {
	/**
	 * The kind of {@link SimpleNodeSchema}.
	 *
	 * @remarks can be used to type-switch between implementations.
	 */
	readonly kind: TNodeKind;
}

/**
 * A {@link SimpleNodeSchema} for an object node.
 *
 * @sealed
 */
export interface SimpleObjectNodeSchema extends SimpleNodeSchemaBase<NodeKind.Object> {
	/**
	 * Schemas for each of the object's fields, keyed off of schema's property keys.
	 */
	readonly fields: Record<string, SimpleFieldSchema>;
}

/**
 * A {@link SimpleNodeSchema} for an array node.
 *
 * @sealed
 */
export interface SimpleArrayNodeSchema extends SimpleNodeSchemaBase<NodeKind.Array> {
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
 *
 * @sealed
 */
export interface SimpleMapNodeSchema extends SimpleNodeSchemaBase<NodeKind.Map> {
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
 *
 * @sealed
 */
export interface SimpleLeafNodeSchema extends SimpleNodeSchemaBase<NodeKind.Leaf> {
	/**
	 * The kind of leaf node.
	 */
	readonly leafKind: ValueSchema;
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
 *
 * @sealed
 */
export interface SimpleFieldSchema {
	/**
	 * The kind of tree field.
	 */
	readonly kind: FieldKind;

	/**
	 * The types allowed under the field.
	 *
	 * @remarks Refers to the types by identifier.
	 * A {@link SimpleTreeSchema} is needed to resolve these identifiers to their schema {@link SimpleTreeSchema.definitions}.
	 */
	readonly allowedTypes: ReadonlySet<string>;

	/**
	 * {@inheritDoc FieldSchemaMetadata.description}
	 */
	readonly description?: string | undefined;
}

/**
 * A simplified representation of a schema for a tree.
 *
 * @remarks Contains the complete set of schema {@link SimpleTreeSchema.definitions} required to resolve references,
 * which are represented inline with identifiers.
 *
 * @sealed
 */
export interface SimpleTreeSchema extends SimpleFieldSchema {
	/**
	 * The kind of tree field representing the root of the tree.
	 */
	readonly kind: FieldKind;

	/**
	 * The types allowed under the tree root.
	 *
	 * @remarks Refers to the types by identifier.
	 * Can be resolved via {@link SimpleTreeSchema.definitions}.
	 */
	readonly allowedTypes: ReadonlySet<string>;

	/**
	 * The complete set of node schema definitions recursively referenced by the tree's {@link SimpleTreeSchema.allowedTypes}.
	 *
	 * @remarks the keys are the schemas' {@link TreeNodeSchemaCore.identifier | identifiers}.
	 */
	readonly definitions: ReadonlyMap<string, SimpleNodeSchema>;
}
