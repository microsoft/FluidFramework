/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NodeKind, TreeNode, WithType } from "../core/index.js";

import type { TreeChangeEventsBeta } from "./treeBeta.js";
import type { TreeChangeEvents } from "./treeChangeEvents.js";
import type { ArrayNodeDeltaOp, ArrayNodeTreeChangedDeltaOp } from "./treeNodeApi.js";
export type {
	ArrayNodeDeltaOp,
	ArrayNodeInsertOp,
	ArrayNodeRemoveOp,
	ArrayNodeRetainOp,
	ArrayNodeTreeChangedDeltaOp,
	ArrayNodeTreeChangedRetainOp,
} from "./treeNodeApi.js";

/**
 * Data included for {@link TreeChangeEventsAlpha.nodeChanged} when the node is an object, map, or record node.
 * @sealed @alpha
 */
export interface NodeChangedDataProperties<TNode extends TreeNode = TreeNode> {
	/**
	 * Lists all the properties which changed on the node.
	 * @remarks
	 * This only includes changes to the node itself (which would trigger {@link TreeChangeEvents.nodeChanged}).
	 *
	 * The set should never be empty, since `nodeChanged` will only be triggered when there is a change, and for the supported node types, the only things that can change are properties.
	 */
	readonly changedProperties: ReadonlySet<
		// For Object nodes, strongly type with the property names from the schema:
		TNode extends WithType<string, NodeKind.Object, infer TInfo>
			? string & keyof TInfo
			: string
	>;
}

/**
 * Data carried by the {@link TreeChangeEventsAlpha.nodeChanged} event for array nodes.
 * @sealed @alpha
 */
export interface NodeChangedDataDelta {
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
 * Data carried by the {@link TreeChangeEventsAlpha.treeChanged} event for array nodes.
 * @remarks
 * Extends {@link NodeChangedDataDelta}: the retain ops in the delta additionally carry a
 * {@link ArrayNodeTreeChangedRetainOp.subtreeChanged} flag indicating whether any descendant
 * of the retained element changed.
 * @sealed @alpha
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
 * The data passed to {@link TreeChangeEventsAlpha.nodeChanged} and, for array nodes,
 * to {@link TreeChangeEventsAlpha.treeChanged}.
 * @remarks
 * - For array nodes: {@link NodeChangedDataDelta} (includes a {@link NodeChangedDataDelta.delta | delta} payload).
 * - For object, map, and record nodes: {@link NodeChangedDataProperties} (includes {@link NodeChangedDataProperties.changedProperties | changedProperties}).
 * - For a generic/unknown node type: the union of both.
 * @alpha
 */
export type NodeChangedDataAlpha<TNode extends TreeNode = TreeNode> =
	TNode extends WithType<string, NodeKind.Array>
		? NodeChangedDataDelta
		: TNode extends WithType<string, NodeKind.Map | NodeKind.Object | NodeKind.Record>
			? NodeChangedDataProperties<TNode>
			: NodeChangedDataProperties<TNode> | NodeChangedDataDelta;

/**
 * Extension of {@link TreeChangeEvents} with a richer `nodeChanged` event and a
 * delta-carrying `treeChanged` event for array nodes.
 * @remarks
 * Provides a `nodeChanged` event that includes a delta payload for array nodes and
 * requires `changedProperties` for object, map, and record nodes.
 * Also provides a `treeChanged` event that, for array nodes, carries a {@link NodeChangedDataDelta}
 * payload describing both shallow and deep changes.
 * For non-array nodes, the `treeChanged` signature is the same as the base event.
 *
 * Use via `TreeAlpha.on`.
 * @sealed @alpha
 */
export interface TreeChangeEventsAlpha<TNode extends TreeNode = TreeNode>
	extends TreeChangeEvents {
	/**
	 * Emitted when a shallow change occurs on this node, i.e., when the node's direct children change.
	 *
	 * @remarks
	 * For array nodes: the event data includes a {@link NodeChangedDataDelta.delta | delta} payload
	 * as a sequence of {@link ArrayNodeDeltaOp} values. Does not fire for deep changes (e.g. a
	 * property of an array element changed without any shallow array change). Subscribe to
	 * {@link TreeChangeEventsAlpha.treeChanged} on the array to receive a delta for those cases as well.
	 *
	 * For object, map, and record nodes: the event data includes
	 * {@link NodeChangedDataProperties.changedProperties | changedProperties}.
	 * @privateRemarks
	 * This defines a property which is a function instead of using the method syntax to avoid function bi-variance issues with the input data to the callback.
	 */
	nodeChanged: (data: NodeChangedDataAlpha<TNode>) => void;

	/**
	 * Emitted when something in the subtree rooted at this node changes.
	 *
	 * @remarks
	 * For array nodes: emitted when any change occurred within the array, including both
	 * shallow changes (insert, remove, move) and deep changes (e.g. a property of an element
	 * changed). The event data carries a {@link NodeChangedDataTreeDelta.delta | delta} payload
	 * describing what changed. The delta uses {@link ArrayNodeTreeChangedRetainOp.subtreeChanged}
	 * to flag elements that have deep changes, without describing the details of those deep changes.
	 * To inspect deep changes, subscribe to `nodeChanged` or `treeChanged` on the individual
	 * element nodes.
	 *
	 * When this array is nested inside another array, the outer array's `treeChanged` still
	 * fires with a delta, but that delta only shows `subtreeChanged: true` for the element
	 * position containing this inner array — it does not include the inner array's detailed
	 * insert/remove/retain ops. To receive those detailed ops, subscribe to `treeChanged`
	 * directly on the inner array.
	 * Ancestor non-array nodes still receive the base (no-payload) `treeChanged` via normal
	 * subtree propagation.
	 *
	 * For non-array nodes: same as the base {@link TreeChangeEvents.treeChanged}.
	 * @privateRemarks
	 * This defines a property which is a function instead of using the method syntax to avoid function bi-variance issues with the input data to the callback.
	 */
	treeChanged: TNode extends WithType<string, NodeKind.Array>
		? (data: NodeChangedDataTreeDelta) => void
		: TreeChangeEventsBeta<TNode>["treeChanged"];
}
