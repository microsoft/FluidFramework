/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { VisualChildNode } from "@fluidframework/devtools-core/internal";

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
	readonly schemaName: string;

	/**
	 * Types allowed (e.g., string, number, boolean, handle & etc.) inside the node.
	 * - InternalNode: `Record<string, string>`.
	 */
	readonly allowedTypes?: string | Record<string, string>;

	/**
	 * If the field or node is required or optional.
	 * - When {@link FieldKind.Required}: The field must be present
	 * - When {@link FieldKind.Optional}: The field may be omitted
	 * - When undefined: Treated the same as {@link FieldKind.Optional}
	 */
	readonly isRequired?: string;
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
