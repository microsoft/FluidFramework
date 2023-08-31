/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
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
	LocalCommitSource,
	rebaseBranch,
	RevisionTag,
} from "../core";
import { EventEmitter, ISubscribable } from "../events";
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
 * * Remove - when one or more commits are removed from the head of the branch. This occurs
 * when a transaction is aborted and all commits pending in that transaction are removed.
 * * Replace - when an operation simultaneously removes and appends commits. For example, when this
 * branch is rebased and some commits are removed and replaced with rebased versions, or when a
 * transaction completes and all pending commits are replaced with a single squash commit.
 */
export type SharedTreeBranchChange<TChange> =
	| { type: "append"; change: TChange; newCommits: GraphCommit<TChange>[] }
	| {
			type: "remove";
			change: TChange | undefined;
			removedCommits: GraphCommit<TChange>[];
	  }
	| {
			type: "replace";
			change: TChange | undefined;
			removedCommits: GraphCommit<TChange>[];
			newCommits: GraphCommit<TChange>[];
	  };

/**
 * Returns the operation that caused the given {@link SharedTreeBranchChange}.
 */
export function getChangeReplaceType(
	change: SharedTreeBranchChange<unknown> & { type: "replace" },
): "transactionCommit" | "rebase" {
	// The "replace" variant of the change event is emitted by two operations: committing a transaction and doing a rebase.
	// Committing a transaction will always remove one or more commits (the commits that were squashed),
	// and will add exactly one new commit (the squash commit).
	if (change.removedCommits.length === 0 || change.newCommits.length !== 1) {
		return "rebase";
	}

	// There is only one case in which a rebase both removes commits and adds exactly one new commit.
	// This occurs when there is exactly one divergent, but equivalent, commit on each branch:
	//
	// A ─ B (branch X)	  -- rebase Y onto X -->   A ─ B (branch X)
	// └─ B' (branch Y)                                └─ (branch Y)
	//
	// B' is removed and replaced by B because both have the same revision.
	if (
		change.removedCommits.length === 1 &&
		change.removedCommits[0].revision === change.newCommits[0].revision
	) {
		return "rebase";
	}

	return "transactionCommit";
}

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
	 * Fired when a revertible change is made to this branch.
	 */
	revertible(type: LocalCommitSource): void;

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
	private readonly transactions = new TransactionStack<TChange>();
	private disposed = false;
	/**
	 * Construct a new branch.
	 * @param head - the head of the branch
	 * @param rebaser - the rebaser used for rebasing and merging commits across branches
	 * @param changeFamily - determines the set of changes that this branch can commit
	 * @param repairDataStoreProvider - an optional provider of {@link RepairDataStore}s to use when generating
	 * repair data. This must be provided in order to use features that require repair data such as undo/redo or constraints.
	 * @param undoRedoManager - an optional {@link UndoRedoManager} to manage the undo/redo operations of this
	 * branch. This must be provided in order to use the `undo` and `redo` methods of this branch.
	 */
	public constructor(
		private head: GraphCommit<TChange>,
		public readonly changeFamily: ChangeFamily<TEditor, TChange>,
		public repairDataStoreProvider?: IRepairDataStoreProvider<TChange>,
		private readonly undoRedoManager?: UndoRedoManager<TChange, TEditor>,
	) {
		super();
		this.editor = this.changeFamily.buildEditor((change) =>
			this.apply(change, mintRevisionTag()),
		);
	}

	/**
	 * Sets the head of this branch. Emits no change events.
	 */
	public setHead(head: GraphCommit<TChange>): void {
		this.assertNotDisposed();
		assert(!this.isTransacting(), 0x685 /* Cannot set head during a transaction */);
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
		return this.applyChange(change, revision, LocalCommitSource.Default);
	}

	private applyChange(
		change: TChange,
		revision: RevisionTag,
		undoRedoType: LocalCommitSource | undefined,
	): [change: TChange, newCommit: GraphCommit<TChange>] {
		this.assertNotDisposed();

		// If this is not part of a transaction, capture the repair data
		let repairData: RepairDataStore<TChange> | undefined;
		if (!this.isTransacting() && this.repairDataStoreProvider !== undefined) {
			repairData = this.repairDataStoreProvider.createRepairData();
			repairData.capture(change, revision);
		}

		this.head = mintCommit(this.head, {
			revision,
			change,
			repairData,
		});

		this.transactions.repairStore?.capture(change, this.head.revision);

		// If this is not part of a transaction, add it to the undo commit tree
		if (undoRedoType !== undefined && !this.isTransacting()) {
			this.undoRedoManager?.trackCommit(this.head, undoRedoType);
			this.emit("revertible", undoRedoType);
		}

		this.emit("change", { type: "append", change, newCommits: [this.head] });
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
	public startTransaction(repairStore?: RepairDataStore<TChange>): void {
		this.assertNotDisposed();
		if (!this.isTransacting() && this.repairDataStoreProvider !== undefined) {
			// If this is the start of a transaction stack, freeze the
			// repair data store provider so that repair data can be captured based on the
			// state of the branch at the start of the transaction.
			this.repairDataStoreProvider.freeze();
		}
		const forks = new Set<SharedTreeBranch<TEditor, TChange>>();
		const onDisposeUnSubscribes: (() => void)[] = [];
		const onForkUnSubscribe = onForkTransitive(this, (fork) => {
			forks.add(fork);
			onDisposeUnSubscribes.push(fork.on("dispose", () => forks.delete(fork)));
		});
		this.transactions.push(
			this.head.revision,
			() => {
				forks.forEach((fork) => fork.dispose());
				onDisposeUnSubscribes.forEach((unsubscribe) => unsubscribe());
				onForkUnSubscribe();
			},
			repairStore,
		);
		this.editor.enterTransaction();
	}

	/**
	 * Commit the current transaction. There must be a transaction in progress that was begun via {@link startTransaction}.
	 * If there are commits in the current transaction, they will be squashed into a new single head commit.
	 * @returns the commits that were squashed and the new squash commit if a squash occurred, otherwise `undefined`.
	 * @remarks If the transaction had no changes applied during its lifetime, then no squash occurs (i.e. this method is a no-op).
	 * Even if the transaction contained only one change, it will still be replaced with an (equivalent) squash change.
	 */
	public commitTransaction():
		| [squashedCommits: GraphCommit<TChange>[], newCommit: GraphCommit<TChange>]
		| undefined {
		this.assertNotDisposed();
		const [startCommit, commits] = this.popTransaction();
		this.editor.exitTransaction();

		if (commits.length === 0) {
			return undefined;
		}

		// Anonymize the commits from this transaction by stripping their revision tags.
		// Otherwise, the change rebaser will record their tags and those tags no longer exist.
		const anonymousCommits = commits.map(({ change }) => ({ change, revision: undefined }));
		// Squash the changes and make the squash commit the new head of this branch
		const squashedChange = this.changeFamily.rebaser.compose(anonymousCommits);
		const revision = mintRevisionTag();

		let repairData: RepairDataStore<TChange> | undefined;
		if (!this.isTransacting() && this.repairDataStoreProvider !== undefined) {
			repairData = this.repairDataStoreProvider.createRepairData();
			repairData?.capture(squashedChange, revision);
		}

		this.head = mintCommit(startCommit, {
			revision,
			change: squashedChange,
			repairData,
		});

		// If this transaction is not nested, add it to the undo commit tree and capture its repair data
		if (!this.isTransacting()) {
			if (this.undoRedoManager !== undefined) {
				this.undoRedoManager.trackCommit(this.head, LocalCommitSource.Default);
				this.emit("revertible", LocalCommitSource.Default);
			}
		}

		// If there is still an ongoing transaction (because this transaction was nested inside of an outer transaction)
		// then update the repair data store for that transaction
		this.transactions.repairStore?.capture(this.head.change, revision);

		this.emit("change", {
			type: "replace",
			change: undefined,
			removedCommits: commits,
			newCommits: [this.head],
		});
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

		this.emit("change", {
			type: "remove",
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
		RepairDataStore<TChange> | undefined,
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
			0x686 /* Must construct branch with an `UndoRedoManager` in order to undo. */,
		);
		// TODO: allow this once it becomes possible to compose the changesets created by edits made
		// within transactions and edits that represent completed transactions.
		assert(!this.isTransacting(), 0x66a /* Undo is not yet supported during transactions */);

		const undoChange = this.undoRedoManager?.undo(this.getHead());
		if (undoChange !== undefined) {
			return this.applyChange(undoChange, mintRevisionTag(), LocalCommitSource.Undo);
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
			0x687 /* Must construct branch with an `UndoRedoManager` in order to redo. */,
		);
		// TODO: allow this once it becomes possible to compose the changesets created by edits made
		// within transactions and edits that represent completed transactions.
		assert(!this.isTransacting(), 0x67e /* Redo is not yet supported during transactions */);

		const redoChange = this.undoRedoManager?.redo(this.getHead());
		if (redoChange !== undefined) {
			return this.applyChange(redoChange, mintRevisionTag(), LocalCommitSource.Redo);
		}

		return undefined;
	}

	/**
	 * Spawn a new branch that is based off of the current state of this branch.
	 * Changes made to the new branch will not be applied to this branch until the new branch is merged back in.
	 * @param repairDataStoreProvider - a {@link RepairDataStoreProvider} that reflects the state of the new branch. If one is not
	 * provided, then it will be cloned from this branch.
	 *
	 * @remarks Forks created during a transaction will be disposed when the transaction ends.
	 */
	public fork(
		repairDataStoreProvider?: IRepairDataStoreProvider<TChange>,
	): SharedTreeBranch<TEditor, TChange> {
		this.assertNotDisposed();
		const fork = new SharedTreeBranch(
			this.head,
			this.changeFamily,
			repairDataStoreProvider ?? this.repairDataStoreProvider?.clone(),
			this.undoRedoManager?.clone(),
		);
		this.emit("fork", fork);
		return fork;
	}

	/**
	 * Rebase the changes that have been applied to this branch over divergent changes in the given branch.
	 * After this operation completes, this branch will be based off of `branch`.
	 *
	 * @remarks
	 * This operation can change the relative ordering between revertible commits therefore, the revertible event
	 * is not emitted during this operation.
	 *
	 * @param branch - the branch to rebase onto
	 * @param upTo - the furthest commit on `branch` over which to rebase (inclusive). Defaults to the head commit of `branch`.
	 * @returns the net change to this branch and the commits that were removed and added to this branch by the rebase,
	 * or undefined if nothing changed
	 */
	public rebaseOnto(
		branch: SharedTreeBranch<TEditor, TChange>,
		upTo = branch.getHead(),
	):
		| [
				change: TChange | undefined,
				removedCommits: GraphCommit<TChange>[],
				newCommits: GraphCommit<TChange>[],
		  ]
		| undefined {
		this.assertNotDisposed();
		// Rebase this branch onto the given branch
		const rebaseResult = this.rebaseBranch(this, branch, upTo);
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
				0x688 /* Cannot rebase a revertible branch onto a non-revertible branch */,
			);
			this.undoRedoManager.updateAfterRebase(sourceCommits, branch.undoRedoManager);
		}
		this.head = newHead;
		const newCommits = targetCommits.concat(sourceCommits);
		this.emit("change", {
			type: "replace",
			change,
			removedCommits: deletedSourceCommits,
			newCommits,
		});
		return [change, deletedSourceCommits, newCommits];
	}

	/**
	 * Apply all the divergent changes on the given branch to this branch.
	 *
	 * @remarks
	 * Revertible events are emitted for new local commits merged into this branch.
	 *
	 * @param branch - the branch to merge into this branch
	 * @returns the net change to this branch and the commits that were added to this branch by the merge,
	 * or undefined if nothing changed
	 */
	public merge(
		branch: SharedTreeBranch<TEditor, TChange>,
	): [change: TChange, newCommits: GraphCommit<TChange>[]] | undefined {
		this.assertNotDisposed();
		branch.assertNotDisposed();
		assert(
			!branch.isTransacting(),
			0x597 /* Branch may not be merged while transaction is in progress */,
		);

		// Rebase the given branch onto this branch
		const rebaseResult = this.rebaseBranch(branch, this);
		if (rebaseResult === undefined) {
			return undefined;
		}

		// Compute the net change to this branch
		const [newHead, _, { sourceCommits }] = rebaseResult;

		if (this.undoRedoManager !== undefined) {
			// TODO: We probably can merge a non-revertible branch into a revertible branch.
			assert(
				branch.undoRedoManager !== undefined,
				0x689 /* Cannot merge a non-revertible branch into a revertible branch */,
			);
			this.undoRedoManager.updateAfterMerge(sourceCommits, branch.undoRedoManager);

			for (const commit of sourceCommits) {
				const type = this.undoRedoManager.getCommitType(commit.revision);
				if (type !== undefined) {
					this.emit("revertible", type);
				}
			}
		}
		this.head = newHead;
		const change = this.changeFamily.rebaser.compose(sourceCommits);
		this.emit("change", {
			type: "append",
			change,
			newCommits: sourceCommits,
		});
		return [change, sourceCommits];
	}

	/** Rebase `branchHead` onto `onto`, but return undefined if nothing changed */
	private rebaseBranch(
		branch: SharedTreeBranch<TEditor, TChange>,
		onto: SharedTreeBranch<TEditor, TChange>,
		upTo = onto.getHead(),
	) {
		const { head, repairDataStoreProvider } = branch;
		if (head === upTo) {
			return undefined;
		}

		const rebaseResult = rebaseBranch(
			this.changeFamily.rebaser,
			repairDataStoreProvider,
			head,
			upTo,
			onto.getHead(),
		);
		const [rebasedHead] = rebaseResult;
		if (this.head === rebasedHead) {
			return undefined;
		}

		return rebaseResult;
	}

	/**
	 * Dispose this branch, freezing its state.
	 *
	 * @remarks
	 * Attempts to further mutate the branch will error.
	 * Any transactions in progress will be aborted.
	 * Calling dispose more than once has no effect.
	 */
	public dispose(): void {
		if (this.disposed) {
			return;
		}

		while (this.isTransacting()) {
			this.abortTransaction();
		}
		this.disposed = true;
		this.emit("dispose");
	}

	private assertNotDisposed(): void {
		assert(!this.disposed, 0x66e /* Branch is disposed */);
	}
}

/**
 * Registers an event listener that fires when the given forkable object forks.
 * The listener will also fire when any of those forks fork, and when those forks of forks fork, and so on.
 * @param forkable - an object that emits an event when it is forked
 * @param onFork - the fork event listener
 * @returns a function which when called will deregister all registrations (including transitive) created by this function.
 * The deregister function has undefined behavior if called more than once.
 */
export function onForkTransitive<T extends ISubscribable<{ fork: (t: T) => void }>>(
	forkable: T,
	onFork: (fork: T) => void,
): () => void {
	const offs: (() => void)[] = [];
	offs.push(
		forkable.on("fork", (fork) => {
			offs.push(onForkTransitive(fork, onFork));
			onFork(fork);
		}),
	);
	return () => offs.forEach((off) => off());
}
