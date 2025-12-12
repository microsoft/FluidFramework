/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ValueSchema } from "../core/index.js";
import type { JsonCompatibleReadOnlyObject } from "../util/index.js";
import type { NodeKind, SchemaUpgrade, SimpleNodeSchemaBase } from "./core/index.js";
import type { FieldKind, FieldSchemaMetadata } from "./fieldSchema.js";

/*
 * TODO:
 * - Customize their JSON serialization to use these formats or provide some other serialization scheme.
 */

/**
 * A {@link SimpleNodeSchema} containing fields for alpha features.
 *
 * @system
 * @alpha
 * @sealed
 */
export interface SimpleNodeSchemaBaseAlpha<
	out Type extends SchemaType,
	out TNodeKind extends NodeKind,
	out TCustomMetadata = unknown,
> extends SimpleNodeSchemaBase<TNodeKind, TCustomMetadata> {
	/**
	 * Persisted metadata for this node schema.
	 * @remarks
	 * While this can be stored in the document, not all versions / configurations will do so.
	 * Additionally, this is not part of {@link TreeView.compatibility|schema compatibility}, so different clients
	 * (even within the same collaborative session) may see different `persistedMetadata` for the same node.
	 * Specified using {@link NodeSchemaOptionsAlpha.persistedMetadata}.
	 * @privateRemarks
	 * How/when this gets updated in documents,
	 * and how to read it from documents should be documented here when this feature is more mature and these questions have good answers.
	 * If this does end up getting reflected in some compatibility value, that should also be documented.
	 */
	readonly persistedMetadata: JsonCompatibleReadOnlyObject | undefined;

	// This overrides the type from SimpleNodeSchemaBase to make it more specific. When stabilized, this should be moved to the base interface.
	readonly metadata: SimpleNodeSchemaBase<TNodeKind, TCustomMetadata>["metadata"] &
		(Type extends SchemaType.View
			? unknown
			: { readonly custom?: undefined; readonly description?: undefined });
}

/**
 * {@link AllowedTypes} for a location in the tree, expressed for use in the Simple Schema layer of abstraction.
 *
 * @remarks
 * Refers to the types by identifier.
 * A {@link SimpleTreeSchema} is needed to resolve these identifiers to their schema {@link SimpleTreeSchema.definitions}.
 */
export type SimpleAllowedTypes<Type extends SchemaType = SchemaType> = ReadonlyMap<
	string,
	SimpleAllowedTypeAttributes<Type>
>;

/**
 * A {@link SimpleNodeSchema} for an object node.
 *
 * @alpha
 * @sealed
 */
export interface SimpleObjectNodeSchema<
	Type extends SchemaType = SchemaType,
	out TCustomMetadata = unknown,
> extends SimpleNodeSchemaBaseAlpha<Type, NodeKind.Object, TCustomMetadata> {
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
	readonly fields: ReadonlyMap<string, SimpleObjectFieldSchema<Type>>;

	/**
	 * Whether the object node allows unknown optional fields.
	 *
	 * @see {@link ObjectSchemaOptions.allowUnknownOptionalFields} for the API where this field is set as part of authoring a schema.
	 *
	 * @remarks Only populated for view schemas, undefined otherwise. Relevant for compatibility checking scenarios.
	 */
	readonly allowUnknownOptionalFields: Type extends SchemaType.View ? boolean : undefined;
}

/**
 * A {@link SimpleFieldSchema} for an {@link SimpleObjectNodeSchema} field.
 * @remarks
 * The only other case fields are uses in the root schema.
 *
 * @alpha
 * @sealed
 */
export interface SimpleObjectFieldSchema<Type extends SchemaType = SchemaType>
	extends SimpleFieldSchema<Type> {
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
export interface SimpleArrayNodeSchema<
	Type extends SchemaType = SchemaType,
	out TCustomMetadata = unknown,
> extends SimpleNodeSchemaBaseAlpha<Type, NodeKind.Array, TCustomMetadata> {
	/**
	 * The types allowed in the array.
	 *
	 * @remarks Refers to the types by identifier.
	 * A {@link SimpleTreeSchema} is needed to resolve these identifiers to their schema {@link SimpleTreeSchema.definitions}.
	 */
	readonly simpleAllowedTypes: ReadonlyMap<string, SimpleAllowedTypeAttributes<Type>>;
}

/**
 * A {@link SimpleNodeSchema} for a map node.
 *
 * @alpha
 * @sealed
 */
export interface SimpleMapNodeSchema<
	Type extends SchemaType = SchemaType,
	out TCustomMetadata = unknown,
> extends SimpleNodeSchemaBaseAlpha<Type, NodeKind.Map, TCustomMetadata> {
	/**
	 * The types allowed as values in the map.
	 *
	 * @remarks Refers to the types by identifier.
	 * A {@link SimpleTreeSchema} is needed to resolve these identifiers to their schema {@link SimpleTreeSchema.definitions}.
	 */
	readonly simpleAllowedTypes: ReadonlyMap<string, SimpleAllowedTypeAttributes<Type>>;
}

/**
 * A {@link SimpleNodeSchema} for a map node.
 *
 * @alpha
 * @sealed
 */
export interface SimpleRecordNodeSchema<
	Type extends SchemaType = SchemaType,
	out TCustomMetadata = unknown,
> extends SimpleNodeSchemaBaseAlpha<Type, NodeKind.Record, TCustomMetadata> {
	/**
	 * The types allowed as values in the record.
	 *
	 * @remarks Refers to the types by identifier.
	 * A {@link SimpleTreeSchema} is needed to resolve these identifiers to their schema {@link SimpleTreeSchema.definitions}.
	 */
	readonly simpleAllowedTypes: ReadonlyMap<string, SimpleAllowedTypeAttributes<Type>>;
}

/**
 * A {@link SimpleNodeSchema} for a leaf node.
 *
 * @alpha
 * @sealed
 */
export interface SimpleLeafNodeSchema<Type extends SchemaType = SchemaType>
	extends SimpleNodeSchemaBaseAlpha<Type, NodeKind.Leaf> {
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
export type SimpleNodeSchema<Type extends SchemaType = SchemaType> =
	| SimpleLeafNodeSchema<Type>
	| SimpleMapNodeSchema<Type>
	| SimpleArrayNodeSchema<Type>
	| SimpleObjectNodeSchema<Type>
	| SimpleRecordNodeSchema<Type>;

/**
 * Information about allowed types under a field.
 *
 * @privateRemarks
 * Variance annotations should not be used to change type checking: they are only used by the compiler as an optimization hint.
 * However in this case, for unknown reasons, TypeScript makes this interface bi-variant without `out` on `Type`.
 * That is bad as it allows schema of unknown type to be used as stored or view without errors.
 * To mitigate this, `out` is added to make this interface properly covariant in `Type`.
 * This may not be robust if TypeScript checks this type structurally,
 * but whatever bug causes the bi-variant likely does not occur in that case anyway.
 *
 * @alpha
 * @sealed
 */
export interface SimpleAllowedTypeAttributes<out Type extends SchemaType = SchemaType> {
	/**
	 * {@link SchemaUpgrade} if this schema is included as a {@link SchemaStaticsBeta.staged | staged} schema upgrade,
	 * allowing the view schema be compatible with stored schema with (post upgrade) or without it (pre-upgrade).
	 * New documents and schema upgrades will omit any staged schema.
	 *
	 * Undefined if derived from a stored schema.
	 *
	 * @privateRemarks
	 * The false and undefined cases here are a bit odd.
	 * This API should be reevaluated before stabilizing.
	 */
	readonly isStaged: Type extends SchemaType.Stored ? undefined : false | SchemaUpgrade;
}

/**
 * The type of simple schema being represented.
 *
 * @alpha
 */
export enum SchemaType {
	/**
	 * The schema is a stored schema, meaning it expresses exactly what could be validly persisted in a SharedTree.
	 */
	Stored,
	/**
	 * The schema is a view schema, meaning it expresses how to view data which is using a compatible stored schema.
	 */
	View,
}
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
export interface SimpleFieldSchema<Type extends SchemaType = SchemaType> {
	/**
	 * The kind of tree field.
	 */
	readonly kind: FieldKind;

	/**
	 * Information about the allowed types under this field.
	 *
	 * @remarks Refers to the types by identifier.
	 * A {@link SimpleTreeSchema} is needed to resolve these identifiers to their schema {@link SimpleTreeSchema.definitions}.
	 */
	readonly simpleAllowedTypes: ReadonlyMap<string, SimpleAllowedTypeAttributes<Type>>;

	/**
	 * Metadata for this field schema, see {@link FieldSchemaMetadata}.
	 * @remarks
	 * As this is the non-persisted portion of the metadata, it is forced to store only undefined in the `SchemaType.Stored` case.
	 */
	readonly metadata: FieldSchemaMetadata &
		(Type extends SchemaType.View
			? unknown
			: { readonly custom?: undefined; readonly description?: undefined });

	/**
	 * Persisted metadata for this field schema.
	 * @remarks
	 * Like {@link SimpleNodeSchemaBaseAlpha.persistedMetadata} but for fields.
	 * Set via {@link FieldPropsAlpha.persistedMetadata}.
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
export interface SimpleTreeSchema<Type extends SchemaType = SchemaType> {
	/**
	 * The tree field representing the root of the tree.
	 */
	readonly root: SimpleFieldSchema<Type>;
	/**
	 * The complete set of node schema definitions recursively referenced by the tree's {@link SimpleTreeSchema.root}.
	 *
	 * @remarks
	 * The keys are the schemas' {@link TreeNodeSchemaCore.identifier | identifiers}.
	 *
	 * Information about if a schema is {@link SchemaStaticsBeta.staged | staged} or not is not available as the "Simple Schema" layer of abstraction: they are included unconditionally.
	 * Options for filtering out staged schemas from view schema are available in {@link extractPersistedSchema}.
	 */
	readonly definitions: ReadonlyMap<string, SimpleNodeSchema<Type>>;
}
