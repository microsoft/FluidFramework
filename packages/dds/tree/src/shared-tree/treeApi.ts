/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import { fail } from "../util/index.js";
import { Context } from "../feature-libraries/index.js";
import {
	TreeNode,
	SimpleTreeApi,
	TreeView,
	simpleTreeApi,
	getFlexNode,
} from "../simple-tree/index.js";
import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
import { TreeCheckout } from "./treeCheckout.js";
import { contextToTreeView } from "./treeView.js";

/**
 * Provides various functions for interacting with {@link TreeNode}s.
 * @public
 */
export interface TreeApi extends SimpleTreeApi {
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param node - The node that will be passed to `transaction`.
	 * This is typically the root node of the subtree that will be modified by the transaction.
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the provided `node`.
	 * At any point during the transaction, the function may return the value `"rollback"` to abort the transaction and discard any changes it made so far.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - If any change in the transaction fails and must be discarded, then the entire transaction is discarded.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction is cancelled and rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	runTransaction<TNode extends TreeNode>(
		node: TNode,
		transaction: (node: TNode) => void | "rollback",
	): void;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param tree - The tree which will be edited by the transaction
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the root of the tree.
	 * At any point during the transaction, the function may return the value `"rollback"` to abort the transaction and discard any changes it made so far.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - If any change in the transaction fails and must be discarded, then the entire transaction is discarded.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction is cancelled and rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	runTransaction<TRoot>(
		tree: TreeView<TRoot>,
		transaction: (root: TRoot) => void | "rollback",
	): void;
}

/**
 * The `Tree` object holds various functions for interacting with {@link TreeNode}s.
 * @public
 */
export const treeApi: TreeApi = {
	...simpleTreeApi,
	runTransaction<TNode extends TreeNode, TRoot>(
		treeOrNode: TNode | TreeView<TRoot>,
		transaction: ((node: TNode) => void | "rollback") | ((root: TRoot) => void | "rollback"),
	) {
		if (treeOrNode instanceof SchematizingSimpleTreeView) {
			const t = transaction as (root: TRoot) => void | "rollback";
			runTransaction(treeOrNode.checkout, () => t(treeOrNode.root as TRoot));
		} else {
			const node = treeOrNode as TNode;
			const t = transaction as (node: TNode) => void | "rollback";
			const context = getFlexNode(node).context;
			assert(context instanceof Context, "Unsupported context");
			const treeView =
				contextToTreeView.get(context) ??
				fail("Expected view to be registered for context");

			runTransaction(treeView.checkout, () => t(node));
		}
	},
};

function runTransaction(checkout: TreeCheckout, transaction: () => void | "rollback"): void {
	checkout.transaction.start();
	try {
		if (transaction() === "rollback") {
			checkout.transaction.abort();
		} else {
			checkout.transaction.commit();
		}
	} catch (e) {
		// If the transaction has an unhandled error, abort and rollback the transaction but continue to propagate the error.
		checkout.transaction.abort();
		throw e;
	}
}

// TODO: tests, and don't forget to test forking a checkoutflextreeview if you can
