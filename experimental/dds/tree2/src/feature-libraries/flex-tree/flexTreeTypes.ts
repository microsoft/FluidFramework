/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: remove flexible types from "schema-aware", and just accept cursors.
import * as SchemaAware from "../schema-aware";
import { FieldKey, ITreeCursorSynchronous, TreeNodeSchemaIdentifier, TreeValue } from "../../core";
import { Assume, FlattenKeys, _InlineTrick } from "../../util";
import { LocalNodeKey, StableNodeKey } from "../node-key";
import {
	TreeFieldSchema,
	InternalTypedSchemaTypes,
	TreeNodeSchema,
	AllowedTypes,
	FieldNodeSchema,
	LeafNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	Any,
	ArrayHasFixedLength,
	Fields,
} from "../typed-schema";
import { FieldKinds } from "../default-schema";
import { FieldKind } from "../modular-schema";
import { EditableTreeEvents } from "./treeEvents";
import { FlexTreeContext } from "./context";

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
export interface FlexTreeEntity<out TSchema = unknown> {
	/**
	 * Schema for this entity.
	 * If well-formed, it must follow this schema.
	 */
	readonly schema: TSchema;

	/**
	 * A common context of a "forest" of EditableTrees.
	 */
	readonly context: FlexTreeContext;

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
	[boxedIterator](): IterableIterator<FlexTreeEntity>;
}

/**
 * Status of the tree that a particular node belongs to.
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
 * {@inheritdoc TreeNode.[onNextChange]}
 */
export const onNextChange = Symbol("onNextChange");

/**
 * Generic tree node API.
 *
 * Nodes are (shallowly) immutable and have a logical identity, a type and either a value or fields under string keys.
 *
 * This "logical identity" is exposed as the object identity: if a node is moved within a document,
 * the same {@link FlexTreeNode} instance will be used in the new location.
 * Similarly, edits applied to a node's sub-tree concurrently with the move of the node will still be applied to its subtree in its new location.
 *
 *
 * @remarks
 * Down-casting (via {@link FlexTreeNode#is}) is required to access Schema-Aware APIs, including editing.
 * All content in the tree is accessible without down-casting, but if the schema is known,
 * the schema aware API may be more ergonomic.
 * All editing is actually done via {@link FlexTreeField}s: the nodes are immutable other than that they contain mutable fields.
 *
 * @alpha
 */
export interface FlexTreeNode extends FlexTreeEntity<TreeNodeSchema> {
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
	tryGetField(key: FieldKey): undefined | FlexTreeField;

	/**
	 * The field this tree is in, and the index within that field.
	 */
	readonly parentField: { readonly parent: FlexTreeField; readonly index: number };

	/**
	 * Type guard for narrowing / down-casting to a specific schema.
	 */
	is<TSchema extends TreeNodeSchema>(schema: TSchema): this is FlexTreeTypedNode<TSchema>;

	/**
	 * Same as `this.schema.name`.
	 * This is provided as an enumerable own property to aid with JavaScript object traversals of this data-structure.
	 * See [ReadMe](./README.md) for details.
	 */
	readonly type: TreeNodeSchemaIdentifier;

	[boxedIterator](): IterableIterator<FlexTreeField>;

	/**
	 * Subscribe to the next change that affects this node's children.
	 * @returns a function which will deregister the registered event.
	 * It has no effect if the event was already deregistered.
	 * @remarks
	 * The given function will be run the next time that this node's direct children change.
	 * It will only be run once, and thereafter automatically deregistered.
	 * It does not run in response to changes beneath this node's direct children.
	 * This event fires after the tree has been mutated but before {@link EditableTreeEvents.afterChange}.
	 * Only one subscriber may register to this event at the same time.
	 * @privateRemarks
	 * This event allows the proxy-based API that is built on top of the editable tree to maintain invariants
	 * around "hydrating" proxies that were created with schema-provided factory functions.
	 * It is not a public API and thus the symbol for this property is not exported.
	 */
	[onNextChange](fn: (node: FlexTreeNode) => void): () => void;
}

/**
 * A collaboratively editable collection of nodes within a {@link FlexTreeEntity}.
 *
 * Fields are inherently part of their parent, and thus cannot be moved.
 * Instead their content can be moved, deleted or created.
 *
 * Editing operations are only valid on trees with the {@link TreeStatus#InDocument} `TreeStatus`.
 *
 * @remarks
 * Fields are used wherever an editable collection of nodes is required.
 * This is required in two places:
 * 1. To hold the children of non-leaf {@link FlexTreeNode}s.
 * 2. As the root of a {@link FlexTreeEntity}.
 *
 * Down-casting (via {@link FlexTreeField.is}) is required to access Schema-Aware APIs, including editing.
 * All content in the tree is accessible without down-casting, but if the schema is known,
 * the schema aware API may be more ergonomic.
 *
 * @alpha
 */
export interface FlexTreeField extends FlexTreeEntity<TreeFieldSchema> {
	/**
	 * The `FieldKey` this field is under.
	 * Defines what part of its parent this field makes up.
	 */
	readonly key: FieldKey;

	/**
	 * The node which has this field on it under `fieldKey`.
	 * `undefined` iff this field is a detached field.
	 */
	readonly parent?: FlexTreeNode;

	/**
	 * Type guard for narrowing / down-casting to a specific schema.
	 */
	is<TSchema extends TreeFieldSchema>(schema: TSchema): this is FlexTreeTypedField<TSchema>;

	[boxedIterator](): IterableIterator<FlexTreeNode>;

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
	isSameAs(other: FlexTreeField): boolean;
}

// #region Node Kinds

/**
 * A {@link FlexTreeNode} that behaves like a `Map<string, Field>` for a specific `Field` type.
 *
 * @remarks
 * Unlike TypeScript Map type, {@link FlexTreeMapNode.get} always provides a reference to any field looked up, even if it has never been set.
 *
 * This means that, for example, a `MapNode` of {@link FlexTreeSequenceField} fields will return an empty sequence when a previously unused key is looked up,
 * and that sequence can be used to insert new items into the field.
 * Additionally empty fields (those containing no nodes) are not distinguished from fields which do not exist.
 * This differs from JavaScript Maps which have a subtle distinction between storing undefined as a value in the map and deleting an entry from the map.
 *
 * @alpha
 */
export interface FlexTreeMapNode<in out TSchema extends MapNodeSchema> extends FlexTreeNode {
	readonly schema: TSchema;

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
	get(key: string): FlexTreeUnboxField<TSchema["info"]>;

	/**
	 * Get the field for `key`.
	 * @param key - which map entry to look up.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, so `get` can be called with any key and will always return a field.
	 * Even if the field is empty, it will still be returned, and can be edited to insert content into the map.
	 */
	getBoxed(key: string): FlexTreeTypedField<TSchema["info"]>;

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
	values(): IterableIterator<FlexTreeUnboxField<TSchema["info"], "notEmpty">>;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, but `entries` will yield only the entries whose fields contain one or more nodes.
	 *
	 * This iteration provided by `entries()` is equivalent to that provided by direct iteration of the {@link FlexTreeMapNode} (a.k.a. `[Symbol.Iterator]()`).
	 */
	entries(): IterableIterator<[FieldKey, FlexTreeUnboxField<TSchema["info"], "notEmpty">]>;

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
			value: FlexTreeUnboxField<TSchema["info"], "notEmpty">,
			key: FieldKey,
			map: FlexTreeMapNode<TSchema>,
		) => void,
		thisArg?: any,
	): void;

	/**
	 * Adds or updates an entry in the map with a specified `key` and a `value`.
	 *
	 * @param key - The key of the element to add to the map.
	 * @param value - The value of the element to add to the map.
	 */
	set(key: string, value: FlexibleFieldContent<TSchema["info"]>): void;

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
	[boxedIterator](): IterableIterator<FlexTreeTypedField<TSchema["info"]>>;

	[Symbol.iterator](): IterableIterator<
		[FieldKey, FlexTreeUnboxField<TSchema["info"], "notEmpty">]
	>;

	/**
	 * An enumerable own property which allows JavaScript object traversals to access {@link FlexTreeSequenceField} content.
	 * It is recommenced to NOT use this when possible (for performance and type safety reasons): instead use {@link FlexTreeMapNode.get} or iterate over fields with `Symbol.iterator`.
	 * See [ReadMe](./README.md) for details.
	 *
	 * This object is not guaranteed to be kept up to date across edits and thus should not be held onto across edits.
	 */
	readonly asObject: {
		readonly [P in FieldKey]?: FlexTreeUnboxField<TSchema["info"], "notEmpty">;
	};
}

/**
 * A {@link FlexTreeNode} that wraps a single {@link FlexTreeField} (which is placed under the {@link EmptyKey}).
 *
 * @remarks
 * A FieldNode is mostly identical to a struct node with a single field using the {@link EmptyKey}, but provides access to it via a field named "content".
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
 * - When a field (such as a {@link FlexTreeSequenceField}) is desired in a location where {@link FlexTreeNode}s are required
 * (like the member of a union or the child of another {@link FlexTreeField}).
 * This can is typically just a different perspective on one of the above cases.
 * For example:
 * `Sequence<Foo> | Sequence<Bar>` or `OptionalField<Sequence<Foo>>` can't be expressed as simple fields
 * (unlike `Sequence<Foo | Bar>` or `OptionalField<Foo>` which can be done as simple fields).
 * Instead {@link FlexTreeFieldNode}s can be use to achieve something similar, more like:
 * `FieldNode<Sequence<Foo>> | FieldNode<Sequence<Bar>>` or `OptionalField<FieldNode<Sequence<Foo>>>`.
 *
 * @privateRemarks
 * FieldNodes do not unbox to their content, so in schema aware APIs which do unboxing, the FieldNode will NOT be skipped over.
 * This is a change from the old behavior to simplify unboxing and prevent cases where arbitrary deep chains of field nodes could unbox omitting information about the tree depth.
 * @alpha
 */
export interface FlexTreeFieldNode<in out TSchema extends FieldNodeSchema> extends FlexTreeNode {
	readonly schema: TSchema;

	/**
	 * The content this field node wraps.
	 * @remarks
	 * This is a version of {@link FlexTreeFieldNode.boxedContent} but does unboxing.
	 * Since field node are usually used to wrap fields which don't do unboxing (like {@link FlexTreeSequenceField})
	 */
	readonly content: FlexTreeUnboxField<TSchema["info"]>;
	/**
	 * The field this field node wraps.
	 *
	 * @remarks
	 * Since field nodes are usually used to wrap fields which don't do unboxing (like {@link FlexTreeSequenceField}),
	 * this is usually the same as {@link FlexTreeFieldNode.content}.
	 * This is also the same as `[...this][0]`.
	 */
	readonly boxedContent: FlexTreeTypedField<TSchema["info"]>;
}

/**
 * A {@link FlexTreeNode} that behaves like an "object" or "struct", providing properties to access its fields.
 *
 * ObjectNodes consist of a finite collection of fields, each with their own (distinct) key and {@link TreeFieldSchema}.
 *
 * @remarks
 * ObjectNodes require complex typing, and have been split into two parts for implementation purposes.
 * See {@link FlexTreeObjectNodeTyped} for the schema aware extensions to this that provide access to the fields.
 *
 * These "Objects" resemble "Structs" from a wide variety of programming languages
 * (Including Algol 68, C, Go, Rust, C# etc.).
 * ObjectNodes also somewhat resemble JavaScript objects: this analogy is less precise (objects don't have a fixed schema for example),
 * but for consistency with other systems in the JavaScript ecosystem (like JSON) is "ObjectNodes" nodes are named "Objects".
 *
 * Another common name for this abstraction is [record](https://en.wikipedia.org/wiki/Record_(computer_science)).
 * The name "Record" is avoided (in favor of Object) here because it has less precise connotations for most TypeScript developers.
 * For example, TypeScript has a built in `Record` type, but it requires all of the fields to have the same type,
 * putting its semantics half way between this library's "Object" schema and {@link FlexTreeMapNode}.
 *
 * @alpha
 */
export interface FlexTreeObjectNode extends FlexTreeNode {
	readonly schema: ObjectNodeSchema;

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
export interface FlexTreeLeafNode<in out TSchema extends LeafNodeSchema> extends FlexTreeNode {
	readonly schema: TSchema;

	/**
	 * Value stored on this node.
	 */
	readonly value: TreeValue<TSchema["info"]>;
}

/**
 * An {@link FlexTreeObjectNode} with schema aware accessors for its fields.
 *
 * @privateRemarks
 *
 * The corresponding implementation logic for this lives in `LazyTree.ts` under `buildStructClass`.
 * If you change the signature here, you will need to update that logic to match.
 *
 * @alpha
 */
export type FlexTreeObjectNodeTyped<TSchema extends ObjectNodeSchema> =
	ObjectNodeSchema extends TSchema
		? FlexTreeObjectNode
		: FlexTreeObjectNode & FlexTreeObjectNodeFields<TSchema["info"]>;

/**
 * Properties to access an object node's fields. See {@link FlexTreeObjectNodeTyped}.
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
export type FlexTreeObjectNodeFields<TFields extends Fields> = FlattenKeys<
	{
		// boxed fields (TODO: maybe remove these when same as non-boxed version?)
		readonly [key in keyof TFields as `boxed${Capitalize<key & string>}`]: FlexTreeTypedField<
			TFields[key]
		>;
	} & {
		// Add getter only (make property readonly) when the field is **not** of a kind that has a logical set operation.
		// If we could map to getters and setters separately, we would preferably do that, but we can't.
		// See https://github.com/microsoft/TypeScript/issues/43826 for more details on this limitation.
		readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
			? never
			: key]: FlexTreeUnboxField<TFields[key]>;
	} & {
		// Add setter (make property writable) when the field is of a kind that has a logical set operation.
		// If we could map to getters and setters separately, we would preferably do that, but we can't.
		// See https://github.com/microsoft/TypeScript/issues/43826 for more details on this limitation.
		-readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
			? key
			: never]: FlexTreeUnboxField<TFields[key]>;
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
 *
 * If a cursor is provided, it must be in Fields mode.
 * @alpha
 */
export type FlexibleFieldContent<TSchema extends TreeFieldSchema> =
	| SchemaAware.TypedField<TSchema, SchemaAware.ApiMode.Flexible>
	| ITreeCursorSynchronous;

/**
 * Strongly typed tree literals for inserting as a node.
 *
 * If a cursor is provided, it must be in Nodes mode.
 * @alpha
 */
export type FlexibleNodeContent<TTypes extends AllowedTypes> =
	| SchemaAware.AllowedTypesToTypedTrees<SchemaAware.ApiMode.Flexible, TTypes>
	| ITreeCursorSynchronous;

/**
 * Strongly typed tree literals for inserting a subsequence of nodes.
 *
 * Used to insert a batch of 0 or more nodes into some location in a {@link FlexTreeSequenceField}.
 *
 * If a cursor is provided, it must be in Fields mode.
 * @alpha
 */
export type FlexibleNodeSubSequence<TTypes extends AllowedTypes> =
	| Iterable<SchemaAware.AllowedTypesToTypedTrees<SchemaAware.ApiMode.Flexible, TTypes>>
	| ITreeCursorSynchronous;

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
 * {@link FlexTreeField} that stores a sequence of children.
 *
 * Sequence fields can contain an ordered sequence any number of {@link FlexTreeNode}s which must be of the {@link AllowedTypes} from the {@link TreeFieldSchema}).
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
export interface FlexTreeSequenceField<in out TTypes extends AllowedTypes> extends FlexTreeField {
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
	at(index: number): FlexTreeUnboxNodeUnion<TTypes> | undefined;

	/**
	 * Gets a boxed node of this field by its index.
	 * Note that a node must exist at the given index.
	 */
	boxedAt(index: number): FlexTreeTypedNodeUnion<TTypes>;

	/**
	 * Calls the provided callback function on each child of this sequence, and returns an array that contains the results.
	 * @param callbackfn - A function that accepts the child and its index.
	 */
	map<U>(callbackfn: (value: FlexTreeUnboxNodeUnion<TTypes>, index: number) => U): U[];

	/**
	 * Calls the provided callback function on each child of this sequence, and returns an array that contains the results.
	 * @param callbackfn - A function that accepts the child and its index.
	 */
	mapBoxed<U>(callbackfn: (value: FlexTreeTypedNodeUnion<TTypes>, index: number) => U): U[];

	readonly length: number;

	/**
	 * Inserts new item(s) at a specified location.
	 * @param index - The index at which to insert `value`.
	 * @param value - The content to insert.
	 * @throws Throws if `index` is not in the range [0, `list.length`).
	 */
	insertAt(index: number, value: FlexibleNodeSubSequence<TTypes>): void;

	/**
	 * Inserts new item(s) at the start of the sequence.
	 * @param value - The content to insert.
	 */
	insertAtStart(value: FlexibleNodeSubSequence<TTypes>): void;

	/**
	 * Inserts new item(s) at the end of the sequence.
	 * @param value - The content to insert.
	 */
	insertAtEnd(value: FlexibleNodeSubSequence<TTypes>): void;

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
	moveToStart(sourceIndex: number, source: FlexTreeSequenceField<AllowedTypes>): void;

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
	moveToEnd(sourceIndex: number, source: FlexTreeSequenceField<AllowedTypes>): void;

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
	moveToIndex(
		index: number,
		sourceIndex: number,
		source: FlexTreeSequenceField<AllowedTypes>,
	): void;

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
	moveRangeToStart(
		sourceStart: number,
		sourceEnd: number,
		source: FlexTreeSequenceField<AllowedTypes>,
	): void;

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
	moveRangeToEnd(
		sourceStart: number,
		sourceEnd: number,
		source: FlexTreeSequenceField<AllowedTypes>,
	): void;

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
		source: FlexTreeSequenceField<AllowedTypes>,
	): void;

	[boxedIterator](): IterableIterator<FlexTreeTypedNodeUnion<TTypes>>;

	[Symbol.iterator](): IterableIterator<FlexTreeUnboxNodeUnion<TTypes>>;

	/**
	 * An enumerable own property which allows JavaScript object traversals to access {@link FlexTreeSequenceField} content.
	 * It is recommenced to NOT use this when possible (for performance and type safety reasons): instead use {@link FlexTreeSequenceField#at} or iterate over nodes with `Symbol.iterator`.
	 * See [ReadMe](./README.md) for details.
	 *
	 * This array is not guaranteed to be kept up to date across edits and thus should not be held onto across edits.
	 */
	readonly asArray: readonly FlexTreeUnboxNodeUnion<TTypes>[];
}

/**
 * Field that stores exactly one child.
 *
 * @remarks
 * Unboxes its content, so in schema aware APIs which do unboxing, the RequiredField itself will be skipped over and its content will be returned directly.
 * @alpha
 */
export interface FlexTreeRequiredField<in out TTypes extends AllowedTypes> extends FlexTreeField {
	get content(): FlexTreeUnboxNodeUnion<TTypes>;
	set content(content: FlexibleNodeContent<TTypes>);

	readonly boxedContent: FlexTreeTypedNodeUnion<TTypes>;
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
export interface FlexTreeOptionalField<in out TTypes extends AllowedTypes> extends FlexTreeField {
	get content(): FlexTreeUnboxNodeUnion<TTypes> | undefined;
	set content(newContent: FlexibleNodeContent<TTypes> | undefined);

	readonly boxedContent?: FlexTreeTypedNodeUnion<TTypes>;
}

/**
 * Field that contains an immutable {@link StableNodeKey} identifying this node.
 * @alpha
 */
export interface FlexTreeNodeKeyField extends FlexTreeField {
	readonly localNodeKey: LocalNodeKey;
	readonly stableNodeKey: StableNodeKey;
}

// #endregion

// #region Typed

/**
 * Schema aware specialization of {@link FlexTreeField}.
 * @alpha
 */
export type FlexTreeTypedField<TSchema extends TreeFieldSchema> = FlexTreeTypedFieldInner<
	TSchema["kind"],
	TSchema["allowedTypes"]
>;

/**
 * Helper for implementing {@link FlexTreeTypedField}.
 * @alpha
 */
export type FlexTreeTypedFieldInner<
	Kind extends FieldKind,
	Types extends AllowedTypes,
> = Kind extends typeof FieldKinds.sequence
	? FlexTreeSequenceField<Types>
	: Kind extends typeof FieldKinds.required
	? FlexTreeRequiredField<Types>
	: Kind extends typeof FieldKinds.optional
	? FlexTreeOptionalField<Types>
	: Kind extends typeof FieldKinds.nodeKey
	? FlexTreeNodeKeyField
	: FlexTreeField;

/**
 * Schema aware specialization of {@link FlexTreeNode} for a given {@link AllowedTypes}.
 * @alpha
 */
export type FlexTreeTypedNodeUnion<TTypes extends AllowedTypes> =
	TTypes extends InternalTypedSchemaTypes.FlexList<TreeNodeSchema>
		? FlexTreeTypedNodeUnionHelper<TTypes>
		: FlexTreeNode;

/**
 * Helper for implementing TypedNodeUnion.
 * @privateRemarks
 * Inlining this into TypedNodeUnion causes it to not compile.
 * The reason for this us unknown, but splitting it out fixed it.
 * @alpha
 */
export type FlexTreeTypedNodeUnionHelper<
	TTypes extends InternalTypedSchemaTypes.FlexList<TreeNodeSchema>,
> = InternalTypedSchemaTypes.ArrayToUnion<
	TypeArrayToTypedFlexTreeArray<
		Assume<InternalTypedSchemaTypes.FlexListToNonLazyArray<TTypes>, readonly TreeNodeSchema[]>
	>
>;
/**
 * Takes in `TreeNodeSchema[]` and returns a TypedNode union.
 * @alpha
 */
export type TypeArrayToTypedFlexTreeArray<T extends readonly TreeNodeSchema[]> = [
	ArrayHasFixedLength<T> extends false
		? T extends readonly (infer InnerT)[]
			? [FlexTreeTypedNode<Assume<InnerT, TreeNodeSchema>>]
			: never
		: FixedSizeTypeArrayToTypedFlexTree<T>,
][_InlineTrick];

/**
 * Takes in `TreeNodeSchema[]` and returns a TypedNode union.
 * @alpha
 */
export type FixedSizeTypeArrayToTypedFlexTree<T extends readonly TreeNodeSchema[]> = [
	T extends readonly [infer Head, ...infer Tail]
		? [
				FlexTreeTypedNode<Assume<Head, TreeNodeSchema>>,
				...FixedSizeTypeArrayToTypedFlexTree<Assume<Tail, readonly TreeNodeSchema[]>>,
		  ]
		: [],
][_InlineTrick];

/**
 * Schema aware specialization of {@link FlexTreeEntity}.
 * @alpha
 */
export type FlexTreeTyped<TSchema extends TreeFieldSchema | TreeNodeSchema> =
	TSchema extends TreeNodeSchema
		? FlexTreeTypedNode<TSchema>
		: FlexTreeTypedField<Assume<TSchema, TreeFieldSchema>>;

/**
 * Schema aware specialization of {@link FlexTreeNode} for a given {@link TreeNodeSchema}.
 * @alpha
 */
export type FlexTreeTypedNode<TSchema extends TreeNodeSchema> = TSchema extends LeafNodeSchema
	? FlexTreeLeafNode<TSchema>
	: TSchema extends MapNodeSchema
	? FlexTreeMapNode<TSchema>
	: TSchema extends FieldNodeSchema
	? FlexTreeFieldNode<TSchema>
	: TSchema extends ObjectNodeSchema
	? FlexTreeObjectNodeTyped<TSchema>
	: FlexTreeNode;

// #endregion

// #region Unbox

/**
 * Schema aware unboxed field.
 * @remarks
 * Unboxes fields to their content if appropriate for the kind.
 * Recursively unboxes that content (then its content etc.) as well if the node union does unboxing.
 * @alpha
 */
export type FlexTreeUnboxField<
	TSchema extends TreeFieldSchema,
	// If "notEmpty", then optional fields will unbox to their content (not their content | undefined)
	Emptiness extends "maybeEmpty" | "notEmpty" = "maybeEmpty",
> = FlexTreeUnboxFieldInner<TSchema["kind"], TSchema["allowedTypes"], Emptiness>;

/**
 * Helper for implementing {@link InternalEditableTreeTypes#UnboxField}.
 * @alpha
 */
export type FlexTreeUnboxFieldInner<
	Kind extends FieldKind,
	TTypes extends AllowedTypes,
	Emptiness extends "maybeEmpty" | "notEmpty",
> = Kind extends typeof FieldKinds.sequence
	? FlexTreeSequenceField<TTypes>
	: Kind extends typeof FieldKinds.required
	? FlexTreeUnboxNodeUnion<TTypes>
	: Kind extends typeof FieldKinds.optional
	? FlexTreeUnboxNodeUnion<TTypes> | (Emptiness extends "notEmpty" ? never : undefined)
	: // Since struct already provides a short-hand accessor for the local field key, and the field provides a nicer general API than the node under it in this case, do not unbox nodeKey fields.
	Kind extends typeof FieldKinds.nodeKey
	? FlexTreeNodeKeyField
	: // TODO: forbidden
	  unknown;

/**
 * Schema aware unboxed union of tree types.
 * @remarks
 * Unboxes when not polymorphic.
 * Recursively unboxes that content as well if the node kind does unboxing.
 * @alpha
 */
export type FlexTreeUnboxNodeUnion<TTypes extends AllowedTypes> = TTypes extends readonly [
	InternalTypedSchemaTypes.LazyItem<infer InnerType>,
]
	? InnerType extends TreeNodeSchema
		? FlexTreeUnboxNode<InnerType>
		: InnerType extends Any
		? FlexTreeNode
		: // This case should not occur. If the result ever ends up unknown, look at places like this to debug.
		  unknown
	: boolean extends IsArrayOfOne<TTypes>
	? FlexTreeUnknownUnboxed // Unknown if this will unbox. This should mainly happen when TTypes is AllowedTypes.
	: FlexTreeTypedNodeUnion<TTypes>; // Known to not be a single type, so known not to unbox.

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
export type FlexTreeUnboxNode<TSchema extends TreeNodeSchema> = TSchema extends LeafNodeSchema
	? TreeValue<TSchema["info"]>
	: TSchema extends MapNodeSchema
	? FlexTreeMapNode<TSchema>
	: TSchema extends FieldNodeSchema
	? FlexTreeFieldNode<TSchema>
	: TSchema extends ObjectNodeSchema
	? FlexTreeObjectNodeTyped<TSchema>
	: FlexTreeUnknownUnboxed;

/**
 * Unboxed tree type for unknown schema cases.
 * @alpha
 */
export type FlexTreeUnknownUnboxed = TreeValue | FlexTreeNode;

// #endregion
