/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeNode } from "../simple-tree/index.js";

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
 * The successful outcome of a transaction, i.e. the transaction should continue.
 * @alpha
 */
export interface ContinueTransaction {
	/** The successful outcome indicating the rest of the transaction should continue */
	readonly result: "continue";
	/**
	 * An optional list of {@link TransactionConstraint | constraints} that are checked just before undoing the
	 * transaction.
	 * If any of the constraints are not met after the transaction delegate is called, it will throw an error.
	 * If any of the constraints are not met after the inverse of the transaction has been ordered by the service,
	 * it will be rolled back on this client and ignored by all other clients.
	 */
	readonly undoPreconditions?: readonly TransactionConstraint[];
}
/**
 * The failed outcome of a transaction, i.e. the transaction should abort.
 * @alpha
 */
export interface AbortTransaction {
	/**
	 * The failed outcome indicating the rest of the transaction should abort and any changes should be rolled back.
	 * This will only fail the current transaction scope. Any transactions in the outer scope will still run.
	 */
	readonly result: "abort";
}

/**
 * The extended successful outcome of a transaction, i.e. the transaction should continue.
 * @alpha
 */
export interface ContinueTransactionExt<TSuccessValue> extends ContinueTransaction {
	/** The user defined return value on successfully completing the transaction */
	readonly returnValue: TSuccessValue;
}
/**
 * The extended failed outcome of a transaction, i.e. the transaction should abort.
 * @alpha
 */
export interface AbortTransactionExt<TFailureValue> extends AbortTransaction {
	/** The user defined return value on failing the transaction */
	readonly returnValue: TFailureValue;
}

/**
 * The successful return value of the runTransaction API, i.e., the transaction succeeded.
 * @alpha
 */
export interface RunTransactionSucceeded {
	/** Property indicating that the transaction was successful */
	readonly success: true;
}
/**
 * The failed return value of the runTransaction API, i.e., the transaction failed.
 * @alpha
 */
export interface RunTransactionFailed {
	/** Property indicating that the transaction failed */
	readonly success: false;
}

/**
 * The extended successful return value of the runTransaction API, i.e., the transaction succeeded.
 * @alpha
 */
export interface RunTransactionSucceededExt<TSuccessValue> extends RunTransactionSucceeded {
	/** The user defined return value on successfully completing the transaction */
	readonly returnValue: TSuccessValue;
}
/**
 * The extended failed return value of the runTransaction API, i.e., the transaction failed.
 * @alpha
 */
export interface RunTransactionFailedExt<TFailureValue> extends RunTransactionFailed {
	/** The user defined return value on failing the transaction */
	readonly returnValue: TFailureValue;
}

/**
 * Parameters for running a transaction on the tree view that applies one or more edits to the tree as a single atomic unit.
 * @alpha
 */
export interface RunTransactionParams {
	/**
	 * The function to run as the body of the transaction.
	 * @returns The result of the transaction indicating whether the transaction should continue or abort.
	 */
	readonly transaction: () => ContinueTransaction | AbortTransaction;
	/**
	 * An optional list of {@link TransactionConstraint | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, it will throw an error.
	 * If any of the constraints are not met after the transaction has been ordered by the service, it will be rolled back on
	 * this client and ignored by all other clients.
	 */
	readonly preconditions?: readonly TransactionConstraint[];
}

/**
 * Parameters for running a transaction on the tree view that applies one or more edits to the tree as a single atomic unit.
 * @alpha
 */
export interface RunTransactionParamsExt<TSuccessValue, TFailureValue> {
	/**
	 * The function to run as the body of the transaction.
	 * @returns The result of the transaction indicating whether the transaction should continue or abort. The user provided
	 * return value will be returned along with the success or failure result.
	 */
	readonly transaction: () =>
		| ContinueTransactionExt<TSuccessValue>
		| AbortTransactionExt<TFailureValue>;
	/**
	 * An optional list of {@link TransactionConstraint | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, it will throw an error.
	 * If any of the constraints are not met after the transaction has been ordered by the service, it will be rolled back on
	 * this client and ignored by all other clients.
	 */
	readonly preconditions?: readonly TransactionConstraint[];
}
