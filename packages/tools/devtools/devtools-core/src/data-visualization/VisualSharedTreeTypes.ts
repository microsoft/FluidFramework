/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { VisualChildNode } from "@fluidframework/devtools-core-previous";

/**
 * Base visualizer for SharedTree.
 */
interface SharedTreeNodeBase {
	schema: SharedTreeSchemaNode;
}

/**
 * The kind of {@link VisualSharedTreeNode}.
 */
export const VisualSharedTreeNodeKind = {
	LeafNode: "LeafNode",
	InternalNode: "InternalNode",
} as const;

/**
 * Base schema interface.
 */
export interface SharedTreeSchemaNode {
	/**
	 * Name of the SharedTree schema.
	 */
	schemaName: string;

	/**
	 * Types allowed (e.g., string, number, boolean, handle & etc.) inside the node.
	 * - InternalNode: `Record<string, string>`.
	 */
	allowedTypes?: string | Record<string, string>;
}

/**
 * Visual interface for SharedTree node with child field(s).
 */
interface SharedTreeNode extends SharedTreeNodeBase {
	kind: typeof VisualSharedTreeNodeKind.InternalNode;
	fields: Record<string | number, VisualSharedTreeNode>;
}

/**
 * Visual interface for SharedTree leaf node.
 *
 * @privateremarks `value` is type of {@link VisualChildNode} to visualize {@link FluidHandleNode}.
 */
export interface SharedTreeLeafNode extends SharedTreeNodeBase {
	kind: typeof VisualSharedTreeNodeKind.LeafNode;
	value: VisualChildNode;
}

/**
 * VisualSharedTreeNode type encompassing leaf / parent SharedTree node.
 */
export type VisualSharedTreeNode = SharedTreeNode | SharedTreeLeafNode;
