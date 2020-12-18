/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Edit } from './PersistedTypes';
import { Snapshot } from './Snapshot';
import { SharedTree, SharedTreeEvent } from './SharedTree';
import { Checkout } from './Checkout';

/**
 * Basic Session that stays up to date with the SharedTree.
 *
 * waitForPendingUpdates is always a no-op since BasicCheckout is always up to date.
 * @public
 * @sealed
 */
export class BasicCheckout extends Checkout {
	/**
	 * The shared tree this checkout views/edits.
	 */
	public readonly tree: SharedTree;

	/**
	 * A bound handler for 'committedEdit' SharedTreeEvent
	 */
	private readonly editCommittedHandler = this.emitChange.bind(this);

	/**
	 * @param tree - the tree
	 */
	public constructor(tree: SharedTree) {
		super(tree.currentView);
		this.tree = tree;

		// If there is an ongoing edit, emitChange will no-op, which is fine.
		this.tree.on(SharedTreeEvent.EditCommitted, this.editCommittedHandler);
	}

	protected handleNewEdit(edit: Edit, view: Snapshot): void {
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
		
	/**
	 * release all resources
	 */
	public dispose(): void {
		// remove registered listner
		this.tree.off(SharedTreeEvent.EditCommitted, this.editCommittedHandler);
	}
}
