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
export class BasicCheckout<TChange> extends Checkout<TChange> {
	/**
	 * @param tree - the tree
	 */
	public constructor(tree: GenericSharedTree<TChange>) {
		super(tree, tree.currentView, (args: EditCommittedEventArguments<GenericSharedTree<TChange>>) => {
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
