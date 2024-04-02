/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	BranchRebaseResult,
	ChangeFamily,
	ChangeFamilyEditor,
	CommitKind,
	CommitMetadata,
	GraphCommit,
	Revertible,
	RevertibleStatus,
	RevisionTag,
	TaggedChange,
	findAncestor,
	findCommonAncestor,
	makeAnonChange,
	mintCommit,
	rebaseBranch,
	rebaseChangeOverChanges,
	tagChange,
	tagRollbackInverse,
} from "../core/index.js";
import { EventEmitter, ISubscribable } from "../events/index.js";

import { TransactionStack } from "./transactionStack.js";

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
	| {
			type: "append";
			change: TaggedChange<TChange>;
			newCommits: readonly GraphCommit<TChange>[];
	  }
	| {
			type: "remove";
			change: TaggedChange<TChange> | undefined;
			removedCommits: readonly GraphCommit<TChange>[];
	  }
	| {
			type: "replace";
			change: TaggedChange<TChange> | undefined;
			removedCommits: readonly GraphCommit<TChange>[];
			newCommits: readonly GraphCommit<TChange>[];
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
	 * Fired just before the head of this branch changes.
	 * @param change - the change to this branch's state and commits
	 */
	beforeChange(change: SharedTreeBranchChange<TChange>): void;

	/**
	 * Fired just after the head of this branch changes.
	 * @param change - the change to this branch's state and commits
	 */
	afterChange(change: SharedTreeBranchChange<TChange>): void;

	/**
	 * Fired when a revertible made on this branch is disposed.
	 *
	 * @param revertible - The revertible that was disposed.
	 * This revertible was previously obtained through the `commitApplied` event.
	 * @param revision - The revision associated with the revertible that was disposed.
	 */
	revertibleDisposed(revertible: Revertible, revision: RevisionTag): void;

	/**
	 * {@inheritdoc TreeViewEvents.commitApplied}
	 */
	commitApplied(data: CommitMetadata, getRevertible?: () => Revertible): void;

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

interface DisposableRevertible extends Revertible {
	dispose: () => void;
}

/**
 * A branch of changes that can be applied to a SharedTree.
 */
export class SharedTreeBranch<TEditor extends ChangeFamilyEditor, TChange> extends EventEmitter<
	SharedTreeBranchEvents<TEditor, TChange>
> {
	public readonly editor: TEditor;
	// set of revertibles maintained for automatic disposal
	private readonly revertibles = new Set<DisposableRevertible>();
	private readonly _revertibleCommits = new Map<RevisionTag, GraphCommit<TChange>>();
	private readonly transactions = new TransactionStack();
	/**
	 * After pushing a starting revision to the transaction stack, this branch might be rebased
	 * over commits which are children of that starting revision. When the transaction is committed,
	 * those rebased-over commits should not be included in the transaction's squash commit, even though
	 * they exist between the starting revision and the final commit within the transaction.
	 *
	 * Whenever `rebaseOnto` is called during a transaction, this map is augmented with an entry from the
	 * original merge-base to the new merge-base.
	 *
	 * This state need only be retained for the lifetime of the transaction.
	 *
	 * TODO: This strategy might need to be revisited when adding better support for async transactions.
	 * Since:
	 *
	 * 1. Transactionality is guaranteed primarily by squashing at commit time
	 * 2. Branches may be rebased with an ongoing transaction
	 *
	 * a rebase operation might invalidate only a portion of a transaction's commits, thus defeating the
	 * purpose of transactionality.
	 *
	 * AB#6483 and children items track this work.
	 */
	private readonly initialTransactionRevToRebasedRev = new Map<RevisionTag, RevisionTag>();
	private disposed = false;
	/**
	 * Construct a new branch.
	 * @param head - the head of the branch
	 * @param changeFamily - determines the set of changes that this branch can commit
	 */
	public constructor(
		private head: GraphCommit<TChange>,
		public readonly changeFamily: ChangeFamily<TEditor, TChange>,
		private readonly mintRevisionTag: () => RevisionTag,
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
		return this.applyChange(change, revision, CommitKind.Default);
	}

	private applyChange(
		change: TChange,
		revision: RevisionTag,
		revertibleKind: CommitKind,
	): [change: TChange, newCommit: GraphCommit<TChange>] {
		this.assertNotDisposed();

		const newHead = mintCommit(this.head, {
			revision,
			change,
		});

		const changeEvent = {
			type: "append",
			change: tagChange(change, revision),
			newCommits: [newHead],
		} as const;

		this.emit("beforeChange", changeEvent);
		this.head = newHead;

		// If this is not part of a transaction, emit a commitApplied event
		if (!this.isTransacting()) {
			this.emitCommitApplied(newHead, { isLocal: true, kind: revertibleKind });
		}

		this.emit("afterChange", changeEvent);
		return [change, newHead];
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
	public startTransaction(): void {
		this.assertNotDisposed();
		const forks = new Set<SharedTreeBranch<TEditor, TChange>>();
		const onDisposeUnSubscribes: (() => void)[] = [];
		const onForkUnSubscribe = onForkTransitive(this, (fork) => {
			forks.add(fork);
			onDisposeUnSubscribes.push(fork.on("dispose", () => forks.delete(fork)));
		});
		this.transactions.push(this.head.revision, () => {
			forks.forEach((fork) => fork.dispose());
			onDisposeUnSubscribes.forEach((unsubscribe) => unsubscribe());
			onForkUnSubscribe();
		});
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
		const revision = this.mintRevisionTag();

		const newHead = mintCommit(startCommit, {
			revision,
			change: squashedChange,
		});

		const changeEvent = {
			type: "replace",
			change: undefined,
			removedCommits: commits,
			newCommits: [newHead],
		} as const;

		this.emit("beforeChange", changeEvent);
		this.head = newHead;

		// If this transaction is not nested, emit a commitApplied event
		if (!this.isTransacting()) {
			this.emitCommitApplied(newHead, { isLocal: true, kind: CommitKind.Default });
		}

		this.emit("afterChange", changeEvent);
		return [commits, newHead];
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
		const [startCommit, commits] = this.popTransaction();
		this.editor.exitTransaction();

		if (commits.length === 0) {
			return [undefined, []];
		}

		const inverses: TaggedChange<TChange>[] = [];
		for (let i = commits.length - 1; i >= 0; i--) {
			const inverse = this.changeFamily.rebaser.invert(commits[i], false);
			inverses.push(tagRollbackInverse(inverse, this.mintRevisionTag(), commits[i].revision));
		}
		const change =
			inverses.length > 0 ? this.changeFamily.rebaser.compose(inverses) : undefined;

		const changeEvent = {
			type: "remove",
			change: change === undefined ? undefined : makeAnonChange(change),
			removedCommits: commits,
		} as const;

		this.emit("beforeChange", changeEvent);
		this.head = startCommit;
		this.emit("afterChange", changeEvent);
		return [change, commits];
	}

	/**
	 * True iff this branch is in the middle of a transaction that was begin via {@link startTransaction}
	 */
	public isTransacting(): boolean {
		return this.transactions.size !== 0;
	}

	private popTransaction(): [GraphCommit<TChange>, GraphCommit<TChange>[]] {
		const { startRevision: startRevisionOriginal } = this.transactions.pop();
		let startRevision = startRevisionOriginal;
		while (this.initialTransactionRevToRebasedRev.has(startRevision)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			startRevision = this.initialTransactionRevToRebasedRev.get(startRevision)!;
		}

		if (!this.isTransacting()) {
			this.initialTransactionRevToRebasedRev.clear();
		}

		const commits: GraphCommit<TChange>[] = [];
		const startCommit = findAncestor([this.head, commits], (c) => c.revision === startRevision);
		assert(
			startCommit !== undefined,
			0x593 /* Expected branch to be ahead of transaction start revision */,
		);
		return [startCommit, commits];
	}

	public revertibleCommits(): IterableIterator<RevisionTag> {
		return this._revertibleCommits.keys();
	}

	public purgeRevertibles(): void {
		for (const revertible of this.revertibles) {
			revertible.dispose();
		}
	}

	/**
	 * Associate a revertible with a new commit of the same revision.
	 * This is applicable when a commit is replaced by a rebase or a local commit is sequenced.
	 */
	public updateRevertibleCommit(commit: GraphCommit<TChange>) {
		if (this._revertibleCommits.get(commit.revision) !== undefined) {
			this._revertibleCommits.set(commit.revision, commit);
		}
	}

	private emitCommitApplied(commit: GraphCommit<TChange>, data: CommitMetadata): void {
		const { revision } = commit;
		let withinEventContext = true;

		const getRevertible = () => {
			assert(
				withinEventContext,
				0x902 /* cannot get a revertible outside of the context of a commitApplied event */,
			);
			assert(
				this._revertibleCommits.get(revision) === undefined,
				0x903 /* cannot get the revertible more than once */,
			);

			const revertibleCommits = this._revertibleCommits;
			const revertible: DisposableRevertible = {
				get status(): RevertibleStatus {
					const revertibleCommit = revertibleCommits.get(revision);
					return revertibleCommit === undefined
						? RevertibleStatus.Disposed
						: RevertibleStatus.Valid;
				},
				revert: () => {
					assert(
						revertible.status === RevertibleStatus.Valid,
						0x904 /* a disposed revertible cannot be reverted */,
					);
					this.revertRevertible(revision, data.kind);
				},
				release: () => revertible.dispose(),
				dispose: () => {
					assert(
						revertible.status === RevertibleStatus.Valid,
						0x905 /* a disposed revertible cannot be reverted */,
					);
					this.disposeRevertible(revertible, revision);
				},
			};

			this._revertibleCommits.set(revision, commit);
			this.revertibles.add(revertible);
			return revertible;
		};

		this.emit("commitApplied", data, getRevertible);
		withinEventContext = false;
		// if no one has acquired the revertible within the context of the event callback, garbage collect the revertible data
		if (!this._revertibleCommits.has(revision)) {
			// TODO: delete the repair data from the forest
		}
	}

	private disposeRevertible(revertible: DisposableRevertible, revision: RevisionTag): void {
		// TODO: delete the repair data from the forest
		this._revertibleCommits.delete(revision);
		this.revertibles.delete(revertible);
		this.emit("revertibleDisposed", revertible, revision);
	}

	private revertRevertible(revision: RevisionTag, kind: CommitKind): void {
		assert(!this.isTransacting(), 0x7cb /* Undo is not yet supported during transactions */);

		const commit = this._revertibleCommits.get(revision);
		assert(commit !== undefined, 0x7cc /* expected to find a revertible commit */);

		let change = this.changeFamily.rebaser.invert(tagChange(commit.change, revision), false);

		const headCommit = this.getHead();
		// Rebase the inverted change onto any commits that occurred after the undoable commits.
		if (revision !== headCommit.revision) {
			const pathAfterUndoable: GraphCommit<TChange>[] = [];
			const ancestor = findCommonAncestor([commit], [headCommit, pathAfterUndoable]);
			assert(
				ancestor === commit,
				0x677 /* The head commit should be based off the undoable commit. */,
			);
			change = rebaseChangeOverChanges(this.changeFamily.rebaser, change, pathAfterUndoable);
		}

		this.applyChange(
			change,
			this.mintRevisionTag(),
			kind === CommitKind.Default || kind === CommitKind.Redo
				? CommitKind.Undo
				: CommitKind.Redo,
		);
	}

	/**
	 * Spawn a new branch that is based off of the current state of this branch.
	 * Changes made to the new branch will not be applied to this branch until the new branch is merged back in.
	 *
	 * @remarks Forks created during a transaction will be disposed when the transaction ends.
	 */
	public fork(): SharedTreeBranch<TEditor, TChange> {
		this.assertNotDisposed();
		const fork = new SharedTreeBranch(this.head, this.changeFamily, this.mintRevisionTag);
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
	 * @returns the result of the rebase or undefined if nothing changed
	 */
	public rebaseOnto(
		branch: SharedTreeBranch<TEditor, TChange>,
		upTo = branch.getHead(),
	): BranchRebaseResult<TChange> | undefined {
		this.assertNotDisposed();

		// Rebase this branch onto the given branch
		const rebaseResult = this.rebaseBranch(this, branch, upTo);
		if (rebaseResult === undefined) {
			return undefined;
		}

		// The net change to this branch is provided by the `rebaseBranch` API
		const { newSourceHead, commits } = rebaseResult;
		const { deletedSourceCommits, targetCommits, sourceCommits } = commits;

		// It's possible that the target branch already contained some of the commits that
		// were on this branch. When that's the case, we adopt the commit objects from the target branch.
		// Because of that, we need to make sure that any revertibles that were based on the old commit objects
		// now point to the new object that were adopted from the target branch.
		for (const targetCommit of targetCommits) {
			this.updateRevertibleCommit(targetCommit);
		}

		const newCommits = targetCommits.concat(sourceCommits);
		if (this.isTransacting()) {
			const src = targetCommits[0].parent?.revision;
			const dst = targetCommits[targetCommits.length - 1].revision;
			if (src !== undefined && dst !== undefined) {
				this.initialTransactionRevToRebasedRev.set(src, dst);
			}
		}
		const changeEvent = {
			type: "replace",
			get change() {
				const change = rebaseResult.sourceChange;
				return change === undefined ? undefined : makeAnonChange(change);
			},
			removedCommits: deletedSourceCommits,
			newCommits,
		} as const;
		this.emit("beforeChange", changeEvent);
		this.head = newSourceHead;

		// update revertible commits that have been rebased
		sourceCommits.forEach((commit) => {
			this.updateRevertibleCommit(commit);
		});

		this.emit("afterChange", changeEvent);
		return rebaseResult;
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
		const sourceCommits = rebaseResult.commits.sourceCommits;
		const change = this.changeFamily.rebaser.compose(sourceCommits);
		const taggedChange = makeAnonChange(change);
		const changeEvent = {
			type: "append",
			get change(): TaggedChange<TChange> {
				return taggedChange;
			},
			newCommits: sourceCommits,
		} as const;

		this.emit("beforeChange", changeEvent);
		this.head = rebaseResult.newSourceHead;
		this.emit("afterChange", changeEvent);
		return [change, sourceCommits];
	}

	/** Rebase `branchHead` onto `onto`, but return undefined if nothing changed */
	private rebaseBranch(
		branch: SharedTreeBranch<TEditor, TChange>,
		onto: SharedTreeBranch<TEditor, TChange>,
		upTo = onto.getHead(),
	) {
		const { head } = branch;
		if (head === upTo) {
			return undefined;
		}

		const rebaseResult = rebaseBranch(
			this.mintRevisionTag,
			this.changeFamily.rebaser,
			head,
			upTo,
			onto.getHead(),
		);
		if (this.head === rebaseResult.newSourceHead) {
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

		this.purgeRevertibles();
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
