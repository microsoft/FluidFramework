/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Value,
	FieldKey,
	FieldSchema,
	TreeSchemaIdentifier,
	TreeSchema,
	ITreeCursor,
	UpPath,
} from "../../core";
import {
	PrimitiveValue,
	MarkedArrayLike,
	ContextuallyTypedNodeDataObject,
	typeNameSymbol,
	valueSymbol,
} from "../contextuallyTyped";
import { EditableTreeContext } from "./editableTreeContext";

/**
 * A symbol for extracting target from {@link EditableTree} proxies.
 * Useful for debugging and testing, but not part of the public API.
 * @alpha
 */
export const proxyTargetSymbol: unique symbol = Symbol("editable-tree:proxyTarget");

/**
 * A symbol to get the type of {@link EditableTree} in contexts where string keys are already in use for fields.
 * @alpha
 */
export const typeSymbol: unique symbol = Symbol("editable-tree:type");

/**
 * A symbol to get the function, which returns the field of {@link EditableTree} without unwrapping,
 * in contexts where string keys are already in use for fields.
 * @alpha
 */
export const getField: unique symbol = Symbol("editable-tree:getField()");

/**
 * A symbol to get the function, which creates a new field of {@link EditableTree},
 * in contexts where string keys are already in use for fields.
 * @alpha
 */
export const createField: unique symbol = Symbol("editable-tree:createField()");

/**
 * A symbol to get the function, which replaces a field of {@link EditableTree},
 * in contexts where string keys are already in use for fields.
 * @alpha
 */
export const replaceField: unique symbol = Symbol("editable-tree:replaceField()");

/**
 * A symbol to get information about where an {@link EditableTree} is parented in contexts where string keys are already in use for fields.
 * in contexts where string keys are already in use for fields.
 * @alpha
 */
export const parentField: unique symbol = Symbol("editable-tree:parentField()");

/**
 * A symbol to get a common context of a "forest" of EditableTrees
 * in contexts where string keys are already in use for fields.
 * @alpha
 */
export const contextSymbol: unique symbol = Symbol("editable-tree:context");

/**
 * A symbol for subscribing to events.
 * @alpha
 */
export const on: unique symbol = Symbol("editable-tree:on");

/**
 * A collection of events that can be raised by an {@link EditableTree}.
 * These events are triggered while the internal data structures are being updated.
 * Thus these events must not trigger reading of the anchorSet or forest.
 *
 * TODO:
 * - Design how events should be ordered.
 * - Include sub-deltas in events.
 * - Add more events.
 * - Have some events (or a way to defer events) until the tree can be read.
 *
 * @alpha
 */
export interface EditableTreeEvents {
	/**
	 * Raised when a specific EditableTree node is changing.
	 * This includes its values and fields.
	 * @param upPath - the path corresponding to the location of the node being changed, upward.
	 * @param value - the new value stored in the node.
	 */
	changing(upPath: UpPath, value: Value): void;

	/**
	 * Raised when something in the tree is changing, including this node and its descendants.
	 * This event is called on every parent (transitively) when a change is occurring.
	 * Includes changes to this node itself.
	 * @param upPath - the path corresponding to the location of the node being changed, upward.
	 */
	subtreeChanging(upPath: UpPath): void;
}

/**
 * A tree which can be traversed and edited.
 *
 * When iterating, only visits non-empty fields.
 * To discover empty fields, inspect the schema using {@link typeSymbol}.
 *
 * The tree can be inspected by means of the built-in JS functions e.g.
 * ```
 * const root = context.unwrappedRoot;
 * for (const key of Reflect.ownKeys(root)) { ... }
 * // OR
 * if ("foo" in root) { ... }
 * ```
 * where `context` is a common `EditableTreeContext`.
 *
 * The tree can be edited either by using its symbol-based "toolbox" (e.g. {@link createField})
 * or using a simple assignment operator (see `EditableTreeContext.unwrappedRoot` for more details).
 *
 * When iterating, reads all fields at once before the iteration starts to get a "snapshot" of this node.
 * It might be inefficient regarding resources, but avoids situations
 * when the fields are getting changed while iterating.
 * @alpha
 */
export interface EditableTree extends Iterable<EditableField>, ContextuallyTypedNodeDataObject {
	/**
	 * The name of the node type.
	 */
	readonly [typeNameSymbol]: TreeSchemaIdentifier;

	/**
	 * The type of the node.
	 * If this node is well-formed, it must follow this schema.
	 */
	readonly [typeSymbol]: TreeSchema;

	/**
	 * Value stored on this node.
	 *
	 * Set the value using the simple assignment operator (`=`).
	 * Concurrently setting the value will follow the "last-write-wins" semantics.
	 */
	[valueSymbol]: Value;

	/**
	 * Stores the target for the proxy which implements reading and writing for this node.
	 * The details of this object are implementation details,
	 * but the presence of this symbol can be used to separate EditableTrees from other types.
	 */
	readonly [proxyTargetSymbol]: object;

	/**
	 * A common context of a "forest" of EditableTrees.
	 */
	readonly [contextSymbol]: EditableTreeContext;

	/**
	 * Gets the field of this node by its key without unwrapping.
	 */
	[getField](fieldKey: FieldKey): EditableField;

	/**
	 * Fields of this node, indexed by their field keys.
	 *
	 * This API exposes content in a way depending on the {@link Multiplicity} of the {@link FieldKind}.
	 * Sequences (including empty ones) are always exposed as {@link EditableField}s,
	 * and everything else is either a single EditableTree or undefined depending on if it's empty.
	 *
	 * It is possible to use this indexed access to delete the field using the `delete` operator and
	 * to set the value of the field or, more precisely, of its existing node using the simple assignment operator (`=`)
	 * if the field is defined as `optional` or `value`, its node {@link isPrimitive} and the value is a {@link PrimitiveValue}.
	 * Concurrently setting the value will follow the "last-write-wins" semantics.
	 *
	 * See `EditableTreeContext.unwrappedRoot` for how to use the simple assignment operator in other cases,
	 * as it works the same way for all children of the tree starting from its root.
	 *
	 * Use with the `delete` operator to delete `optional` or `sequence` fields of this node.
	 */
	// TODO: update docs for concurrently deleting the field.
	[key: FieldKey]: UnwrappedEditableField;

	/**
	 * Creates a new field at this node.
	 *
	 * The content of the new field must follow the {@link Multiplicity} of the {@link FieldKind}:
	 * - use a single cursor when creating an `optional` field;
	 * - use array of cursors when creating a `sequence` field;
	 * - use {@link EditableField.insertNodes} instead to create fields of kind `value` as currently
	 * it is not possible to have trees with already populated fields of this kind.
	 *
	 * When creating a field in a concurrent environment,
	 * `optional` fields will be created following the "last-write-wins" semantics,
	 * and for `sequence` fields the content ends up in order of "sequenced-last" to "sequenced-first".
	 */
	[createField](fieldKey: FieldKey, newContent: ITreeCursor | ITreeCursor[]): void;

	/**
	 * Replaces the field of this node.
	 *
	 * The content of the field must follow the {@link Multiplicity} of the {@link FieldKind}:
	 * - use a single cursor when replacing an `optional` or a `value` field;
	 * - use array of cursors when replacing a `sequence` field.
	 *
	 * Use `delete` operator to delete `optional` or `sequence` fields of this node, if any.
	 *
	 * When replacing a field in a concurrent environment,
	 * the following merge semantics will be applied depending on the field multiplicity:
	 * - optional and value fields will be overwritten in a "last-write-wins" fashion,
	 * - for sequence fields, the nodes present in the field on the issuing client will be
	 * deleted and the newContent will be inserted. This means concurrent inserts (including
	 * calls to `replaceField`) can all contribute content. In the future this will likely be
	 * replaced with merge semantics that is more consistent with that of optional and value fields.
	 */
	[replaceField](fieldKey: FieldKey, newContent: ITreeCursor | ITreeCursor[]): void;

	/**
	 * The field this tree is in, and the index within that field.
	 */
	readonly [parentField]: { readonly parent: EditableField; readonly index: number };

	/**
	 * {@inheritDoc ISubscribable#on}
	 */
	[on]<K extends keyof EditableTreeEvents>(
		eventName: K,
		listener: EditableTreeEvents[K],
	): () => void;
}

/**
 * EditableTree,
 * but with any type that `isPrimitive` unwrapped into the value if that value is a {@link PrimitiveValue}.
 * @alpha
 */
export type EditableTreeOrPrimitive = EditableTree | PrimitiveValue;

/**
 * EditableTree, but with these cases of unwrapping:
 * - primitives are unwrapped. See {@link EditableTreeOrPrimitive}.
 * - nodes with PrimaryField (see `getPrimaryField`) are unwrapped to {@link EditableField}s.
 * - fields are unwrapped based on their schema's multiplicity. See {@link UnwrappedEditableField}.
 * @alpha
 */
export type UnwrappedEditableTree = EditableTreeOrPrimitive | EditableField;

/**
 * Unwrapped field.
 * Non-sequence multiplicities are unwrapped to the child tree or `undefined` if there is none.
 * Sequence multiplicities are handled with {@link EditableField}.
 * See {@link UnwrappedEditableTree} for how the children themselves are unwrapped.
 * @alpha
 */
export type UnwrappedEditableField = UnwrappedEditableTree | undefined | EditableField;

/**
 * A field of an {@link EditableTree} as an array-like sequence of unwrapped nodes (see {@link UnwrappedEditableTree}).
 *
 * The number of nodes depends on a field's multiplicity.
 * When iterating, the nodes are read at once. Use index access to read the nodes "lazily".
 * Use `getNode` to get a node without unwrapping.
 *
 * It is possible to create/replace a node or to set its value by using the simple assignment operator (`=`)
 * and providing an input data as a {@link ContextuallyTypedNodeData}.
 * See `EditableTreeContext.unwrappedRoot` for more details, as it works the same way for all
 * children of the tree starting from its root.
 *
 * It is forbidden to delete the node using the `delete` operator, use the `deleteNodes()` method instead.
 * @alpha
 */
export interface EditableField
	// Here, the `UnwrappedEditableTree | ContextuallyTypedNodeData` is is used
	// due to a lacking support for variant accessors for index signatures in TypeScript,
	// see https://github.com/microsoft/TypeScript/issues/43826.
	// Otherwise it would be better to have a setter accepting the `ContextuallyTypedNodeData`
	// and a getter returning the `UnwrappedEditableTree` for the numeric indexed access
	// similar to, e.g., the getter and setter of the `EditableTreeContext.root`.
	// Thus, in most cases this must be understood as:
	// - "returns `UnwrappedEditableTree` when accessing the nodes by their indices" and
	// - "can also accept `ContextuallyTypedNodeData` when setting the nodes by their indices".
	// TODO: replace the numeric indexed access with getters and setters if possible.
	extends MarkedArrayLike<UnwrappedEditableTree> {
	/**
	 * The `FieldSchema` of this field.
	 */
	readonly fieldSchema: FieldSchema;

	/**
	 * The `FieldKey` of this field.
	 */
	readonly fieldKey: FieldKey;

	/**
	 * The node which has this field on it under `fieldKey`.
	 * `undefined` iff this field is a detached field.
	 */
	readonly parent?: EditableTree;

	/**
	 * A common context of a "forest" of EditableTrees.
	 */
	readonly context: EditableTreeContext;

	/**
	 * Stores the target for the proxy which implements reading and writing for this sequence field.
	 * The details of this object are implementation details,
	 * but the presence of this symbol can be used to separate EditableTrees from other types.
	 */
	readonly [proxyTargetSymbol]: object;

	/**
	 * Gets a node of this field by its index without unwrapping.
	 * Note that the node must exists at the given index.
	 */
	getNode(index: number): EditableTree;

	/**
	 * Inserts new nodes into this field.
	 */
	insertNodes(index: number, newContent: ITreeCursor | ITreeCursor[]): void;

	/**
	 * Sequentially deletes the nodes from this field.
	 *
	 * @param index - the index of the first node to be deleted. It must be in a range of existing node indices.
	 * @param count - the number of nodes to be deleted. If not provided, deletes all nodes
	 * starting from the index and up to the length of the field.
	 */
	deleteNodes(index: number, count?: number): void;

	/**
	 * Sequentially replaces the nodes of this field.
	 *
	 * @param index - the index of the first node to be replaced. It must be in a range of existing node indices.
	 * @param count - the number of nodes to be replaced. If not provided, replaces all nodes
	 * starting from the index and up to the length of the field.
	 *
	 * Note that, if multiple clients concurrently call replace on a sequence field,
	 * all the insertions will be preserved.
	 */
	replaceNodes(index: number, newContent: ITreeCursor | ITreeCursor[], count?: number): void;
}
