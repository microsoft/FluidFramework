/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeFamily, ChangeFamilyEditor } from "../change-family";
import { GraphCommit, GraphCommitType, RevisionTag, tagChange } from "../rebase";
import { ReadonlyRepairDataStore, RepairDataStore } from "../repair";
import { Delta } from "../tree";

/**
 * Manages the undo commit tree and repair data associated with undoable commits.
 */
export class UndoRedoManager<TChange, TEditor extends ChangeFamilyEditor> {
	private pendingRepairData?: RepairDataStore;

	/**
	 * @param repairDataStoryFactory - Factory function for creating {@link RepairDataStore}s to create and store repair
	 * data for {@link UndoableCommit}s.
	 * @param changeFamily - {@link ChangeFamily} used for inverting changes.
	 * @param applyChange - Callback to apply undos as local changes. This should call {@link UndoRedoManager.trackCommit}
	 * with the created commit.
	 * @param headUndoCommit - Optional commit to set as the initial undoable commit.
	 */
	public constructor(
		private readonly repairDataStoryFactory: () => RepairDataStore,
		private readonly changeFamily: ChangeFamily<TEditor, TChange>,
		protected readonly applyChange: (
			change: TChange,
			revision?: RevisionTag,
			type?: GraphCommitType,
		) => void,
		protected headUndoCommit?: UndoableCommit<TChange>,
	) {}

	/**
	 * Used to capture repair data from changes within a transaction. The repair data will be
	 * add to the same {@link RepairDataStore} until {@link UndoRedoManager.trackCommit} is called.
	 * @param startRevision - the revision of the first commit in the transaction
	 */
	public trackRepairData(change: Delta.Root, startRevision: RevisionTag) {
		if (this.pendingRepairData === undefined) {
			this.pendingRepairData = this.repairDataStoryFactory();
		}

		this.pendingRepairData.capture(change, startRevision);
	}

	/**
	 * Adds the provided commit to the undo commit tree. 
	 * Should be called for all commits on the relevant branch, including undo commits.
	 */
	public trackCommit(commit: GraphCommit<TChange>) {
		if (commit.type === GraphCommitType.Undo) {
			// Currently no need to handle undo commits
			return;
		}

		const parent = this.headUndoCommit;
		const repairData = this.pendingRepairData ?? this.repairDataStoryFactory();
		if (this.pendingRepairData === undefined) {
			repairData.capture(this.changeFamily.intoDelta(commit.change), commit.revision);
		} else {
			this.pendingRepairData = undefined;
		}
		this.headUndoCommit = {
			commit,
			parent,
			repairData,
		};
	}

	/**
	 * Inverts the head undo commit and applies it as a local change.
	 */
	public undo(): void {
		const commitToUndo = this.headUndoCommit;

		if (commitToUndo === undefined) {
			// No undoable commits, exit early
			return undefined;
		}

		const { commit, parent, repairData } = commitToUndo;
		// Removes this undo from the undo commit tree
		this.headUndoCommit = parent;

		const inverse = this.changeFamily.rebaser.invert(
			tagChange(commit.change, commit.revision),
			false,
			repairData,
		);

		this.applyChange(inverse, undefined, GraphCommitType.Undo);
	}

	/**
	 * Creates a copy of this `UndoRedoManager` with a reference to the same head undo commit.
	 */
	public clone(
		repairDataStoreFactory: () => RepairDataStore,
		applyChange: (change: TChange) => void,
	): UndoRedoManager<TChange, TEditor> {
		return new UndoRedoManager(
			repairDataStoreFactory,
			this.changeFamily,
			applyChange,
			this.headUndoCommit,
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
