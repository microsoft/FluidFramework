/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRevertible, UndoRedoStackManager } from '@fluidframework/undo-redo';
import { assertNotUndefined } from '../Common';
import { EditId } from '../Identifiers';
import { EditCommittedEventArguments, SharedTreeEvent } from '../generic';
import { SharedTree } from './SharedTree';
import * as HistoryEditFactory from './HistoryEditFactory';

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

	private readonly treeDeltaHandler = (eventArguments: EditCommittedEventArguments<SharedTree>) => {
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
	constructor(private editId: EditId, private readonly tree: SharedTree) {}

	public revert() {
		// Apply the revert edit and set it as the new revertible edit.
		this.editId = revert(this.tree, this.editId);
	}

	public discard() {
		return;
	}
}

/**
 * Reverts an edit from the session.
 * @param edit - the edit to revert.
 * @returns The id of the revert.
 */
export function revert(tree: SharedTree, editId: EditId): EditId {
	const editIndex = tree.edits.getIndexOfId(editId);
	const edit = tree.edits.getEditInSessionAtIndex(editIndex);
	const viewBefore = tree.logViewer.getRevisionViewInSession(editIndex);
	return tree.applyEdit(...HistoryEditFactory.revert(edit.changes, viewBefore));
}
