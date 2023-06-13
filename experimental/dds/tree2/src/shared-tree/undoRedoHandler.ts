/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRevertible, UndoRedoStackManager } from "@fluidframework/undo-redo";
import { LocalCommitSource } from "../core";
import { fail } from "../util";
import { ISharedTree } from "./sharedTree";

/**
 * A shared tree view undo redo handler that will add all local undoable tree changes to the provided
 * undo redo stack manager.
 *
 * @alpha
 */
export class SharedTreeViewUndoRedoHandler {
	private readonly connectedTrees = new Map<ISharedTree, () => void>();

	public constructor(private readonly stackManager: UndoRedoStackManager) {}

	public attachTree(tree: ISharedTree) {
		if (this.connectedTrees.has(tree)) {
			fail("Cannot attach the same tree twice");
		}
		this.connectedTrees.set(tree, tree.events.on("revertible", this.treeDeltaHandler));
	}
	public detachTree(tree: ISharedTree) {
		const detach = this.connectedTrees.get(tree);
		if (detach === undefined) {
			fail("Cannot detach a tree that is not attached");
		}
		detach();
	}

	private readonly treeDeltaHandler = (type: LocalCommitSource, target: ISharedTree) => {
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
		private readonly localCommitSource: LocalCommitSource,
		private readonly tree: ISharedTree,
	) {}

	public revert() {
		if (this.localCommitSource === LocalCommitSource.Undo) {
			this.tree.redo();
		} else {
			this.tree.undo();
		}
	}

	public discard() {
		return;
	}
}
