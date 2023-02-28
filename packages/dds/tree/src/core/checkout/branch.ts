/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { EventEmitter } from "../../events";
import { findAncestor, GraphCommit, mintCommit, mintRevisionTag, Rebaser } from "../rebase";

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
export class SharedTreeBranch<TChange> extends EventEmitter<SharedTreeBranchEvents<TChange>> {
	private head: GraphCommit<TChange>;
	private readonly forks = new Set<SharedTreeBranch<TChange>>();
	private disposed = false;

	/**
	 * @param getBaseBranch - a function which retrieves the head of the base branch
	 * @param mergeIntoBase - a function which describes how to merge this branch into its base branch
	 * @param sessionId - the session ID used to author commits made by to this branch
	 * @param rebaser - a rebaser to rebase this branch's changes when it pulls or merges
	 */
	public constructor(
		private readonly getBaseBranch: () => GraphCommit<TChange>,
		private readonly mergeIntoBase: (forked: SharedTreeBranch<TChange>) => TChange,
		private readonly sessionId: string,
		private readonly rebaser: Rebaser<TChange>,
	) {
		super();
		this.head = getBaseBranch();
	}

	/**
	 * @returns the commit at the head of this branch.
	 */
	public getHead(): GraphCommit<TChange> {
		return this.head;
	}

	/**
	 * Apply the given change to this branch.
	 * Emits an `onChange` event.
	 * @returns the net change to this branch (i.e. `change`)
	 */
	public applyChange(change: TChange): TChange {
		this.assertNotDisposed();
		this.head = mintCommit(this.head, {
			revision: mintRevisionTag(),
			sessionId: this.sessionId,
			change,
		});
		this.emit("onChange", change);
		return change;
	}

	/**
	 * Rebase the changes that have been applied to this branch over all the changes in the base branch that have
	 * occurred since this branch last pulled (or was forked).
	 * @returns the net change to this branch
	 */
	public pull(): TChange {
		this.assertNotDisposed();
		const baseBranch = this.getBaseBranch();
		if (this.head === baseBranch) {
			// Not necessary for correctness, but skips needless rebase and event firing below
			return this.rebaser.changeRebaser.compose([]);
		}

		const [newBranch, change] = this.rebaser.rebaseBranch(this.head, baseBranch);
		this.head = newBranch;
		this.emit("onChange", change);
		return change;
	}

	/**
	 * Spawn a new branch that is based off of the current state of this branch.
	 * Changes made to the new branch will not be applied to this branch until the new branch is merged back in.
	 */
	public fork(): SharedTreeBranch<TChange> {
		this.assertNotDisposed();
		const fork = new SharedTreeBranch(
			() => this.head,
			(forked) => {
				// In this function, `this` is the base and `forked` is the fork being merged in
				const changes: GraphCommit<TChange>[] = [];
				const baseBranch = forked.getBaseBranch();
				assert(
					findAncestor([forked.head, changes], (c) => c === baseBranch) !== undefined,
					"Expected merging checkout branches to be related",
				);
				this.head = forked.head;
				assert(this.forks.delete(forked), "Invalid checkout merge");
				const change = this.rebaser.changeRebaser.compose(changes);
				this.emit("onChange", change);
				return change;
			},
			this.sessionId,
			this.rebaser,
		);
		this.forks.add(fork);
		return fork;
	}

	/**
	 * Apply all the changes on this branch to the base branch from which it was forked. If the base branch has new
	 * changes since this branch last pulled (or was forked), then this branch's changes will be rebased over those first.
	 * After the merge completes, this branch may no longer be forked or mutated.
	 * @returns the net change to this branch
	 */
	public merge(): TChange {
		this.assertNotDisposed();
		const change = this.pull();
		this.mergeIntoBase(this);
		this.dispose();
		return change;
	}

	/**
	 * Whether or not this branch has been merged into its base via `merge()`.
	 * If it has, then it may no longer be forked or mutated.
	 */
	public isMerged(): boolean {
		return this.disposed;
	}

	/**
	 * Dispose this branch and all branches that descend from it (i.e. have been transitively forked).
	 */
	private dispose(): void {
		this.disposed = true;
		for (const fork of this.forks) {
			fork.dispose();
		}
	}

	private assertNotDisposed(message?: string | number): void {
		assert(!this.isMerged(), message ?? "Branch is already merged");
	}
}
