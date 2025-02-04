/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ISharedTree,
	type SharedTreeOptionsInternal,
	type SharedTreeOptions,
	SharedTree,
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
} from "./sharedTree.js";

export {
	SharedTreeAttributes,
	SharedTreeFactoryType,
} from "./publicContracts.js";

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

export type { ISharedTreeEditor, ISchemaEditor } from "./sharedTreeEditBuilder.js";

export {
	treeApi as Tree,
	type TreeApi,
	type RunTransaction,
} from "./treeApi.js";

export {
	type TransactionConstraint,
	type NodeInDocumentConstraint,
	type RunTransactionParams,
	type VoidTransactionCallbackStatus,
	type TransactionCallbackStatus,
	type TransactionResult,
	type TransactionResultExt,
	type TransactionResultSuccess,
	type TransactionResultFailed,
	rollback,
} from "./transactionTypes.js";

export { TreeAlpha } from "./treeApiAlpha.js";

export {
	independentInitializedView,
	type ViewContent,
	independentView,
} from "./independentView.js";
