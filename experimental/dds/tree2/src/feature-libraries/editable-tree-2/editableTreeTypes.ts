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
import { FieldKinds } from "../default-field-kinds";
import { TreeStatus } from "../editable-tree";
import { FieldKind } from "../modular-schema";
import { TreeContext } from "./context";

/**
 * Allows boxed iteration of a tree/field
 */
export const boxedIterator = Symbol();

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
export interface Tree<TSchema = unknown> {
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
	 * For non-root fields, this is the status of the parent node, since fields do not have a separate lifetime.
	 */
	treeStatus(): TreeStatus;

	/**
	 * Iterate through all nodes/fields in this field/node.
	 *
	 * @remarks
	 * No mutations to the current view of the shared tree are permitted during iteration.
	 */
	[boxedIterator](): IterableIterator<Tree>;
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
	 * This is provided as an enumerable own property to aid with JavaScript object traversals of this data-structure.
	 * See [ReadMe](./README.md) for details.
	 */
	readonly type: TreeSchemaIdentifier;

	[boxedIterator](): IterableIterator<TreeField>;
}

/**
 * A collaboratively editable collection of nodes within a {@link Tree}.
 *
 * Fields are inherently part of their parent, and thus cannot be moved.
 * Instead their content can be moved, deleted or created.
 *
 * Editing operations are only valid on trees with the {@link TreeStatus#InDocument} `TreeStatus`.
 *
 * @remarks
 * Fields are used wherever an editable collection of nodes is required.
 * This is required in two places:
 * 1. To hold the children of non-leaf {@link TreeNode}s.
 * 2. As the root of a {@link Tree}.
 *
 * Down-casting (via {@link TreeField.is}) is required to access Schema-Aware APIs, including editing.
 * All content in the tree is accessible without down-casting, but if the schema is known,
 * the schema aware API may be more ergonomic.
 *
 * @alpha
 */
export interface TreeField extends Tree<FieldSchema> {
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

	[boxedIterator](): IterableIterator<TreeNode>;

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

/**
 * A {@link TreeNode} that behaves like a `Map<FieldKey, Field>` for a specific `Field` type.
 *
 * @remarks
 * Unlike TypeScript Map type, {@link MapNode.get} always provides a reference to any field looked up, even if it has never been set.
 *
 * This means that, for example, a `MapNode` of {@link Sequence} fields will return an empty sequence when a previously unused key is looked up,
 * and that sequence can be used to insert new items into the field.
 * Additionally empty fields (those containing no nodes) are not distinguished from fields which do not exist.
 * This differs from JavaScript Maps which have a subtle distinction between storing undefined as a value in the map and deleting an entry from the map.
 *
 * @alpha
 */
export interface MapNode<TSchema extends MapSchema> extends TreeNode {
	/**
	 * The number of elements in the map.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, but `size` will count only the fields which contain one or more nodes.
	 */
	readonly size: number;

	/**
	 * Checks whether a value exists for the given key.
	 * @param key - Which map entry to look up.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, but `has` will only return true if there are one or more nodes present in the given field.
	 *
	 * @privateRemarks
	 * TODO: Consider changing the key type to `string` for easier use.
	 */
	has(key: FieldKey): boolean;

	/**
	 * Get the value associated with `key`.
	 * @param key - which map entry to look up.
	 *
	 * @privateRemarks
	 * TODO: Consider changing the key type to `string` for easier use.
	 */
	get(key: FieldKey): UnboxField<TSchema["mapFields"]>;

	/**
	 * Get the field for `key`.
	 * @param key - which map entry to look up.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, so `get` can be called with any key and will always return a field.
	 * Even if the field is empty, it will still be returned, and can be edited to insert content into the map.
	 *
	 * @privateRemarks
	 * TODO: Consider changing the key type to `string` for easier use.
	 */
	getBoxed(key: FieldKey): TypedField<TSchema["mapFields"]>;

	/**
	 * Returns an iterable of keys in the map.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, but `keys` will yield only the keys of fields which contain one or more nodes.
	 */
	keys(): IterableIterator<FieldKey>;

	/**
	 * Returns an iterable of values in the map.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, but `values` will yield only the fields containing one or more nodes.
	 */
	values(): IterableIterator<UnboxField<TSchema["mapFields"]>>;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, but `entries` will yield only the entries whose fields contain one or more nodes.
	 */
	entries(): IterableIterator<[FieldKey, UnboxField<TSchema["mapFields"]>]>;

	/**
	 * Executes a provided function once per each key/value pair in the map.
	 * @param callbackFn - The function to run for each map entry
	 * @param thisArg - If present, `callbackFn` will be bound to `thisArg`
	 *
	 * @privateRemarks
	 * TODO: This should run over fields in insertion order if we want to match the javascript foreach spec.
	 */
	forEach(
		callbackFn: (
			value: UnboxField<TSchema["mapFields"]>,
			key: FieldKey,
			map: MapNode<TSchema>,
		) => void,
		thisArg?: any,
	): void;

	// TODO: Add `set` method when FieldKind provides a setter (and derive the type from it).
	// set(key: FieldKey, content: FlexibleFieldContent<TSchema["mapFields"]>): void;

	/**
	 * Iterate through all fields in the map.
	 *
	 * @remarks
	 * No mutations to the current view of the shared tree are permitted during iteration.
	 * To iterate over the unboxed values of the map, use `Symbol.Iterator()`.
	 */
	[boxedIterator](): IterableIterator<TypedField<TSchema["mapFields"]>>;

	[Symbol.iterator](): IterableIterator<UnboxField<TSchema["mapFields"], "notEmpty">>;

	/**
	 * An enumerable own property which allows JavaScript object traversals to access {@link Sequence} content.
	 * It is recommenced to NOT use this when possible (for performance and type safety reasons): instead use {@link MapNode.get} or iterate over fields with `Symbol.iterator`.
	 * See [ReadMe](./README.md) for details.
	 *
	 * This object is not guaranteed to be kept up to date across edits and thus should not be held onto across edits.
	 */
	readonly asObject: {
		readonly [P in FieldKey]?: UnboxField<TSchema["mapFields"]>;
	};
}

/**
 * A {@link TreeNode} that wraps a single {@link TreeField} (which is placed under the {@link EmptyKey}).
 *
 * @remarks
 * FieldNodes unbox to their content, so in schema aware APIs which do unboxing, the FieldNode itself will be skipped over.
 * This layer of field nodes is then omitted when using schema-aware APIs which do unboxing.
 * Other than this unboxing, a FieldNode is identical to a struct node with a single field using the {@link EmptyKey}.
 *
 * There are several use-cases where it makes sense to use a field node.
 * Here are a few:
 * - When it's necessary to differentiate between an empty sequence, and no sequence.
 * One case where this is needed is encoding Json.
 * - When polymorphism over {@link FieldSchema} (and not just a union of {@link AllowedTypes}) is required.
 * For example when encoding a schema for a type like
 * `Foo[] | Bar[]`, `Foo | Foo[]` or `Optional<Foo> | Optional<Bar>` (Where `Optional` is the Optional field kind, not TypeScript's `Optional`).
 * Since this schema system only allows `|` of {@link TreeSchema} (and only when declaring a {@link FieldSchema}), see {@link SchemaBuilder.field},
 * these aggregate types are most simply expressed by creating fieldNodes for the terms like `Foo[]`, and `Optional<Foo>`.
 * Note that these are distinct from types like `(Foo | Bar)[]` and `Optional<Foo | Bar>` which can be expressed as single fields without extra nodes.
 * - When a distinct merge identity is desired for a field.
 * For example, if the application wants to be able to have an optional node or a sequence which it can pass around, edit and observe changes to,
 * in some cases (like when the content is moved to a different parent) this can be more flexible if a field node is introduced
 * to create a separate logical entity (node) which wraps the field.
 * This can even be useful with value fields to wrap terminal nodes if a stable merge
 * - When a field (such as a {@link Sequence}) is desired in a location where {@link TreeNode}s are required
 * (like the member of a union or the child of another {@link TreeField}).
 * This can is typically just a different perspective on one of the above cases.
 * For example:
 * `Sequence<Foo> | Sequence<Bar>` or `OptionalField<Sequence<Foo>>` can't be expressed as simple fields
 * (unlike `Sequence<Foo | Bar>` or `OptionalField<Foo>` which can be done as simple fields).
 * Instead {@link FieldNode}s can be use to achieve something similar, more like:
 * `FieldNode<Sequence<Foo>> | FieldNode<Sequence<Bar>>` or `OptionalField<FieldNode<Sequence<Foo>>>`.
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
 * A {@link TreeNode} that behaves like struct, providing properties to access its fields.
 *
 * Struct nodes consist of a finite collection of fields, each with their own (distinct) key and {@link FieldSchema}.
 *
 * @remarks
 * Struct nodes require complex typing, and have been split into two parts for implementation purposes.
 * See {@link StructTyped} for the schema aware extensions to this that provide access to the fields.
 *
 * These "Structs" resemble (and are named after) "Structs" from a wide variety of programming languages
 * (Including Algol 68, C, Go, Rust, C# etc.).
 * Struct nodes also somewhat resemble JavaScript objects: this analogy is less precise (objects don't have a fixed schema for example),
 * which is why "Struct" nodes are named after "Structs" instead.
 *
 * Another common name for this abstraction is [record](https://en.wikipedia.org/wiki/Record_(computer_science)).
 * The name "Record" is avoided (in favor of Struct) here because it has less precise connotations for most TypeScript developers.
 * For example, TypeScript has a built in `Record` type, but it requires all of the fields to have the same type,
 * putting its semantics half way between this library's "Struct" schema and {@link MapNode}.
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
 * A {@link TreeNode} that behaves like struct, providing properties to access its fields.
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
 * Type to ensures two types overlap in at least one way.
 * It evaluates to the input type if this is true, and never otherwise.
 * Examples:
 * CheckTypesOverlap\<number | boolean, number | object\> = number | boolean
 * CheckTypesOverlap\<number | boolean, string | object\> = never
 * @alpha
 */
export type CheckTypesOverlap<T, TCheck> = [Extract<T, TCheck> extends never ? never : T][0];

/**
 * {@link TreeField} that stores a sequence of children.
 *
 * Sequence fields can contain an ordered sequence any number of {@link TreeNode}s which must be of the {@link AllowedTypes} from the {@link FieldSchema}).
 *
 * @remarks
 * Allows for concurrent editing based on index, adjusting the locations of indexes as needed so they apply to the same logical place in the sequence when rebased and merged.
 *
 * Edits to sequence fields are anchored relative to their surroundings, so concurrent edits can result in the indexes of nodes and edits getting shifted.
 * To hold onto locations in sequence across an edit, use anchors.
 *
 * @privateRemarks
 * TODO:
 * Add anchor API that can actually hold onto locations in a sequence.
 * Currently only nodes can be held onto with anchors, and this does not replicate the behavior implemented for editing.
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
	 * @param callbackfn - A function that accepts the child and its index.
	 */
	map<U>(callbackfn: (value: UnboxNodeUnion<TTypes>, index: number) => U): U[];

	/**
	 * Calls the provided callback function on each child of this sequence, and returns an array that contains the results.
	 * @param callbackfn - A function that accepts the child and its index.
	 */
	mapBoxed<U>(callbackfn: (value: TypedNodeUnion<TTypes>, index: number) => U): U[];

	readonly length: number;

	/**
	 * Inserts new item(s) at a specified location.
	 * @param index - The index at which to insert `value`.
	 * @param value - The content to insert.
	 * @throws Throws if any of the input indices are invalid.
	 */
	insertAt(index: number, value: FlexibleNodeContent<TTypes>[]): void;

	/**
	 * Inserts new item(s) at the start of the sequence.
	 * @param value - The content to insert.
	 * @throws Throws if any of the input indices are invalid.
	 */
	insertAtStart(value: FlexibleNodeContent<TTypes>[]): void;

	/**
	 * Inserts new item(s) at the end of the sequence.
	 * @param value - The content to insert.
	 * @throws Throws if any of the input indices are invalid.
	 */
	insertAtEnd(value: FlexibleNodeContent<TTypes>[]): void;

	/**
	 * Removes the item at the specified location.
	 * @param index - The index at which to remove the item.
	 * @throws Throws if any of the input indices are invalid.
	 */
	removeAt(index: number): void;

	/**
	 * Removes all items between the specified indices.
	 * @param start - The starting index of the range to remove (inclusive). Defaults to the start of the sequence.
	 * @param end - The ending index of the range to remove (exclusive).
	 * @throws Throws if any of the input indices are invalid.
	 * If `end` is not supplied or is greater than the length of the sequence, all items after `start` are deleted.
	 */
	removeRange(start?: number, end?: number): void;

	/**
	 * Moves the specified items to the start of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToStart(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the start of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source sequence to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence or if the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToStart<TTypesSource extends AllowedTypes>(
		sourceStart: number,
		sourceEnd: number,
		source: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void;

	/**
	 * Moves the specified items to the end of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToEnd(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the end of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source sequence to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence or if the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToEnd<TTypesSource extends AllowedTypes>(
		sourceStart: number,
		sourceEnd: number,
		source: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void;

	/**
	 * Moves the specified items to the desired location within the sequence.
	 * @param index - The index to move the items to.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToIndex(index: number, sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the desired location within the sequence.
	 * @param index - The index to move the items to.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source sequence to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence or if the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToIndex<TTypesSource extends AllowedTypes>(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void;

	[boxedIterator](): IterableIterator<TypedNodeUnion<TTypes>>;

	[Symbol.iterator](): IterableIterator<UnboxNodeUnion<TTypes>>;

	/**
	 * An enumerable own property which allows JavaScript object traversals to access {@link Sequence} content.
	 * It is recommenced to NOT use this when possible (for performance and type safety reasons): instead use {@link Sequence#at} or iterate over nodes with `Symbol.iterator`.
	 * See [ReadMe](./README.md) for details.
	 *
	 * This array is not guaranteed to be kept up to date across edits and thus should not be held onto across edits.
	 */
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
 *
 * @privateRemarks
 * TODO: Document merge semitics
 * TODO: Allow Optional fields to be used with last write wins OR first write wins merge resolution.
 * TODO:
 * Better centralize the documentation about what kinds of merge semantics are available for field kinds.
 * Maybe link editor?
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
	Kind extends FieldKind,
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
export type UnboxField<
	TSchema extends FieldSchema,
	// If "notEmpty", then optional fields will unbox to their content (not their content | undefined)
	Emptiness extends "maybeEmpty" | "notEmpty" = "maybeEmpty",
> = UnboxFieldInner<TSchema["kind"], TSchema["allowedTypes"], Emptiness>;

/**
 * Helper for implementing {@link InternalEditableTreeTypes#UnboxField}.
 * @alpha
 */
export type UnboxFieldInner<
	Kind extends FieldKind,
	TTypes extends AllowedTypes,
	Emptiness extends "maybeEmpty" | "notEmpty",
> = Kind extends typeof FieldKinds.sequence
	? Sequence<TTypes>
	: Kind extends typeof FieldKinds.value
	? UnboxNodeUnion<TTypes>
	: Kind extends typeof FieldKinds.optional
	? UnboxNodeUnion<TTypes> | (Emptiness extends "notEmpty" ? never : undefined)
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
