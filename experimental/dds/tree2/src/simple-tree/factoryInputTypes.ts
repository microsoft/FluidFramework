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
	TreeSchema,
} from "../feature-libraries";

/**
 * An object which supports property-based access to fields.
 * @alpha
 */
export type TreeObjectNodeFactoryInput<TSchema extends ObjectNodeSchema> =
	TreeObjectNodeFieldsFactoryInput<TSchema["objectNodeFieldsObject"]>;

/**
 * Helper for generating the properties of a {@link TreeObjectNode}.
 * @privateRemarks
 * This type is composed of four subtypes for each mutually exclusive combination of "readonly" and "optional".
 * If it were possible to map to getters and setters separately, the "readonly" cases would collapse, but this is not currently a feature in TS.
 * See https://github.com/microsoft/TypeScript/issues/43826 for more details on this limitation.
 * @alpha
 */
export type TreeObjectNodeFieldsFactoryInput<
	TFields extends RestrictiveReadonlyRecord<string, TreeFieldSchema>,
> = {
	// Make all properties optional.
	readonly [key in keyof TFields]?: TreeFieldFactoryInput<TFields[key]>;
} & {
	// Require non-optional.
	readonly [key in keyof TFields as TFields[key]["kind"] extends typeof FieldKinds.optional
		? never
		: key]-?: TreeFieldFactoryInput<TFields[key]>;
};

/**
 * Given a field's schema, return the corresponding object in the proxy-based API.
 * @alpha
 */
export type TreeFieldFactoryInput<TSchema extends TreeFieldSchema = TreeFieldSchema> =
	TreeFieldInnerFactoryInput<TSchema["kind"], TSchema["allowedTypes"]>;

/**
 * Helper for implementing {@link InternalEditableTreeTypes#ProxyField}.
 * @alpha
 */
export type TreeFieldInnerFactoryInput<
	Kind extends FieldKind,
	TTypes extends AllowedTypes,
> = Kind extends typeof FieldKinds.sequence
	? never // Sequences are only supported underneath FieldNodes. See FieldNode case in `ProxyNode`.
	: Kind extends typeof FieldKinds.required
	? TreeNodeUnionFactoryInput<TTypes>
	: Kind extends typeof FieldKinds.optional
	? TreeNodeUnionFactoryInput<TTypes> | undefined
	: unknown;

/**
 * Given multiple node schema types, return the corresponding object type union in the proxy-based API.
 * @alpha
 */
export type TreeNodeUnionFactoryInput<TTypes extends AllowedTypes> = TTypes extends readonly [Any]
	? unknown
	: {
			// TODO: Is the the best way to write this type function? Can it be simplified?
			// This first maps the tuple of AllowedTypes to a tuple of node API types.
			// Then, it uses [number] to index arbitrarily into that tuple, effectively converting the type tuple into a type union.
			[Index in keyof TTypes]: TTypes[Index] extends InternalTypedSchemaTypes.LazyItem<
				infer InnerType
			>
				? InnerType extends TreeNodeSchema
					? TypedNodeFactoryInput<InnerType>
					: never
				: never;
	  }[number];

/**
 * Given a node's schema, return the corresponding object in the proxy-based API.
 * @alpha
 */
export type TypedNodeFactoryInput<TSchema extends TreeNodeSchema> = TSchema extends LeafNodeSchema
	? TreeValue<TSchema["info"]>
	: TSchema extends MapNodeSchema
	? ReadonlyMap<string, TreeFieldFactoryInput<TSchema["info"]>>
	: TSchema extends FieldNodeSchema
	? readonly TreeNodeUnionFactoryInput<TSchema["info"]["allowedTypes"]>[]
	: TSchema extends ObjectNodeSchema
	? TreeObjectNodeFactoryInput<TSchema>
	: // TODO: This should be `never` not `unknown` since this type is used as input, and thus should not fallback to unknown when the types are not specific enough.
	  // As is, this use of `unknown` causes `TypedNodeFactoryInput<TreeNodeSchema>` to just be `unknown` which makes some code much less type safe than it should be.
	  unknown;

/**
 * The root type (the type of the entire tree) for a given schema collection.
 * */
export type TreeRootFactoryInput<TSchema extends TreeSchema> = TSchema extends TreeSchema<
	infer TRootFieldSchema
>
	? TreeFieldFactoryInput<TRootFieldSchema>
	: never;
