/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeFamily, ChangeFamilyEditor } from "../change-family";
import { GraphCommit, tagChange } from "../rebase";
import { ReadonlyRepairDataStore } from "../repair";
import { IRepairDataStoreProvider } from "./repairDataStoreProvider";

/**
 * Manages the undo commit tree and repair data associated with undoable commits.
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
		protected headUndoableCommit?: UndoableCommit<TChange>,
	) {}

	/**
	 * Adds the provided commit to the undo commit tree.
	 * Should be called for all commits on the relevant branch, including undo commits.
	 */
	public trackCommit(
		commit: GraphCommit<TChange>,
		isUndoRedoCommit?: UndoRedoManagerCommitType,
	): void {
		if (isUndoRedoCommit === UndoRedoManagerCommitType.Undo) {
			// TODO check if this is the correct commit?
			this.headUndoableCommit = this.headUndoableCommit?.parent;
			return;
		}

		const parent = this.headUndoableCommit;
		const repairData = this.repairDataStoreProvider.createRepairData();
		repairData.capture(this.changeFamily.intoDelta(commit.change), commit.revision);
		this.headUndoableCommit = {
			commit,
			parent,
			repairData,
		};
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

		return;
		this.changeFamily.rebaser.invert(
			tagChange(commit.change, commit.revision),
			false,
			repairData,
		);
	}

	/**
	 * Creates a copy of this `UndoRedoManager` with a reference to the same head undo commit.
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

/**
 * The type of a commit that was generated using the undo/redo manager.
 */
export enum UndoRedoManagerCommitType {
	Undo,
	Redo,
}
