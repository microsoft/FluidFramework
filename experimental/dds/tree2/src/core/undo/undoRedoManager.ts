/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeFamily, ChangeFamilyEditor } from "../change-family";
import { GraphCommit, tagChange } from "../rebase";
import { ReadonlyRepairDataStore } from "../repair";
import { IRepairDataStoreProvider } from "./repairDataStoreProvider";

/**
 * Manages the undo and redo commit trees and repair data associated with undoable and redoable commits.
 */
export class UndoRedoManager<TChange, TEditor extends ChangeFamilyEditor> {
	/**
	 * @param repairDataStoryFactory - Factory for creating {@link RepairDataStore}s to create and store repair
	 * data for {@link UndoableCommit}s.
	 * @param changeFamily - {@link ChangeFamily} used for inverting changes.
	 * @param headUndoableCommit - Optional commit to set as the initial undoable commit.
	 */
	public constructor(
		public readonly repairDataStoreProvider: IRepairDataStoreProvider,
		private readonly changeFamily: ChangeFamily<TEditor, TChange>,
		private headUndoableCommit?: UndoableCommit<TChange>,
		private headRedoableCommit?: RedoableCommit<TChange>,
	) {}

	public get headUndoable(): UndoableCommit<TChange> | undefined {
		return this.headUndoableCommit;
	}

	public get headRedoable(): UndoableCommit<TChange> | undefined {
		return this.headRedoableCommit;
	}

	/**
	 * Adds the provided commit to the undo or redo commit tree, depending on the type of commit it is.
	 * Should be called for all commits on the relevant branch, including undo commits.
	 * If no commit type is passed in, it is assumed to an undoable commit.
	 */
	public trackCommit(
		commit: GraphCommit<TChange>,
		undoRedoManagerCommitType?: UndoRedoManagerCommitType,
	): void {
		const repairData = this.repairDataStoreProvider.createRepairData();
		repairData.capture(this.changeFamily.intoDelta(commit.change), commit.revision);

		const parent = undoRedoManagerCommitType === UndoRedoManagerCommitType.Undo ? this.headRedoableCommit : this.headUndoableCommit;

		if (undoRedoManagerCommitType === UndoRedoManagerCommitType.Undo) {
			this.headUndoableCommit = this.headUndoableCommit?.parent;
		} else if (undoRedoManagerCommitType === UndoRedoManagerCommitType.Redo) {
			this.headRedoableCommit = this.headRedoableCommit?.parent;
		}

		this.headUndoableCommit = {
			commit,
			parent,
			repairData,
		}
	}

	/**
	 * Inverts the head undo commit and returns the inverted change.
	 * This change can then be applied and tracked.
	 */
	public undo(): TChange | undefined {
		const commitToUndo = this.headUndoableCommit;

		if (commitToUndo === undefined) {
			// No undoable commits, exit early
			return undefined;
		}

		const { commit, repairData } = commitToUndo;

		return this.changeFamily.rebaser.invert(
			tagChange(commit.change, commit.revision),
			false,
			repairData,
		);
	}

	/**
	 * Creates a copy of this `UndoRedoManager`.
	 * @param repairDataStoreProvider - Optional {@link IRepairDataStoreProvider} to use for the new `UndoRedoManager`.
	 * If one is not provided, the `repairDataStoreProvider` of this `UndoRedoManager` will be cloned.
	 */
	public clone(
		repairDataStoreProvider?: IRepairDataStoreProvider,
	): UndoRedoManager<TChange, TEditor> {
		return new UndoRedoManager(
			repairDataStoreProvider ?? this.repairDataStoreProvider.clone(),
			this.changeFamily,
			this.headUndoableCommit,
			this.headRedoableCommit,
		);
	}
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

interface RedoableCommit<TChange> extends UndoableCommit<TChange> {}

/**
 * The type of a commit in the context of undo/redo manager.
 */
export enum UndoRedoManagerCommitType {
	Undoable,
	Redoable,
	Undo,
	Redo,
}

/**
 * Marks the commits in the provided path as undoable or redoable.
 * @param path - the path of commits that may or may not be undoable or redoable.
 * @param headUndoableCommit - the head undoable commit of the undo commit tree that may contain the commits in the path.
 */
export function markCommits<TChange>(
	path: GraphCommit<TChange>[],
	headUndoableCommit?: UndoableCommit<TChange>,
): { commit: GraphCommit<TChange>; isUndoable?: true }[] {
	let currentUndoable: UndoableCommit<TChange> | undefined = headUndoableCommit;

	if (currentUndoable === undefined) {
		// If there are no undoable commits, none are marked
		return path.map((commit) => ({ commit }));
	}

	// Walk up the commit tree to figure out which commits are undoable or redoable
	return path
		.reverse()
		.map((commit) => {
			const markedCommit: { commit: GraphCommit<TChange>; isUndoable?: true } = { commit };
			if (commit.revision === currentUndoable?.commit.revision) {
				markedCommit.isUndoable = true;
				currentUndoable = currentUndoable?.parent;
			}
			return markedCommit;
		})
		.reverse();
}
