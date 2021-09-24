/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionView } from '../TreeView';
import { ReconciliationPath } from '../ReconciliationPath';
import { Transaction } from '../default-edits';
import { Result } from '../Common';
import {
	ChangeResult,
	EditStatus,
	GenericTransaction,
	GenericTransactionPolicy,
	SucceedingTransactionState,
	TransactionFailure,
} from '../generic';
import { AnchoredChange } from './PersistedTypes';
import { ResolutionFailure, resolveChangeAnchors } from './AnchorResolution';

/**
 * A mutable transaction for applying sequences of changes to a TreeView.
 * Allows viewing the intermediate states.
 *
 * Contains necessary state to apply changes within an edit to a TreeView.
 *
 * May have any number of changes applied to make up the edit.
 * Use `close` to complete the transaction, returning the array of changes and an EditingResult showing the
 * results of applying the changes as an Edit to the initial TreeView (passed to the constructor).
 *
 * No data outside the Transaction is modified by Transaction:
 * the results from `close` must be used to actually submit an `Edit`.
 */
export namespace TransactionWithAnchors {
	/**
	 * Makes a new {@link GenericTransaction} that follows the {@link TransactionWithAnchors.Policy} policy.
	 */
	export function factory(view: RevisionView): GenericTransaction<AnchoredChange, Failure> {
		return new GenericTransaction(view, new Policy());
	}

	type ValidState = SucceedingTransactionState<AnchoredChange>;

	/**
	 * The policy followed by a {@link TransactionWithAnchors}.
	 */
	export class Policy implements GenericTransactionPolicy<AnchoredChange, Failure> {
		private readonly basePolicy = new Transaction.Policy();

		public tryResolveChange(
			state: ValidState,
			change: AnchoredChange,
			path: ReconciliationPath<AnchoredChange>
		): Result<AnchoredChange, TransactionFailure<Failure>> {
			const result = resolveChangeAnchors(change, state.view, path);
			return Result.isOk(result)
				? result
				: Result.error({
						status: EditStatus.Invalid,
						failure: { kind: FailureKind.ResolutionFailure, change, resolutionFailure: result.error },
				  });
		}

		public validateOnClose(state: ValidState): ChangeResult<Failure> {
			return Result.mapError(this.basePolicy.validateOnClose(state), wrapBasicError);
		}

		public dispatchChange(state: ValidState, change: AnchoredChange): ChangeResult<Failure> {
			return Result.mapError(this.basePolicy.dispatchChange(state, change), wrapBasicError);
		}
	}

	/**
	 * The kinds of failures that a transaction with anchors might encounter.
	 */
	export enum FailureKind {
		BadBasicTransaction = 'BadBasicTransaction',
		ResolutionFailure = 'ResolutionFailure',
	}

	/**
	 * A failure encountered by a transaction with anchors.
	 */
	export type Failure =
		| {
				kind: FailureKind.BadBasicTransaction;
				basicFailure: Transaction.Failure;
		  }
		| {
				kind: FailureKind.ResolutionFailure;
				change: AnchoredChange;
				resolutionFailure: ResolutionFailure;
		  };
}

function wrapBasicError({
	status,
	failure,
}: TransactionFailure<Transaction.Failure>): TransactionFailure<TransactionWithAnchors.Failure> {
	return {
		status,
		failure: {
			kind: TransactionWithAnchors.FailureKind.BadBasicTransaction,
			basicFailure: failure,
		},
	};
}
