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
	type SharedTreeContentSnapshot,
	type SharedTreeFormatOptions,
	defaultSharedTreeOptions,
	type ForestOptions,
	type ITreeInternal,
	exportSimpleSchema,
	type SharedTreeKernelView,
	persistedToSimpleSchema,
	getCodecTreeForSharedTreeFormat,
} from "./sharedTree.js";

export { type ForestType, buildConfiguredForest } from "./forestType.js";
export { ForestTypeReference } from "./forestTypeReference.js";
export { ForestTypeOptimized } from "./forestTypeOptimized.js";
export { ForestTypeExpensiveDebug } from "./forestTypeExpensiveDebug.js";

export {
	createTreeCheckout,
	TreeCheckout,
	type ITreeCheckout,
	type CheckoutEvents,
	type TreeTransactor,
} from "./treeCheckout.js";

export { SchematizingSimpleTreeView } from "./schematizingTreeView.js";

export { initialize, initializerFromChunk } from "./schematizeTree.js";

export type {
	ISharedTreeEditor,
	ISchemaEditor,
	SharedTreeEditBuilder,
} from "./sharedTreeEditBuilder.js";

export { minimize } from "./transactionMinimize.js";

export { Tree } from "./tree.js";
export type { RunTransaction } from "./tree.js";

export { TreeBeta } from "./treeBeta.js";

export {
	TreeAlpha,
	type TreeIdentifierUtils,
	type ObservationResults,
} from "./treeAlpha.js";

export {
	independentInitializedView,
	type ViewContent,
	createIndependentTreeViewAlpha,
	independentView,
	type IndependentViewOptions,
	type IndependentViewTelemetryOptions,
	createIndependentTreeAlpha,
	createIndependentTreeBeta,
	createIndependentTreeView,
	type CreateIndependentTreeAlphaOptions,
} from "./independentView.js";

export type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
export {
	makeSerializedChangeCodec,
	type SerializedChangeCodec,
} from "./serializedChange.js";

export {
	getCodecTreeForChangeFormat,
	type SharedTreeChangeFormatVersion,
} from "./sharedTreeChangeCodecs.js";

export { createViewableTreeAlpha } from "./viewableTree.js";
