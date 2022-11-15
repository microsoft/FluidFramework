/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assertNotUndefined } from './Common';
import { SharedTreeEvent } from './EventTypes';
import { EditId } from './Identifiers';
import { EditCommittedEventArguments, SharedTree } from './SharedTree';

// TODO: We temporarily duplicate these contracts from 'framework/undo-redo' to unblock development
// while we decide on the correct layering for undo.

export interface IRevertible {
	revert();
	discard();
}

export interface IUndoConsumer {
	pushToCurrentOperation(revertible: IRevertible);
}

/**
 * A shared tree undo redo handler that will add revertible local tree changes to the provided
 * undo redo stack manager
 */
export class SharedTreeUndoRedoHandler {
	constructor(private readonly stackManager: IUndoConsumer) {}

	public attachTree(tree: SharedTree) {
		tree.on(SharedTreeEvent.EditCommitted, this.treeDeltaHandler);
	}
	public detachTree(tree: SharedTree) {
		tree.off(SharedTreeEvent.EditCommitted, this.treeDeltaHandler);
	}

	private readonly treeDeltaHandler = (eventArguments: EditCommittedEventArguments) => {
		const { editId, local, tree } = eventArguments;

		if (local) {
			this.stackManager.pushToCurrentOperation(
				new SharedTreeRevertible(
					editId,
					assertNotUndefined(
						tree,
						'An edit committed event for a revertible edit should include the target SharedTree in its arguments.'
					)
				)
			);
		}
	};
}

/**
 * Tracks a change on a shared tree and allows reverting it
 */
export class SharedTreeRevertible implements IRevertible {
	constructor(private readonly editId: EditId, private readonly tree: SharedTree) {}

	public revert() {
		this.tree.revert(this.editId);
	}

	public discard() {
		return;
	}
}
