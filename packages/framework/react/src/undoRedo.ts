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
import type {
	RevertibleAlpha,
	TreeBranchAlpha,
} from "@fluidframework/tree/internal";

/**
 * Interface for undo/redo stack operations.
 * @internal
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
 * @sealed @internal
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
				if (getRevertible === undefined) {
					return;
				}
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

/**
 * Manages undo and redo stacks for a labeled subset of edits on a {@link TreeBranchAlpha}.
 *
 * @remarks
 * Unlike {@link UndoRedoStacks}, this class only tracks commits that are tagged with a specific
 * label via {@link RunTransactionParams.label | RunTransactionParams.label}. This allows multiple
 * independent undo/redo stacks to coexist on the same branch — for example, one per text editor —
 * without interfering with each other.
 *
 * @sealed @internal
 */
export class LabeledUndoRedoStacks implements UndoRedo {
	readonly #undoStack: RevertibleAlpha[] = [];
	readonly #redoStack: RevertibleAlpha[] = [];
	readonly #listeners = new Set<() => void>();
	readonly #unsubscribe: () => void;
	readonly #label: unknown;

	public constructor(
		/**
		 * The branch whose commits this stack will track.
		 */
		branch: TreeBranchAlpha,
		/**
		 * The label used to identify commits that belong to this stack.
		 * @remarks Should be unique among stacks that share the same branch.
		 */
		label: unknown,
	) {
		this.#label = label;
		this.#unsubscribe = branch.events.on("changed", (data, getRevertible) => {
			if (!data.isLocal || getRevertible === undefined) {
				return;
			}

			if (!data.labels.has(this.#label)) {
				return;
			}

			if (data.kind === CommitKind.Undo) {
				this.#redoStack.push(getRevertible());
			} else if (data.kind === CommitKind.Redo) {
				this.#undoStack.push(getRevertible());
			} else {
				// CommitKind.Default: a new edit tagged with our label. Clear the redo stack.
				for (const r of this.#redoStack) r.dispose();
				this.#redoStack.length = 0;
				this.#undoStack.push(getRevertible());
			}
			this.#notifyListeners();
		});
	}

	/**
	 * Undo the most recent commit in the stack.
	 * @remarks Only valid to call when {@link LabeledUndoRedoStacks.canUndo}.
	 */
	public undo(): void {
		const revertible = this.#undoStack.pop();
		if (revertible === undefined) {
			throw new Error("Cannot undo: undo stack is empty.");
		}
		revertible.revert();
		this.#notifyListeners();
	}

	/**
	 * Redo the most recent undone commit.
	 * @remarks Only valid to call when {@link LabeledUndoRedoStacks.canRedo}.
	 */
	public redo(): void {
		const revertible = this.#redoStack.pop();
		if (revertible === undefined) {
			throw new Error("Cannot redo: redo stack is empty.");
		}
		revertible.revert();
		this.#notifyListeners();
	}

	public dispose(): void {
		this.#unsubscribe();
		this.#listeners.clear();
		for (const revertible of this.#undoStack) {
			revertible.dispose();
		}
		for (const revertible of this.#redoStack) {
			revertible.dispose();
		}
		this.#undoStack.length = 0;
		this.#redoStack.length = 0;
	}

	/**
	 * Whether or not there are commits available to undo in this stack.
	 */
	public canUndo(): boolean {
		return this.#undoStack.length > 0;
	}

	/**
	 * Whether or not there are commits available to redo in this stack.
	 */
	public canRedo(): boolean {
		return this.#redoStack.length > 0;
	}

	public onStateChange(callback: () => void): () => void {
		this.#listeners.add(callback);
		return () => this.#listeners.delete(callback);
	}

	#notifyListeners(): void {
		for (const listener of this.#listeners) {
			listener();
		}
	}
}
