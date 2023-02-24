/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { createEmitter, ISubscribable } from "../../events";
import { IndexEvents } from "../../shared-tree-core";
import { ChangeFamily } from "../change-family";
import { findAncestor, GraphCommit, mintCommit, mintRevisionTag, Rebaser } from "../rebase";

/**
 * A view of a `SharedTree`.
 * // TODO better docs
 */
export interface ICheckout<TChange> {
	/**
	 * Apply a change to this checkout. This operation will error if the checkout is disposed.
	 * @param change - the change to apply.
	 */
	applyChange(change: TChange): void;

	/**
	 * Creates a new checkout with the same state as this checkout. However, mutations applied to the new checkout will not
	 * be applied to this checkout. This operation will error if the checkout is disposed.
	 */
	fork(): IForkedCheckout<TChange>;

	/**
	 * Rebases this checkout's state onto the given checkout's state. This operation will error if this checkout is disposed.
	 * @param fork - the checkout to merge into this one. It must have been created by this checkout via `fork()`.
	 * It will be disposed by this operation.
	 */
	merge(fork: IForkedCheckout<TChange>): void;
}

/**
 * TODO: docs
 */
export interface IForkedCheckout<TChange> extends ICheckout<TChange> {
	/**
	 * Retrieve the head of this checkout's commits
	 */
	getBranch(): GraphCommit<TChange>;

	/**
	 * Rebase this checkout's state onto this checkout's `baseCheckout`.
	 * This operation will error if the checkout is disposed.
	 */
	pull(): void;

	/**
	 * Marks this checkout as consumed by a `merge`. Disposed checkouts may not be read or mutated.
	 */
	dispose(): void;

	/**
	 * Whether or not this checkout has been consumed by a `merge` operation.
	 * If true, this checkout can no longer be read or mutated.
	 */
	isDisposed(): boolean;
}

export class ForkedCheckout<TChange, TIndexes> implements IForkedCheckout<TChange> {
	private branch: GraphCommit<TChange>;
	private readonly rebaser: Rebaser<TChange>;
	private readonly indexEventEmitter = createEmitter<IndexEvents<TChange>>();
	private readonly forks = new Set<IForkedCheckout<TChange>>();
	private disposed = false;

	public constructor(
		private readonly getBaseBranch: () => GraphCommit<TChange>,
		public readonly sessionId: string,
		private readonly changeFamily: ChangeFamily<unknown, TChange>,
		private readonly indexes: TIndexes,
		private readonly cloneState: (
			indexes: TIndexes,
			events: ISubscribable<IndexEvents<TChange>>,
		) => TIndexes,
	) {
		this.branch = this.getBaseBranch();
		this.indexes = cloneState(this.indexes, this.indexEventEmitter); // TODO: should probably lazy-clone state at first `applyChange` rather than here
		this.rebaser = new Rebaser(this.changeFamily.rebaser);
	}

	public getBranch(): GraphCommit<TChange> {
		this.assertNotDisposed();
		return this.branch;
	}

	public applyChange(change: TChange): void {
		this.assertNotDisposed();
		this.branch = mintCommit(this.branch, {
			revision: mintRevisionTag(),
			sessionId: this.sessionId,
			change,
		});
		this.indexEventEmitter.emit("newLocalChange", change);
		this.indexEventEmitter.emit("newLocalState", this.changeFamily.intoDelta(change));
	}

	public fork(): IForkedCheckout<TChange> {
		this.assertNotDisposed();
		const fork = new ForkedCheckout(
			() => this.branch,
			this.sessionId,
			this.changeFamily,
			this.indexes,
			this.cloneState,
		);
		this.forks.add(fork);
		return fork;
	}

	public pull(): void {
		this.assertNotDisposed();

		const baseBranch = this.getBaseBranch();
		if (this.branch === baseBranch) {
			// Not necessary for correctness, but skips needless event firing below
			return;
		}

		const [newBranch, change] = this.rebaser.rebaseBranch(this.branch, this.getBaseBranch());
		this.branch = newBranch;
		this.indexEventEmitter.emit("newLocalChange", change);
		this.indexEventEmitter.emit("newLocalState", this.changeFamily.intoDelta(change));
	}

	public merge(fork: IForkedCheckout<TChange>): void {
		assert(this.forks.delete(fork), "Invalid checkout merge");
		this.assertNotDisposed();
		fork.pull();
		const changes: GraphCommit<TChange>[] = [];
		const forkBranch = fork.getBranch();
		fork.dispose();
		const baseBranch = this.getBaseBranch();
		assert(
			findAncestor([forkBranch, changes], (c) => c === baseBranch) !== undefined,
			"Expected merging checkout branches to be related",
		);
		this.branch = forkBranch;
		const change = this.rebaser.changeRebaser.compose(changes);
		this.indexEventEmitter.emit("newLocalChange", change);
		this.indexEventEmitter.emit("newLocalState", this.changeFamily.intoDelta(change));
	}

	public isDisposed(): boolean {
		return this.disposed;
	}

	public dispose(): void {
		this.disposed = true;
		for (const fork of this.forks) {
			fork.dispose();
		}
	}

	private assertNotDisposed(message?: string | number): void {
		assert(!this.isDisposed(), message ?? "Checkout is disposed");
	}
}

/**
 * @alpha
 */
export enum TransactionResult {
	Abort,
	Apply,
}
