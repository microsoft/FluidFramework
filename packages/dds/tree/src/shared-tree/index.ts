/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ISharedTree,
	SharedTreeFactory,
	type SharedTreeOptions,
	SharedTree,
	ForestType,
	type SharedTreeContentSnapshot,
	type SharedTreeFormatOptions,
	SharedTreeFormatVersion,
} from "./sharedTree.js";

export {
	createTreeCheckout,
	TreeCheckout,
	type ITreeCheckout,
	runSynchronous,
	type CheckoutEvents,
	type ITransaction,
	type ITreeCheckoutFork,
	type RevertibleFactory,
} from "./treeCheckout.js";

export {
	type SchematizeConfiguration,
	type TreeContent,
	type TreeStoredContent,
	type InitializeAndSchematizeConfiguration,
	type SchemaConfiguration,
	buildTreeConfiguration,
} from "./schematizeTree.js";

export {
	CheckoutFlexTreeView,
	type FlexTreeView,
} from "./treeView.js";

export type { ISharedTreeEditor, ISchemaEditor } from "./sharedTreeEditBuilder.js";

export {
	treeApi as Tree,
	type TreeApi,
	type TransactionConstraint,
	type NodeInDocumentConstraint,
	type RunTransaction,
	rollback,
} from "./treeApi.js";
