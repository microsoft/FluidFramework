/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable } from "@fluidframework/core-interfaces";
import {
	CommitKind,
	type CommitMetadata,
	type Revertible,
	type RevertibleFactory,
	type TreeViewEvents,
} from "@fluidframework/tree";

/**
 * Interface for undo/redo stack operations.
 * @alpha
 */
export interface UndoRedo {
	/**
	 * Reverts the most recent change. Only valid to call when {@link UndoRedo.canUndo} returns true.
	 * @throws Error if there is nothing to undo.
	 */
	undo(): void;
	/**
	 * Reapplies the most recently undone change. Only valid to call when {@link UndoRedo.canRedo} returns true.
	 * @throws Error if there is nothing to redo.
	 */
	redo(): void;
	dispose(): void;
	canUndo(): boolean;
	canRedo(): boolean;
	/**
	 * Subscribe to state changes (when canUndo/canRedo may have changed).
	 * @param callback - Called when the undo/redo stack state changes
	 * @returns Unsubscribe function
	 */
	onStateChange(callback: () => void): () => void;
}

/**
 * Manages undo and redo stacks for a TreeView.
 * Listens to commitApplied events and manages Revertible objects.
 * @sealed @alpha
 */
export class UndoRedoStacks implements UndoRedo {
	private readonly undoStack: Revertible[] = [];
	private readonly redoStack: Revertible[] = [];
	private readonly listeners = new Set<() => void>();
	private readonly unsubscribe: () => void;

	public constructor(events: Listenable<TreeViewEvents>) {
		this.unsubscribe = events.on(
			"commitApplied",
			(commit: CommitMetadata, getRevertible?: RevertibleFactory) => {
				if (getRevertible === undefined) return;
				const revertible = getRevertible();
				if (commit.kind === CommitKind.Undo) {
					this.redoStack.push(revertible);
				} else {
					if (commit.kind === CommitKind.Default) {
						for (const r of this.redoStack) r.dispose();
						this.redoStack.length = 0;
					}
					this.undoStack.push(revertible);
				}
				this.notifyListeners();
			},
		);
	}

	public undo(): void {
		const revertible = this.undoStack.pop();
		if (revertible === undefined) {
			throw new Error("Cannot undo: undo stack is empty.");
		}
		revertible.revert();
		this.notifyListeners();
	}

	public redo(): void {
		const revertible = this.redoStack.pop();
		if (revertible === undefined) {
			throw new Error("Cannot redo: redo stack is empty.");
		}
		revertible.revert();
		this.notifyListeners();
	}

	public dispose(): void {
		this.unsubscribe();
		this.listeners.clear();
		for (const r of this.undoStack) r.dispose();
		for (const r of this.redoStack) r.dispose();
		this.undoStack.length = 0;
		this.redoStack.length = 0;
	}

	public canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	public canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	public onStateChange(callback: () => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	private notifyListeners(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
