/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type AnchorNode,
	type ExclusiveMapTree,
	type FieldKey,
	type FieldUpPath,
	type TreeValue,
	anchorSlot,
} from "../../core/index.js";
import type { Assume, FlattenKeys } from "../../util/index.js";
import type {
	FieldKinds,
	SequenceFieldEditBuilder,
	ValueFieldEditBuilder,
	OptionalFieldEditBuilder,
} from "../default-schema/index.js";
import type { FlexFieldKind } from "../modular-schema/index.js";
import type {
	Any,
	FlexAllowedTypes,
	FlexFieldNodeSchema,
	FlexFieldSchema,
	FlexList,
	FlexListToUnion,
	FlexMapNodeSchema,
	FlexObjectNodeFields,
	FlexObjectNodeSchema,
	FlexTreeNodeSchema,
	LazyItem,
	LeafNodeSchema,
} from "../typed-schema/index.js";

import type { FlexTreeContext } from "./context.js";

/**
 * An anchor slot which records the {@link FlexTreeNode} associated with that anchor, if there is one.
 * @remarks This always points to a "real" {@link FlexTreeNode} (i.e. a `LazyTreeNode`), never to a "raw" node.
 */
export const flexTreeSlot = anchorSlot<FlexTreeNode>();

/**
 * Indicates that an object is a flex tree.
 */
export const flexTreeMarker = Symbol("flexTreeMarker");

export function isFlexTreeEntity(t: unknown): t is FlexTreeEntity {
	return typeof t === "object" && t !== null && flexTreeMarker in t;
}

export function isFlexTreeNode(t: unknown): t is FlexTreeNode {
	return isFlexTreeEntity(t) && t[flexTreeMarker] === FlexTreeEntityKind.Node;
}

/**
 */
export enum FlexTreeEntityKind {
	Node,
	Field,
}

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
 */
export interface FlexTreeEntity<out TSchema = unknown> {
	/**
	 * Indicates that an object is a specific kind of flex tree FlexTreeEntity.
	 * This makes it possible to both down cast FlexTreeEntities safely as well as validate if an object is or is not a FlexTreeEntity.
	 */
	readonly [flexTreeMarker]: FlexTreeEntityKind;

	/**
	 * Schema for this entity.
	 * If well-formed, it must follow this schema.
	 */
	readonly schema: TSchema;

	/**
	 * A common context of a "forest" of FlexTrees.
	 * @remarks This is `undefined` for unhydrated nodes or fields that have not yet been inserted into the tree.
	 */
	readonly context?: FlexTreeContext;

	/**
	 * Iterate through all nodes/fields in this field/node.
	 *
	 * @remarks
	 * No mutations to the current view of the shared tree are permitted during iteration.
	 */
	boxedIterator(): IterableIterator<FlexTreeEntity>;
}

/**
 * Status of the tree that a particular node belongs to.
 * @public
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

	/**
	 * Is created but has not yet been inserted into the tree.
	 */
	New = 3,
}

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
 */
export interface FlexTreeNode extends FlexTreeEntity<FlexTreeNodeSchema> {
	readonly [flexTreeMarker]: FlexTreeEntityKind.Node;

	/**
	 * Value stored on this node.
	 */
	readonly value?: TreeValue;

	/**
	 * Gets a field of this node, if it is not empty.
	 */
	tryGetField(key: FieldKey): undefined | FlexTreeField;

	/**
	 * Get the field for `key`.
	 * @param key - which entry to look up.
	 *
	 * @remarks
	 * All fields implicitly exist, so `getBoxed` can be called with any key and will always return a field.
	 * Even if the field is empty, it will still be returned, and can be edited to insert content if allowed by the field kind.
	 * See {@link FlexTreeNode.tryGetField} for a variant that does not allocate afield in the empty case.
	 */
	getBoxed(key: FieldKey): FlexTreeField;

	/**
	 * The field this tree is in, and the index within that field.
	 */
	readonly parentField: { readonly parent: FlexTreeField; readonly index: number };

	/**
	 * Type guard for narrowing / down-casting to a specific schema.
	 */
	is<TSchema extends FlexTreeNodeSchema>(schema: TSchema): this is FlexTreeTypedNode<TSchema>;

	boxedIterator(): IterableIterator<FlexTreeField>;

	/**
	 * The anchor node associated with this node
	 *
	 * @remarks
	 * The ref count keeping this alive is owned by the FlexTreeNode:
	 * if holding onto this anchor for longer than the FlexTreeNode might be alive,
	 * a separate Anchor (and thus ref count) must be allocated to keep it alive.
	 */
	readonly anchorNode: AnchorNode;
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
 */
export interface FlexTreeField extends FlexTreeEntity<FlexFieldSchema> {
	readonly [flexTreeMarker]: FlexTreeEntityKind.Field;

	/**
	 * The number of nodes in this field
	 */
	readonly length: number;

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
	is<TSchema extends FlexFieldSchema>(schema: TSchema): this is FlexTreeTypedField<TSchema>;

	boxedIterator(): IterableIterator<FlexTreeNode>;

	/**
	 * Gets a node of this field by its index without unboxing.
	 * @param index - Zero-based index of the item to retrieve. Negative values are interpreted from the end of the sequence.
	 *
	 * @returns The element in the sequence matching the given index. Always returns undefined if index \< -sequence.length
	 * or index \>= sequence.length.
	 *
	 * @remarks
	 * Semantics match {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/at | Array.at}.
	 */
	boxedAt(index: number): FlexTreeNode | undefined;
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
 */
export interface FlexTreeMapNode<in out TSchema extends FlexMapNodeSchema>
	extends FlexTreeNode {
	readonly schema: TSchema;

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
	 *
	 * No guarantees are made regarding the order of the keys returned.
	 */
	keys(): IterableIterator<FieldKey>;

	/**
	 * Returns an iterable of values in the map.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, but `values` will yield only the fields containing one or more nodes.
	 *
	 * No guarantees are made regarding the order of the values returned.
	 */
	values(): IterableIterator<FlexTreeUnboxField<TSchema["info"], "notEmpty">>;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, but `entries` will yield only the entries whose fields contain one or more nodes.
	 *
	 * This iteration provided by `entries()` is equivalent to that provided by direct iteration of the {@link FlexTreeMapNode} (a.k.a. `[Symbol.Iterator]()`).
	 *
	 * No guarantees are made regarding the order of the entries returned.
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): void;

	/**
	 * Iterate through all fields in the map.
	 *
	 * @remarks
	 * No mutations to the current view of the shared tree are permitted during iteration.
	 * To iterate over the unboxed values of the map, use `Symbol.Iterator()`.
	 */
	boxedIterator(): IterableIterator<FlexTreeTypedField<TSchema["info"]>>;

	[Symbol.iterator](): IterableIterator<
		[FieldKey, FlexTreeUnboxField<TSchema["info"], "notEmpty">]
	>;
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
 * - When polymorphism over {@link FlexFieldSchema} (and not just a union of {@link FlexAllowedTypes}) is required.
 * For example when encoding a schema for a type like
 * `Foo[] | Bar[]`, `Foo | Foo[]` or `Optional<Foo> | Optional<Bar>` (Where `Optional` is the Optional field kind, not TypeScript's `Optional`).
 * Since this schema system only allows `|` of {@link FlexTreeNodeSchema} (and only when declaring a {@link FlexFieldSchema}), see {@link SchemaBuilderBase.field},
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
 */
export interface FlexTreeFieldNode<in out TSchema extends FlexFieldNodeSchema>
	extends FlexTreeNode {
	readonly schema: TSchema;

	/**
	 * The content this field node wraps.
	 */
	readonly content: FlexTreeUnboxField<TSchema["info"]>;
}

/**
 * A {@link FlexTreeNode} that behaves like an "object" or "struct", providing properties to access its fields.
 *
 * ObjectNodes consist of a finite collection of fields, each with their own (distinct) key and {@link FlexFieldSchema}.
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
 */
export interface FlexTreeObjectNode extends FlexTreeNode {
	readonly schema: FlexObjectNodeSchema;
}

/**
 * Leaf holding a value.
 *
 * @remarks
 * Leaves are immutable and have no children.
 * Leaf unboxes its content, so in schema aware APIs which do unboxing, the Leaf itself will be skipped over and its value will be returned directly.
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
 */
export type FlexTreeObjectNodeTyped<TSchema extends FlexObjectNodeSchema> =
	FlexObjectNodeSchema extends TSchema
		? FlexTreeObjectNode
		: FlexTreeObjectNode & FlexTreeObjectNodeFields<TSchema["info"]>;

/**
 * Properties to access an object node's fields. See {@link FlexTreeObjectNodeTyped}.
 *
 * @privateRemarks
 * TODO: Support custom field keys.
 */
export type FlexTreeObjectNodeFields<TFields extends FlexObjectNodeFields> =
	FlexTreeObjectNodeFieldsInner<
		FlattenKeys<
			{
				// When the key does not need to be escaped, map it from the input TFields in a way that doesn't break navigate to declaration
				[key in keyof TFields as key extends PropertyNameFromFieldKey<key & string>
					? key
					: never]: TFields[key];
			} & {
				[key in keyof TFields as key extends PropertyNameFromFieldKey<key & string>
					? never
					: PropertyNameFromFieldKey<key & string>]: TFields[key];
			}
		>
	>;

/**
 * Properties to access an object node's fields. See {@link FlexTreeObjectNodeTyped}.
 *
 * @privateRemarks
 * TODO: Do we keep assignment operator + "setFoo" methods, or just use methods?
 * Inconsistency in the API experience could confusing for consumers.
 */
export type FlexTreeObjectNodeFieldsInner<TFields extends FlexObjectNodeFields> = FlattenKeys<
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
			: never]: (content: FlexibleNodeContent) => void;
	}
>;

/**
 * Reserved object node field property names to avoid collisions with the rest of the object node API.
 */
export const reservedObjectNodeFieldPropertyNames = [
	"anchorNode",
	"constructor",
	"context",
	"is",
	"parentField",
	"schema",
	"tryGetField",
	"type",
	"value",
	"boxedIterator",
	"iterator",
	"getBoxed",
] as const;

/**
 * Reserved object node field property names prefixes.
 * These are reserved to avoid collisions with properties derived from field other field names.
 *
 * Field names starting with these must be followed by a lowercase letter, or be escaped.
 */
export const reservedObjectNodeFieldPropertyNamePrefixes = [
	"set",
	"boxed",
	"field",
	"Field",
] as const;

/**
 * {@link reservedObjectNodeFieldPropertyNamePrefixes} as a type union.
 */
export type ReservedObjectNodeFieldPropertyNames =
	(typeof reservedObjectNodeFieldPropertyNames)[number];

/**
 * {@link reservedObjectNodeFieldPropertyNamePrefixes} as a type union.
 */
export type ReservedObjectNodeFieldPropertyNamePrefixes =
	(typeof reservedObjectNodeFieldPropertyNamePrefixes)[number];

/**
 * Convert an object node's field key into an escaped string usable as a property name.
 *
 * @privateRemarks
 * TODO:
 * Collisions are still possible.
 * For example fields named "foo" and "Foo" would both produce a setter "setFoo".
 * Consider naming schemes to avoid this, ensure that there is a good workaround for these cases.
 * Another approach would be to support custom field names (separate from keys),
 * and do the escaping (if needed) when creating the flex tree schema (both when manually creating them and when doing so automatically):
 * this would enable better intellisense for escaped fields, as well as allow the feature of custom field property names.
 */
export type PropertyNameFromFieldKey<T extends string> =
	T extends ReservedObjectNodeFieldPropertyNames
		? `field${Capitalize<T>}`
		: T extends `${ReservedObjectNodeFieldPropertyNamePrefixes}${Capitalize<string>}`
			? `field${Capitalize<T>}`
			: T;

/**
 * Field kinds that allow value assignment.
 */
export type AssignableFieldKinds = typeof FieldKinds.optional | typeof FieldKinds.required;

// #endregion

// #region Field Kinds

/**
 * Typed tree for inserting as the content of a field.
 */
export type FlexibleFieldContent = ExclusiveMapTree[];

/**
 * Tree for inserting as a node.
 */
export type FlexibleNodeContent = ExclusiveMapTree;

/**
 * Tree for inserting a subsequence of nodes.
 *
 * Used to insert a batch of 0 or more nodes into some location in a {@link FlexTreeSequenceField}.
 */
export type FlexibleNodeSubSequence = ExclusiveMapTree[];

/**
 * Type to ensures two types overlap in at least one way.
 * It evaluates to the input type if this is true, and never otherwise.
 * Examples:
 * CheckTypesOverlap\<number | boolean, number | object\> = number | boolean
 * CheckTypesOverlap\<number | boolean, string | object\> = never
 */
export type CheckTypesOverlap<T, TCheck> = [Extract<T, TCheck> extends never ? never : T][0];

/**
 * {@link FlexTreeField} that stores a sequence of children.
 *
 * Sequence fields can contain an ordered sequence any number of {@link FlexTreeNode}s which must be of the {@link FlexAllowedTypes} from the {@link FlexFieldSchema}).
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
 */
export interface FlexTreeSequenceField<in out TTypes extends FlexAllowedTypes>
	extends FlexTreeField {
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
	 * {@inheritdoc FlexTreeField.boxedAt}
	 */
	boxedAt(index: number): FlexTreeTypedNodeUnion<TTypes> | undefined;

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
	 * Get an editor for this sequence.
	 */
	readonly editor: SequenceFieldEditBuilder<FlexibleFieldContent>;

	boxedIterator(): IterableIterator<FlexTreeTypedNodeUnion<TTypes>>;

	/**
	 * Gets the FieldUpPath of a field.
	 */
	getFieldPath(): FieldUpPath;

	[Symbol.iterator](): IterableIterator<FlexTreeUnboxNodeUnion<TTypes>>;
}

/**
 * Field that stores exactly one child.
 *
 * @remarks
 * Unboxes its content, so in schema aware APIs which do unboxing, the RequiredField itself will be skipped over and its content will be returned directly.
 */
export interface FlexTreeRequiredField<in out TTypes extends FlexAllowedTypes>
	extends FlexTreeField {
	get content(): FlexTreeUnboxNodeUnion<TTypes>;

	readonly editor: ValueFieldEditBuilder<FlexibleNodeContent>;
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
 */
export interface FlexTreeOptionalField<in out TTypes extends FlexAllowedTypes>
	extends FlexTreeField {
	get content(): FlexTreeUnboxNodeUnion<TTypes> | undefined;

	readonly editor: OptionalFieldEditBuilder<FlexibleNodeContent>;
}

// #endregion

// #region Typed

/**
 * Schema aware specialization of {@link FlexTreeField}.
 */
export type FlexTreeTypedField<TSchema extends FlexFieldSchema> = FlexTreeTypedFieldInner<
	TSchema["kind"],
	TSchema["allowedTypes"]
>;

/**
 * Helper for implementing {@link FlexTreeTypedField}.
 */
export type FlexTreeTypedFieldInner<
	Kind extends FlexFieldKind,
	Types extends FlexAllowedTypes,
> = Kind extends typeof FieldKinds.sequence
	? FlexTreeSequenceField<Types>
	: Kind extends typeof FieldKinds.required
		? FlexTreeRequiredField<Types>
		: Kind extends typeof FieldKinds.optional
			? FlexTreeOptionalField<Types>
			: FlexTreeField;

/**
 * Schema aware specialization of {@link FlexTreeNode} for a given {@link FlexAllowedTypes}.
 */
export type FlexTreeTypedNodeUnion<T extends FlexAllowedTypes> =
	T extends FlexList<FlexTreeNodeSchema>
		? FlexTreeTypedNode<Assume<FlexListToUnion<T>, FlexTreeNodeSchema>>
		: FlexTreeNode;

/**
 * Schema aware specialization of {@link FlexTreeNode} for a given {@link FlexTreeNodeSchema}.
 */
export type FlexTreeTypedNode<TSchema extends FlexTreeNodeSchema> =
	TSchema extends LeafNodeSchema
		? FlexTreeLeafNode<TSchema>
		: TSchema extends FlexMapNodeSchema
			? FlexTreeMapNode<TSchema>
			: TSchema extends FlexFieldNodeSchema
				? FlexTreeFieldNode<TSchema>
				: TSchema extends FlexObjectNodeSchema
					? FlexTreeObjectNodeTyped<TSchema>
					: FlexTreeNode;

// #endregion

// #region Unbox

/**
 * Schema aware unboxed field.
 * @remarks
 * Unboxes fields to their content if appropriate for the kind.
 * Recursively unboxes that content (then its content etc.) as well if the node union does unboxing.
 */
export type FlexTreeUnboxField<
	TSchema extends FlexFieldSchema,
	// If "notEmpty", then optional fields will unbox to their content (not their content | undefined)
	Emptiness extends "maybeEmpty" | "notEmpty" = "maybeEmpty",
> = FlexTreeUnboxFieldInner<TSchema["kind"], TSchema["allowedTypes"], Emptiness>;

/**
 * Helper for implementing FlexTreeUnboxField.
 */
export type FlexTreeUnboxFieldInner<
	Kind extends FlexFieldKind,
	TTypes extends FlexAllowedTypes,
	Emptiness extends "maybeEmpty" | "notEmpty",
> = Kind extends typeof FieldKinds.sequence
	? FlexTreeSequenceField<TTypes>
	: Kind extends typeof FieldKinds.required
		? FlexTreeUnboxNodeUnion<TTypes>
		: Kind extends typeof FieldKinds.optional
			? FlexTreeUnboxNodeUnion<TTypes> | (Emptiness extends "notEmpty" ? never : undefined)
			: // TODO: forbidden
				unknown;

/**
 * Schema aware unboxed union of tree types.
 * @remarks
 * Unboxes when not polymorphic.
 * Recursively unboxes that content as well if the node kind does unboxing.
 */
export type FlexTreeUnboxNodeUnion<TTypes extends FlexAllowedTypes> = TTypes extends readonly [
	LazyItem<infer InnerType>,
]
	? InnerType extends FlexTreeNodeSchema
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
 */
export type FlexTreeUnboxNode<TSchema extends FlexTreeNodeSchema> =
	TSchema extends LeafNodeSchema
		? TreeValue<TSchema["info"]>
		: TSchema extends FlexMapNodeSchema
			? FlexTreeMapNode<TSchema>
			: TSchema extends FlexFieldNodeSchema
				? FlexTreeFieldNode<TSchema>
				: TSchema extends FlexObjectNodeSchema
					? FlexTreeObjectNodeTyped<TSchema>
					: FlexTreeUnknownUnboxed;

/**
 * Unboxed tree type for unknown schema cases.
 */
export type FlexTreeUnknownUnboxed = TreeValue | FlexTreeNode;

// #endregion
