/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ValueSchema } from "../core/index.js";
import type { JsonCompatibleReadOnlyObject } from "../util/index.js";
import type { NodeKind } from "./core/index.js";
import type { FieldKind, FieldSchemaMetadata, NodeSchemaMetadata } from "./schemaTypes.js";

/*
 * TODO:
 * - Customize their JSON serialization to use these formats or provide some other serialization scheme.
 */

/**
 * Base interface for {@link TreeNodeSchema} and {@link SimpleNodeSchema} types.
 * Once simple schema is stable this doesn't have a reason to be kept `@system`, but it could be.
 * @system
 * @public
 * @sealed
 */
export interface SimpleNodeSchemaBase<
	out TNodeKind extends NodeKind,
	out TCustomMetadata = unknown,
> {
	/**
	 * The {@link NodeKind}.
	 *
	 * @remarks can be used to type-switch between implementations.
	 */
	readonly kind: TNodeKind;

	/**
	 * User-provided {@link NodeSchemaMetadata} for this schema.
	 */
	readonly metadata: NodeSchemaMetadata<TCustomMetadata>;
}

/**
 * A {@link SimpleNodeSchema} containing fields for alpha features.
 *
 * @system
 * @alpha
 * @sealed
 */
export interface SimpleNodeSchemaBaseAlpha<
	out TNodeKind extends NodeKind,
	out TCustomMetadata = unknown,
> extends SimpleNodeSchemaBase<TNodeKind, TCustomMetadata> {
	/**
	 * Persisted metadata for this node schema.
	 */
	readonly persistedMetadata: JsonCompatibleReadOnlyObject | undefined;
}

/**
 * A {@link SimpleNodeSchema} for an object node.
 *
 * @alpha
 * @sealed
 */
export interface SimpleObjectNodeSchema<out TCustomMetadata = unknown>
	extends SimpleNodeSchemaBaseAlpha<NodeKind.Object, TCustomMetadata> {
	/**
	 * Schemas for each of the object's fields, keyed off of schema's keys.
	 * @remarks
	 * The keys are the property keys if known, otherwise they are the stored keys.
	 * Use {@link SimpleObjectFieldSchema.storedKey} to get the stored key.
	 * @privateRemarks
	 * TODO: Provide and link a way to translate from stored keys to the property keys.
	 * TODO: Consider adding `storedKeysToFields` or something similar to reduce confusion,
	 * especially if/when TreeNodeSchema for objects provide more maps.
	 */
	readonly fields: ReadonlyMap<string, SimpleObjectFieldSchema>;
}

/**
 * A {@link SimpleFieldSchema} for an {@link SimpleObjectNodeSchema} field.
 * @remarks
 * The only other case fields are uses in the root schema.
 *
 * @alpha
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
 * @alpha
 * @sealed
 */
export interface SimpleArrayNodeSchema<out TCustomMetadata = unknown>
	extends SimpleNodeSchemaBaseAlpha<NodeKind.Array, TCustomMetadata> {
	/**
	 * The types allowed in the array.
	 *
	 * @remarks Refers to the types by identifier.
	 * A {@link SimpleTreeSchema} is needed to resolve these identifiers to their schema {@link SimpleTreeSchema.definitions}.
	 */
	readonly allowedTypesIdentifiers: ReadonlySet<string>;
}

/**
 * A {@link SimpleNodeSchema} for a map node.
 *
 * @alpha
 * @sealed
 */
export interface SimpleMapNodeSchema<out TCustomMetadata = unknown>
	extends SimpleNodeSchemaBaseAlpha<NodeKind.Map, TCustomMetadata> {
	/**
	 * The types allowed as values in the map.
	 *
	 * @remarks Refers to the types by identifier.
	 * A {@link SimpleTreeSchema} is needed to resolve these identifiers to their schema {@link SimpleTreeSchema.definitions}.
	 */
	readonly allowedTypesIdentifiers: ReadonlySet<string>;
}

/**
 * A {@link SimpleNodeSchema} for a leaf node.
 *
 * @alpha
 * @sealed
 */
export interface SimpleLeafNodeSchema extends SimpleNodeSchemaBaseAlpha<NodeKind.Leaf> {
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
 * Note that, as documented on {@link NodeKind}, more kinds of nodes may be added,
 * and therefore code should not assume that switching over all these cases can be done exhaustively.
 * @privateRemarks
 * Because of the above mentioned extensibility of node kinds, does it make sense to stabilize this?
 *
 * @alpha
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
 * @alpha
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
	readonly allowedTypesIdentifiers: ReadonlySet<string>;

	/**
	 * {@inheritDoc FieldSchemaMetadata}
	 */
	readonly metadata: FieldSchemaMetadata;

	/**
	 * Persisted metadata for this field schema.
	 */
	readonly persistedMetadata?: JsonCompatibleReadOnlyObject | undefined;
}

/**
 * A simplified representation of a schema for a tree.
 *
 * @remarks Contains the complete set of schema {@link SimpleTreeSchema.definitions} required to resolve references,
 * which are represented inline with identifiers.
 *
 * @alpha
 * @sealed
 */
export interface SimpleTreeSchema {
	/**
	 * The tree field representing the root of the tree.
	 */
	readonly root: SimpleFieldSchema;

	/**
	 * The complete set of node schema definitions recursively referenced by the tree's {@link SimpleTreeSchema.root}.
	 *
	 * @remarks the keys are the schemas' {@link TreeNodeSchemaCore.identifier | identifiers}.
	 */
	readonly definitions: ReadonlyMap<string, SimpleNodeSchema>;
}
