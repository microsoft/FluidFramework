/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import { Context, TreeStatus } from "../feature-libraries/index.js";
import {
	ImplicitFieldSchema,
	TreeNode,
	TreeNodeApi,
	TreeView,
	getFlexNode,
	treeNodeApi,
} from "../simple-tree/index.js";
import { fail } from "../util/index.js";

import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
import { TreeCheckout } from "./treeCheckout.js";
import { contextToTreeView } from "./treeView.js";

/**
 * Provides various functions for interacting with {@link TreeNode}s.
 * @public
 */
export interface TreeApi extends TreeNodeApi {
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
	 * @param node - The node that will be passed to `transaction`.
	 * This is typically the root node of the subtree that will be modified by the transaction.
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the provided `node`.
	 * At any point during the transaction, the function may return the value `"rollback"` to abort the transaction and discard any changes it made so far.
	 * @param preconditions - An optional list of {@link TransactionConstraint | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, it will throw an error.
	 * If any of the constraints are not met when this transaction is sequenced (on this client or other clients), the transaction will not be run.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction is cancelled and rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	runTransaction<TNode extends TreeNode>(
		node: TNode,
		transaction: (node: TNode) => void | "rollback",
		preconditions?: TransactionConstraint[],
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
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction is cancelled and rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	runTransaction<TView extends TreeView<ImplicitFieldSchema>>(
		tree: TView,
		transaction: (root: TView["root"]) => void | "rollback",
	): void;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param tree - The tree which will be edited by the transaction
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the root of the tree.
	 * At any point during the transaction, the function may return the value `"rollback"` to abort the transaction and discard any changes it made so far.
	 * @param preconditions - An optional list of {@link TransactionConstraint | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, it will throw an error.
	 * If any of the constraints are not met when this transaction is sequenced (on this client or other clients), the transaction will not be run.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction is cancelled and rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	runTransaction<TView extends TreeView<ImplicitFieldSchema>>(
		tree: TView,
		transaction: (root: TView["root"]) => void | "rollback",
		preconditions?: TransactionConstraint[],
	): void;

	/**
	 * Check if the subtree defined by `node` contains `other`.
	 *
	 * @returns true if `other` is an inclusive descendant of `node`, and false otherwise.
	 * @remarks
	 * This includes direct and indirect children:
	 * as long as `node` is an ancestor of `other` (occurs in its parentage chain), this returns true, regardless of the number of levels of the tree between.
	 *
	 * `node` is considered to contain itself, so the case where `node === other` returns true.
	 *
	 * This is handy when checking if moving `node` into `other` would create a cycle and thus is invalid.
	 *
	 * This check walks the parents of `other` looking for `node`,
	 * and thus runs in time proportional to the depth of child in the tree.
	 */
	contains(node: TreeNode, other: TreeNode): boolean;
}

/**
 * The `Tree` object holds various functions for interacting with {@link TreeNode}s.
 * @public
 */
export const treeApi: TreeApi = {
	...treeNodeApi,
	runTransaction<TNode extends TreeNode, TRoot extends ImplicitFieldSchema>(
		treeOrNode: TNode | TreeView<TRoot>,
		transaction: ((node: TNode) => void | "rollback") | ((root: TRoot) => void | "rollback"),
		preconditions: TransactionConstraint[] = [],
	) {
		if (treeOrNode instanceof SchematizingSimpleTreeView) {
			const t = transaction as (root: TRoot) => void | "rollback";
			runTransaction(treeOrNode.checkout, () => t(treeOrNode.root as TRoot), preconditions);
		} else {
			const node = treeOrNode as TNode;
			const t = transaction as (node: TNode) => void | "rollback";
			const context = getFlexNode(node).context;
			assert(context instanceof Context, 0x901 /* Unsupported context */);
			const treeView =
				contextToTreeView.get(context) ??
				fail("Expected view to be registered for context");

			runTransaction(treeView.checkout, () => t(node), preconditions);
		}
	},

	contains(parent: TreeNode, child: TreeNode): boolean {
		let toCheck: TreeNode | undefined = child;
		while (toCheck !== undefined) {
			if (toCheck === parent) {
				return true;
			}
			toCheck = treeApi.parent(toCheck);
		}
		return false;
	},
};

/**
 * A requirement for a SharedTree transaction to succeed.
 * @remarks Transaction constraints are useful for validating that the state of the tree meets some requirement when a transaction runs.
 * In general, when running a transaction a client can validate their tree state in whatever way they wish and decide to either proceed with the transaction or not.
 * However, they cannot know what the tree state will be when the transaction is _sequenced_.
 * There may have been any number of edits from other clients that get sequenced before the transaction is eventually sequenced.
 * Constraints provide a way to validate the tree state after the transaction has been sequenced and abort the transaction if the constraints are not met.
 * All clients will validate the constraints of a transaction when it is sequenced, so all clients will agree on whether the transaction succeeds or not.
 * @public
 */
export type TransactionConstraint = NodeInDocumentConstraint; // TODO: Add more constraint types here

/**
 * A transaction {@link TransactionConstraint | constraint} which requires that the given node exists in the tree.
 * @remarks The node must be in the document (its {@link TreeStatus | status} must be {@link TreeStatus.InDocument | InDocument}) to qualify as "existing".
 * @public
 */
export interface NodeInDocumentConstraint {
	type: "nodeInDocument";
	node: TreeNode;
}

// TODO: Add more constraint types here

function runTransaction(
	checkout: TreeCheckout,
	transaction: () => void | "rollback",
	preconditions: TransactionConstraint[],
): void {
	checkout.transaction.start();
	for (const constraint of preconditions) {
		switch (constraint.type) {
			case "nodeInDocument": {
				const node = getFlexNode(constraint.node);
				assert(
					node.treeStatus() === TreeStatus.InDocument,
					'Attempted to apply "nodeExists" constraint when building a transaction, but the node is not in the document.',
				);
				checkout.editor.addNodeExistsConstraint(node.anchorNode);
				break;
			}
			default:
				unreachableCase(constraint.type);
		}
	}
	let result: void | "rollback";
	try {
		result = transaction();
	} catch (e) {
		// If the transaction has an unhandled error, abort and rollback the transaction but continue to propagate the error.
		checkout.transaction.abort();
		throw e;
	}

	if (result === "rollback") {
		checkout.transaction.abort();
	} else {
		checkout.transaction.commit();
	}
}
