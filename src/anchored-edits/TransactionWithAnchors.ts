/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { NodeId, DetachedSequenceId } from '../Identifiers';
import { RevisionView } from '../TreeView';
import { ReconciliationPath } from '../ReconciliationPath';
import { Transaction } from '../default-edits';
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
export class TransactionWithAnchors extends Transaction {
	protected readonly detached: Map<DetachedSequenceId, readonly NodeId[]> = new Map();

	public static factory(view: RevisionView): TransactionWithAnchors {
		return new TransactionWithAnchors(view);
	}

	protected tryResolveChange(
		change: AnchoredChange,
		path: ReconciliationPath<AnchoredChange>
	): AnchoredChange | undefined {
		return resolveChangeAnchors(change, this.view, path);
	}
}
