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
	tryGetCachedTreeNode,
	tryDisposeTreeNode,
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
} from "./treeNodeSchema.js";
export {
	getSimpleNodeSchema,
	setFlexSchemaFromClassSchema,
	tryGetSimpleNodeSchema,
	cachedFlexSchemaFromClassSchema,
	getSimpleNodeSchemaFromNode,
} from "./schemaCaching.js";
