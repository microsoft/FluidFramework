/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assertNotUndefined } from './Common.js';
import { SharedTreeEvent } from './EventTypes.js';
import { EditId } from './Identifiers.js';
import { EditCommittedEventArguments, SharedTree } from './SharedTree.js';

// TODO: We temporarily duplicate these contracts from 'framework/undo-redo' to unblock development
// while we decide on the correct layering for undo.

/**
 * A revertible change
 *
 * @alpha
 */
export interface IRevertible {
	/**
	 * Revert the change
	 */
	revert();

	/**
	 * Discard the change, freeing any associated resources.
	 */
	discard();
}

/**
 * A consumer of revertible changes.
 *
 * This interface is typically implemented by a stack which may optionally aggregate multiple
 * changes into one operation.
 *
 * @alpha
 */
export interface IUndoConsumer {
	/**
	 * Push a revertible to the current operation. Invoked for each change on undo consumers subscribed to a SharedTree.
	 */
	pushToCurrentOperation(revertible: IRevertible);
}

/**
 * A shared tree undo redo handler that will add revertible local tree changes to the provided
 * undo redo stack manager
 *
 * @alpha
 */
export class SharedTreeUndoRedoHandler {
	constructor(private readonly stackManager: IUndoConsumer) {}

	/**
	 * Attach a shared tree to this handler. Each edit from the tree will invoke `this.stackManager`'s
	 * {@link IUndoConsumer.pushToCurrentOperation} method with an associated {@link IRevertible}.
	 */
	public attachTree(tree: SharedTree) {
		tree.on(SharedTreeEvent.EditCommitted, this.treeDeltaHandler);
	}

	/**
	 * Detach a shared tree from this handler. Edits from the tree will no longer cause `this.stackManager`'s
	 * {@link IUndoConsumer.pushToCurrentOperation} to be called.
	 */
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
	constructor(
		private readonly editId: EditId,
		private readonly tree: SharedTree
	) {}

	public revert() {
		this.tree.revert(this.editId);
	}

	public discard() {
		return;
	}
}
