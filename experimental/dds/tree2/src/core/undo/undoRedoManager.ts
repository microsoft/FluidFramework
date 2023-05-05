/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { ChangeFamily, ChangeFamilyEditor } from "../change-family";
import { GraphCommit, findCommonAncestor, tagChange } from "../rebase";
import { ReadonlyRepairDataStore } from "../repair";
import { IRepairDataStoreProvider } from "./repairDataStoreProvider";

/**
 * Manages a branch of the undoable/redoable commit trees and repair data associated with the undoable and redoable commits.
 */
export class UndoRedoManager<TChange, TEditor extends ChangeFamilyEditor> {
	/**
	 * @param repairDataStoryFactory - Factory for creating {@link RepairDataStore}s to create and store repair
	 * data for {@link ReversibleCommit}s.
	 * @param changeFamily - {@link ChangeFamily} used for inverting changes.
	 * @param getHead - Function for retrieving the head commit of the branch associated with this undo redo manager.
	 * @param headUndoableCommit - Optional commit to set as the initial undoable commit.
	 * @param headRedoableCommit - Optional commit to set as the initial redoable commit.
	 */
	public constructor(
		public readonly repairDataStoreProvider: IRepairDataStoreProvider,
		private readonly changeFamily: ChangeFamily<TEditor, TChange>,
		private readonly getHead?: () => GraphCommit<TChange>,
		private headUndoableCommit?: ReversibleCommit<TChange>,
		private headRedoableCommit?: ReversibleCommit<TChange>,
	) {}

	public get headUndoable(): ReversibleCommit<TChange> | undefined {
		return this.headUndoableCommit;
	}

	public get headRedoable(): ReversibleCommit<TChange> | undefined {
		return this.headRedoableCommit;
	}

	/**
	 * Adds the provided commit to the undo or redo commit tree, depending on the type of commit it is.
	 * Should be called for all commits on the relevant branch, including undo and redo commits.
	 */
	public trackCommit(commit: GraphCommit<TChange>, type: UndoRedoManagerCommitType): void {
		const repairData = this.repairDataStoreProvider.createRepairData();
		repairData.capture(this.changeFamily.intoDelta(commit.change), commit.revision);

		const parent =
			type === UndoRedoManagerCommitType.Undo || type === UndoRedoManagerCommitType.Redoable
				? this.headRedoableCommit
				: this.headUndoableCommit;
		const undoableOrRedoable = {
			commit,
			parent,
			repairData,
		};

		switch (type) {
			// Both undo commits and redoable commits result in a new head redoable commit
			// being pushed to the redoable commit stack but only undo commits need to pop from the
			// undoable commit stack.
			case UndoRedoManagerCommitType.Undo:
				this.headUndoableCommit = this.headUndoableCommit?.parent;
			case UndoRedoManagerCommitType.Redoable:
				this.headRedoableCommit = undoableOrRedoable;
				break;
			// Both redo commits and undoable commits result in a new head undoable commit
			// being pushed to the undoable commit stack but only redo commits need to pop from the
			// redoable commit stack.
			case UndoRedoManagerCommitType.Redo:
				this.headRedoableCommit = this.headRedoableCommit?.parent;
			case UndoRedoManagerCommitType.Undoable:
				this.headUndoableCommit = undoableOrRedoable;
				break;
			default:
				unreachableCase(type);
		}
	}

	/**
	 * Inverts the head undoable commit and returns the inverted change.
	 * This change can then be applied and tracked.
	 */
	public undo(): TChange | undefined {
		const undoableCommit = this.headUndoableCommit;

		if (undoableCommit === undefined) {
			// No undoable commits, exit early
			return undefined;
		}

		return this.createInvertedChange(undoableCommit);
	}

	/**
	 * Inverts the head redoable commit and returns the inverted change.
	 * This change can then be applied and tracked.
	 */
	public redo(): TChange | undefined {
		const redoableCommit = this.headRedoableCommit;

		if (redoableCommit === undefined) {
			// No undoable commits, exit early
			return undefined;
		}

		return this.createInvertedChange(redoableCommit);
	}

	private createInvertedChange(undoableOrRedoable: ReversibleCommit<TChange>): TChange {
		const { commit, repairData } = undoableOrRedoable;

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
					0x677 /* The head commit should be based off the undoable commit. */,
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
		headUndoableCommit?: ReversibleCommit<TChange>,
		headRedoableCommit?: ReversibleCommit<TChange>,
	): UndoRedoManager<TChange, TEditor> {
		return new UndoRedoManager(
			repairDataStoreProvider ?? this.repairDataStoreProvider.clone(),
			this.changeFamily,
			getHead ?? this.getHead,
			headUndoableCommit ?? this.headUndoableCommit,
			headRedoableCommit ?? this.headRedoableCommit,
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
		if (
			originalUndoRedoManager.headUndoable === undefined &&
			originalUndoRedoManager.headRedoable === undefined
		) {
			// The branch that was rebased had no undoable or redoable edits so the new undo redo manager
			// should be a copy of the undo redo manager from the base branch.
			this.headUndoableCommit = baseUndoRedoManager.headUndoable;
			this.headRedoableCommit = baseUndoRedoManager.headRedoable;
			return;
		}

		const rebasedPath: GraphCommit<TChange>[] = [];
		const ancestor = findCommonAncestor([baseHead], [rebasedHead, rebasedPath]);
		assert(
			ancestor === baseHead,
			0x678 /* The rebased head should be based off of the base branch. */,
		);

		if (rebasedPath.length === 0) {
			this.headUndoableCommit = baseUndoRedoManager.headUndoable;
			this.headRedoableCommit = baseUndoRedoManager.headRedoable;
			return;
		}

		const markedCommits = markCommits(
			rebasedPath,
			originalUndoRedoManager.headUndoable,
			originalUndoRedoManager.headRedoable,
		);
		// Create a complete clone of the base undo redo manager for tracking the rebased path
		const undoRedoManager = baseUndoRedoManager.clone();

		for (const { commit, undoRedoManagerCommitType } of markedCommits) {
			if (undoRedoManagerCommitType !== undefined) {
				undoRedoManager.trackCommit(commit, undoRedoManagerCommitType);
			}
			undoRedoManager.repairDataStoreProvider.applyDelta(
				this.changeFamily.intoDelta(commit.change),
			);
		}

		this.headUndoableCommit = undoRedoManager.headUndoable;
		this.headRedoableCommit = undoRedoManager.headRedoable;
	}
}

/**
 * Represents a commit that can be undone.
 */
export interface ReversibleCommit<TChange> {
	/* The commit to undo */
	readonly commit: GraphCommit<TChange>;
	/* The repair data associated with the commit */
	readonly repairData: ReadonlyRepairDataStore;
	/* The next undoable commit. */
	readonly parent?: ReversibleCommit<TChange>;
}

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
 * @param headRedoableCommit - the head redoable commit of the redo commit tree that may contain the commits in the path.
 */
export function markCommits<TChange>(
	path: GraphCommit<TChange>[],
	headUndoableCommit?: ReversibleCommit<TChange>,
	headRedoableCommit?: ReversibleCommit<TChange>,
): { commit: GraphCommit<TChange>; undoRedoManagerCommitType?: UndoRedoManagerCommitType }[] {
	let currentUndoable: ReversibleCommit<TChange> | undefined = headUndoableCommit;
	let currentRedoable: ReversibleCommit<TChange> | undefined = headRedoableCommit;

	if (currentUndoable === undefined && currentRedoable === undefined) {
		// If there are no undoable or redoable commits, none are marked
		return path.map((commit) => ({ commit }));
	}

	// Walk up the commit tree to figure out which commits are undoable or redoable
	return path
		.reverse()
		.map((commit) => {
			const markedCommit: {
				commit: GraphCommit<TChange>;
				undoRedoManagerCommitType?: UndoRedoManagerCommitType;
			} = { commit };
			if (commit.revision === currentUndoable?.commit.revision) {
				markedCommit.undoRedoManagerCommitType = UndoRedoManagerCommitType.Undoable;
				currentUndoable = currentUndoable?.parent;
			} else if (commit.revision === currentRedoable?.commit.revision) {
				markedCommit.undoRedoManagerCommitType = UndoRedoManagerCommitType.Redoable;
				currentRedoable = currentRedoable?.parent;
			}
			return markedCommit;
		})
		.reverse();
}
