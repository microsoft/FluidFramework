/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ChangeFamily, ChangeFamilyEditor } from "../change-family";
import { GraphCommit, findCommonAncestor, tagChange } from "../rebase";
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
	 * @param getHead - Function for retrieving the head commit of the branch associated with this undo redo manager.
	 * @param headUndoableCommit - Optional commit to set as the initial undoable commit.
	 */
	public constructor(
		public readonly repairDataStoreProvider: IRepairDataStoreProvider,
		private readonly changeFamily: ChangeFamily<TEditor, TChange>,
		private readonly getHead?: () => GraphCommit<TChange>,
		private headUndoableCommit?: UndoableCommit<TChange>,
	) {}

	public get headUndoable(): UndoableCommit<TChange> | undefined {
		return this.headUndoableCommit;
	}

	/**
	 * Adds the provided commit to the undo commit tree.
	 * Should be called for all commits on the relevant branch, including undo commits.
	 */
	public trackCommit(commit: GraphCommit<TChange>, type: UndoRedoManagerCommitType): void {
		switch (type) {
			case UndoRedoManagerCommitType.Undo:
				// TODO check if this is the correct commit?
				this.headUndoableCommit = this.headUndoableCommit?.parent;
				return;
			default: {
				const parent = this.headUndoableCommit;
				const repairData = this.repairDataStoreProvider.createRepairData();
				repairData.capture(this.changeFamily.intoDelta(commit.change), commit.revision);
				this.headUndoableCommit = {
					commit,
					parent,
					repairData,
				};
			}
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

		let change = this.changeFamily.rebaser.invert(
			tagChange(commit.change, commit.revision),
			false,
			repairData,
		);

		if (this.getHead !== undefined) {
			// Rebase the inverted change onto any commits that occurred after the undoable commits.
			const head = this.getHead();
			if (commit.revision !== head.revision) {
				const pathAfterUndoable: GraphCommit<TChange>[] = [];
				const ancestor = findCommonAncestor([commit], [head, pathAfterUndoable]);
				assert(
					ancestor === commit,
					"The head commit should be based off the undoable commit.",
				);
				change = pathAfterUndoable.reduce(
					(a, b) => this.changeFamily.rebaser.rebase(a, b),
					change,
				);
			}
		}

		return change;
	}

	/**
	 * Creates a copy of this `UndoRedoManager`.
	 * @param getHead - Optional function to use for retrieving the head commit for the branch associated with the
	 * the new {@link UndoRedoManager}. If one is not provided, the one from this {@link UndoRedoManager} will be used.
	 * @param repairDataStoreProvider - Optional {@link IRepairDataStoreProvider} to use for the new {@link UndoRedoManager}.
	 * If one is not provided, the `repairDataStoreProvider` of this {@link UndoRedoManager} will be cloned.
	 * @param headUndoableCommit - Optional head undoable commit, if one is not provided the head undoable commit
	 * of this {@link UndoRedoManager} will be used.
	 */
	public clone(
		getHead?: () => GraphCommit<TChange>,
		repairDataStoreProvider?: IRepairDataStoreProvider,
		headUndoableCommit?: UndoableCommit<TChange>,
	): UndoRedoManager<TChange, TEditor> {
		return new UndoRedoManager(
			repairDataStoreProvider ?? this.repairDataStoreProvider.clone(),
			this.changeFamily,
			getHead ?? this.getHead,
			headUndoableCommit ?? this.headUndoableCommit,
		);
	}

	/**
	 * Updates the state of this {@link UndoRedoManager} to correctly reference commits that have been rebased after merging.
	 * @param newHead - the head commit of the newly rebased branch.
	 * @param mergedUndoRedoManager - the {@link UndoRedoManager} of the branch that was merged.
	 */
	public updateAfterMerge(
		newHead: GraphCommit<TChange>,
		mergedUndoRedoManager: UndoRedoManager<TChange, TEditor>,
	): void {
		if (this.getHead !== undefined) {
			this.updateBasedOnNewCommits(this.getHead(), newHead, this, mergedUndoRedoManager);
		}
	}

	/**
	 * Updates the state of this {@link UndoRedoManager} to correctly reference commits that have been rebased.
	 * @param newHead - the head commit of the newly rebased branch.
	 * @param baseUndoRedoManager - the {@link UndoRedoManager} of the branch that was rebased onto
	 */
	public updateAfterRebase(
		newHead: GraphCommit<TChange>,
		baseUndoRedoManager: UndoRedoManager<TChange, TEditor>,
	): void {
		if (baseUndoRedoManager.getHead !== undefined) {
			const baseHead = baseUndoRedoManager.getHead();
			this.updateBasedOnNewCommits(baseHead, newHead, baseUndoRedoManager, this);
		}
	}

	private updateBasedOnNewCommits(
		baseHead: GraphCommit<TChange>,
		rebasedHead: GraphCommit<TChange>,
		baseUndoRedoManager: UndoRedoManager<TChange, TEditor>,
		originalUndoRedoManager: UndoRedoManager<TChange, TEditor>,
	): void {
		if (originalUndoRedoManager.headUndoable === undefined) {
			// The branch that was rebased had no undoable edits so the new undo redo manager
			// should be a copy of the undo redo manager from the base branch.
			this.headUndoableCommit = baseUndoRedoManager.headUndoable;
			return;
		}

		const rebasedPath: GraphCommit<TChange>[] = [];
		const ancestor = findCommonAncestor([baseHead], [rebasedHead, rebasedPath]);
		assert(ancestor === baseHead, "The rebased head should be based off of the base branch.");

		if (rebasedPath.length === 0) {
			this.headUndoableCommit = baseUndoRedoManager.headUndoable;
			return;
		}

		const markedCommits = markCommits(rebasedPath, originalUndoRedoManager.headUndoable);
		// Create a complete clone of the base undo redo manager for tracking the rebased path
		const undoRedoManager = baseUndoRedoManager.clone();

		for (const { commit, isUndoable } of markedCommits) {
			if (isUndoable) {
				undoRedoManager.trackCommit(commit, UndoRedoManagerCommitType.Undoable);
			}
			undoRedoManager.repairDataStoreProvider.applyDelta(
				this.changeFamily.intoDelta(commit.change),
			);
		}

		this.headUndoableCommit = undoRedoManager.headUndoable;
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
 * The type of a commit in the context of undo/redo manager.
 */
export enum UndoRedoManagerCommitType {
	Undoable,
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
