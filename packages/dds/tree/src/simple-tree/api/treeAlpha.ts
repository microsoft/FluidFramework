/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NodeKind, TreeNode, WithType } from "../core/index.js";

import type { TreeChangeEvents } from "./treeChangeEvents.js";
export type {
	ArrayNodeDeltaOp,
	ArrayNodeInsertOp,
	ArrayNodeRemoveOp,
	ArrayNodeRetainOp,
} from "./treeNodeApi.js";
import type { ArrayNodeDeltaOp } from "./treeNodeApi.js";

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
 * Data included for {@link TreeChangeEventsAlpha.nodeChanged} when the node is an array node.
 * @sealed @alpha
 */
export interface NodeChangedDataDelta {
	/**
	 * The sequential operations describing what changed in the array node.
	 * @remarks
	 * The value may be `undefined` when the document was updated in a way that required multiple
	 * internal changes pass in a single operation (for example, a data change combined with a
	 * schema upgrade).
	 *
	 * See {@link ArrayNodeDeltaOp} for op semantics.
	 */
	readonly delta: readonly ArrayNodeDeltaOp[] | undefined;
}

/**
 * The data passed to {@link TreeChangeEventsAlpha.nodeChanged}.
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
 * Extension of {@link TreeChangeEvents} with a richer `nodeChanged` event.
 * @remarks
 * Provides a `nodeChanged` event that includes a delta payload for array nodes and
 * requires `changedProperties` for object, map, and record nodes.
 * Use via `TreeAlpha.on`.
 * @sealed @alpha
 */
export interface TreeChangeEventsAlpha<TNode extends TreeNode = TreeNode>
	extends TreeChangeEvents {
	/**
	 * Like `TreeChangeEventsBeta.nodeChanged`, but for array nodes the event data includes
	 * a {@link NodeChangedDataDelta.delta | delta} payload describing the changes as a sequence
	 * of {@link ArrayNodeDeltaOp} values.
	 *
	 * @remarks
	 * This defines a property which is a function instead of using the method syntax to avoid function bi-variance issues with the input data to the callback.
	 */
	nodeChanged: (data: NodeChangedDataAlpha<TNode>) => void;
}
