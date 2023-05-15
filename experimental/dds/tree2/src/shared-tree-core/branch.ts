/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	AnchorSet,
	ChangeFamily,
	ChangeFamilyEditor,
	findAncestor,
	GraphCommit,
	IRepairDataStoreProvider,
	mintCommit,
	mintRevisionTag,
	RepairDataStore,
	UndoRedoManager,
	tagChange,
	TaggedChange,
	UndoRedoManagerCommitType,
	rebaseBranch,
	RevisionTag,
} from "../core";
import { EventEmitter } from "../events";
import { TransactionStack } from "./transactionStack";

/**
 * Describes a change to a `SharedTreeBranch`. Various operations can mutate the head of the branch;
 * this change format describes each in terms of the "removed commits" (all commits which were present
 * on the branch before the operation but are no longer present after) and the "new commits" (all
 * commits which are present on the branch after the operation that were not present before). Each of
 * the following event types also provides a `change` which contains the net change to the branch
 * (or is undefined if there was no net change):
 * * Append - when one or more commits are appended to the head of the branch, for example via
 * a change applied by the branch's editor, or as a result of merging another branch into this one
 * * Rollback - when one or more commits are removed from the head of the branch. This occurs
 * when a transaction is aborted, and all commits in that transaction are removed.
 * * Rebase - when this branch is rebased over another branch. In this case, commits on the source
 * branch are removed and replaced with new, rebased versions
 */
export type SharedTreeBranchChange<TChange> =
	| { type: "append"; change: TChange; newCommits: GraphCommit<TChange>[] }
	| {
			type: "rollback";
			change: TChange | undefined;
			removedCommits: GraphCommit<TChange>[];
	  }
	| {
			type: "rebase";
			change: TChange | undefined;
			removedCommits: GraphCommit<TChange>[];
			newCommits: GraphCommit<TChange>[];
	  };

/**
 * The events emitted by a `SharedTreeBranch`
 */
export interface SharedTreeBranchEvents<TEditor extends ChangeFamilyEditor, TChange> {
	/**
	 * Fired anytime the head of this branch changes.
	 * @param change - the change to this branch's state and commits
	 */
	change(change: SharedTreeBranchChange<TChange>): void;

	/**
	 * Fired when this branch forks
	 * @param fork - the new branch that forked off of this branch
	 */
	fork(fork: SharedTreeBranch<TEditor, TChange>): void;

	/**
	 * Fired after this branch is disposed
	 */
	dispose(): void;
}

/**
 * A branch of changes that can be applied to a SharedTree.
 */
export class SharedTreeBranch<TEditor extends ChangeFamilyEditor, TChange> extends EventEmitter<
	SharedTreeBranchEvents<TEditor, TChange>
> {
	public readonly editor: TEditor;
	private readonly transactions = new TransactionStack();
	private disposed = false;
	/**
	 * Construct a new branch.
	 * @param head - the head of the branch
	 * @param rebaser - the rebaser used for rebasing and merging commits across branches
	 * @param changeFamily - determines the set of changes that this branch can commit
	 * @param undoRedoManager - an optional {@link UndoRedoManager} to manage the undo/redo operations of this
	 * branch. This must be provided in order to use the `undo` and `redo` methods of this branch.
	 * @param anchors - an optional set of anchors that this branch will rebase whenever the branch head changes
	 */
	public constructor(
		private head: GraphCommit<TChange>,
		public readonly changeFamily: ChangeFamily<TEditor, TChange>,
		private readonly undoRedoManager?: UndoRedoManager<TChange, TEditor>,
		private readonly anchors?: AnchorSet,
	) {
		super();
		this.editor = this.changeFamily.buildEditor(
			(change) => this.apply(change, mintRevisionTag()),
			new AnchorSet(), // This branch class handles the anchor rebasing, so we don't want the editor to do any rebasing; so pass it a dummy anchor set.
		);
	}

	/**
	 * Sets the head of this branch. Emits no change events.
	 */
	public setHead(head: GraphCommit<TChange>): void {
		this.assertNotDisposed();
		assert(!this.isTransacting(), "Cannot set head during a transaction");
		this.head = head;
	}

	/**
	 * Apply a change to this branch.
	 * @param change - the change to apply
	 * @param revision - the revision of the new head commit of the branch that contains `change`
	 * @returns the change that was applied and the new head commit of the branch
	 */
	public apply(
		change: TChange,
		revision: RevisionTag,
	): [change: TChange, newCommit: GraphCommit<TChange>] {
		return this.applyChange(change, revision, UndoRedoManagerCommitType.Undoable);
	}

	private applyChange(
		change: TChange,
		revision: RevisionTag,
		undoRedoType: UndoRedoManagerCommitType | undefined,
	): [change: TChange, newCommit: GraphCommit<TChange>] {
		this.assertNotDisposed();
		this.head = mintCommit(this.head, {
			revision,
			change,
		});

		const delta = this.changeFamily.intoDelta(change);
		this.transactions.repairStore?.capture(delta, this.head.revision);

		// If this is not part of a transaction, add it to the undo commit tree
		if (undoRedoType !== undefined && !this.isTransacting()) {
			this.undoRedoManager?.trackCommit(this.head, undoRedoType);
		}

		this.emitAndRebaseAnchors({ type: "append", change, newCommits: [this.head] });
		return [change, this.head];
	}

	/**
	 * @returns the commit at the head of this branch.
	 */
	public getHead(): GraphCommit<TChange> {
		return this.head;
	}

	/**
	 * Begin a transaction on this branch. If the transaction is committed via {@link commitTransaction},
	 * all commits made since this call will be squashed into a single head commit.
	 * @param repairStore - the repair store associated with this transaction
	 */
	public startTransaction(repairStore?: RepairDataStore): void {
		this.assertNotDisposed();
		if (!this.isTransacting()) {
			// If this is the start of a transaction stack, freeze the undo redo manager's
			// repair data store provider so that repair data can be captured based on the
			// state of the branch at the start of the transaction.
			this.undoRedoManager?.repairDataStoreProvider.freeze();
		}
		this.transactions.push(this.head.revision, repairStore);
		this.editor.enterTransaction();
	}

	/**
	 * Commit the current transaction. There must be a transaction in progress that was begun via
	 * {@link startTransaction}. All commits in the current transaction will be squashed into a new,
	 * single head commit.
	 * @returns the commits that were squashed, and the new squash commit
	 */
	public commitTransaction(): [
		squashedCommits: GraphCommit<TChange>[],
		newCommit: GraphCommit<TChange>,
	] {
		this.assertNotDisposed();
		const [startCommit, commits] = this.popTransaction();
		this.editor.exitTransaction();

		// Anonymize the commits from this transaction by stripping their revision tags.
		// Otherwise, the change rebaser will record their tags and those tags no longer exist.
		const anonymousCommits = commits.map(({ change }) => ({ change, revision: undefined }));

		{
			// Squash the changes and make the squash commit the new head of this branch
			const change = this.changeFamily.rebaser.compose(anonymousCommits);
			this.head = mintCommit(startCommit, {
				revision: mintRevisionTag(),
				change,
			});

			// If this transaction is not nested, add it to the undo commit tree
			if (!this.isTransacting()) {
				this.undoRedoManager?.trackCommit(this.head, UndoRedoManagerCommitType.Undoable);
			}

			// If there is still an ongoing transaction (because this transaction was nested inside of an outer transaction)
			// then update the repair data store for that transaction
			this.transactions.repairStore?.capture(
				this.changeFamily.intoDelta(change),
				this.head.revision,
			);
		}
		return [commits, this.head];
	}

	/**
	 * Cancel the current transaction. There must be a transaction in progress that was begun via
	 * {@link startTransaction}. All commits made during the transaction will be removed.
	 * @returns the change to this branch resulting in the removal of the commits, and a list of the
	 * commits that were removed.
	 */
	public abortTransaction(): [
		change: TChange | undefined,
		abortedCommits: GraphCommit<TChange>[],
	] {
		this.assertNotDisposed();
		const [startCommit, commits, repairStore] = this.popTransaction();
		this.editor.exitTransaction();
		this.head = startCommit;
		if (commits.length === 0) {
			return [undefined, []];
		}

		const inverses: TaggedChange<TChange>[] = [];
		for (let i = commits.length - 1; i >= 0; i--) {
			const inverse = this.changeFamily.rebaser.invert(commits[i], false, repairStore);
			inverses.push(tagChange(inverse, mintRevisionTag()));
		}
		const change =
			inverses.length > 0 ? this.changeFamily.rebaser.compose(inverses) : undefined;

		this.emitAndRebaseAnchors({
			type: "rollback",
			change,
			removedCommits: commits,
		});
		return [change, commits];
	}

	/**
	 * True iff this branch is in the middle of a transaction that was begin via {@link startTransaction}
	 */
	public isTransacting(): boolean {
		return this.transactions.size !== 0;
	}

	private popTransaction(): [
		GraphCommit<TChange>,
		GraphCommit<TChange>[],
		RepairDataStore | undefined,
	] {
		const { startRevision, repairStore } = this.transactions.pop();
		const commits: GraphCommit<TChange>[] = [];
		const startCommit = findAncestor([this.head, commits], (c) => c.revision === startRevision);
		assert(
			startCommit !== undefined,
			0x593 /* Expected branch to be ahead of transaction start revision */,
		);
		return [startCommit, commits, repairStore];
	}

	/**
	 * Undoes the last change made by the client. If there is no change to undo then this method has no effect.
	 * This method will error if no {@link UndoRedoManager} was provided when this branch was constructed.
	 * It is invalid to call this method while a transaction is open (this will be supported in the future).
	 * @returns the change to this branch and the new head commit, or undefined if there was nothing to undo
	 */
	public undo(): [change: TChange, newCommit: GraphCommit<TChange>] | undefined {
		assert(
			this.undoRedoManager !== undefined,
			"Must construct branch with an `UndoRedoManager` in order to undo.",
		);
		// TODO: allow this once it becomes possible to compose the changesets created by edits made
		// within transactions and edits that represent completed transactions.
		assert(!this.isTransacting(), 0x66a /* Undo is not yet supported during transactions */);

		const undoChange = this.undoRedoManager?.undo(this.getHead());
		if (undoChange !== undefined) {
			return this.applyChange(undoChange, mintRevisionTag(), UndoRedoManagerCommitType.Undo);
		}

		return undefined;
	}

	/**
	 * Redoes the last change made by the client. If there is no change to redo then this method has no effect.
	 * This method will error if no {@link UndoRedoManager} was provided when this branch was constructed.
	 * It is invalid to call this method while a transaction is open (this will be supported in the future).
	 * @returns the change to this branch and the new head commit, or undefined if there was nothing to redo
	 */
	public redo(): [change: TChange, newCommit: GraphCommit<TChange>] | undefined {
		assert(
			this.undoRedoManager !== undefined,
			"Must construct branch with an `UndoRedoManager` in order to redo.",
		);
		// TODO: allow this once it becomes possible to compose the changesets created by edits made
		// within transactions and edits that represent completed transactions.
		assert(!this.isTransacting(), 0x67e /* Redo is not yet supported during transactions */);

		const redoChange = this.undoRedoManager?.redo(this.getHead());
		if (redoChange !== undefined) {
			return this.applyChange(redoChange, mintRevisionTag(), UndoRedoManagerCommitType.Redo);
		}

		return undefined;
	}

	/**
	 * Spawn a new branch that is based off of the current state of this branch.
	 * Changes made to the new branch will not be applied to this branch until the new branch is merged back in.
	 * @param anchors - an optional set of anchors that the new branch is responsible for rebasing
	 */
	public fork(
		repairDataStoreProvider?: IRepairDataStoreProvider,
		anchors?: AnchorSet,
	): SharedTreeBranch<TEditor, TChange> {
		this.assertNotDisposed();
		const fork = new SharedTreeBranch(
			this.head,
			this.changeFamily,
			this.undoRedoManager?.clone(repairDataStoreProvider),
			anchors,
		);
		this.emit("fork", fork);
		return fork;
	}

	/**
	 * Rebase the changes that have been applied to this branch over all the divergent changes in the given branch.
	 * After this operation completes, this branch will be based off of `branch`.
	 * @param branch - the branch to rebase onto
	 * @returns the net change to this branch and the commits that were removed and added to this branch by the rebase,
	 * or undefined if nothing changed
	 */
	public rebaseOnto(
		branch: SharedTreeBranch<TEditor, TChange>,
	):
		| [
				change: TChange | undefined,
				removedCommits: GraphCommit<TChange>[],
				newCommits: GraphCommit<TChange>[],
		  ]
		| undefined {
		this.assertNotDisposed();
		// Rebase this branch onto the given branch
		const rebaseResult = this.rebaseBranch(this.head, branch.getHead());
		if (rebaseResult === undefined) {
			return undefined;
		}

		// The net change to this branch is provided by the `rebaseBranch` API
		const [newHead, change, { deletedSourceCommits, targetCommits, sourceCommits }] =
			rebaseResult;

		if (this.undoRedoManager !== undefined) {
			// TODO: We probably can rebase a revertible branch onto a non-revertible branch.
			assert(
				branch.undoRedoManager !== undefined,
				"Cannot rebase a revertible branch onto a non-revertible branch",
			);
			this.undoRedoManager.updateAfterRebase(sourceCommits, branch.undoRedoManager);
		}
		this.head = newHead;
		const newCommits = targetCommits.concat(sourceCommits);
		this.emitAndRebaseAnchors({
			type: "rebase",
			change,
			removedCommits: deletedSourceCommits,
			newCommits,
		});
		return [change, deletedSourceCommits, newCommits];
	}

	/**
	 * Apply all the divergent changes on the given branch to this branch.
	 * @returns the net change to this branch and the commits that were added to this branch by the merge,
	 * or undefined if nothing changed
	 */
	public merge(
		branch: SharedTreeBranch<TEditor, TChange>,
	): [change: TChange, newCommits: GraphCommit<TChange>[]] | undefined {
		this.assertNotDisposed();
		assert(
			!branch.isTransacting(),
			0x597 /* Branch may not be merged while transaction is in progress */,
		);

		// Rebase the given branch onto this branch
		const rebaseResult = this.rebaseBranch(branch.head, this.head);
		if (rebaseResult === undefined) {
			return undefined;
		}

		// Compute the net change to this branch
		const [newHead, _, { sourceCommits }] = rebaseResult;

		if (this.undoRedoManager !== undefined) {
			// TODO: We probably can merge a non-revertible branch into a revertible branch.
			assert(
				branch.undoRedoManager !== undefined,
				"Cannot merge a non-revertible branch into a revertible branch",
			);
			this.undoRedoManager.updateAfterMerge(sourceCommits, branch.undoRedoManager);
		}
		this.head = newHead;
		const change = this.changeFamily.rebaser.compose(sourceCommits);
		this.emitAndRebaseAnchors({
			type: "append",
			change,
			newCommits: sourceCommits,
		});
		return [change, sourceCommits];
	}

	/** Rebase `branchHead` onto `onto`, but return undefined if nothing changed */
	private rebaseBranch(branchHead: GraphCommit<TChange>, onto: GraphCommit<TChange>) {
		if (branchHead === onto) {
			return undefined;
		}

		const rebaseResult = rebaseBranch(this.changeFamily.rebaser, branchHead, onto);
		const [rebasedHead] = rebaseResult;
		if (this.head === rebasedHead) {
			return undefined;
		}

		return rebaseResult;
	}

	/**
	 * Dispose this branch, freezing its state.
	 * Attempts to further mutate or dispose the branch will error.
	 */
	public dispose(): void {
		this.assertNotDisposed();
		this.disposed = true;
		this.emit("dispose");
	}

	private emitAndRebaseAnchors(change: SharedTreeBranchChange<TChange>): void {
		if (this.anchors !== undefined && change.change !== undefined) {
			this.changeFamily.rebaser.rebaseAnchors(this.anchors, change.change);
		}

		this.emit("change", change);
	}

	private assertNotDisposed(): void {
		assert(!this.disposed, 0x66e /* Branch is disposed */);
	}
}
