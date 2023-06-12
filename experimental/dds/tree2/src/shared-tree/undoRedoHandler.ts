/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRevertible, UndoRedoStackManager } from "@fluidframework/undo-redo";
import { UndoRedoManagerCommitType } from "../core";
import { ISharedTreeView } from "./sharedTreeView";

/**
 * A shared tree view undo redo handler that will add all local undoable tree changes to the provided
 * undo redo stack manager.
 *
 * @alpha
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
		type: UndoRedoManagerCommitType,
		target: ISharedTreeView,
	) => {
		this.stackManager.pushToCurrentOperation(new SharedTreeViewRevertible(type, target));
	};
}

/**
 * Provides an interface for reverting a change to a SharedTree. SharedTree manages its own undo stack so this
 * revertible stores no information about the commit being reverted other than whether it needs to be an undo or redo.
 *
 * @alpha
 */
export class SharedTreeViewRevertible implements IRevertible {
	public constructor(
		private readonly undoRedoManagerCommitType: UndoRedoManagerCommitType,
		private readonly tree: ISharedTreeView,
	) {}

	public revert() {
		if (
			this.undoRedoManagerCommitType === UndoRedoManagerCommitType.Undoable ||
			this.undoRedoManagerCommitType === UndoRedoManagerCommitType.Redo
		) {
			this.tree.undo();
		} else if (
			this.undoRedoManagerCommitType === UndoRedoManagerCommitType.Redoable ||
			this.undoRedoManagerCommitType === UndoRedoManagerCommitType.Undo
		) {
			this.tree.redo();
		}
	}

	public discard() {
		return;
	}
}
