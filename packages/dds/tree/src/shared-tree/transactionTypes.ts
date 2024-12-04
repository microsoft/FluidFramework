/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ImplicitFieldSchema, TreeNode } from "../simple-tree/index.js";

/**
 * A special object that signifies when a SharedTree {@link RunTransaction | transaction} should "roll back".
 * @public
 */
export const rollback = Symbol("SharedTree Transaction Rollback");

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
	readonly type: "nodeInDocument";
	readonly node: TreeNode;
}

/**
 * Parameters for running a transaction on the tree view that applies one or more edits to the tree as a single atomic unit.
 * @alpha
 */
export interface TransactionParams<TResult> {
	/**
	 * The function to run as the body of the transaction. This function is passed the root of the tree.
	 * At any point during the transaction, the function may return the special {@link RunTransaction.rollback | rollback value}
	 * (`Tree.runTransaction.rollback`) to abort the transaction and discard any changes it made so far.
	 */
	readonly transaction: () => TransactionStatus<TResult>;
	/**
	 * An optional list of {@link TransactionConstraint | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, it will throw an error.
	 * If any of the constraints are not met after the transaction has been ordered by the service, it will be rolled back on
	 * this client and ignored by all other clients.
	 */
	readonly preconditions?: readonly TransactionConstraint[];
}

/**
 * The status of a transaction on the tree view.
 * @alpha
 */
export interface TransactionStatus<TResult> {
	/**
	 * The value returned by the inner `transaction` function or the special {@link RunTransaction.rollback | rollback value}
	 * (`Tree.runTransaction.rollback`) which means that the transaction was aborted.
	 */
	readonly result: TResult | typeof rollback;
}
