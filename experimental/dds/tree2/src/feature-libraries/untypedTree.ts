/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Value,
	FieldKey,
	TreeFieldStoredSchema,
	TreeNodeSchemaIdentifier,
	ForestEvents,
	TreeStoredSchema,
	UpPath,
	PathVisitor,
	TreeNodeStoredSchema,
} from "../core";
import { ISubscribable } from "../events";
import { Named } from "../util";
import { PrimitiveValue, MarkedArrayLike, typeNameSymbol, valueSymbol } from "./contextuallyTyped";
import { TreeNode, TreeStatus } from "./editable-tree-2";

/**
 * This file provides an API for working with trees which is type safe even when schema is not known.
 * This means no editing is allowed.
 *
 * Schema aware APIs for working with trees should superset this, while sub-setting EditableTree.
 *
 * TODO:
 * This API should replace EditableTree as the default public API for tree access.
 * SchemaAware builds on this, adding editing and type safe APIs which can be accessed via SchematizeView.
 * Once this is finished, the unsafe EditableTree types can be removed (or converted to package internal documentation for the proxies).
 */

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
 * A symbol to get information about where an {@link EditableTree} is parented
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
 * A symbol to get the function, which gets the {@link TreeStatus} of {@link EditableTree}
 * @alpha
 */
export const treeStatus: unique symbol = Symbol("editable-tree:treeStatus()");

/**
 * A tree of an unknown type.
 * This only includes operations that are safe to do without knowing the schema for the tree, so it does not include any editing.
 *
 * TODO: document how to downcast to more specific types for schema aware reading and editing APIs.
 *
 * @alpha
 */
export interface UntypedTree<TContext = UntypedTreeContext> extends UntypedTreeCore<TContext> {
	/**
	 * The name of the node type.
	 */
	// TODO: remove this favor of typeSymbol once its the view schema
	readonly [typeNameSymbol]: TreeNodeSchemaIdentifier;

	/**
	 * Value stored on this node.
	 */
	readonly [valueSymbol]: Value;

	/**
	 * Fields of this node, indexed by their field keys.
	 *
	 * This API exposes content in a way depending on the {@link Multiplicity} of the {@link FieldKind}.
	 * Sequences (including empty ones) are always exposed as {@link UntypedField}s,
	 * and everything else is either a single UntypedTree or undefined depending on if it's empty.
	 */
	readonly [key: FieldKey]: UnwrappedUntypedField<TContext>;
}

/**
 * Subset of {@link UntypedTree} which does not get narrowed based on schema.
 *
 * TODO:
 * getField should be made schema aware and moved to `UntypedTree`.
 * @alpha
 */
export interface UntypedTreeCore<
	out TContext = UntypedTreeContext,
	out TField = UntypedField<TContext>,
> extends Iterable<TField> {
	/**
	 * The type of the node.
	 * If this node is well-formed, it must follow this schema.
	 */
	// TODO: update implementation to use view schema in typed views.
	readonly [typeSymbol]: TreeNodeStoredSchema & Named<TreeNodeSchemaIdentifier>;

	/**
	 * A common context of a "forest" of EditableTrees.
	 */
	readonly [contextSymbol]: TContext;

	/**
	 * Gets the field of this node by its key without unwrapping.
	 */
	[getField](fieldKey: FieldKey): TField;

	/**
	 * Gets the {@link TreeStatus} of the tree.
	 */
	[treeStatus](): TreeStatus;

	/**
	 * The field this tree is in, and the index within that field.
	 */
	readonly [parentField]: { readonly parent: TField; readonly index: number };

	/**
	 * {@inheritDoc ISubscribable#on}
	 */
	[on]<K extends keyof EditableTreeEvents>(
		eventName: K,
		listener: EditableTreeEvents[K],
	): () => void;
}

/**
 * UntypedTree,
 * but with any type that `isPrimitive` unwrapped into the value if that value is a {@link PrimitiveValue}.
 * @alpha
 */
export type UntypedTreeOrPrimitive<TContext = UntypedTreeContext> =
	| UntypedTree<TContext>
	| PrimitiveValue;

/**
 * UntypedTree, but with these cases of unwrapping:
 * - primitives are unwrapped. See {@link UntypedTreeOrPrimitive}.
 * - nodes with PrimaryField (see `getPrimaryField`) are unwrapped to {@link UntypedField}s.
 * - fields are unwrapped based on their schema's multiplicity. See {@link UnwrappedUntypedField}.
 * @alpha
 */
export type UnwrappedUntypedTree<TContext = UntypedTreeContext> =
	| UntypedTreeOrPrimitive<TContext>
	| UntypedField<TContext>;

/**
 * Unwrapped field.
 * Non-sequence multiplicities are unwrapped to the child tree or `undefined` if there is none.
 * Sequence multiplicities are handled with {@link UntypedField}.
 * See {@link UnwrappedUntypedTree} for how the children themselves are unwrapped.
 * @alpha
 */
export type UnwrappedUntypedField<TContext = UntypedTreeContext> =
	| UnwrappedUntypedTree<TContext>
	| undefined
	| UntypedField<TContext>;

/**
 * A field of an {@link UntypedTree} as an array-like sequence of unwrapped nodes (see {@link UnwrappedUntypedTree}).
 * @alpha
 */
export interface UntypedField<
	TContext = UntypedTreeContext,
	TChild = UntypedTree<TContext>,
	TParent = UntypedTree<TContext>,
	TUnwrappedChild = UnwrappedUntypedTree<TContext>,
> extends MarkedArrayLike<TUnwrappedChild> {
	/**
	 * The `TreeFieldStoredSchema` of this field.
	 */
	readonly fieldSchema: TreeFieldStoredSchema;

	/**
	 * The `FieldKey` of this field.
	 */
	readonly fieldKey: FieldKey;

	/**
	 * The node which has this field on it under `fieldKey`.
	 * `undefined` iff this field is a detached field.
	 */
	readonly parent?: TParent;

	/**
	 * A common context of a "forest" of EditableTrees.
	 */
	readonly context: TContext;

	/**
	 * Gets a node of this field by its index without unwrapping.
	 * Note that a node must exist at the given index.
	 */
	getNode(index: number): TChild;

	/**
	 * Gets the {@link TreeStatus} of the parentNode of this field.
	 */
	treeStatus(): TreeStatus;
}

/**
 * A common context of a "forest" of UntypedTrees.
 * @alpha
 */
export interface UntypedTreeContext extends ISubscribable<ForestEvents> {
	/**
	 * Gets the root field of the tree.
	 */
	readonly root: UntypedField;

	/**
	 * Gets the root field of the tree.
	 *
	 * See {@link UnwrappedEditableField} for what is unwrapped.
	 */
	readonly unwrappedRoot: UnwrappedUntypedField;

	/**
	 * Schema used within this context.
	 * All data must conform to these schema.
	 *
	 * The root's schema is tracked under {@link rootFieldKey}.
	 */
	readonly schema: TreeStoredSchema;

	/**
	 * Call before editing.
	 *
	 * Note that after performing edits, EditableTrees for nodes that no longer exist are invalid to use.
	 * TODO: maybe add an API to check if a specific EditableTree still exists,
	 * and only make use other than that invalid.
	 */
	prepareForEdit(): void;

	/**
	 * Call to free resources.
	 * It is invalid to use the context after this.
	 */
	free(): void;

	/**
	 * Release any cursors and anchors held by EditableTrees created in this context.
	 * The EditableTrees are invalid to use after this, but the context may still be used
	 * to create new trees starting from the root.
	 */
	clear(): void;
}

/**
 * An event raised on a {@link TreeNode}.
 *
 * @alpha
 */
export interface TreeEvent {
	/**
	 * The node of the tree where the listener receiving the event is attached.
	 */
	readonly target: TreeNode;
}

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
	 * This includes its fields.
	 * @param upPath - the path corresponding to the location of the node being changed, upward.
	 */
	changing(upPath: UpPath): void;

	/**
	 * Raised when something in the tree is changing, including this node and its descendants.
	 * The event can optionally return a {@link PathVisitor} to traverse the subtree
	 * This event is called on every parent (transitively) when a change is occurring.
	 * Includes changes to this node itself.
	 * @param upPath - the path corresponding to the location of the node being changed, upward.
	 * @returns a visitor to traverse the subtree or `void`.
	 */
	subtreeChanging(upPath: UpPath): PathVisitor | void;

	/**
	 * Raised on a node right before a change is applied to one of its fields or the fields of a descendant node.
	 *
	 * @param event - The event object. See {@link TreeEvent} for details.
	 *
	 * @remarks
	 * What exactly qualifies as a change that triggers this event (or {@link EditableTreeEvents.afterChange}) is dependent
	 * on the implementation of SharedTree. In general, these events will fire once for every atomic editing operation
	 * supported by SharedTree; {@link EditableTreeEvents.beforeChange} before the change is applied, and
	 * {@link EditableTreeEvents.afterChange} after it is.
	 *
	 * {@link Sequence} fields present two exceptions:
	 *
	 * The first one is that events will fire separately for each node involved in the operation (when inserting, removing,
	 * or moving more than one node at a time). This means that, for example, when inserting two nodes into a {@link Sequence}
	 * field the following will happen:
	 * - {@link EditableTreeEvents.beforeChange} will fire once before either new node is present in the tree.
	 * - {@link EditableTreeEvents.afterChange} will fire once after the first node is present in the tree, but the second one isn't.
	 * - {@link EditableTreeEvents.beforeChange} will fire once before the second node is present in the tree, but the first one already is.
	 * - {@link EditableTreeEvents.afterChange} will fire once after the second node is present in the tree (so at this point both nodes are).
	 * Something similar applies to removing nodes from a sequence, and moving them to another sequence.
	 *
	 * The second one is that for an operation to move nodes, events will fire *twice* for each node being moved; once
	 * while they are being detached from their source location, and once when they are being attached at the target location.
	 */
	beforeChange(event: TreeEvent): void;

	/**
	 * Raised on a node right after a change is applied to one of its fields or the fields of a descendant node.
	 *
	 * @param event - The event object. See {@link TreeEvent} for details.
	 *
	 * @remarks
	 * What exactly qualifies as a change that triggers this event (or {@link EditableTreeEvents.beforeChange}) is dependent
	 * on the implementation of SharedTree. In general, these events will fire once for every atomic editing operation supported
	 * by SharedTree; {@link EditableTreeEvents.beforeChange} before the change is applied, and
	 * {@link EditableTreeEvents.afterChange} after it is.
	 *
	 * {@link Sequence} fields present two exceptions:
	 *
	 * The first one is that events will fire separately for each node involved in the operation (when inserting, removing,
	 * or moving more than one node at a time). This means that, for example, when inserting two nodes into a {@link Sequence}
	 * field the following will happen:
	 * - {@link EditableTreeEvents.beforeChange} will fire once before either new node is present in the tree.
	 * - {@link EditableTreeEvents.afterChange} will fire once after the first node is present in the tree, but the second one isn't.
	 * - {@link EditableTreeEvents.beforeChange} will fire once before the second node is present in the tree, but the first one already is.
	 * - {@link EditableTreeEvents.afterChange} will fire once after the second node is present in the tree (so at this point both nodes are).
	 * Something similar applies to removing nodes from a sequence, and moving them to another sequence.
	 *
	 * The second one is that for an operation to move nodes, events will fire *twice* for each node being moved; once
	 * while they are being detached from their source location, and once when they are being attached at the target location.
	 */
	afterChange(event: TreeEvent): void;
}
