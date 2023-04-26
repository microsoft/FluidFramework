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
} from "../core";
import { EventEmitter } from "../events";
import { TransactionResult } from "../util";
import { TransactionStack } from "./transactionStack";

/**
 * The events emitted by a `SharedTreeBranch`
 */
export interface SharedTreeBranchEvents<TEditor extends ChangeFamilyEditor, TChange> {
	/**
	 * Fired anytime the head of this branch changes.
	 * @param change - the cumulative change to this branch's state.
	 * This may be a composition of changes from multiple commits at once (e.g. after a rebase or merge).
	 */
	change(change: TChange): void;

	/**
	 * Fired when this branch forks
	 * @param fork - the new branch that forked off of this branch
	 */
	fork(fork: SharedTreeBranch<TEditor, TChange>): void;

	/**
	 * Fired after this branch is rebased
	 */
	rebase(): void;

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
	 * @param sessionId - the session ID used to author commits made by this branch
	 * @param rebaser - the rebaser used for rebasing and merging commits across branches
	 * @param changeFamily - determines the set of changes that this branch can commit
	 * @param undoRedoManager - the undo/redo manager used to track undoable commits
	 * @param anchors - an optional set of anchors that this branch will rebase whenever the branch head changes
	 */
	public constructor(
		private head: GraphCommit<TChange>,
		private readonly sessionId: string,
		public readonly changeFamily: ChangeFamily<TEditor, TChange>,
		public undoRedoManager: UndoRedoManager<TChange, TEditor>,
		private readonly anchors?: AnchorSet,
	) {
		super();
		this.editor = this.changeFamily.buildEditor(
			(change) => this.applyChange(change),
			new AnchorSet(), // This branch class handles the anchor rebasing, so we don't want the editor to do any rebasing; so pass it a dummy anchor set.
		);
	}

	private applyChange(change: TChange, isUndoRedoCommit?: UndoRedoManagerCommitType): void {
		this.assertNotDisposed();
		const revision = mintRevisionTag();
		this.head = mintCommit(this.head, {
			revision,
			sessionId: this.sessionId,
			change,
		});

		const delta = this.changeFamily.intoDelta(change);
		this.transactions.repairStore?.capture(delta, this.head.revision);

		// If this is not part of a transaction, add it to the undo commit tree
		if (!this.isTransacting()) {
			this.undoRedoManager.trackCommit(this.head, isUndoRedoCommit);
		}

		this.emitAndRebaseAnchors(change);
	}

	/**
	 * @returns the commit at the head of this branch.
	 */
	public getHead(): GraphCommit<TChange> {
		return this.head;
	}

	public startTransaction(repairStore?: RepairDataStore): void {
		this.assertNotDisposed();
		if (!this.isTransacting()) {
			// If this is the start of a transaction stack, freeze the undo redo manager's
			// repair data store provider so that repair data can be captured based on the
			// state of the branch at the start of the transaction.
			this.undoRedoManager.repairDataStoreProvider.freeze();
		}
		this.transactions.push(this.head.revision, repairStore);
		this.editor.enterTransaction();
	}

	public commitTransaction(): TransactionResult.Commit {
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
				sessionId: this.sessionId,
				change,
			});

			// If this transaction is not nested, add it to the undo commit tree
			if (!this.isTransacting()) {
				this.undoRedoManager.trackCommit(this.head);
			}

			// If there is still an ongoing transaction (because this transaction was nested inside of an outer transaction)
			// then update the repair data store for that transaction
			this.transactions.repairStore?.capture(
				this.changeFamily.intoDelta(change),
				this.head.revision,
			);
		}
		return TransactionResult.Commit;
	}

	public abortTransaction(): TransactionResult.Abort {
		this.assertNotDisposed();
		const [startCommit, commits, repairStore] = this.popTransaction();
		this.editor.exitTransaction();
		this.head = startCommit;
		const inverses: TaggedChange<TChange>[] = [];
		for (let i = commits.length - 1; i >= 0; i--) {
			const inverse = this.changeFamily.rebaser.invert(commits[i], false, repairStore);
			inverses.push(tagChange(inverse, mintRevisionTag()));
		}
		this.emitAndRebaseAnchors(inverses);
		return TransactionResult.Abort;
	}

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
	 * Undoes the last completed transaction made by the client.
	 * It is invalid to call it while a transaction is open (this will be supported in the future).
	 */
	public undo(): void {
		// TODO: allow this once it becomes possible to compose the changesets created by edits made
		// within transactions and edits that represent completed transactions.
		assert(!this.isTransacting(), 0x66a /* Undo is not yet supported during transactions */);

		const undoChange = this.undoRedoManager.undo();
		if (undoChange !== undefined) {
			this.applyChange(undoChange, UndoRedoManagerCommitType.Undo);
		}
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
			this.sessionId,
			this.changeFamily,
			this.undoRedoManager.clone(repairDataStoreProvider),
			anchors,
		);
		this.emit("fork", fork);
		return fork;
	}

	/**
	 * Rebase the changes that have been applied to this branch over all the divergent changes in the given branch.
	 * After this operation completes, this branch will be based off of `branch`.
	 * @param branch - the head of the branch to rebase onto
	 * @returns the net change to this branch
	 */
	public rebaseOnto(branch: GraphCommit<TChange>): TChange {
		this.assertNotDisposed();
		// Rebase this branch onto the given branch
		const rebaseResult = this.rebaseBranch(this.head, branch);
		if (rebaseResult === undefined) {
			return this.noChange;
		}

		// The net change to this branch is provided by the `rebaseBranch` API
		const [newHead, change] = rebaseResult;
		this.head = newHead;
		const composedChange = this.emitAndRebaseAnchors(change);
		this.emit("rebase");
		return composedChange;
	}

	/**
	 * Apply all the divergent changes on the given branch to this branch.
	 * @returns the net change to this branch
	 */
	public merge(branch: SharedTreeBranch<TEditor, TChange>): TChange {
		this.assertNotDisposed();
		assert(
			!branch.isTransacting(),
			0x597 /* Branch may not be merged while transaction is in progress */,
		);

		// Rebase the given branch onto this branch
		const rebaseResult = this.rebaseBranch(branch.head, this.head);
		if (rebaseResult === undefined) {
			return this.noChange;
		}

		// Compute the net change to this branch
		const [newHead] = rebaseResult;
		const changes: GraphCommit<TChange>[] = [];
		findAncestor([newHead, changes], (c) => c === this.head);
		this.head = newHead;
		return this.emitAndRebaseAnchors(changes);
	}

	/** Rebase `branchHead` onto `onto`, but return undefined if nothing changed */
	private rebaseBranch(
		branchHead: GraphCommit<TChange>,
		onto: GraphCommit<TChange>,
	): [newSourceHead: GraphCommit<TChange>, sourceChange: TChange] | undefined {
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

	private emitAndRebaseAnchors(change: TChange | TaggedChange<TChange>[]): TChange {
		let composedChange: TChange;
		if (Array.isArray(change)) {
			if (change.length === 0) {
				return this.noChange;
			}
			composedChange = this.changeFamily.rebaser.compose(change);
		} else {
			composedChange = change;
		}

		if (this.anchors !== undefined) {
			this.changeFamily.rebaser.rebaseAnchors(this.anchors, composedChange);
		}

		this.emit("change", composedChange);
		return composedChange;
	}

	private get noChange() {
		return this.changeFamily.rebaser.compose([]);
	}

	private assertNotDisposed(): void {
		assert(!this.disposed, "Branch is disposed");
	}
}
