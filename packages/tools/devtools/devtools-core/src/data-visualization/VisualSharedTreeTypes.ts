/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type Primitive } from "./VisualTree.js";

/**
 * Base visualizer interface for {@link VisualSharedTreeNode}.
 */
export interface SharedTreeNodeBase {
	/**
	 * Contains schema information for the current node.
	 */
	schema: SharedTreeSchemaNode;
}

/**
 * Base schema interface.
 */
export interface SharedTreeSchemaNode {
	/**
	 * Name of the SharedTree schema.
	 */
	name: string;

	/**
	 * Allowed fields or types of the current node.
	 * If the node contains fields: expected field name and its allowed type(s) (e.g., `{ "field1": "string | boolean", "field2": "number" }`).
	 * Else if the node is a leaf node: allowed types (e.g., string, number, boolean, handle & etc.).
	 */
	allowedTypes: string;
}

/**
 * Visual interface for SharedTree node with child field(s).
 */
export interface SharedTreeNode extends SharedTreeNodeBase {
	fields: Record<string | number, VisualSharedTreeNode | SharedTreeSchemaNode>;
}

/**
 * Visual interface for SharedTree leaf node.
 */
export interface SharedTreeLeafNode extends SharedTreeNodeBase {
	value: Primitive;
}

/**
 * VisualSharedTreeNode type encompassing leaf / parent SharedTree node.
 */
export type VisualSharedTreeNode = SharedTreeNode | SharedTreeLeafNode;
