/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NodeKind, TreeNode, WithType } from "../core/index.js";

import type {
	NodeChangedData,
	NodeChangedDataDelta,
	NodeChangedDataProperties,
	TreeChangeEventsBeta,
} from "./treeBeta.js";
export type {
	ArrayNodeDeltaOp,
	ArrayNodeInsertOp,
	ArrayNodeRemoveOp,
	ArrayNodeRetainOp,
	ArrayNodeTreeChangedDeltaOp,
	ArrayNodeTreeChangedRetainOp,
} from "./treeNodeApi.js";

/**
 * Compatibility alias for the event data now available from {@link TreeChangeEventsBeta.nodeChanged}.
 * @alpha
 */
export type NodeChangedDataAlpha<TNode extends TreeNode = TreeNode> =
	TNode extends WithType<string, NodeKind.Array>
		? NodeChangedDataDelta
		: TNode extends WithType<string, NodeKind.Map | NodeKind.Object | NodeKind.Record>
			? NodeChangedDataProperties<TNode>
			: NodeChangedData<TNode>;

/**
 * Compatibility alias for the event variants now available from {@link (TreeBeta:interface).on}.
 * @sealed @alpha
 */
export interface TreeChangeEventsAlpha<TNode extends TreeNode = TreeNode>
	extends TreeChangeEventsBeta<TNode> {}
