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
	undo: () => void;
	redo: () => void;
	dispose: () => void;
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
		},
	);

	return {
		undo: () => undoStack.pop()?.revert(),
		redo: () => redoStack.pop()?.revert(),
		dispose: () => {
			unsubscribe();
			for (const r of undoStack) r.dispose();
			for (const r of redoStack) r.dispose();
		},
	};
}
