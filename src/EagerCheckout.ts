/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Checkout } from './Checkout';
import { EditCommittedEventArguments, GenericSharedTree, RevisionView } from './generic';

/**
 * Checkout that always stays up to date with the SharedTree.
 * This means that {@link EagerCheckout.waitForPendingUpdates} is always a no-op since EagerCheckout is always up to date.
 *
 * @public
 * @sealed
 */
export class EagerCheckout<TChange, TChangeInternal, TFailure = unknown> extends Checkout<
	TChange,
	TChangeInternal,
	TFailure
> {
	/**
	 * @param tree - the tree
	 */
	public constructor(tree: GenericSharedTree<TChange, TChangeInternal, TFailure>) {
		super(
			tree,
			tree.currentView,
			(args: EditCommittedEventArguments<GenericSharedTree<TChange, TChangeInternal, TFailure>>) => {
				this.emitChange();
			}
		);
	}

	protected get latestCommittedView(): RevisionView {
		return this.tree.currentView;
	}

	public async waitForPendingUpdates(): Promise<void> {
		return Promise.resolve();
	}

	public async waitForEditsToSubmit(): Promise<void> {
		return Promise.resolve();
	}
}
