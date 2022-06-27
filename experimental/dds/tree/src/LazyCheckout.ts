/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Checkout } from './Checkout';
import { EditId } from './Identifiers';
import { RevisionView } from './RevisionView';
import { EditCommittedEventArguments, SharedTree } from './SharedTree';
import { ValidEditingResult } from './TransactionInternal';

/**
 * Checkout that only updates its view of the tree when explicitly requested.
 * This means that the {@link Checkout.currentView} field will never change unless {@link LazyCheckout.waitForPendingUpdates} is called.
 *
 * @public
 * @sealed
 */
export class LazyCheckout extends Checkout {
	private latestView: RevisionView;

	/**
	 * @param tree - the tree
	 */
	public constructor(tree: SharedTree) {
		super(tree, tree.currentView, (args: EditCommittedEventArguments) => {});
		this.latestView = tree.currentView;
	}

	protected handleNewEdit(id: EditId, result: ValidEditingResult): void {
		super.handleNewEdit(id, result);
		this.latestView = result.after;
	}

	protected get latestCommittedView(): RevisionView {
		return this.latestView;
	}

	public async waitForPendingUpdates(): Promise<void> {
		if (this.tree.currentView !== this.latestView) {
			this.latestView = this.tree.currentView;
			this.emitChange();
		}
		return Promise.resolve();
	}

	public async waitForEditsToSubmit(): Promise<void> {
		// This checkout is only lazy on updates, not edit application, so it does not need to wait for here.
		return Promise.resolve();
	}
}
