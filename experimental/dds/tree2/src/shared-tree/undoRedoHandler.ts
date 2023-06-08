/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRevertible, UndoRedoStackManager } from "@fluidframework/undo-redo";
import { UndoRedoManagerCommitType } from "../core";
import { ISharedTreeView } from ".";

/**
 * A shared tree view undo redo handler that will add all local undoable tree changes to the provided
 * undo redo stack manager.
 */
export class SharedTreeViewUndoRedoHandler {
	private detach?: () => void;

	public constructor(private readonly stackManager: UndoRedoStackManager) {}

	public attachTree(tree: ISharedTreeView) {
		this.detach = tree.events.on("undoable", this.treeDeltaHandler);
	}
	public detachTree(tree: ISharedTreeView) {
		this.detach?.();
	}

	private readonly treeDeltaHandler = (
		undoRedoManagerCommitType: UndoRedoManagerCommitType,
		target: ISharedTreeView,
	) => {
		this.stackManager.pushToCurrentOperation(new SharedTreeRevertible(undoRedoManagerCommitType, target));
	};
}

/**
 * Provides an interface for reverting a change to a SharedTree. SharedTree manages its own undo stack so this
 * revertible stores no information about the commit being reverted other than whether it needs to be an undo or redo.
 */
export class SharedTreeRevertible implements IRevertible {
	public constructor(private undoRedoManagerCommitType: UndoRedoManagerCommitType, private readonly tree: ISharedTreeView) {}

	public revert() {
		if (this.undoRedoManagerCommitType === UndoRedoManagerCommitType.Undoable) {
			this.tree.undo();
			this.undoRedoManagerCommitType = UndoRedoManagerCommitType.Redoable;
		} else if (this.undoRedoManagerCommitType === UndoRedoManagerCommitType.Redoable) {
			this.tree.redo();
			this.undoRedoManagerCommitType = UndoRedoManagerCommitType.Undoable;
		}
	}

	public discard() {
		return;
	}
}
