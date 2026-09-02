/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NodeKind, TreeNode, WithType } from "../core/index.js";

import type { TreeChangeEvents } from "./treeChangeEvents.js";

/**
 * A `"retain"` op in an {@link ArrayNodeDeltaOp} sequence.
 * Represents elements that were neither inserted into nor removed from the array.
 * @sealed @beta
 */
export interface ArrayNodeRetainOp {
	readonly type: "retain";
	readonly count: number;
}

/**
 * A `"retain"` op in an {@link ArrayNodeTreeChangedDeltaOp} sequence, used in
 * {@link NodeChangedDataTreeDelta} payloads delivered to
 * {@link TreeChangeEventsBeta.treeChanged} on array nodes.
 *
 * Extends {@link ArrayNodeRetainOp} with a {@link ArrayNodeTreeChangedRetainOp.subtreeChanged}
 * flag that indicates whether any descendant of the retained element changed.
 * @sealed @beta
 */
export interface ArrayNodeTreeChangedRetainOp extends ArrayNodeRetainOp {
	/**
	 * Whether any descendant of this retained element changed.
	 * `true` if the element's subtree changed; `false` if nothing changed within it.
	 * @remarks
	 * Subscribe to `nodeChanged` or `treeChanged` on the element node itself for details.
	 */
	readonly subtreeChanged: boolean;
}

/**
 * A single operation in an array-node delta delivered by {@link TreeChangeEventsBeta.treeChanged}.
 * Extends {@link ArrayNodeDeltaOp}: retain ops carry a {@link ArrayNodeTreeChangedRetainOp.subtreeChanged}
 * flag indicating whether any descendant of the retained element changed.
 * @beta
 */
export type ArrayNodeTreeChangedDeltaOp =
	| ArrayNodeTreeChangedRetainOp
	| ArrayNodeInsertOp
	| ArrayNodeRemoveOp;

/**
 * An `"insert"` op in an {@link ArrayNodeDeltaOp} sequence.
 * Represents elements added to the array.
 * Read the new element values from the current tree at the positions described by this op.
 * @sealed @beta
 */
export interface ArrayNodeInsertOp {
	readonly type: "insert";
	readonly count: number;
}

/**
 * A `"remove"` op in an {@link ArrayNodeDeltaOp} sequence.
 * Represents elements removed from the array.
 * @sealed @beta
 */
export interface ArrayNodeRemoveOp {
	readonly type: "remove";
	readonly count: number;
}

/**
 * A single operation in an array node change delta. Used to efficiently sync an external
 * representation of an array (e.g. a text editor or virtual list) with tree changes without
 * needing to snapshot the old state or diff the entire array. Each op describes a contiguous run
 * of positions in the array before the change. For inserts, read the new element values from the
 * current tree at those positions.
 *
 * @remarks
 * There is no dedicated `"move"` op. Moves are represented as `"remove"` + `"insert"`.
 * When an element is moved within the same array it appears
 * as a `"remove"` at the source position followed by an `"insert"` at the destination position.
 * When an element is moved across two different arrays, the source array's delta contains a
 * `"remove"` and the destination array's delta contains an `"insert"` — they cannot be
 * correlated without additional bookkeeping on the caller's side.
 *
 * The operations cover the complete array: trailing elements that were not changed are included
 * in a final `"retain"` op. Applying every operation therefore consumes the entire pre-edit array
 * and produces the entire post-edit array.
 *
 * @sealed @beta
 */
export type ArrayNodeDeltaOp = ArrayNodeRetainOp | ArrayNodeInsertOp | ArrayNodeRemoveOp;

/**
 * Data included for {@link TreeChangeEventsBeta.nodeChanged}.
 * @sealed @beta
 */
export interface NodeChangedData<TNode extends TreeNode = TreeNode> {
	/**
	 * When the changed node is an object, map, or record node, this lists all the properties which changed.
	 * @remarks
	 * This only includes changes to the node itself (which would trigger {@link TreeChangeEvents.nodeChanged}).
	 *
	 * Not present when the {@link NodeKind} does not support this feature (currently just array nodes).
	 *
	 * When defined, the set should never be empty, since `nodeChanged` will only be triggered when there is a change, and for the supported node types, the only things that can change are properties.
	 */
	readonly changedProperties?: ReadonlySet<
		// For Object nodes, strongly type with the property names from the schema:
		TNode extends WithType<string, NodeKind.Object, infer TInfo>
			? string & keyof TInfo
			: string
	>;

	/**
	 * When the changed node is an array node, the sequential operations describing what changed.
	 * @remarks
	 * Not present for non-array nodes. When present, the value may be `undefined` when the
	 * document was updated in a way that required multiple internal change passes in a single
	 * operation (for example, a data change combined with a schema upgrade).
	 */
	readonly delta?: readonly ArrayNodeDeltaOp[] | undefined;
}

/**
 * Data included for {@link TreeChangeEventsBeta.nodeChanged} when the node is an object, map, or record node.
 * @sealed @beta
 */
export interface NodeChangedDataProperties<TNode extends TreeNode = TreeNode>
	extends NodeChangedData<TNode> {
	/**
	 * Lists all the properties which changed on the node.
	 */
	readonly changedProperties: ReadonlySet<
		TNode extends WithType<string, NodeKind.Object, infer TInfo>
			? string & keyof TInfo
			: string
	>;
}

/**
 * Data carried by the {@link TreeChangeEventsBeta.nodeChanged} event for array nodes.
 * @sealed @beta
 */
export interface NodeChangedDataDelta extends NodeChangedData {
	/**
	 * The sequential operations describing what changed in the array node.
	 * @remarks
	 * The value may be `undefined` when the document was updated in a way that required multiple
	 * internal change passes in a single operation (for example, a data change combined with a
	 * schema upgrade).
	 *
	 * See {@link ArrayNodeDeltaOp} for op semantics.
	 */
	readonly delta: readonly ArrayNodeDeltaOp[] | undefined;
}

/**
 * Data carried by the {@link TreeChangeEventsBeta.treeChanged} event for array nodes.
 * @remarks
 * Extends {@link NodeChangedDataDelta}: the retain ops in the delta additionally carry a
 * {@link ArrayNodeTreeChangedRetainOp.subtreeChanged} flag indicating whether any descendant
 * of the retained element changed.
 * @sealed @beta
 */
export interface NodeChangedDataTreeDelta {
	/**
	 * The sequential operations describing what changed in the array node,
	 * including subtree-change information on retain ops.
	 * @remarks
	 * The value may be `undefined` when the document was updated in a way that required multiple
	 * internal change passes in a single operation (for example, a data change combined with a
	 * schema upgrade).
	 *
	 * See {@link ArrayNodeTreeChangedDeltaOp} for op semantics.
	 */
	readonly delta: readonly ArrayNodeTreeChangedDeltaOp[] | undefined;
}

/**
 * Extensions to {@link TreeChangeEvents} which are not yet stable.
 *
 * @sealed @beta
 */
export interface TreeChangeEventsBeta<TNode extends TreeNode = TreeNode>
	extends Omit<TreeChangeEvents, "nodeChanged" | "treeChanged"> {
	/**
	 * Emitted by a node after a batch of changes has been applied to the tree, if any of the changes affected the node.
	 *
	 * - Object nodes define a change as being when the value of one of its properties changes (i.e., the property's value is set, including when set to `undefined`).
	 *
	 * - Array nodes define a change as when an element is added, removed, moved or replaced.
	 *
	 * - Map nodes define a change as when an entry is added, updated, or removed.
	 *
	 * @remarks
	 * This event is not emitted when:
	 *
	 * - Properties of a child node change. Notably, updates to an array node or a map node (like adding or removing
	 * elements/entries) will emit this event on the array/map node itself, but not on the node that contains the
	 * array/map node as one of its properties.
	 *
	 * - The node is moved to a different location in the tree or removed from the tree.
	 * In this case the event is emitted on the _parent_ node, not the node itself.
	 *
	 * For remote edits, this event is not guaranteed to occur in the same order or quantity that it did in
	 * the client that made the original edit.
	 *
	 * When the event is emitted, the tree is guaranteed to be in-schema.
	 *
	 * @privateRemarks
	 * This event occurs whenever the apparent contents of the node instance change, regardless of what caused the change.
	 * For example, it will fire when the local client reassigns a child, when part of a remote edit is applied to the
	 * node, or when the node has to be updated due to resolution of a merge conflict
	 * (for example a previously applied local change might be undone, then reapplied differently or not at all).
	 *
	 * TODO: define and document event ordering (ex: bottom up, with nodeChanged before treeChange on each level).
	 *
	 * This defines a property which is a function instead of using the method syntax to avoid function bi-variance issues with the input data to the callback.
	 */
	nodeChanged: (
		data: TNode extends WithType<string, NodeKind.Array>
			? NodeChangedDataDelta
			: TNode extends WithType<string, NodeKind.Map | NodeKind.Object | NodeKind.Record>
				? NodeChangedDataProperties<TNode>
				: NodeChangedData<TNode>,
	) => void;

	/**
	 * Emitted when something in the subtree rooted at this node changes.
	 *
	 * @remarks
	 * For array nodes, the event data carries a {@link NodeChangedDataTreeDelta.delta | delta}
	 * payload describing both shallow and deep changes. Retain operations use
	 * {@link ArrayNodeTreeChangedRetainOp.subtreeChanged} to indicate whether an element's
	 * descendants changed.
	 *
	 * For non-array nodes, this has the same signature as {@link TreeChangeEvents.treeChanged}.
	 * @privateRemarks
	 * This defines a property which is a function instead of using the method syntax to avoid function bi-variance issues with the input data to the callback.
	 */
	treeChanged: TNode extends WithType<string, NodeKind.Array>
		? (data: NodeChangedDataTreeDelta) => void
		: TreeChangeEvents["treeChanged"];
}
