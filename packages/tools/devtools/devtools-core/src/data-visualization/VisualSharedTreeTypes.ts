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
export const SharedTreeSchemaType = {
	MapNodeStoredSchema: "MapNodeStoredSchema",
	ObjectNodeStoredSchema: "ObjectNodeStoredSchema",
	LeafNodeStoredSchema: "LeafNodeStoredSchema",
} as const;

/**
 * Use a Union of Literal Types to represent the SharedTree schema type.
 */
type SharedTreeSchemaType = (typeof SharedTreeSchemaType)[keyof typeof SharedTreeSchemaType];

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
	 * - LeafNode: String.
	 * - InternalNode: `Record<string, string>`.
	 */
	allowedTypes: string | Record<string, string>;
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
 */
export interface SharedTreeLeafNode extends SharedTreeNodeBase {
	kind: typeof VisualSharedTreeNodeKind.LeafNode;
	value: Primitive;
}

/**
 * VisualSharedTreeNode type encompassing leaf / parent SharedTree node.
 */
export type VisualSharedTreeNode = SharedTreeNode | SharedTreeLeafNode;
