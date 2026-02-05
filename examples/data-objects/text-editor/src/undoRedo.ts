/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CommitKind,
	type CommitMetadata,
	type Revertible,
	type RevertibleFactory,
	type TreeViewEvents,
} from "@fluidframework/tree";
import type { Listenable } from "fluid-framework";

/**
 * Interface for undo/redo stack operations.
 */
export interface UndoRedo {
	readonly undo: () => void;
	readonly redo: () => void;
	readonly dispose: () => void;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	/**
	 * Subscribe to state changes (when canUndo/canRedo may have changed).
	 * @param callback - Called when the undo/redo stack state changes
	 * @returns Unsubscribe function
	 */
	readonly onStateChange: (callback: () => void) => () => void;
}

/**
 * Creates undo and redo stacks for a TreeView.
 * Listens to commitApplied events and manages Revertible objects.
 *
 * @param events - The TreeView events to listen to
 * @returns An object with undo, redo, and dispose functions
 */
export function createUndoRedoStacks(events: Listenable<TreeViewEvents>): UndoRedo {
	const undoStack: Revertible[] = [];
	const redoStack: Revertible[] = [];
	const listeners = new Set<() => void>();

	const notifyListeners = (): void => {
		for (const listener of listeners) {
			listener();
		}
	};

	const unsubscribe = events.on(
		"commitApplied",
		(commit: CommitMetadata, getRevertible?: RevertibleFactory) => {
			if (getRevertible === undefined) return;
			const revertible = getRevertible();
			if (commit.kind === CommitKind.Undo) {
				redoStack.push(revertible);
			} else {
				if (commit.kind === CommitKind.Default) {
					for (const r of redoStack) r.dispose();
					redoStack.length = 0;
				}
				undoStack.push(revertible);
			}
			notifyListeners();
		},
	);

	return {
		undo: () => {
			undoStack.pop()?.revert();
		},
		redo: () => {
			redoStack.pop()?.revert();
		},
		dispose: () => {
			unsubscribe();
			listeners.clear();
			for (const r of undoStack) r.dispose();
			for (const r of redoStack) r.dispose();
		},
		get canUndo() {
			return undoStack.length > 0;
		},
		get canRedo() {
			return redoStack.length > 0;
		},
		onStateChange: (callback: () => void) => {
			listeners.add(callback);
			return () => listeners.delete(callback);
		},
	};
}
