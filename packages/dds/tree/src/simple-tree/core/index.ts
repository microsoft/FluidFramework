/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	isTreeNode,
	TreeNodeKernel,
	getKernel,
	tryGetTreeNodeSchema,
	type InnerNode,
	tryDisposeTreeNode,
	tryGetTreeNodeFromMapNode,
	getOrCreateInnerNode,
	treeNodeFromAnchor,
} from "./treeNodeKernel.js";
export { type WithType, typeNameSymbol, typeSchemaSymbol } from "./withType.js";
export {
	type TreeChangeEvents,
	TreeNode,
	type Unhydrated,
	inPrototypeChain,
	type InternalTreeNode,
	privateToken,
} from "./types.js";
export {
	type TreeNodeSchema,
	NodeKind,
	type TreeNodeSchemaClass,
	type TreeNodeSchemaNonClass,
	type TreeNodeSchemaCore,
	type TreeNodeSchemaBoth,
} from "./treeNodeSchema.js";
export { getSimpleNodeSchemaFromInnerNode } from "./schemaCaching.js";
export { walkAllowedTypes, type SchemaVisitor } from "./walkSchema.js";
export { Context, HydratedContext, SimpleContextSlot } from "./context.js";
export { getOrCreateNodeFromInnerNode } from "./getOrCreateNode.js";
export {
	UnhydratedFlexTreeNode,
	UnhydratedTreeSequenceField,
	tryUnhydratedFlexTreeNode,
	UnhydratedContext,
} from "./unhydratedFlexTree.js";
