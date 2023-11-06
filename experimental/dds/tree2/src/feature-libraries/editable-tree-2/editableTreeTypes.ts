/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as SchemaAware from "../schema-aware";
import { FieldKey, TreeNodeSchemaIdentifier, TreeValue } from "../../core";
import { Assume, FlattenKeys, RestrictiveReadonlyRecord, _InlineTrick } from "../../util";
import { LocalNodeKey, StableNodeKey } from "../node-key";
import {
	TreeFieldSchema,
	InternalTypedSchemaTypes,
	TreeNodeSchema,
	AllowedTypes,
	FieldNodeSchema,
	LeafSchema,
	MapSchema,
	ObjectNodeSchema,
	Any,
	ArrayHasFixedLength,
} from "../typed-schema";
import { EditableTreeEvents } from "../untypedTree";
import { FieldKinds } from "../default-field-kinds";
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
export interface Tree<out TSchema = unknown> {
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
 * Status of the tree that a particular node in {@link Tree} belongs to.
 * @alpha
 */
export enum TreeStatus {
	/**
	 * Is parented under the root field.
	 */
	InDocument = 0,

	/**
	 * Is not parented under the root field, but can be added back to the original document tree.
	 */
	Removed = 1,

	/**
	 * Is removed and cannot be added back to the original document tree.
	 */
	Deleted = 2,
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
export interface TreeNode extends Tree<TreeNodeSchema> {
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
	is<TSchema extends TreeNodeSchema>(schema: TSchema): this is TypedNode<TSchema>;

	/**
	 * Same as `this.schema.name`.
	 * This is provided as an enumerable own property to aid with JavaScript object traversals of this data-structure.
	 * See [ReadMe](./README.md) for details.
	 */
	readonly type: TreeNodeSchemaIdentifier;

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
export interface TreeField extends Tree<TreeFieldSchema> {
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
	is<TSchema extends TreeFieldSchema>(schema: TSchema): this is TypedField<TSchema>;

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
 * A {@link TreeNode} that behaves like a `Map<string, Field>` for a specific `Field` type.
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
export interface MapNode<in out TSchema extends MapSchema> extends TreeNode {
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
	 */
	has(key: string): boolean;

	/**
	 * Get the value associated with `key`.
	 * @param key - which map entry to look up.
	 */
	get(key: string): UnboxField<TSchema["mapFields"]>;

	/**
	 * Get the field for `key`.
	 * @param key - which map entry to look up.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, so `get` can be called with any key and will always return a field.
	 * Even if the field is empty, it will still be returned, and can be edited to insert content into the map.
	 */
	getBoxed(key: string): TypedField<TSchema["mapFields"]>;

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
	values(): IterableIterator<UnboxField<TSchema["mapFields"], "notEmpty">>;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, but `entries` will yield only the entries whose fields contain one or more nodes.
	 *
	 * This iteration provided by `entries()` is equivalent to that provided by direct iteration of the {@link MapNode} (a.k.a. `[Symbol.Iterator]()`).
	 */
	entries(): IterableIterator<[FieldKey, UnboxField<TSchema["mapFields"], "notEmpty">]>;

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
			value: UnboxField<TSchema["mapFields"], "notEmpty">,
			key: FieldKey,
			map: MapNode<TSchema>,
		) => void,
		thisArg?: any,
	): void;

	/**
	 * Adds or updates an entry in the map with a specified `key` and a `value`.
	 *
	 * @param key - The key of the element to add to the map.
	 * @param value - The value of the element to add to the map.
	 */
	set(key: string, value: FlexibleFieldContent<TSchema["mapFields"]>): void;

	/**
	 * Removes the specified element from this map by its `key`.
	 *
	 * @remarks
	 * Note: unlike JavaScript's Map API, this method does not return a flag indicating whether or not the value was
	 * deleted.
	 *
	 * @privateRemarks
	 * Regarding the choice to not return a boolean: Since this data structure is distributed in nature, it isn't
	 * possible to tell whether or not the item was deleted as a result of this method call. Returning a "best guess"
	 * is more likely to create issues / promote bad usage patterns than offer useful information.
	 *
	 * @param key - The key of the element to remove from the map.
	 */
	delete(key: string): void;

	/**
	 * Iterate through all fields in the map.
	 *
	 * @remarks
	 * No mutations to the current view of the shared tree are permitted during iteration.
	 * To iterate over the unboxed values of the map, use `Symbol.Iterator()`.
	 */
	[boxedIterator](): IterableIterator<TypedField<TSchema["mapFields"]>>;

	[Symbol.iterator](): IterableIterator<[FieldKey, UnboxField<TSchema["mapFields"], "notEmpty">]>;

	/**
	 * An enumerable own property which allows JavaScript object traversals to access {@link Sequence} content.
	 * It is recommenced to NOT use this when possible (for performance and type safety reasons): instead use {@link MapNode.get} or iterate over fields with `Symbol.iterator`.
	 * See [ReadMe](./README.md) for details.
	 *
	 * This object is not guaranteed to be kept up to date across edits and thus should not be held onto across edits.
	 */
	readonly asObject: {
		readonly [P in FieldKey]?: UnboxField<TSchema["mapFields"], "notEmpty">;
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
 * - When polymorphism over {@link TreeFieldSchema} (and not just a union of {@link AllowedTypes}) is required.
 * For example when encoding a schema for a type like
 * `Foo[] | Bar[]`, `Foo | Foo[]` or `Optional<Foo> | Optional<Bar>` (Where `Optional` is the Optional field kind, not TypeScript's `Optional`).
 * Since this schema system only allows `|` of {@link TreeNodeSchema} (and only when declaring a {@link TreeFieldSchema}), see {@link SchemaBuilderBase.field},
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
 * @privateRemarks
 * TODO: The rule walking over the tree via enumerable own properties is lossless (see [ReadMe](./README.md) for details)
 * fails to be true for recursive field nodes with field kind optional, since the length of the chain of field nodes is lost.
 * THis could be fixed by tweaking the unboxing rules, or simply ban view schema that would have this problem (check for recursive optional field nodes).
 * Replacing the field node pattern with one where the FieldNode node exposes APIs from its field instead of unboxing could have the same issue, and same solutions.
 * @alpha
 */
export interface FieldNode<in out TSchema extends FieldNodeSchema> extends TreeNode {
	/**
	 * The content this field node wraps.
	 * @remarks
	 * This is a version of {@link FieldNode.boxedContent} but does unboxing.
	 * Since field node are usually used to wrap fields which don't do unboxing (like {@link Sequence})
	 */
	readonly content: UnboxField<TSchema["objectNodeFieldsObject"][""]>;
	/**
	 * The field this field node wraps.
	 *
	 * @remarks
	 * Since field nodes are usually used to wrap fields which don't do unboxing (like {@link Sequence}),
	 * this is usually the same as {@link FieldNode.content}.
	 * This is also the same as `[...this][0]`.
	 */
	readonly boxedContent: TypedField<TSchema["objectNodeFieldsObject"][""]>;
}

/**
 * A {@link TreeNode} that behaves like an "object" or "struct", providing properties to access its fields.
 *
 * ObjectNodes consist of a finite collection of fields, each with their own (distinct) key and {@link TreeFieldSchema}.
 *
 * @remarks
 * ObjectNodes require complex typing, and have been split into two parts for implementation purposes.
 * See {@link ObjectNodeTyped} for the schema aware extensions to this that provide access to the fields.
 *
 * These "Objects" resemble "Structs" from a wide variety of programming languages
 * (Including Algol 68, C, Go, Rust, C# etc.).
 * ObjectNodes also somewhat resemble JavaScript objects: this analogy is less precise (objects don't have a fixed schema for example),
 * but for consistency with other systems in the JavaScript ecosystem (like JSON) is "ObjectNodes" nodes are named "Objects".
 *
 * Another common name for this abstraction is [record](https://en.wikipedia.org/wiki/Record_(computer_science)).
 * The name "Record" is avoided (in favor of Object) here because it has less precise connotations for most TypeScript developers.
 * For example, TypeScript has a built in `Record` type, but it requires all of the fields to have the same type,
 * putting its semantics half way between this library's "Object" schema and {@link MapNode}.
 *
 * @alpha
 */
export interface ObjectNode extends TreeNode {
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
export interface Leaf<in out TSchema extends LeafSchema> extends TreeNode {
	/**
	 * Value stored on this node.
	 */
	readonly value: TreeValue<TSchema["leafValue"]>;
}

/**
 * An {@link ObjectNode} with schema aware accessors for its fields.
 *
 * @privateRemarks
 *
 * The corresponding implementation logic for this lives in `LazyTree.ts` under `buildStructClass`.
 * If you change the signature here, you will need to update that logic to match.
 *
 * @alpha
 */
export type ObjectNodeTyped<TSchema extends ObjectNodeSchema> = ObjectNodeSchema extends TSchema
	? ObjectNode
	: ObjectNode & ObjectNodeFields<TSchema["objectNodeFieldsObject"]>;

/**
 * Properties to access an object node's fields. See {@link ObjectNodeTyped}.
 *
 * @privateRemarks TODOs:
 *
 * 1. Support custom field keys.
 *
 * 2. Do we keep assignment operator + "setFoo" methods, or just use methods?
 * Inconsistency in the API experience could confusing for consumers.
 *
 * @alpha
 */
export type ObjectNodeFields<TFields extends RestrictiveReadonlyRecord<string, TreeFieldSchema>> =
	FlattenKeys<
		{
			// boxed fields (TODO: maybe remove these when same as non-boxed version?)
			readonly [key in keyof TFields as `boxed${Capitalize<key & string>}`]: TypedField<
				TFields[key]
			>;
		} & {
			// Add getter only (make property readonly) when the field is **not** of a kind that has a logical set operation.
			// If we could map to getters and setters separately, we would preferably do that, but we can't.
			// See https://github.com/microsoft/TypeScript/issues/43826 for more details on this limitation.
			readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
				? never
				: key]: UnboxField<TFields[key]>;
		} & {
			// Add setter (make property writable) when the field is of a kind that has a logical set operation.
			// If we could map to getters and setters separately, we would preferably do that, but we can't.
			// See https://github.com/microsoft/TypeScript/issues/43826 for more details on this limitation.
			-readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
				? key
				: never]: UnboxField<TFields[key]>;
		} & {
			// Setter method (when the field is of a kind that has a logical set operation).
			readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
				? `set${Capitalize<key & string>}`
				: never]: (content: FlexibleFieldContent<TFields[key]>) => void;
		}
	>;

/**
 * Field kinds that allow value assignment.
 *
 * @alpha
 */
export type AssignableFieldKinds = typeof FieldKinds.optional | typeof FieldKinds.required;

// #endregion

// #region Field Kinds

/**
 * Strongly typed tree literals for inserting as the content of a field.
 * @alpha
 */
export type FlexibleFieldContent<TSchema extends TreeFieldSchema> = SchemaAware.TypedField<
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
 * Sequence fields can contain an ordered sequence any number of {@link TreeNode}s which must be of the {@link AllowedTypes} from the {@link TreeFieldSchema}).
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
export interface Sequence<in out TTypes extends AllowedTypes> extends TreeField {
	/**
	 * Gets a node of this field by its index with unboxing.
	 * @param index - Zero-based index of the item to retrieve. Negative values are interpreted from the end of the sequence.
	 *
	 * @returns The element in the sequence matching the given index. Always returns undefined if index \< -sequence.length
	 * or index \>= array.length.
	 *
	 * @remarks
	 * Semantics match {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/at | Array.at}.
	 */
	at(index: number): UnboxNodeUnion<TTypes> | undefined;

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
	 * @throws Throws if `index` is not in the range [0, `list.length`).
	 */
	insertAt(index: number, value: Iterable<FlexibleNodeContent<TTypes>>): void;

	/**
	 * Inserts new item(s) at the start of the sequence.
	 * @param value - The content to insert.
	 */
	insertAtStart(value: Iterable<FlexibleNodeContent<TTypes>>): void;

	/**
	 * Inserts new item(s) at the end of the sequence.
	 * @param value - The content to insert.
	 */
	insertAtEnd(value: Iterable<FlexibleNodeContent<TTypes>>): void;

	/**
	 * Removes the item at the specified location.
	 * @param index - The index at which to remove the item.
	 * @throws Throws if `index` is not in the range [0, `list.length`).
	 */
	removeAt(index: number): void;

	/**
	 * Removes all items between the specified indices.
	 * @param start - The starting index of the range to remove (inclusive). Defaults to the start of the sequence.
	 * @param end - The ending index of the range to remove (exclusive).
	 * @throws Throws if `start` is not in the range [0, `list.length`).
	 * @throws Throws if `end` is less than `start`.
	 * If `end` is not supplied or is greater than the length of the sequence, all items after `start` are deleted.
	 */
	removeRange(start?: number, end?: number): void;

	/**
	 * Moves the specified item to the start of the sequence.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if `sourceIndex` is not in the range [0, `list.length`).
	 */
	moveToStart(sourceIndex: number): void;

	/**
	 * Moves the specified item to the start of the sequence.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source sequence to move the item out of.
	 * @throws Throws if `sourceIndex` is not in the range [0, `list.length`).
	 */
	moveToStart(sourceIndex: number, source: Sequence<AllowedTypes>): void;

	/**
	 * Moves the specified item to the end of the sequence.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if `sourceIndex` is not in the range [0, `list.length`).
	 */
	moveToEnd(sourceIndex: number): void;

	/**
	 * Moves the specified item to the end of the sequence.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source sequence to move the item out of.
	 * @throws Throws if `sourceIndex` is not in the range [0, `list.length`).
	 */
	moveToEnd(sourceIndex: number, source: Sequence<AllowedTypes>): void;

	/**
	 * Moves the specified item to the desired location in the sequence.
	 * @param index - The index to move the item to.
	 * This is based on the state of the sequence before moving the source item.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if any of the input indices are not in the range [0, `list.length`).
	 */
	moveToIndex(index: number, sourceIndex: number): void;

	/**
	 * Moves the specified item to the desired location in the sequence.
	 * @param index - The index to move the item to.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source sequence to move the item out of.
	 * @throws Throws if any of the input indices are not in the range [0, `list.length`).
	 */
	moveToIndex(index: number, sourceIndex: number, source: Sequence<AllowedTypes>): void;

	/**
	 * Moves the specified items to the start of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if either of the input indices are not in the range [0, `list.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToStart(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the start of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source sequence to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence,
	 * if either of the input indices are not in the range [0, `list.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToStart(sourceStart: number, sourceEnd: number, source: Sequence<AllowedTypes>): void;

	/**
	 * Moves the specified items to the end of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if either of the input indices are not in the range [0, `list.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToEnd(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the end of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source sequence to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence,
	 * if either of the input indices are not in the range [0, `list.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToEnd(sourceStart: number, sourceEnd: number, source: Sequence<AllowedTypes>): void;

	/**
	 * Moves the specified items to the desired location within the sequence.
	 * @param index - The index to move the items to.
	 * This is based on the state of the sequence before moving the source items.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are not in the range [0, `list.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToIndex(index: number, sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the desired location within the sequence.
	 * @param index - The index to move the items to.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source sequence to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence,
	 * if any of the input indices are not in the range [0, `list.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToIndex(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source: Sequence<AllowedTypes>,
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
	get content(): UnboxNodeUnion<TTypes>;
	set content(content: FlexibleNodeContent<TTypes>);

	readonly boxedContent: TypedNodeUnion<TTypes>;
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
	get content(): UnboxNodeUnion<TTypes> | undefined;
	set content(newContent: FlexibleNodeContent<TTypes> | undefined);

	readonly boxedContent?: TypedNodeUnion<TTypes>;
}

/**
 * Field that contains an immutable {@link StableNodeKey} identifying this node.
 * @alpha
 */
export interface NodeKeyField extends TreeField {
	readonly localNodeKey: LocalNodeKey;
	readonly stableNodeKey: StableNodeKey;
}

// #endregion

// #region Typed

/**
 * Schema aware specialization of {@link TreeField}.
 * @alpha
 */
export type TypedField<TSchema extends TreeFieldSchema> = TypedFieldInner<
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
	: Kind extends typeof FieldKinds.required
	? RequiredField<Types>
	: Kind extends typeof FieldKinds.optional
	? OptionalField<Types>
	: Kind extends typeof FieldKinds.nodeKey
	? NodeKeyField
	: TreeField;

/**
 * Schema aware specialization of {@link TreeNode} for a given {@link AllowedTypes}.
 * @alpha
 */
export type TypedNodeUnion<TTypes extends AllowedTypes> =
	TTypes extends InternalTypedSchemaTypes.FlexList<TreeNodeSchema>
		? TypedNodeUnionHelper<TTypes>
		: TreeNode;

/**
 * Helper for implementing TypedNodeUnion.
 * @privateRemarks
 * Inlining this into TypedNodeUnion causes it to not compile.
 * The reason for this us unknown, but splitting it out fixed it.
 * @alpha
 */
export type TypedNodeUnionHelper<TTypes extends InternalTypedSchemaTypes.FlexList<TreeNodeSchema>> =
	InternalTypedSchemaTypes.ArrayToUnion<
		TypeArrayToTypedTreeArray<
			Assume<
				InternalTypedSchemaTypes.FlexListToNonLazyArray<TTypes>,
				readonly TreeNodeSchema[]
			>
		>
	>;
/**
 * Takes in `TreeNodeSchema[]` and returns a TypedNode union.
 * @alpha
 */
export type TypeArrayToTypedTreeArray<T extends readonly TreeNodeSchema[]> = [
	ArrayHasFixedLength<T> extends false
		? T extends readonly (infer InnerT)[]
			? [TypedNode<Assume<InnerT, TreeNodeSchema>>]
			: never
		: FixedSizeTypeArrayToTypedTree<T>,
][_InlineTrick];

/**
 * Takes in `TreeNodeSchema[]` and returns a TypedNode union.
 * @alpha
 */
export type FixedSizeTypeArrayToTypedTree<T extends readonly TreeNodeSchema[]> = [
	T extends readonly [infer Head, ...infer Tail]
		? [
				TypedNode<Assume<Head, TreeNodeSchema>>,
				...FixedSizeTypeArrayToTypedTree<Assume<Tail, readonly TreeNodeSchema[]>>,
		  ]
		: [],
][_InlineTrick];

/**
 * Schema aware specialization of {@link Tree}.
 * @alpha
 */
export type Typed<TSchema extends TreeFieldSchema | TreeNodeSchema> = TSchema extends TreeNodeSchema
	? TypedNode<TSchema>
	: TypedField<Assume<TSchema, TreeFieldSchema>>;

/**
 * Schema aware specialization of {@link TreeNode} for a given {@link TreeNodeSchema}.
 * @alpha
 */
export type TypedNode<TSchema extends TreeNodeSchema> = TSchema extends LeafSchema
	? Leaf<TSchema>
	: TSchema extends MapSchema
	? MapNode<TSchema>
	: TSchema extends FieldNodeSchema
	? FieldNode<TSchema>
	: TSchema extends ObjectNodeSchema
	? ObjectNodeTyped<TSchema>
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
	TSchema extends TreeFieldSchema,
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
	: Kind extends typeof FieldKinds.required
	? UnboxNodeUnion<TTypes>
	: Kind extends typeof FieldKinds.optional
	? UnboxNodeUnion<TTypes> | (Emptiness extends "notEmpty" ? never : undefined)
	: // Since struct already provides a short-hand accessor for the local field key, and the field provides a nicer general API than the node under it in this case, do not unbox nodeKey fields.
	Kind extends typeof FieldKinds.nodeKey
	? NodeKeyField
	: // TODO: forbidden
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
	? InnerType extends TreeNodeSchema
		? UnboxNode<InnerType>
		: InnerType extends Any
		? TreeNode
		: // This case should not occur. If the result ever ends up unknown, look at places like this to debug.
		  unknown
	: boolean extends IsArrayOfOne<TTypes>
	? UnknownUnboxed // Unknown if this will unbox. This should mainly happen when TTypes is AllowedTypes.
	: TypedNodeUnion<TTypes>; // Known to not be a single type, so known not to unbox.

/**
 * `true` if T is known to be an array of one item.
 * `false` if T is known not to be an array of one item.
 * `boolean` if it is unknown if T is an array of one item or not.
 * @alpha
 */
export type IsArrayOfOne<T extends readonly unknown[]> = T["length"] extends 1
	? true
	: 1 extends T["length"]
	? boolean
	: false;

/**
 * Schema aware unboxed tree type.
 * @remarks
 * Unboxes if the node kind does unboxing.
 * Recursively unboxes that content as well if it does unboxing.
 * @alpha
 */
export type UnboxNode<TSchema extends TreeNodeSchema> = TSchema extends LeafSchema
	? TreeValue<TSchema["leafValue"]>
	: TSchema extends MapSchema
	? MapNode<TSchema>
	: TSchema extends FieldNodeSchema
	? UnboxField<TSchema["objectNodeFieldsObject"][""]>
	: TSchema extends ObjectNodeSchema
	? ObjectNodeTyped<TSchema>
	: UnknownUnboxed;

/**
 * Unboxed tree type for unknown schema cases.
 * @alpha
 */
export type UnknownUnboxed = TreeValue | TreeNode | TreeField;

// #endregion
