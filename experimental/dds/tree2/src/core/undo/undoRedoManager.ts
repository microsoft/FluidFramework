/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { ChangeFamily, ChangeFamilyEditor } from "../change-family";
import { GraphCommit, RevisionTag, findCommonAncestor, tagChange } from "../rebase";

/**
 * Manages a branch of the undoable/redoable commit trees and repair data associated with the undoable and redoable commits.
 */
export class UndoRedoManager<TChange, TEditor extends ChangeFamilyEditor> {
	/**
	 * @param repairDataStoryFactory - Factory for creating {@link RepairDataStore}s to create and store repair
	 * data for {@link ReversibleCommit}s.
	 * @param changeFamily - {@link ChangeFamily} used for inverting changes.
	 * @param headUndoableCommit - Optional commit to set as the initial undoable commit.
	 * @param headRedoableCommit - Optional commit to set as the initial redoable commit.
	 */
	public static create<TChange, TEditor extends ChangeFamilyEditor>(
		changeFamily: ChangeFamily<TEditor, TChange>,
		headUndoableCommit?: ReversibleCommit<TChange>,
		headRedoableCommit?: ReversibleCommit<TChange>,
	): UndoRedoManager<TChange, TEditor> {
		return new UndoRedoManager(changeFamily, headUndoableCommit, headRedoableCommit);
	}

	private constructor(
		private readonly changeFamily: ChangeFamily<TEditor, TChange>,
		private headUndoableCommit?: ReversibleCommit<TChange>,
		private headRedoableCommit?: ReversibleCommit<TChange>,
		private readonly commitTypes = new Map<RevisionTag, UndoRedoManagerCommitType>(),
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
		this.commitTypes.set(commit.revision, type);

		const parent =
			type === UndoRedoManagerCommitType.Undo || type === UndoRedoManagerCommitType.Redoable
				? this.headRedoableCommit
				: this.headUndoableCommit;
		const undoableOrRedoable = {
			commit,
			parent,
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
	 * Returns the {@link UndoRedoManagerCommitType} associated with the provided revision.
	 */
	public getCommitType(revision: RevisionTag): UndoRedoManagerCommitType | undefined {
		return this.commitTypes.get(revision);
	}

	/**
	 * Removes the {@link UndoRedoManagerCommitType} associated with the provided revision.
	 */
	public untrackCommitType(revision: RevisionTag): void {
		this.commitTypes.delete(revision);
	}

	/**
	 * Inverts the head undoable commit and returns the inverted change.
	 * This change can then be applied and tracked.
	 * @param headCommit - The head commit of the branch to undo from.
	 */
	public undo(headCommit: GraphCommit<TChange>): TChange | undefined {
		const undoableCommit = this.headUndoableCommit;

		if (undoableCommit === undefined) {
			// No undoable commits, exit early
			return undefined;
		}

		return this.createInvertedChange(undoableCommit, headCommit);
	}

	/**
	 * Inverts the head redoable commit and returns the inverted change.
	 * This change can then be applied and tracked.
	 * @param headCommit - The head commit of the branch to redo from.
	 */
	public redo(headCommit: GraphCommit<TChange>): TChange | undefined {
		const redoableCommit = this.headRedoableCommit;

		if (redoableCommit === undefined) {
			// No undoable commits, exit early
			return undefined;
		}

		return this.createInvertedChange(redoableCommit, headCommit);
	}

	private createInvertedChange(
		undoableOrRedoable: ReversibleCommit<TChange>,
		headCommit: GraphCommit<TChange>,
	): TChange {
		const { commit } = undoableOrRedoable;

		let change = this.changeFamily.rebaser.invert(
			tagChange(commit.change, commit.revision),
			false,
			commit.repairData,
		);

		// Rebase the inverted change onto any commits that occurred after the undoable commits.
		if (commit.revision !== headCommit.revision) {
			const pathAfterUndoable: GraphCommit<TChange>[] = [];
			const ancestor = findCommonAncestor([commit], [headCommit, pathAfterUndoable]);
			assert(
				ancestor === commit,
				0x677 /* The head commit should be based off the undoable commit. */,
			);
			change = pathAfterUndoable.reduce(
				(a, b) => this.changeFamily.rebaser.rebase(a, b),
				change,
			);
		}

		return change;
	}

	/**
	 * Creates a copy of this `UndoRedoManager`.
	 * @param headUndoableCommit - Optional head undoable commit, if one is not provided the head undoable commit
	 * of this {@link UndoRedoManager} will be used.
	 * @param headRedoableCommit - Optional head redoable commit, if one is not provided the head redoable commit
	 * of this {@link UndoRedoManager} will be used.
	 */
	public clone(
		headUndoableCommit?: ReversibleCommit<TChange>,
		headRedoableCommit?: ReversibleCommit<TChange>,
	): UndoRedoManager<TChange, TEditor> {
		return new UndoRedoManager(
			this.changeFamily,
			headUndoableCommit ?? this.headUndoableCommit,
			headRedoableCommit ?? this.headRedoableCommit,
			this.commitTypes,
		);
	}

	/**
	 * Updates the state of this {@link UndoRedoManager} to correctly reference commits that have been rebased after merging.
	 * @param newCommits - all commits which were appended to the source branch.
	 * @param mergedUndoRedoManager - the {@link UndoRedoManager} of the branch that was merged.
	 */
	public updateAfterMerge(
		newCommits: GraphCommit<TChange>[],
		mergedUndoRedoManager: UndoRedoManager<TChange, TEditor>,
	): void {
		this.updateBasedOnNewCommits(newCommits, this, mergedUndoRedoManager);
	}

	/**
	 * Updates the state of this {@link UndoRedoManager} to correctly reference commits that have been rebased.
	 * @param newCommits - all commits from the original branch that have rebased versions present on the new branch.
	 * @param baseUndoRedoManager - the {@link UndoRedoManager} of the branch that was rebased onto
	 */
	public updateAfterRebase(
		newCommits: GraphCommit<TChange>[],
		baseUndoRedoManager: UndoRedoManager<TChange, TEditor>,
	): void {
		this.updateBasedOnNewCommits(newCommits, baseUndoRedoManager, this);
	}

	private updateBasedOnNewCommits(
		newCommits: GraphCommit<TChange>[],
		baseUndoRedoManager: UndoRedoManager<TChange, TEditor>,
		originalUndoRedoManager: UndoRedoManager<TChange, TEditor>,
	): void {
		if (
			(originalUndoRedoManager.headUndoable === undefined &&
				originalUndoRedoManager.headRedoable === undefined) ||
			newCommits.length === 0
		) {
			// The branch that was rebased had no undoable or redoable edits so the new undo redo manager
			// should be a copy of the undo redo manager from the base branch.
			this.headUndoableCommit = baseUndoRedoManager.headUndoable;
			this.headRedoableCommit = baseUndoRedoManager.headRedoable;
			return;
		}

		// Rebuild the reversible commit trees off of the undo redo manager of the branch
		// that was rebased onto.
		let newHeadUndoable = baseUndoRedoManager.headUndoable;
		let newHeadRedoable = baseUndoRedoManager.headRedoable;

		// Distinguish which reversible stack each commit is in and add it to the stack.
		for (const commit of newCommits) {
			const type = originalUndoRedoManager.commitTypes.get(commit.revision);
			if (type !== undefined) {
				if (
					type === UndoRedoManagerCommitType.Undoable ||
					type === UndoRedoManagerCommitType.Redo
				) {
					newHeadUndoable = {
						commit,
						parent: newHeadUndoable,
					};
				} else if (
					type === UndoRedoManagerCommitType.Redoable ||
					type === UndoRedoManagerCommitType.Undo
				) {
					newHeadRedoable = {
						commit,
						parent: newHeadRedoable,
					};
				}
			}
		}

		this.headUndoableCommit = newHeadUndoable;
		this.headRedoableCommit = newHeadRedoable;
	}
}

/**
 * Represents a commit that can be undone.
 */
export interface ReversibleCommit<TChange> {
	/* The commit to undo */
	commit: GraphCommit<TChange>;
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
