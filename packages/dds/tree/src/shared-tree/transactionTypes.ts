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
 * The status of the transaction callback in the {@link RunTransaction | RunTransaction} API.
 * @alpha
 */
export type TransactionCallbackStatus<TSuccessValue, TFailureValue> = (
	| {
			/** Indicates that the transaction callback ran successfully. */
			rollback?: false;
			/** The user defined value when the transaction ran successfully. */
			value: TSuccessValue;
	  }
	| {
			/** Indicates that the transaction callback failed and the transaction should be rolled back. */
			rollback: true;
			/** The user defined value when the transaction failed. */
			value: TFailureValue;
	  }
) & {
	/**
	 * An optional list of {@link TransactionConstraint | constraints} that will be checked when the commit corresponding
	 * to this transaction is reverted.
	 * If any of the constraints are not met after the transaction callback runs, an error will be thrown. Basically,
	 * these constraints have to be met after the transaction is applied.
	 * If any of the constraints are not met when the revert is being applied either locally or on remote clients, the
	 * revert will be ignored.
	 */
	preconditionsOnRevert?: readonly TransactionConstraint[];
};

/**
 * The status of a the transaction callback in the {@link RunTransaction | RunTransaction} API where the transaction doesn't
 * need to return a value. This is the same as {@link TransactionCallbackStatus} but with the `value` field omitted. This
 * @alpha
 */
export type VoidTransactionCallbackStatus = Omit<
	TransactionCallbackStatus<unknown, unknown>,
	"value"
>;

/**
 * The result of the {@link RunTransaction | RunTransaction} API when it was successful.
 * @alpha
 */
export interface TransactionResultSuccess<TSuccessValue> {
	/** Indicates that the transaction was successful. */
	success: true;
	/** The user defined value when the transaction was successful. */
	value: TSuccessValue;
}

/**
 * The result of the {@link RunTransaction | RunTransaction} API when it failed.
 * @alpha
 */
export interface TransactionResultFailed<TFailureValue> {
	/** Indicates that the transaction failed. */
	success: false;
	/** The user defined value when the transaction failed. */
	value: TFailureValue;
}

/**
 * The result of the {@link RunTransaction | RunTransaction} API.
 * @alpha
 */
export type TransactionResultExt<TSuccessValue, TFailureValue> =
	| TransactionResultSuccess<TSuccessValue>
	| TransactionResultFailed<TFailureValue>;

/**
 * The result of the {@link RunTransaction | RunTransaction} API. This is the same as {@link TransactionResultExt}
 * but with the `value` field omitted. This is useful when the transaction callback doesn't need to return a value.
 * @alpha
 */
export type TransactionResult =
	| Omit<TransactionResultSuccess<unknown>, "value">
	| Omit<TransactionResultFailed<unknown>, "value">;

/**
 * The parameters for the {@link RunTransaction | RunTransaction} API.
 * @alpha
 */
export interface RunTransactionParams {
	/**
	 * An optional list of {@link TransactionConstraint | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, an error will be thrown.
	 * If any of the constraints are not met after the transaction has been ordered by the service, it will be rolled back on
	 * this client and ignored by all other clients.
	 */
	readonly preconditions?: readonly TransactionConstraint[];
}
