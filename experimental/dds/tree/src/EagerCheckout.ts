/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Checkout } from './Checkout';
import { RevisionView } from './RevisionView';
import { EditCommittedEventArguments, SharedTree } from './SharedTree';

/**
 * Checkout that always stays up to date with the SharedTree.
 * This means that {@link EagerCheckout.waitForPendingUpdates} is always a no-op since EagerCheckout is always up to date.
 * @sealed
 * @alpha
 */
export class EagerCheckout extends Checkout {
	/**
	 * @param tree - the tree
	 */
	public constructor(tree: SharedTree) {
		super(tree, tree.currentView, (args: EditCommittedEventArguments) => {
			this.emitChange();
		});
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
