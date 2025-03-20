/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ValueSchema } from "../../core/index.js";
import type { NodeKind } from "../core/index.js";
import type { FieldKind, FieldSchemaMetadata, NodeSchemaMetadata } from "../schemaTypes.js";

/*
 * TODO:
 * - Make TreeNodeSchema implement these interfaces directly.
 * - Customize their JSON serialization to use these formats or provide some other serialization scheme.
 * - Promote these to alpha
 */

/**
 * Base interface for all {@link SimpleNodeSchema} implementations.
 *
 * @internal
 * @sealed
 */
export interface SimpleNodeSchemaBase<TNodeKind extends NodeKind> {
	/**
	 * The kind of {@link SimpleNodeSchema}.
	 *
	 * @remarks can be used to type-switch between implementations.
	 */
	readonly kind: TNodeKind;

	/**
	 * {@inheritDoc NodeSchemaMetadata}
	 */
	readonly metadata?: NodeSchemaMetadata | undefined;
}

/**
 * A {@link SimpleNodeSchema} for an object node.
 *
 * @internal
 * @sealed
 */
export interface SimpleObjectNodeSchema extends SimpleNodeSchemaBase<NodeKind.Object> {
	/**
	 * Schemas for each of the object's fields, keyed off of schema's keys.
	 * @remarks
	 * The keys are the property keys if known, otherwise they are the stored keys.
	 * @privateRemarks
	 * TODO: Provide and link a way to translate between the stored keys and the property keys.
	 * TODO: Consider adding `storedKeysToFields` or something similar to reduce confusion,
	 * especially if/when TreeNodeSchema for objects implement this and likely provide more maps.
	 */
	readonly fields: ReadonlyMap<string, SimpleObjectFieldSchema>;
}

/**
 * A {@link SimpleNodeSchema} for an object node.
 * @remarks
 * The only other case fields are uses in the root schema.
 *
 * @internal
 * @sealed
 */
export interface SimpleObjectFieldSchema extends SimpleFieldSchema {
	/**
	 * The stored key of the field.
	 * @remarks
	 * See {@link FieldProps.key} for more information.
	 */
	readonly storedKey: string;
}

/**
 * A {@link SimpleNodeSchema} for an array node.
 *
 * @internal
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
 * @internal
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
 * @internal
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
 *
 * @internal
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
 * @internal
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
	 * {@inheritDoc FieldSchemaMetadata}
	 */
	readonly metadata?: FieldSchemaMetadata | undefined;
}

/**
 * A simplified representation of a schema for a tree.
 *
 * @remarks Contains the complete set of schema {@link SimpleTreeSchema.definitions} required to resolve references,
 * which are represented inline with identifiers.
 *
 * @internal
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
