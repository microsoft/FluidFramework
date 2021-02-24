/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Edit } from './PersistedTypes';
import { Snapshot } from './Snapshot';
import { SharedTree } from './SharedTree';
import { Checkout, CheckoutEvent } from './Checkout';
import { EditId } from './Identifiers';

/**
 * Basic Session that stays up to date with the SharedTree.
 *
 * waitForPendingUpdates is always a no-op since BasicCheckout is always up to date.
 * @public
 * @sealed
 */
export class BasicCheckout extends Checkout {
	/**
	 * @param tree - the tree
	 */
	public constructor(tree: SharedTree) {
		super(tree, tree.currentView, (id: EditId) => {
			this.emitChange();
			this.emit(CheckoutEvent.EditCommitted, id);
		});
	}

	protected handleNewEdit(edit: Edit, before: Snapshot, after: Snapshot): void {
		// Since external edits could have been applied while currentEdit was pending,
		// do not use the produced view: just go to the newest revision
		// (which processLocalEdit will do, including invalidation).
		this.tree.processLocalEdit(edit);
	}

	protected get latestCommittedView(): Snapshot {
		return this.tree.currentView;
	}

	public async waitForPendingUpdates(): Promise<void> {
		return Promise.resolve();
	}
}
