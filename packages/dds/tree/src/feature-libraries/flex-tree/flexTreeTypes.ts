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
import type {
	FieldKinds,
	SequenceFieldEditBuilder,
	ValueFieldEditBuilder,
	OptionalFieldEditBuilder,
} from "../default-schema/index.js";
import type { FlexFieldKind } from "../modular-schema/index.js";
import type {
	FlexFieldSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	FlexTreeNodeSchema,
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
	is(schema: FlexTreeNodeSchema): boolean;

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

	/**
	 * Returns an iterable of keys for non-empty fields.
	 *
	 * @remarks
	 * All fields under a map implicitly exist, but `keys` will yield only the keys of fields which contain one or more nodes.
	 *
	 * No guarantees are made regarding the order of the keys returned.
	 */
	keys(): IterableIterator<FieldKey>;
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
	is<TKind extends FlexFieldKind>(kind: TKind): this is FlexTreeTypedField<TKind>;

	/**
	 * Type guard for narrowing / down-casting to a specific schema.
	 */
	isExactly(schema: FlexFieldSchema): boolean;

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

	/**
	 * Gets the FieldUpPath of a field.
	 */
	getFieldPath(): FieldUpPath;
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
}

/**
 * A {@link FlexTreeNode} that behaves like an "object" or "struct", providing properties to access its fields.
 *
 * ObjectNodes consist of a finite collection of fields, each with their own (distinct) key and {@link FlexFieldSchema}.
 *
 * @remarks
 * ObjectNodes require complex typing, and have been split into two parts for implementation purposes.
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
	readonly value: TreeValue;
}

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
export interface FlexTreeSequenceField extends FlexTreeField {
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
	at(index: number): FlexTreeUnknownUnboxed | undefined;

	/**
	 * {@inheritdoc FlexTreeField.boxedAt}
	 */
	boxedAt(index: number): FlexTreeNode | undefined;

	/**
	 * Calls the provided callback function on each child of this sequence, and returns an array that contains the results.
	 * @param callbackfn - A function that accepts the child and its index.
	 */
	map<U>(callbackfn: (value: FlexTreeUnknownUnboxed, index: number) => U): U[];

	/**
	 * Get an editor for this sequence.
	 */
	readonly editor: SequenceFieldEditBuilder<FlexibleFieldContent>;

	boxedIterator(): IterableIterator<FlexTreeNode>;
}

/**
 * Field that stores exactly one child.
 *
 * @remarks
 * Unboxes its content, so in schema aware APIs which do unboxing, the RequiredField itself will be skipped over and its content will be returned directly.
 */
export interface FlexTreeRequiredField extends FlexTreeField {
	get content(): FlexTreeUnknownUnboxed;

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
export interface FlexTreeOptionalField extends FlexTreeField {
	get content(): FlexTreeUnknownUnboxed | undefined;

	readonly editor: OptionalFieldEditBuilder<FlexibleNodeContent>;
}

// #endregion

// #region Typed

/**
 * Schema aware specialization of {@link FlexTreeField}.
 */
export type FlexTreeTypedField<Kind extends FlexFieldKind> =
	Kind extends typeof FieldKinds.sequence
		? FlexTreeSequenceField
		: Kind extends typeof FieldKinds.required
			? FlexTreeRequiredField
			: Kind extends typeof FieldKinds.optional
				? FlexTreeOptionalField
				: FlexTreeField;

// #endregion

/**
 * Unboxed tree type for unknown schema cases.
 */
export type FlexTreeUnknownUnboxed = TreeValue | FlexTreeNode;
