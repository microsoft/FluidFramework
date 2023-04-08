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
	mintCommit,
	mintRevisionTag,
	Rebaser,
	RepairDataStore,
} from "../core";
import { EventEmitter } from "../events";
import { TransactionResult } from "../util";
import { TransactionStack } from "./transactionStack";

/**
 * The events emitted by a `SharedTreeBranch`
 */
export interface SharedTreeBranchEvents<TChange> {
	/**
	 * Fired any time the branch has a new change applied to it
	 */
	onChange(change: TChange): void;
}

/**
 * A branch of changes that can be applied to a SharedTree.
 */
export class SharedTreeBranch<TEditor extends ChangeFamilyEditor, TChange> extends EventEmitter<
	SharedTreeBranchEvents<TChange>
> {
	private head: GraphCommit<TChange>;
	public readonly editor: TEditor;
	private readonly transactions = new TransactionStack();
	private readonly forks = new Set<SharedTreeBranch<TEditor, TChange>>();

	/**
	 * @param getBaseBranch - a function which retrieves the head of the base branch
	 * @param mergeIntoBase - a function which describes how to merge this branch into the base branch which created it.
	 * It is responsible for rebasing the changes properly across branches and updating the head of the base branch.
	 * It returns the net change to the child branch.
	 * @param sessionId - the session ID used to author commits made by to this branch
	 * @param rebaser - a rebaser to rebase this branch's changes when it pulls or merges
	 */
	public constructor(
		private readonly getBaseBranch: () => GraphCommit<TChange>,
		private readonly mergeIntoBase: (forked: SharedTreeBranch<TEditor, TChange>) => TChange,
		private readonly sessionId: string,
		private readonly rebaser: Rebaser<TChange>,
		private readonly changeFamily: ChangeFamily<TEditor, TChange>,
		private readonly anchors: AnchorSet,
	) {
		super();
		this.head = getBaseBranch();
		this.editor = this.changeFamily.buildEditor(
			(change) => this.applyChange(change, false),
			anchors,
		);
	}

	public applyChange(change: TChange, rebaseAnchors = true): void {
		const revision = mintRevisionTag();
		this.head = mintCommit(this.head, {
			revision,
			sessionId: this.sessionId,
			change,
		});

		this.transactions.repairStore?.capture(
			this.changeFamily.intoDelta(change),
			this.head.revision,
		);

		if (rebaseAnchors) {
			this.changeFamily.rebaser.rebaseAnchors(this.anchors, change);
		}
		this.emit("onChange", change);
	}

	/**
	 * @returns the commit at the head of this branch.
	 */
	public getHead(): GraphCommit<TChange> {
		return this.head;
	}

	public startTransaction(repairStore?: RepairDataStore): void {
		this.transactions.push(this.head.revision, repairStore);
		this.editor.enterTransaction();
	}

	public commitTransaction(): TransactionResult.Commit {
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
		const [startCommit, commits, repairStore] = this.popTransaction();
		this.editor.exitTransaction();
		this.head = startCommit;
		for (let i = commits.length - 1; i >= 0; i--) {
			const inverse = this.changeFamily.rebaser.invert(commits[i], false, repairStore);
			this.changeFamily.rebaser.rebaseAnchors(this.anchors, inverse);
			this.emit("onChange", inverse);
		}
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
	 * Rebase the changes that have been applied to this branch over all the changes in the base branch that have
	 * occurred since this branch last pulled (or was forked).
	 * @returns the net change to this branch
	 */
	public pull(): TChange {
		const baseBranch = this.getBaseBranch();
		if (this.head === baseBranch) {
			// Not necessary for correctness, but skips needless rebase and event firing below
			return this.rebaser.changeRebaser.compose([]);
		}

		const [newBranch, change] = this.rebaser.rebaseBranch(this.head, baseBranch);
		this.head = newBranch;
		this.changeFamily.rebaser.rebaseAnchors(this.anchors, change);
		this.emit("onChange", change);
		return change;
	}

	/**
	 * Spawn a new branch that is based off of the current state of this branch.
	 * Changes made to the new branch will not be applied to this branch until the new branch is merged back in.
	 */
	public fork(anchors: AnchorSet): SharedTreeBranch<TEditor, TChange> {
		const fork = new SharedTreeBranch(
			() => this.head,
			(forked) => {
				// In this function, `this` is the base and `forked` is the fork being merged in
				const changeToForked = forked.pull();
				assert(
					forked.getBaseBranch() === this.head,
					0x594 /* Expected merging checkout branches to be related */,
				);
				const commits: GraphCommit<TChange>[] = [];
				const ancestor = findAncestor([forked.head, commits], (c) => c === this.head);
				assert(
					ancestor === this.head,
					0x595 /* Expected merging checkout branches to be related */,
				);
				this.head = forked.head;
				assert(this.forks.delete(forked), 0x596 /* Invalid checkout merge */);
				const change = this.rebaser.changeRebaser.compose(commits);
				this.changeFamily.rebaser.rebaseAnchors(this.anchors, change);
				this.emit("onChange", change);
				return changeToForked;
			},
			this.sessionId,
			this.rebaser,
			this.changeFamily,
			anchors,
		);
		this.forks.add(fork);
		return fork;
	}

	/**
	 * Apply all the changes on this branch to the base branch from which it was forked. If the base branch has new
	 * changes since this branch last pulled (or was forked), then this branch's changes will be rebased over those first.
	 * @returns the net change to this branch
	 */
	public merge(): TChange {
		assert(
			this.transactions.size === 0,
			0x597 /* Branch may not be merged while transaction is in progress */,
		);
		const change = this.mergeIntoBase(this);
		this.head = this.getBaseBranch();
		return change;
	}
}
