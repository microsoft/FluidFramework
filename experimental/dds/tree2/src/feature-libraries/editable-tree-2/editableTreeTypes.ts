/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as SchemaAware from "../schema-aware";
import { FieldKey, TreeSchemaIdentifier, TreeValue } from "../../core";
import { Assume, RestrictiveReadonlyRecord, _InlineTrick } from "../../util";
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
import { TreeContext } from "./context";

/**
 * Part of a tree.
 * Iterates over children.
 *
 * @privateRemarks
 * This exists mainly as a place to share common members between nodes and fields.
 * It is not expected to be useful or common to write code which handles this type directly.
 * If this assumption turns out to be false, and generically processing `UntypedEntity`s is useful,
 * then this interface should probably be extended with some down casting functionality (like `is`).
 *
 * TODO:
 * Design and document iterator invalidation rules and ordering rules.
 * Providing a custom iterator type with place anchor semantics would be a good approach.
 *
 * @alpha
 */
export interface Tree<TSchema = unknown> extends Iterable<Tree> {
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
 * Generic tree node API.
 *
 * Nodes are (shallowly) immutable and have a logical identity, a type and either a value or fields under string keys.
 *
 * This "logical identity" is exposed as the object identity: if a node is moved within a document,
 * the same {@link TreeNode} instance will be used in the new location.
 * Similarly, edits applied to a node's sub-tree concurrently with the move of the node will still be applied to its subtree in its new location.
 *
 *
 * @remarks
 * Down-casting (via {@link TreeNode#is}) is required to access Schema-Aware APIs, including editing.
 * All content in the tree is accessible without down-casting, but if the schema is known,
 * the schema aware API may be more ergonomic.
 * All editing is actually done via {@link TreeField}s: the nodes are immutable other than that they contain mutable fields.
 *
 * @alpha
 */
export interface TreeNode extends Tree<TreeSchema> {
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
	tryGetField(key: FieldKey): undefined | TreeField;

	/**
	 * The field this tree is in, and the index within that field.
	 */
	readonly parentField: { readonly parent: TreeField; readonly index: number };

	/**
	 * Type guard for narrowing / down-casting to a specific schema.
	 */
	is<TSchema extends TreeSchema>(schema: TSchema): this is TypedNode<TSchema>;

	/**
	 * Same as `this.schema.name`.
	 * This is provided as a enumerable own property to aid with JavaScript object traversals of this data-structure.
	 * See [readme](./README.md) for details.
	 */
	// TODO: do we want to leave this and other similar properties in the TypeScript API?
	readonly type: TreeSchemaIdentifier;

	[Symbol.iterator](): Iterator<TreeField>;
}

/**
 * A collaboratively editable collection of nodes within a {@link Tree}.
 *
 * Fields are inherently part of their parent, and thus cannot be moved.
 * Instead their content can be moved, deleted or created.
 *
 * @remarks
 * Fields are used wherever an editable collection of nodes is required.
 * This is required in two places:
 * 1. To hold the children of non-leaf {@link TreeNode}s.
 * 2. As the root of a {@link Tree}.
 *
 * Down-casting (via {@link TreeField#is}) is required to access Schema-Aware APIs, including editing.
 * All content in the tree is accessible without down-casting, but if the schema is known,
 * the schema aware API may be more ergonomic.
 *
 * @alpha
 */
export interface TreeField extends Tree<FieldSchema>, Iterable<TreeNode> {
	/**
	 * The `FieldKey` this field is under.
	 * Defines what part of its parent this field makes up.
	 */
	readonly key: FieldKey;

	/**
	 * The node which has this field on it under `fieldKey`.
	 * `undefined` iff this field is a detached field.
	 */
	readonly parent?: TreeNode;

	/**
	 * Type guard for narrowing / down-casting to a specific schema.
	 */
	is<TSchema extends FieldSchema>(schema: TSchema): this is TypedField<TSchema>;

	[Symbol.iterator](): Iterator<TreeNode>;

	/**
	 * Check if this field is the same as a different field.
	 * This is defined to mean that both are in the same editable tree, and are the same field on the same node.
	 * This is more than just a reference comparison because unlike EditableTree nodes, fields are not cached on anchors and can be duplicated.
	 *
	 * @privateRemarks
	 * TODO:
	 * If practical, cache TreeField instances so use of this method can be replaced with `===` to compare object identity.
	 * Implementing this will require some care to preserve lazy-ness and work efficiently (without leaks) for empty fields, particularly on MapNodes.
	 */
	isSameAs(other: TreeField): boolean;
}

// #region Node Kinds

/**
 * A node that behaves like a `Map<FieldKey, Field>` for a specific `Field` type.
 * @alpha
 */
export interface MapNode<TSchema extends MapSchema> extends TreeNode {
	/**
	 * Get the field for `key`.
	 * @param key - which map entry to look up.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, so `get` can be called with any key and will always return a field.
	 * Even if the field is empty, it will still be returned, and can be edited to insert content into the map.
	 */
	get(key: FieldKey): TypedField<TSchema["mapFields"]>;

	// TODO: Add `set` method when FieldKind provides a setter (and derive the type from it).
	// set(key: FieldKey, content: FlexibleFieldContent<TSchema["mapFields"]>): void;

	[Symbol.iterator](): Iterator<TypedField<TSchema["mapFields"]>>;

	// TODO: JS object traversal docs
	// Inclines only non-empty fields, like iteration.
	readonly asObject: {
		readonly [P in FieldKey]?: UnboxField<TSchema["mapFields"]>;
	};
}

/**
 * A {@link TreeNode} that wraps a single field.
 *
 * @remarks
 * FieldNodes unbox to their content, so in schema aware APIs which do unboxing, the FieldNode itself will be skipped over.
 * Mainly useful when a field (such as a sequence) is desired in a location where nodes are required (like the member of a union or the child of another field).
 *
 * For example:
 * `Sequence<Foo> | Sequence<Bar>` or `OptionalField<Sequence<Foo>>` can't be expressed as simple fields
 * (unlike `Sequence<Foo | Bar>` or `OptionalField<Foo>` which can be done as simple fields).
 * Instead {@link FieldNode}s can be use to achieve something similar, more like:
 * `FieldNode<Sequence<Foo>> | FieldNode<Sequence<Bar>>` or `OptionalField<FieldNode<Sequence<Foo>>>`.
 *
 * This extra layer of field nodes is then omitted when using schema-aware APIs which do unboxing.
 *
 * Other than this unboxing, a FieldNode is identical to a struct node with a single field using the {@link EmptyKey}.
 *
 * @alpha
 */
export interface FieldNode<TSchema extends FieldNodeSchema> extends TreeNode {
	/**
	 * The content this field node wraps.
	 * @remarks
	 * This is a version of {@link FieldNode.boxedContent} but does unboxing.
	 * Since field node are usually used to wrap fields which don't do unboxing (like {@link Sequence})
	 */
	readonly content: UnboxField<TSchema["structFieldsObject"][""]>;
	/**
	 * The field this field node wraps.
	 *
	 * @remarks
	 * Since field nodes are usually used to wrap fields which don't do unboxing (like {@link Sequence}),
	 * this is usually the same as {@link FieldNode.content}.
	 * This is also the same as `[...this][0]`.
	 */
	readonly boxedContent: TypedField<TSchema["structFieldsObject"][""]>;
}

/**
 * A node that behaves like struct, providing properties to access its fields.
 *
 * @remarks
 * Struct nodes require complex typing, and have been split into two parts for implementation purposes.
 * See {@link StructTyped} for the schema aware extensions to this.
 *
 * @alpha
 */
export interface Struct extends TreeNode {
	/**
	 * {@link LocalNodeKey} that identifies this node.
	 */
	readonly localNodeKey?: LocalNodeKey;
}

/**
 * Leaf holding a value.
 *
 * @remarks
 * Leaves are immutable and have no children.
 * Leaf unboxes its content, so in schema aware APIs which do unboxing, the Leaf itself will be skipped over and its value will be returned directly.
 * @alpha
 */
export interface Leaf<TSchema extends LeafSchema> extends TreeNode {
	/**
	 * Value stored on this node.
	 */
	readonly value: SchemaAware.InternalTypes.TypedValue<TSchema["leafValue"]>;
}

/**
 * A node that behaves like struct, providing properties to access its fields.
 *
 * @alpha
 */
export type StructTyped<TSchema extends StructSchema> = Struct &
	StructFields<TSchema["structFieldsObject"]>;

/**
 * Properties to access a struct nodes fields. See {@link StructTyped}.
 *
 * @privateRemarks
 * TODO: support custom field keys
 *
 * @alpha
 */
export type StructFields<TFields extends RestrictiveReadonlyRecord<string, FieldSchema>> =
	// Getters
	{
		readonly [key in keyof TFields]: UnboxField<TFields[key]>;
	} & {
		readonly // boxed fields (TODO: maybe remove these when same as non-boxed version?)
		[key in keyof TFields as `boxed${Capitalize<key & string>}`]: TypedField<TFields[key]>;
	};
// TODO: Add `set` method when FieldKind provides a setter (and derive the type from it).
// set(key: FieldKey, content: FlexibleFieldContent<TSchema["mapFields"]>): void;
// {
// 	readonly [key in keyof TFields as `set${Capitalize<key & string>}`]: (
// 		content: FlexibleFieldContent<TFields[key]>,
// 	) => void;
// };
// This could be enabled to allow assignment via `=` in some cases.
// & {
// 	// Setter properties (when the type system permits)
// 	[key in keyof TFields]: UnwrappedField<TFields[key]> & StructSetContent<TFields[key]>;
// }

// #endregion

// #region Field Kinds

/**
 * Strongly typed tree literals for inserting as the content of a field.
 * @alpha
 */
export type FlexibleFieldContent<TSchema extends FieldSchema> = SchemaAware.TypedField<
	TSchema,
	SchemaAware.ApiMode.Flexible
>;

/**
 * Strongly typed tree literals for inserting as a node.
 * @alpha
 */
export type FlexibleNodeContent<TTypes extends AllowedTypes> = SchemaAware.AllowedTypesToTypedTrees<
	SchemaAware.ApiMode.Flexible,
	TTypes
>;

/**
 * Field that stores a sequence of children.
 *
 * @remarks
 * Allows for concurrent editing based on index, adjusting the locations of indexes as needed so they apply to the same logical place in the sequence when rebased and merged.
 * @alpha
 */
export interface Sequence<TTypes extends AllowedTypes> extends TreeField {
	/**
	 * Gets a node of this field by its index with unboxing.
	 * Note that a node must exist at the given index.
	 */
	at(index: number): UnboxNodeUnion<TTypes>;

	/**
	 * Gets a boxed node of this field by its index.
	 * Note that a node must exist at the given index.
	 */
	boxedAt(index: number): TypedNodeUnion<TTypes>;

	/**
	 * Calls the provided callback function on each child of this sequence, and returns an array that contains the results.
	 * @param callbackfn - A function that accepts the child, its index, and this field.
	 */
	map<U>(callbackfn: (value: UnboxNodeUnion<TTypes>, index: number, array: this) => U): U[];

	/**
	 * Calls the provided callback function on each child of this sequence, and returns an array that contains the results.
	 * @param callbackfn - A function that accepts the child, its index, and this field.
	 */
	mapBoxed<U>(callbackfn: (value: TypedNodeUnion<TTypes>, index: number, array: this) => U): U[];

	readonly length: number;

	// TODO: more and/or better editing APIs. As is, this can't express moves.
	replaceRange(
		index: number,
		count: number,
		content: Iterable<FlexibleNodeContent<TTypes>>,
	): void;

	[Symbol.iterator](): Iterator<TypedNodeUnion<TTypes>>;

	// TODO: JS object traversal docs
	readonly asArray: readonly UnboxNodeUnion<TTypes>[];
}

/**
 * Field that stores exactly one child.
 *
 * @remarks
 * Unboxes its content, so in schema aware APIs which do unboxing, the RequiredField itself will be skipped over and its content will be returned directly.
 * @privateRemarks
 * TODO: Finish renaming from ValueField to RequiredField
 * @alpha
 */
export interface RequiredField<TTypes extends AllowedTypes> extends TreeField {
	readonly content: UnboxNodeUnion<TTypes>;
	readonly boxedContent: TypedNodeUnion<TTypes>;
	setContent(content: FlexibleNodeContent<TTypes>): void;
}

/**
 * Field that stores zero or one child.
 *
 * @remarks
 * Unboxes its content, so in schema aware APIs which do unboxing, the OptionalField itself will be skipped over and its content will be returned directly.
 * @alpha
 */
export interface OptionalField<TTypes extends AllowedTypes> extends TreeField {
	readonly content?: UnboxNodeUnion<TTypes>;
	readonly boxedContent?: TypedNodeUnion<TTypes>;
	setContent(content: undefined | FlexibleNodeContent<TTypes>): void;
}

// #endregion

// #region Typed

/**
 * Schema aware specialization of {@link TreeField}.
 * @alpha
 */
export type TypedField<TSchema extends FieldSchema> = TypedFieldInner<
	TSchema["kind"],
	TSchema["allowedTypes"]
>;

/**
 * Helper for implementing {@link TypedField}.
 * @alpha
 */
export type TypedFieldInner<
	Kind extends FieldKindTypes,
	Types extends AllowedTypes,
> = Kind extends typeof FieldKinds.sequence
	? Sequence<Types>
	: Kind extends typeof FieldKinds.value
	? RequiredField<Types>
	: Kind extends typeof FieldKinds.optional
	? OptionalField<Types>
	: TreeField;

/**
 * Schema aware specialization of {@link TreeNode} for a given {@link AllowedTypes}.
 * @alpha
 */
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
		: TreeNode;

/**
 * Takes in `TreeSchema[]` and returns a TypedNode union.
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

/**
 * Schema aware specialization of {@link TreeNode} for a given {@link TreeSchema}.
 * @alpha
 */
export type TypedNode<TSchema extends TreeSchema> = TSchema extends LeafSchema
	? Leaf<TSchema>
	: TSchema extends MapSchema
	? MapNode<TSchema>
	: TSchema extends FieldNodeSchema
	? FieldNode<TSchema>
	: TSchema extends StructSchema
	? StructTyped<TSchema>
	: TreeNode;

// #endregion

// #region Unbox

/**
 * Schema aware unboxed field.
 * @remarks
 * Unboxes fields to their content if appropriate for the kind.
 * Recursively unboxes that content (then its content etc.) as well if the node union does unboxing.
 * @alpha
 */
export type UnboxField<TSchema extends FieldSchema> = UnboxFieldInner<
	TSchema["kind"],
	TSchema["allowedTypes"]
>;

/**
 * Helper for implementing {@link InternalEditableTreeTypes#UnboxField}.
 * @alpha
 */
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

/**
 * Schema aware unboxed union of tree types.
 * @remarks
 * Unboxes when not polymorphic.
 * Recursively unboxes that content as well if the node kind does unboxing.
 * @alpha
 */
export type UnboxNodeUnion<TTypes extends AllowedTypes> = TTypes extends readonly [
	InternalTypedSchemaTypes.LazyItem<infer InnerType>,
]
	? InnerType extends TreeSchema
		? UnboxNode<InnerType>
		: TypedNodeUnion<TTypes>
	: TypedNodeUnion<TTypes>;

/**
 * Schema aware unboxed tree type.
 * @remarks
 * Unboxes if the node kind does unboxing.
 * Recursively unboxes that content as well if it does unboxing.
 * @alpha
 */
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
