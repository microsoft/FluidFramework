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
 * List of possible SharedTree schemaType for {@link SharedTreeSchemaNode}.
 */
type SharedTreeSchemaType =
	| "MapNodeStoredSchema"
	| "ObjectNodeStoredSchema"
	| "LeafNodeStoredSchema";

/**
 * Base schema interface.
 */
interface SharedTreeSchemaNode {
	/**
	 * Name of the SharedTree schema.
	 */
	name?: string;

	/**
	 * A type of schema. Should be one of the following:
	 * - MapNodeStoredSchema
	 * - ObjectNodeStoredSchema
	 * - LeafNodeStoredSchema
	 */
	schemaType: SharedTreeSchemaType;

	/**
	 * Types allowed (e.g., string, number, boolean, handle & etc.) inside the node.
	 */
	allowedTypes: string | undefined;
}

/**
 * Visual interface for SharedTree node with child field(s).
 */
interface SharedTreeNode extends SharedTreeNodeBase {
	fields: Record<string | number, VisualSharedTreeNode>;
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
