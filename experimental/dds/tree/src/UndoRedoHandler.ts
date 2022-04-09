/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRevertible, UndoRedoStackManager } from '@fluidframework/undo-redo';
import { assertNotUndefined } from './Common';
import { SharedTreeEvent } from './EventTypes';
import { EditId } from './Identifiers';
import { EditCommittedEventArguments, SharedTree } from './SharedTree';

/**
 * A shared tree undo redo handler that will add revertible local tree changes to the provided
 * undo redo stack manager
 */
export class SharedTreeUndoRedoHandler {
	constructor(private readonly stackManager: UndoRedoStackManager) {}

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
