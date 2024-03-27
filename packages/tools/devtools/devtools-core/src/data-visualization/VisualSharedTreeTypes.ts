/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type Primitive } from "./VisualTree.js";

/**
 * Base visualizer for SharedTree.
 */
interface SharedTreeNodeBase {
	schema: SharedTreeSchemaNode;
}
/**
 * TODO
 */
interface SharedTreeSchemaNode {
	/**
	 * Name of the SharedTree schema.
	 */
	name?: string;

	/**
	 * Types allowed (e.g., string, number, boolean, handle & etc.) inside the node.
	 */
	allowedTypes: string;
}
/**
 * TODO
 */
interface SharedTreeNode extends SharedTreeNodeBase {
	// TODO: Fix types.
	fields: Record<string | number, VisualSharedTreeNode>;
}
/**
 * TODO
 */
export interface SharedTreeLeafNode extends SharedTreeNodeBase {
	value: Primitive;
}

/**
 * TODO
 */
export type VisualSharedTreeNode = SharedTreeNode | SharedTreeLeafNode;
