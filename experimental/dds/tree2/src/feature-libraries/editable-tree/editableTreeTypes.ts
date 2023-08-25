/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Value,
	TreeSchemaIdentifier,
	isCursor,
	FieldKey,
	ITreeCursorSynchronous,
} from "../../core";
import { PrimitiveValue, typeNameSymbol, valueSymbol, NewFieldContent } from "../contextuallyTyped";
import { LocalNodeKey } from "../node-key";
import { UntypedField, UntypedTreeCore, parentField } from "../untypedTree";
import { EditableTreeContext } from "./editableTreeContext";

/**
 * A symbol for extracting target from {@link EditableTree} proxies.
 * Useful for debugging and testing, but not part of the public API.
 * @alpha
 */
export const proxyTargetSymbol: unique symbol = Symbol("editable-tree:proxyTarget");

/**
 * A symbol to get the {@link LocalNodeKey} that identifies this {@link EditableTree} node.
 * @alpha
 */
export const localNodeKeySymbol: unique symbol = Symbol("editable-tree:localNodeKey");

/**
 * A symbol to get the function, which replaces the content of a field of {@link EditableTree}.
 * @alpha
 */
export const setField: unique symbol = Symbol("editable-tree:setField()");

/**
 * Status of the tree that a particular node in {@link EditableTree} and {@link UntypedTree} belongs to.
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
 * The tree can be edited either by using its symbol-based "toolbox" (e.g. {@link valueSymbol}),
 * using a simple assignment operator (see `EditableTreeContext.unwrappedRoot` for more details)
 * or by getting a field (via {@link getField} or optionally property access for sequence fields) and modifying that.
 *
 * When iterating, reads all fields at once before the iteration starts to get a "snapshot" of this node.
 * It might be inefficient regarding resources, but avoids situations
 * when the fields are getting changed while iterating.
 * @alpha
 */
export interface EditableTree
	extends Iterable<EditableField>,
		Omit<UntypedTreeCore<EditableTreeContext, EditableField>, typeof Symbol.iterator> {
	/**
	 * The name of the node type.
	 */
	readonly [typeNameSymbol]: TreeSchemaIdentifier;

	/**
	 * {@link LocalNodeKey} that identifies this node.
	 */
	readonly [localNodeKeySymbol]?: LocalNodeKey;

	/**
	 * Value stored on this node.
	 *
	 * Set the value using the simple assignment operator (`=`).
	 * Concurrently setting the value will follow the "last-write-wins" semantics.
	 */
	readonly [valueSymbol]: Value;

	/**
	 * Stores the target for the proxy which implements reading and writing for this node.
	 * The details of this object are implementation details,
	 * but the presence of this symbol can be used to separate EditableTrees from other types.
	 */
	readonly [proxyTargetSymbol]: object;

	/**
	 * Fields of this node, indexed by their field keys.
	 *
	 * This API exposes content in a way depending on the {@link Multiplicity} of the {@link FieldKind}.
	 * Sequences (including empty ones) are always exposed as {@link EditableField}s,
	 * and everything else is either a single EditableTree or undefined depending on if it's empty.
	 *
	 * It is possible to use this indexed access to remove the field using the `remove` operator and
	 * to set the value of the field or, more precisely, of its existing node using the simple assignment operator (`=`)
	 * if the field is defined as `optional` or `value`, its node {@link isPrimitive} and the value is a {@link PrimitiveValue}.
	 * Concurrently setting the value will follow the "last-write-wins" semantics.
	 *
	 * See `EditableTreeContext.unwrappedRoot` for how to use the simple assignment operator in other cases,
	 * as it works the same way for all children of the tree starting from its root.
	 *
	 * Use with the `remove` operator to remove `optional` or `sequence` fields of this node.
	 */
	// TODO: update docs for concurrently deleting the field.
	[key: string]: UnwrappedEditableField;

	/**
	 * Set the field of a field.
	 * Shorthand for `this[getField](fieldKey).setContent(content)`.
	 *
	 * Equivalent to `this.field = content` but has the desired types (assignment types for direct fields assignment are limited by typescript).
	 */
	[setField](fieldKey: FieldKey, content: NewFieldContent): void;

	/**
	 * The field this tree is in, and the index within that field.
	 */
	readonly [parentField]: { readonly parent: EditableField; readonly index: number };
}

/**
 * Check if NewFieldContent is made of {@link ITreeCursor}s.
 *
 * Useful when APIs want to take in tree data in multiple formats, including cursors.
 */
export function areCursors(
	data: NewFieldContent,
): data is ITreeCursorSynchronous | readonly ITreeCursorSynchronous[] {
	if (isCursor(data)) {
		return true;
	}

	if (Array.isArray(data) && data.length >= 0 && isCursor(data[0])) {
		return true;
	}

	return false;
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
 * It is forbidden to remove the node using the `remvoe` operator, use the `removeNodes()` method instead.
 *
 * TODO: split this interface by field kind.
 * @alpha
 */
export interface EditableField
	extends UntypedField<EditableTreeContext, EditableTree, EditableTree, UnwrappedEditableTree> {
	/**
	 * Stores the target for the proxy which implements reading and writing for this sequence field.
	 * The details of this object are implementation details,
	 * but the presence of this symbol can be used to separate EditableTrees from other types.
	 */
	readonly [proxyTargetSymbol]: object;

	/**
	 * Inserts new nodes into this field.
	 * Sequence fields only.
	 */
	insertNodes(index: number, newContent: NewFieldContent): void;

	/**
	 * Moves nodes from this field to destination iff both source and destination are sequence fields.
	 * If the destinationField is not provided, the current field is used as the destination.
	 */
	moveNodes(
		sourceIndex: number,
		count: number,
		destIndex: number,
		destinationField?: EditableField,
	): void;

	/**
	 * Sequentially remove the nodes from this field.
	 * Sequence fields only.
	 *
	 * @param index - the index of the first node to be removed. It must be in a range of existing node indices.
	 * @param count - the number of nodes to be removed. If not provided, removes all nodes.
	 * starting from the index and up to the length of the field.
	 * Once removed, the removed node should return {@link TreeStatus.Deleted} when prompted for its {@link TreeStatus}.
	 * TODO: The remove apis should eventually be fixed such that it returns {@link TreeStatus.Removed} when prompted for its {@link TreeStatus}.
	 */
	removeNodes(index: number, count?: number): void;

	/**
	 * Sequentially replaces the nodes of this field.
	 * Sequence fields only.
	 *
	 * @param index - the index of the first node to be replaced. It must be in a range of existing node indices.
	 * @param count - the number of nodes to be replaced. If not provided, replaces all nodes
	 * starting from the index and up to the length of the field.
	 *
	 * Note that, if multiple clients concurrently call replace on a sequence field,
	 * all the insertions will be preserved.
	 */
	replaceNodes(index: number, newContent: NewFieldContent, count?: number): void;

	/**
	 * Removes the content of this field.
	 * Only supports field kinds which can be empty.
	 * Once removed, the removed node should return {@link TreeStatus.Deleted} when prompted for its {@link TreeStatus}.
	 * TODO: The remove apis should eventually be fixed such that it returns {@link TreeStatus.Removed} when prompted for its {@link TreeStatus}.
	 */
	remove(): void;

	/**
	 * The content of this field.
	 *
	 * @remarks
	 * For optional and value field multiplicities, the single child, or undefined of none.
	 * For sequence fields, the field itself (and thus not very useful to read, but can be assigned to).
	 * Does not unwrap the content.
	 */
	get content(): EditableTree | undefined | EditableField;

	/**
	 * Sets the content of this field.
	 *
	 * @remarks
	 * This exists instead of a setter for `content` due to limitations in TypeScripts typing that
	 * prevent providing strongly typed getters and setters with the types required.
	 */
	setContent(newContent: NewFieldContent): void;
}
