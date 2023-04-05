/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeFamily, ChangeFamilyEditor } from "../change-family";
import { GraphCommit, tagChange } from "../rebase";
import { ReadonlyRepairDataStore, RepairDataStore } from "../repair";

/**
 * Needed functionality:
 * 1. applying a local change will add it to the undo commit tree
 * 2. undoing will pop the undo commit tree, generate the inverse of the commit
 * 3. takes care of "committing" undo/redos
 */
export class UndoRedoManager<TChange, TEditor extends ChangeFamilyEditor> {
	private pendingCommit?: UndoableCommitType;

	/**
	 * @param repairDataStoryFactory - Factory function for creating {@link RepairDataStore}s to create and store repair
	 * data for {@link UndoableCommit}s.
	 * @param changeFamily - TODO
	 * @param applyChange - Callback to apply undos as local changes.
	 * @param headUndoCommit - Optional commit to set as the initial undoable commit.
	 */
	public constructor(
		private readonly repairDataStoryFactory: () => RepairDataStore,
		private readonly changeFamily: ChangeFamily<TEditor, TChange>,
		private readonly applyChange: (change: TChange) => void,
		private headUndoCommit?: UndoableCommit<TChange>,
	) {}

	/**
	 * TODO: should we return anything?
	 * TODO: trackCommit or addLocalCommit?
	 */
	public trackCommit(commit: GraphCommit<TChange>) {
		if (this.pendingCommit === UndoableCommitType.Undo) {
			// Currently no need to handle undo commits
			return;
		}

		const parent = this.headUndoCommit;
		const repairData = this.repairDataStoryFactory();
		repairData.capture(this.changeFamily.intoDelta(commit.change), commit.revision);
		this.headUndoCommit = {
			commit,
			parent,
			repairData,
		};
	}

	/**
	 * Inverts the head undo commit and applies it as a local change.
	 * 
	 * TODO: return result?
	 */
	public undo(): undefined {
		const commitToUndo = this.headUndoCommit;

		if (commitToUndo === undefined) {
			// No undoable commits, send event and exit early
			// TODO: sent event?
			return undefined;
		}

		const { commit, parent, repairData } = commitToUndo;
		// Removes this undo from the undo commit tree
		this.headUndoCommit = parent;
		// Set the pending commit type so that the next call to `trackCommit` knows how
		// to handle the provided undo commit.
		this.pendingCommit = UndoableCommitType.Undo;

		const inverse = this.changeFamily.rebaser.invert(
			tagChange(commit.change, commit.revision),
			false,
			repairData,
		);

		this.applyChange(inverse);
	}

	/**
	 * Creates a copy of this `UndoRedoManager` with a reference to the same head undo commit.
	 */
	public clone(applyChange: (change: TChange) => void): UndoRedoManager<TChange, TEditor> {
		return new UndoRedoManager(
			this.repairDataStoryFactory,
			this.changeFamily,
			applyChange,
			this.headUndoCommit,
		);
	}
}

enum UndoableCommitType {
	Undo = "undo",
}

/**
 * Represents a commit that can be undone.
 */
interface UndoableCommit<TChange> {
	/* The commit to undo */
	readonly commit: GraphCommit<TChange>;
	/* The repair data associated with the commit */
	readonly repairData: ReadonlyRepairDataStore;
	/* The next undoable commit. */
	readonly parent?: UndoableCommit<TChange>;
}
