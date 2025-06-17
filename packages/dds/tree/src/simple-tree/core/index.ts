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
	getOrCreateInnerNode,
	treeNodeFromAnchor,
	getSimpleNodeSchemaFromInnerNode,
} from "./treeNodeKernel.js";
export { type WithType, typeNameSymbol, typeSchemaSymbol } from "./withType.js";
export {
	type Unhydrated,
	type InternalTreeNode,
} from "./types.js";
export {
	TreeNode,
	privateToken,
	inPrototypeChain,
} from "./treeNode.js";
export {
	type TreeNodeSchema,
	NodeKind,
	type TreeNodeSchemaClass,
	type TreeNodeSchemaNonClass,
	type TreeNodeSchemaCore,
	type TreeNodeSchemaBoth,
} from "./treeNodeSchema.js";
export { walkAllowedTypes, type SchemaVisitor } from "./walkSchema.js";
export { Context, HydratedContext, SimpleContextSlot } from "./context.js";
export { getOrCreateNodeFromInnerNode } from "./getOrCreateNode.js";
export {
	UnhydratedFlexTreeNode,
	UnhydratedSequenceField,
	UnhydratedContext,
	createField,
} from "./unhydratedFlexTree.js";
