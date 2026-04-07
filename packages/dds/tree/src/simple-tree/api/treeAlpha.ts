/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NodeKind, TreeNode, WithType } from "../core/index.js";

import type { TreeChangeEvents } from "./treeChangeEvents.js";
import type { ArrayNodeDeltaOp } from "./treeNodeApi.js";
export type {
	ArrayNodeDeltaOp,
	ArrayNodeInsertOp,
	ArrayNodeRemoveOp,
	ArrayNodeRetainOp,
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
 * Data carried by array-node events from {@link TreeChangeEventsAlpha}:
 * both {@link TreeChangeEventsAlpha.nodeChanged} and {@link TreeChangeEventsAlpha.treeChanged}.
 * @sealed @alpha
 */
export interface NodeChangedDataDelta {
	/**
	 * The sequential operations describing what changed in the array node.
	 * @remarks
	 * The value may be `undefined` in two cases:
	 * - The node was created locally and has not yet been inserted into a document tree (a known
	 * temporary limitation, tracked in AB#63261).
	 * - The document was updated in a way that required multiple internal change passes in a single
	 * operation (for example, a data change combined with a schema upgrade).
	 *
	 * See {@link ArrayNodeDeltaOp} for op semantics.
	 */
	readonly delta: readonly ArrayNodeDeltaOp[] | undefined;
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
 * payload describing both structural and nested-content changes.
 * For non-array nodes the `treeChanged` signature is the same as the base event.
 *
 * Use via `TreeAlpha.on`.
 * @sealed @alpha
 */
export interface TreeChangeEventsAlpha<TNode extends TreeNode = TreeNode>
	extends TreeChangeEvents {
	/**
	 * Emitted when a direct structural change occurs on the node (an element was inserted,
	 * removed, or moved). For array nodes the event data includes a
	 * {@link NodeChangedDataDelta.delta | delta} payload as a sequence of {@link ArrayNodeDeltaOp}
	 * values; retain ops with {@link ArrayNodeRetainOp.contentChanged | contentChanged} flag elements
	 * that also had nested-content changes in the same transaction.
	 * For object, map, and record nodes the event data includes
	 * {@link NodeChangedDataProperties.changedProperties | changedProperties}.
	 *
	 * @remarks
	 * Does not fire for pure nested-content changes (e.g. a property of an array element changed
	 * without any structural array change). Subscribe to {@link TreeChangeEventsAlpha.treeChanged}
	 * on the array to receive a delta for those cases as well.
	 *
	 * This defines a property which is a function instead of using the method syntax to avoid function bi-variance issues with the input data to the callback.
	 */
	nodeChanged: (data: NodeChangedDataAlpha<TNode>) => void;

	/**
	 * For array nodes: emitted when any change occurred within the array, including both
	 * structural changes (insert, remove, move) and nested-content changes (a property of
	 * an element changed). The event data carries a {@link NodeChangedDataDelta.delta | delta}
	 * payload describing what changed.
	 *
	 * For non-array nodes: same as the base {@link TreeChangeEvents.treeChanged}.
	 *
	 * @remarks
	 * The delta uses {@link ArrayNodeRetainOp.contentChanged} to flag elements that have
	 * nested-content changes, without describing the details of those nested changes.
	 * To inspect nested changes, subscribe to `nodeChanged` or `treeChanged` on the
	 * individual element nodes.
	 *
	 * This event only fires on the array node whose elements changed — it does not propagate to
	 * ancestor nodes. To receive a delta for a nested array, subscribe directly to that array.
	 * Ancestor nodes still receive the base (no-payload) `treeChanged` via the normal subtree
	 * propagation, and retain ops with {@link ArrayNodeRetainOp.contentChanged} signal which
	 * elements contain nested changes worth drilling into.
	 *
	 * The listener type is conditional on `TNode`. If `TNode` is the base {@link TreeNode} type
	 * (i.e. the node's schema is not known statically), the listener is typed as `() => void`
	 * and no delta payload is provided. Use a more specific schema type to get the delta.
	 *
	 * This defines a property which is a function instead of using the method syntax to avoid function bi-variance issues with the input data to the callback.
	 */
	treeChanged: TNode extends WithType<string, NodeKind.Array>
		? (data: NodeChangedDataDelta) => void
		: () => void;
}
