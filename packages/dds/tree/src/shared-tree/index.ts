/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type CreateIndependentTreeAlphaOptions,
	type IndependentViewOptions,
	type ViewContent,
	createIndependentTreeAlpha,
	createIndependentTreeBeta,
	independentInitializedView,
	independentView,
} from "./independentView.js";
export { initialize, initializerFromChunk } from "./schematizeTree.js";
export { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
export {
	type ForestOptions,
	type ForestType,
	ForestTypeExpensiveDebug,
	ForestTypeOptimized,
	ForestTypeReference,
	type ITreeInternal,
	type ITreePrivate,
	type SharedTreeContentSnapshot,
	type SharedTreeFormatOptions,
	SharedTreeKernel,
	type SharedTreeKernelView,
	type SharedTreeOptions,
	type SharedTreeOptionsBeta,
	type SharedTreeOptionsInternal,
	buildConfiguredForest,
	defaultSharedTreeOptions,
	exportSimpleSchema,
	getBranch,
	getCodecTreeForSharedTreeFormat,
	persistedToSimpleSchema,
} from "./sharedTree.js";
export {
	type SharedTreeChangeFormatVersion,
	getCodecTreeForChangeFormat,
} from "./sharedTreeChangeCodecs.js";
export type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
export type {
	ISchemaEditor,
	ISharedTreeEditor,
	SharedTreeEditBuilder,
} from "./sharedTreeEditBuilder.js";
export type { RunTransaction } from "./tree.js";
export { Tree } from "./tree.js";
export {
	type ObservationResults,
	TreeAlpha,
	type TreeIdentifierUtils,
} from "./treeAlpha.js";
export {
	type BranchableTree,
	type CheckoutEvents,
	type ITreeCheckout,
	type ITreeCheckoutFork,
	type TreeBranchFork,
	TreeCheckout,
	createTreeCheckout,
} from "./treeCheckout.js";
