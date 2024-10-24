/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ISharedTree,
	SharedTreeFactory,
	type SharedTreeOptions,
	SharedTree,
	getBranch,
	ForestType,
	type SharedTreeContentSnapshot,
	type SharedTreeFormatOptions,
	SharedTreeFormatVersion,
	buildConfiguredForest,
	defaultSharedTreeOptions,
	type ForestOptions,
} from "./sharedTree.js";

export {
	createTreeCheckout,
	TreeCheckout,
	type ITreeCheckout,
	runSynchronous,
	type CheckoutEvents,
	type ITransaction,
	type ITreeCheckoutFork,
	type TreeBranch,
	type TreeBranchFork,
} from "./treeCheckout.js";

export { type TreeStoredContent } from "./schematizeTree.js";

export { SchematizingSimpleTreeView } from "./schematizingTreeView.js";

export { CheckoutFlexTreeView } from "./checkoutFlexTreeView.js";

export type { ISharedTreeEditor, ISchemaEditor } from "./sharedTreeEditBuilder.js";

export {
	treeApi as Tree,
	type TreeApi,
	type TransactionConstraint,
	type NodeInDocumentConstraint,
	type RunTransaction,
	rollback,
} from "./treeApi.js";
