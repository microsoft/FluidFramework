/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionView } from './TreeView';
import { Checkout } from './Checkout';
import { EditCommittedEventArguments, GenericSharedTree } from './generic';

/**
 * Basic Session that stays up to date with the SharedTree.
 *
 * waitForPendingUpdates is always a no-op since BasicCheckout is always up to date.
 * @public
 * @sealed
 */
export class BasicCheckout<TChange, TFailure = unknown> extends Checkout<TChange, TFailure> {
	/**
	 * @param tree - the tree
	 */
	public constructor(tree: GenericSharedTree<TChange, TFailure>) {
		super(tree, tree.currentView, (args: EditCommittedEventArguments<GenericSharedTree<TChange, TFailure>>) => {
			this.emitChange();
		});
	}

	protected get latestCommittedView(): RevisionView {
		return this.tree.currentView;
	}

	public async waitForPendingUpdates(): Promise<void> {
		return Promise.resolve();
	}
}
