/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as SchemaAware from "../schema-aware";
import { FieldKey, TreeValue } from "../../core";
import { Assume, FlattenKeys, RestrictiveReadonlyRecord, _InlineTrick } from "../../util";
import { LocalNodeKey } from "../node-key";
import {
	FieldSchema,
	InternalTypedSchemaTypes,
	TreeSchema,
	AllowedTypes,
	FieldNodeSchema,
	LeafSchema,
	MapSchema,
	StructSchema,
} from "../typed-schema";
import { EditableTreeEvents } from "../untypedTree";
import { FieldKindTypes, FieldKinds } from "../default-field-kinds";
import { TreeStatus } from "../editable-tree";
import { TreeContext } from "./editableTreeContext";

// TODO: would be nice to make this Iterable<UntypedEntity>, but TypeScript can't handle it.
export interface UntypedEntity<TSchema = unknown> {
	/**
	 * Schema for this entity.
	 * If well-formed, it must follow this schema.
	 */
	readonly schema: TSchema;

	/**
	 * A common context of a "forest" of EditableTrees.
	 */
	readonly context: TreeContext;

	/**
	 * Gets the {@link TreeStatus} of this tree.
	 *
	 * @remarks
	 * For non-root fields, this is the the status of the parent node, since fields do not have a separate lifetime.
	 */
	treeStatus(): TreeStatus;
}

/**
 * Generic tree access API.
 *
 * All content of the tree is accessible via this API.
 *
 * Down-casting (via {@link UntypedTree.is}) is required to access Schema-Aware APIs, including editing.
 */
// TODO: design and document iterator invalidation rules and ordering rules. Maybe provide custom iterator with an anchor semantics.
export interface UntypedTree extends UntypedEntity<TreeSchema>, Iterable<UntypedField> {
	/**
	 * Value stored on this node.
	 */
	readonly value?: TreeValue;

	/**
	 * {@inheritDoc ISubscribable#on}
	 */
	on<K extends keyof EditableTreeEvents>(
		eventName: K,
		listener: EditableTreeEvents[K],
	): () => void;

	/**
	 * Gets a field of this node, if it is not empty.
	 */
	tryGetField(key: FieldKey): undefined | UntypedField;

	/**
	 * The field this tree is in, and the index within that field.
	 */
	readonly parentField: { readonly parent: UntypedField; readonly index: number };

	/**
	 * Type guard for narrowing / down-casting to a specific schema.
	 */
	is<TSchema extends TreeSchema>(schema: TSchema): this is TypedNode<TSchema>;
}

/**
 * A field of an {@link UntypedTree} as an array-like sequence of unwrapped nodes (see {@link UnwrappedUntypedTree}).
 *
 * Down-casting (via {@link UntypedField.is}) is required to access Schema-Aware APIs, including editing.
 *
 * @alpha
 */
// TODO: design and document iterator invalidation. Maybe provide custom iterator with an anchor semantics.
export interface UntypedField extends UntypedEntity<FieldSchema>, Iterable<UntypedTree> {
	/**
	 * The `FieldKey` this field is under.
	 */
	readonly key: FieldKey;

	/**
	 * The node which has this field on it under `fieldKey`.
	 * `undefined` iff this field is a detached field.
	 */
	readonly parent?: UntypedTree;

	/**
	 * Type guard for narrowing / down-casting to a specific schema.
	 */
	is<TSchema extends FieldSchema>(schema: TSchema): this is TypedField<TSchema>;
}

// #region Node Kinds

export interface MapNode<TSchema extends MapSchema> extends UntypedTree {
	get(key: FieldKey): TypedField<TSchema["mapFields"]>;
	// TODO: maybe remove this since it can be done in terms of editing result from `get` which prov ides better control over merge semantics.
	set(key: FieldKey, content: FlexibleFieldContent<TSchema["mapFields"]>): void;
}
export interface FieldNode<TSchema extends FieldNodeSchema> extends UntypedTree {
	readonly content: TypedField<TSchema["structFields"][""]>;
}

export interface Struct extends UntypedTree {
	/**
	 * {@link LocalNodeKey} that identifies this node.
	 */
	readonly localNodeKey?: LocalNodeKey;
}

/**
 * Leaf holding a value.
 */
export interface Leaf<TSchema extends LeafSchema> extends UntypedTree {
	/**
	 * Value stored on this node.
	 */
	readonly value: SchemaAware.InternalTypes.TypedValue<TSchema["leafValue"]>;
}

export type StructTyped<TSchema extends StructSchema> = Struct &
	StructFields<TSchema["structFieldsObject"]>;

// TODO: custom field identifiers
export type StructFields<TFields extends RestrictiveReadonlyRecord<string, FieldSchema>> =
	FlattenKeys<
		// Getters
		{
			readonly [key in keyof TFields]: UnboxField<TFields[key]>;
		} & {
			readonly // Setter methods (TODO: constrain `this`?)
			[key in keyof TFields as `set${Capitalize<key & string>}`]: (
				content: FlexibleFieldContent<TFields[key]>,
			) => void;
		} & {
			readonly // boxed fields (TODO: maybe remove these when same as non-boxed version?)
			[key in keyof TFields as `boxed${Capitalize<key & string>}`]: TypedField<TFields[key]>;
		}
		// This could be enabled to allow assignment via `=` in some cases.
		// & {
		// 	// Setter properties (when the type system permits)
		// 	[key in keyof TFields]: UnwrappedField<TFields[key]> & StructSetContent<TFields[key]>;
		// }
	>;

// #endregion

// #region Field Kinds

export type FlexibleFieldContent<TSchema extends FieldSchema> = SchemaAware.TypedField<
	TSchema,
	SchemaAware.ApiMode.Flexible
>;

export type FlexibleNodeContent<TTypes extends AllowedTypes> = SchemaAware.AllowedTypesToTypedTrees<
	SchemaAware.ApiMode.Flexible,
	TTypes
>;

export interface Sequence<TTypes extends AllowedTypes> extends UntypedField {
	/**
	 * Gets a node of this field by its index without unwrapping.
	 * Note that a node must exist at the given index.
	 */
	at(index: number): UnboxNodeUnion<TTypes>;
	boxedAt(index: number): TypedNodeUnion<TTypes>;

	readonly length: number;

	replaceRange(
		index: number,
		count: number,
		content: Iterable<FlexibleNodeContent<TTypes>>,
	): void;
}

export interface ValueField<TTypes extends AllowedTypes> extends UntypedField {
	readonly content: TypedNodeUnion<TTypes>;
	setContent(content: FlexibleNodeContent<TTypes>): void;
}

export interface OptionalField<TTypes extends AllowedTypes> extends UntypedField {
	readonly content?: TypedNodeUnion<TTypes>;
	setContent(content: undefined | FlexibleNodeContent<TTypes>): void;
}

// #endregion

// #region Typed

export type TypedField<TSchema extends FieldSchema> = TypedFieldInner<
	TSchema["kind"],
	TSchema["allowedTypes"]
>;

export type TypedFieldInner<
	Kind extends FieldKindTypes,
	Types extends AllowedTypes,
> = Kind extends typeof FieldKinds.sequence
	? Sequence<Types>
	: Kind extends typeof FieldKinds.value
	? ValueField<Types>
	: Kind extends typeof FieldKinds.optional
	? OptionalField<Types>
	: UntypedField;

export type TypedNodeUnion<TTypes extends AllowedTypes> =
	TTypes extends InternalTypedSchemaTypes.FlexList<TreeSchema>
		? InternalTypedSchemaTypes.ArrayToUnion<
				TypeArrayToTypedTreeArray<
					Assume<
						InternalTypedSchemaTypes.ConstantFlexListToNonLazyArray<TTypes>,
						readonly TreeSchema[]
					>
				>
		  >
		: UntypedTree;

/**
 * Takes in `TreeSchema[]` and returns a TypedTree union.
 * @alpha
 */
export type TypeArrayToTypedTreeArray<T extends readonly TreeSchema[]> = [
	T extends readonly [infer Head, ...infer Tail]
		? [
				TypedNode<Assume<Head, TreeSchema>>,
				...TypeArrayToTypedTreeArray<Assume<Tail, readonly TreeSchema[]>>,
		  ]
		: [],
][_InlineTrick];

export type TypedNode<TSchema extends TreeSchema> = TSchema extends LeafSchema
	? Leaf<TSchema>
	: TSchema extends MapSchema
	? MapNode<TSchema>
	: TSchema extends FieldNodeSchema
	? FieldNode<TSchema>
	: TSchema extends StructSchema
	? StructTyped<TSchema>
	: UntypedTree;

// #endregion

// #region Unbox

/**
 * Unwraps fields to their content if appropriate for the kind.
 */
export type UnboxField<TSchema extends FieldSchema> = UnboxFieldInner<
	TSchema["kind"],
	TSchema["allowedTypes"]
>;

export type UnboxFieldInner<
	Kind extends FieldKindTypes,
	TTypes extends AllowedTypes,
> = Kind extends typeof FieldKinds.sequence
	? Sequence<TTypes>
	: Kind extends typeof FieldKinds.value
	? UnboxNodeUnion<TTypes>
	: Kind extends typeof FieldKinds.optional
	? UnboxNodeUnion<TTypes> | undefined
	: // TODO: forbidden and nodeKey
	  unknown;

export type UnboxNodeUnion<TTypes extends AllowedTypes> = TTypes extends readonly [
	InternalTypedSchemaTypes.LazyItem<infer InnerType>,
]
	? InnerType extends TreeSchema
		? UnboxNode<InnerType>
		: TypedNodeUnion<TTypes>
	: TypedNodeUnion<TTypes>;

export type UnboxNode<TSchema extends TreeSchema> = TSchema extends LeafSchema
	? SchemaAware.InternalTypes.TypedValue<TSchema["leafValue"]>
	: TSchema extends MapSchema
	? MapNode<TSchema>
	: TSchema extends FieldNodeSchema
	? UnboxField<TSchema["structFieldsObject"][""]>
	: TSchema extends StructSchema
	? StructTyped<TSchema>
	: unknown;

// #endregion
