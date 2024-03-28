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

type SharedTreeSchemaType =
	| "MapNodeStoredSchema"
	| "ObjectNodeStoredSchema"
	| "LeafNodeStoredSchema";

/**
 * TODO
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
