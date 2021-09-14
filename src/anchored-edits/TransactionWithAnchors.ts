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
import { resolveChangeAnchors } from './AnchorResolution';

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
	export function factory(view: RevisionView): GenericTransaction<AnchoredChange> {
		return new GenericTransaction(view, new Policy());
	}

	type ValidState = SucceedingTransactionState<AnchoredChange>;

	/**
	 * The policy followed by a {@link TransactionWithAnchors}.
	 */
	export class Policy implements GenericTransactionPolicy<AnchoredChange> {
		private readonly basePolicy = new Transaction.Policy();

		public tryResolveChange(
			state: ValidState,
			change: AnchoredChange,
			path: ReconciliationPath<AnchoredChange>
		): Result<AnchoredChange, TransactionFailure> {
			const resolved = resolveChangeAnchors(change, state.view, path);
			return resolved === undefined ? Result.error({ status: EditStatus.Invalid }) : Result.ok(resolved);
		}

		public validateOnClose(state: ValidState): ChangeResult {
			return this.basePolicy.validateOnClose(state);
		}

		public dispatchChange(state: ValidState, change: AnchoredChange): ChangeResult {
			return this.basePolicy.dispatchChange(state, change);
		}
	}
}
