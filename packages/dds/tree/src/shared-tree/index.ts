/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ITreePrivate,
	type SharedTreeOptionsInternal,
	type SharedTreeOptions,
	SharedTreeKernel,
	getBranch,
	type ForestType,
	type SharedTreeContentSnapshot,
	type SharedTreeFormatOptions,
	SharedTreeFormatVersion,
	buildConfiguredForest,
	defaultSharedTreeOptions,
	type ForestOptions,
	type ITreeInternal,
	ForestTypeOptimized,
	ForestTypeExpensiveDebug,
	ForestTypeReference,
	exportSimpleSchema,
	type SharedTreeKernelView,
} from "./sharedTree.js";

export {
	createTreeCheckout,
	TreeCheckout,
	type ITreeCheckout,
	type CheckoutEvents,
	type ITreeCheckoutFork,
	type BranchableTree,
	type TreeBranchFork,
} from "./treeCheckout.js";

export { type TreeStoredContent } from "./schematizeTree.js";

export { SchematizingSimpleTreeView } from "./schematizingTreeView.js";

export { CheckoutFlexTreeView } from "./checkoutFlexTreeView.js";

export type {
	ISharedTreeEditor,
	ISchemaEditor,
	SharedTreeEditBuilder,
} from "./sharedTreeEditBuilder.js";

export {
	treeApi as Tree,
	type TreeApi,
	type RunTransaction,
} from "./treeApi.js";

export { TreeAlpha } from "./treeApiAlpha.js";

export {
	independentInitializedView,
	type ViewContent,
	independentView,
} from "./independentView.js";

export type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
