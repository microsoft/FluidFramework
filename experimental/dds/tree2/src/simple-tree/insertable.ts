/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeValue } from "../core";
import { RestrictiveReadonlyRecord } from "../util";
import {
	FieldKind,
	FieldKinds,
	AllowedTypes,
	Any,
	FieldNodeSchema,
	TreeFieldSchema,
	InternalTypedSchemaTypes,
	LeafNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	TreeNodeSchema,
	FlexTreeSchema,
} from "../feature-libraries";

/**
 * Data from which a {@link TreeObjectNode} can be built.
 */
export type InsertableTreeObjectNode<TSchema extends ObjectNodeSchema> =
	InsertableTreeObjectNodeFields<TSchema["objectNodeFieldsObject"]>;

/**
 * Helper for generating the properties of a InsertableTreeObjectNode.
 */
export type InsertableTreeObjectNodeFields<
	TFields extends RestrictiveReadonlyRecord<string, TreeFieldSchema>,
> = {
	// Make all properties optional.
	readonly [key in keyof TFields]?: InsertableTreeField<TFields[key]>;
} & {
	// Require non-optional.
	readonly [key in keyof TFields as TFields[key]["kind"] extends typeof FieldKinds.optional
		? never
		: key]-?: InsertableTreeField<TFields[key]>;
};

/**
 * Data from which a {@link TreeField} can be built.
 */
export type InsertableTreeField<TSchema extends TreeFieldSchema = TreeFieldSchema> =
	InsertableTreeFieldInner<TSchema["kind"], TSchema["allowedTypes"]>;

/**
 * Helper for implementing InsertableTreeField.
 */
export type InsertableTreeFieldInner<
	Kind extends FieldKind,
	TTypes extends AllowedTypes,
> = Kind extends typeof FieldKinds.sequence
	? never // Sequences are only supported underneath FieldNodes. See FieldNode case in `ProxyNode`.
	: Kind extends typeof FieldKinds.required
	? InsertableTreeNodeUnion<TTypes>
	: Kind extends typeof FieldKinds.optional
	? InsertableTreeNodeUnion<TTypes> | undefined
	: unknown;

/**
 * Given multiple node schema types, return the corresponding object type union from which the node could be built.
 *
 * If the types are ambagious, use the schema's factory to construct a unhydrated node instance with the desired type.
 */
export type InsertableTreeNodeUnion<TTypes extends AllowedTypes> = TTypes extends readonly [Any]
	? unknown
	: {
			// TODO: Is the the best way to write this type function? Can it be simplified?
			// This first maps the tuple of AllowedTypes to a tuple of node API types.
			// Then, it uses [number] to index arbitrarily into that tuple, effectively converting the type tuple into a type union.
			[Index in keyof TTypes]: TTypes[Index] extends InternalTypedSchemaTypes.LazyItem<
				infer InnerType
			>
				? InnerType extends TreeNodeSchema
					? InsertableTypedNode<InnerType>
					: never
				: never;
	  }[number];

/**
 * Given a node's schema, return the corresponding object from which the node could be built.
 */
export type InsertableTypedNode<TSchema extends TreeNodeSchema> = TSchema extends LeafNodeSchema
	? TreeValue<TSchema["info"]>
	: TSchema extends MapNodeSchema
	? ReadonlyMap<string, InsertableTreeField<TSchema["info"]>>
	: TSchema extends FieldNodeSchema
	? readonly InsertableTreeNodeUnion<TSchema["info"]["allowedTypes"]>[]
	: TSchema extends ObjectNodeSchema
	? InsertableTreeObjectNode<TSchema>
	: // TODO: This should be `never` not `unknown` since this type is used as input, and thus should not fallback to unknown when the types are not specific enough.
	  // As is, this use of `unknown` causes `InsertableTypedNode<TreeNodeSchema>` to just be `unknown` which makes some code much less type safe than it should be.
	  unknown;

/**
 * Data which can be built into an entire tree matching the provided schema.
 */
export type InsertableTreeRoot<TSchema extends FlexTreeSchema> = TSchema extends FlexTreeSchema<
	infer TRootFieldSchema
>
	? InsertableTreeField<TRootFieldSchema>
	: never;
