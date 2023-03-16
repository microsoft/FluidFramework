/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { GraphCommit } from "../rebase";
import { ReadonlyRepairDataStore } from "../repair";

/**
 * Is an actual undoable commit tree needed or can we just store the head 
 * for the undo tree directly in SharedTreeCore?
 * 
 * Prob better to have some wrapper around the functionality so that it can be somewhat reused
 * 
 * Needed functionality:
 * 1. applying a local change will add it to the undo commit tree
 * 2. undoing will pop the undo commit tree, generate the inverse of the commit, and submit it as a new commit
 * 
 * TODO: rename?
 */
export class UndoRedoManager<TChange> {
	// TODO: allow customization of the undo window
	// private tailUndoCommit?: UndoableCommit<TChange>;

	public constructor(private readonly repairData: ReadonlyRepairDataStore, private headUndoCommit?: UndoableCommit<TChange>) {}

	/**
	 * TODO: should we return anything?
	 */
	public trackLocalCommit(commit: GraphCommit<TChange>) {
		const parent = this.headUndoCommit;
		this.headUndoCommit = {
			commit,
			parent,
			repairData: this.repairData
		}
	}

	/**
	 * 
	 */
	public undo(): GraphCommit<TChange> | undefined {
		const commitToUndo = this.headUndoCommit;

		if (commitToUndo === undefined) {
			// No undoable commits, send event and exit early
			return undefined;
		}

		this.headUndoCommit = commitToUndo?.parent;
		return commitToUndo.commit;
	}
}

interface UndoableCommit<TChange> {
	/* The commit to undo */
	readonly commit: GraphCommit<TChange>;
	/**
     * The repair data associated with the commit
     * 
     * TODO: should this be the repair data store or the actual data in cursor form?
     */
	readonly repairData: ReadonlyRepairDataStore;
	/* The next undoable commit. */
	readonly parent?: UndoableCommit<TChange>;
}