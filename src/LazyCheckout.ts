/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionView } from './TreeView';
import { Checkout } from './Checkout';
import { EditCommittedEventArguments, GenericSharedTree, ValidEditingResult } from './generic';
import { EditId } from './Identifiers';

/**
 * Checkout that only updates its view of the tree when explicitly requested.
 * This means that the {@link Checkout.currentView} field will never change unless {@link LazyCheckout.waitForPendingUpdates} is called.
 *
 * @public
 * @sealed
 */
export class LazyCheckout<TChange, TChangeInternal, TFailure = unknown> extends Checkout<
	TChange,
	TChangeInternal,
	TFailure
> {
	private latestView: RevisionView;

	/**
	 * @param tree - the tree
	 */
	public constructor(tree: GenericSharedTree<TChange, TChangeInternal, TFailure>) {
		super(
			tree,
			tree.currentView,
			(args: EditCommittedEventArguments<GenericSharedTree<TChange, TChangeInternal, TFailure>>) => {}
		);
		this.latestView = tree.currentView;
	}

	protected handleNewEdit(id: EditId, result: ValidEditingResult<TChangeInternal>): void {
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
}
