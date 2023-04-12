/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeFamily, ChangeFamilyEditor } from "../change-family";
import { GraphCommit, GraphCommitType, tagChange } from "../rebase";
import { ReadonlyRepairDataStore, RepairDataStore } from "../repair";

/**
 * Manages the undo commit tree and repair data associated with undoable commits.
 */
export class UndoRedoManager<TChange, TEditor extends ChangeFamilyEditor> {
	/**
	 * @param repairDataStoryFactory - Factory function for creating {@link RepairDataStore}s to create and store repair
	 * data for {@link UndoableCommit}s.
	 * @param changeFamily - {@link ChangeFamily} used for inverting changes.
	 * @param headUndoableCommit - Optional commit to set as the initial undoable commit.
	 */
	public constructor(
		private readonly repairDataStoryFactory: () => RepairDataStore,
		private readonly changeFamily: ChangeFamily<TEditor, TChange>,
		protected headUndoableCommit?: UndoableCommit<TChange>,
	) {}

	/**
	 * Adds the provided commit to the undo commit tree.
	 * Should be called for all commits on the relevant branch, including undo commits.
	 */
	public trackCommit(commit: GraphCommit<TChange>, repairDataStore?: RepairDataStore): void {
		if (commit.type === GraphCommitType.Undo) {
			// Currently no need to handle undo commits
			return;
		}

		const parent = this.headUndoableCommit;
		// If repair data was not provided, create a new repair data store and capture the repair data for the commit
		const repairData = repairDataStore ?? this.repairDataStoryFactory();
		if (repairDataStore === undefined) {
			repairData.capture(this.changeFamily.intoDelta(commit.change), commit.revision);
		}

		this.headUndoableCommit = {
			commit,
			parent,
			repairData,
		};
	}

	/**
	 * Inverts the head undo commit and applies it as a local change.
	 */
	public undo(): TChange | undefined {
		const commitToUndo = this.headUndoableCommit;

		if (commitToUndo === undefined) {
			// No undoable commits, exit early
			return undefined;
		}

		const { commit, parent, repairData } = commitToUndo;
		// Removes this undo from the undo commit tree
		this.headUndoableCommit = parent;

		return this.changeFamily.rebaser.invert(
			tagChange(commit.change, commit.revision),
			false,
			repairData,
		);
	}

	/**
	 * Creates a copy of this `UndoRedoManager` with a reference to the same head undo commit.
	 */
	public clone(
		repairDataStoreFactory: () => RepairDataStore,
		applyChange?: (change: TChange) => void,
	): UndoRedoManager<TChange, TEditor> {
		return new UndoRedoManager(
			repairDataStoreFactory,
			this.changeFamily,
			this.headUndoableCommit,
		);
	}
}

/**
 * Represents a commit that can be undone.
 */
export interface UndoableCommit<TChange> {
	/* The commit to undo */
	readonly commit: GraphCommit<TChange>;
	/* The repair data associated with the commit */
	readonly repairData: ReadonlyRepairDataStore;
	/* The next undoable commit. */
	readonly parent?: UndoableCommit<TChange>;
}
