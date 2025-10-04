/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ITreePrivate,
	type SharedTreeOptionsInternal,
	type SharedTreeOptions,
	type SharedTreeOptionsBeta,
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
	persistedToSimpleSchema,
	getCodecTreeForSharedTreeFormat,
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

export { SchematizingSimpleTreeView } from "./schematizingTreeView.js";

export type {
	ISharedTreeEditor,
	ISchemaEditor,
	SharedTreeEditBuilder,
} from "./sharedTreeEditBuilder.js";

export { Tree } from "./tree.js";
export type { RunTransaction } from "./tree.js";

export {
	TreeAlpha,
	type TreeIdentifierUtils,
	type ObservationResults,
} from "./treeAlpha.js";

export {
	independentInitializedView,
	type ViewContent,
	independentView,
} from "./independentView.js";

export type { SharedTreeChange } from "./sharedTreeChangeTypes.js";

export {
	getCodecTreeForChangeFormat,
	type SharedTreeChangeFormatVersion,
} from "./sharedTreeChangeCodecs.js";
