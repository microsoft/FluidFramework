/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeNode } from "../core/index.js";

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
 * Type for alpha version {@link TransactionConstraint | constraint}s
 * @sealed @alpha
 */
export type TransactionConstraintAlpha = TransactionConstraint | NoChangeConstraint; // TODO: Add more constraint types here

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
 * A {@link TransactionConstraintAlpha | constraint} which requires that, for this transaction to apply, the document must be in the same state immediately before the transaction is applied as it was before the transaction was authored.
 * When used as a revert precondition it requires that, for the revert to apply, the document must be in the same state immediately before the revert is applied as it was after the transaction was applied.
 * @alpha
 */
export interface NoChangeConstraint {
	readonly type: "noChange";
}

/**
 * An interface representing a value associated with a transaction.
 * @alpha
 */
export interface WithValue<TValue> {
	/** The user defined value. */
	value: TValue;
}

/**
 * The status of the transaction callback in the {@link RunTransaction | RunTransaction} API.
 * @alpha
 */
export type TransactionCallbackStatus<TSuccessValue, TFailureValue> = (
	| (WithValue<TSuccessValue> & {
			/** Indicates that the transaction callback ran successfully. */
			rollback?: false;
	  })
	| (WithValue<TFailureValue> & {
			/** Indicates that the transaction callback failed and the transaction should be rolled back. */
			rollback: true;
	  })
) & {
	/**
	 * An optional list of {@link TransactionConstraintAlpha | constraints} that will be checked when the commit corresponding
	 * to this transaction is reverted. If any of these constraints are not met when the revert is being applied either
	 * locally or on remote clients, the revert will be ignored.
	 * These constraints must also be met at the time they are first introduced. If they are not met after the transaction
	 * callback returns, then `runTransaction` (which invokes the transaction callback) will throw a `UsageError`.
	 */
	preconditionsOnRevert?: readonly TransactionConstraintAlpha[];
};

/**
 * The status of a the transaction callback in the {@link RunTransaction | RunTransaction} API where the transaction doesn't
 * need to return a value. This is the same as {@link TransactionCallbackStatus} but with the `value` field omitted.
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
export interface TransactionResultSuccess<TSuccessValue> extends WithValue<TSuccessValue> {
	/** Indicates that the transaction was successful. */
	success: true;
}

/**
 * The result of the {@link RunTransaction | RunTransaction} API when it failed.
 * @alpha
 */
export interface TransactionResultFailed<TFailureValue> extends WithValue<TFailureValue> {
	/** Indicates that the transaction failed. */
	success: false;
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
 * @input
 */
export interface RunTransactionParams {
	/**
	 * An optional list of {@link TransactionConstraintAlpha | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, an error will be thrown.
	 * If any of the constraints are not met after the transaction has been ordered by the service, it will be rolled back on
	 * this client and ignored by all other clients.
	 */
	readonly preconditions?: readonly TransactionConstraintAlpha[];
	/**
	 * A label for this transaction that allows it to be correlated with later edits (e.g. for controlling undo/redo grouping).
	 *
	 * @remarks
	 * This label is associated with the commit produced by this transaction, and is surfaced through the
	 * `label` property of {@link ChangeMetadata} in the `commitApplied` or `changed` event.
	 *
	 * If there is a nested transaction, only the outermost transaction label will be used.
	 */
	readonly label?: unknown;
}
