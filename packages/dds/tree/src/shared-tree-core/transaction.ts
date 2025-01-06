/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { createEmitter } from "@fluid-internal/client-utils";
import type { IDisposable, Listenable } from "@fluidframework/core-interfaces";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	findAncestor,
	type ChangeFamilyEditor,
	type GraphCommit,
	type TaggedChange,
} from "../core/index.js";
import type { SharedTreeBranch, SharedTreeBranchEvents } from "./branch.js";
import { getOrCreate } from "../util/index.js";

/**
 * Describes the result of a transaction.
 * Transactions may either succeed and commit, or fail and abort.
 */
export enum TransactionResult {
	/**
	 * Indicates the transaction failed.
	 */
	Abort,
	/**
	 * Indicates the transaction succeeded.
	 */
	Commit,
}

/**
 * A simple API for managing transactions.
 */
export interface Transactor {
	/**
	 * Start a new transaction.
	 * If a transaction is already in progress when this new transaction starts, then this transaction will be "nested" inside of it,
	 * i.e. the outer transaction will still be in progress after this new transaction is committed or aborted.
	 *
	 * @remarks - Asynchronous transactions are not supported on the root checkout,
	 * since it is always kept up-to-date with the latest remote edits and the results of this rebasing (which might invalidate
	 * the transaction) is not visible to the application author.
	 * Instead,
	 *
	 * 1. fork the root checkout
	 * 2. run the transaction on the fork
	 * 3. merge the fork back into the root checkout
	 *
	 * @privateRemarks - There is currently no enforcement that asynchronous transactions don't happen on the root checkout.
	 * AB#6488 tracks adding some enforcement to make it more clear to application authors that this is not supported.
	 */
	start(): void;
	/**
	 * Close this transaction by squashing its edits and committing them as a single edit.
	 * If this is the root checkout and there are no ongoing transactions remaining, the squashed edit will be submitted to Fluid.
	 */
	commit(): void;
	/**
	 * Close this transaction and revert the state of the tree to what it was before this transaction began.
	 */
	abort(): void;
	/**
	 * True if there is at least one transaction currently in progress on this view, otherwise false.
	 */
	isInProgress(): boolean;
	/**
	 * Provides events for changes in transaction progress.
	 */
	events: Listenable<TransactionEvents>;
}

export interface TransactionEvents {
	/**
	 * Raised just after a transaction has begun.
	 * @remarks When this event fires, {@link Transactor.isInProgress} will be true because the transaction has already begun.
	 */
	started(): void;
	/**
	 * Raised just before a transaction is aborted.
	 * @remarks When this event fires, {@link Transactor.isInProgress} will still be true because the transaction has not yet ended.
	 */
	aborting(): void;
	/**
	 * Raised just before a transaction is committed.
	 * @remarks When this event fires, {@link Transactor.isInProgress} will still be true because the transaction has not yet ended.
	 */
	committing(): void;
}

/**
 * A function that will be called when a transaction is pushed to the {@link TransactionStack | stack}.
 * @remarks This function may return {@link OnPop | its complement} - another function that will be called when the transaction is popped from the stack.
 * This function runs just before the transaction begins, so if this is the beginning of an outermost (not nested) transaction then {@link Transactor.isInProgress} will be false during its execution.
 */
export type OnPush = () => OnPop | void;

/**
 * A function that will be called when a transaction is popped from the {@link TransactionStack | stack}.
 * @remarks This function runs just after the transaction ends, so if this is the end of an outermost (not nested) transaction then {@link Transactor.isInProgress} will be false during its execution.
 */
export type OnPop = (result: TransactionResult) => void;

/**
 * An implementation of {@link Transactor} that uses a stack to manage transactions.
 * @remarks Using a stack allows transactions to nest - i.e. an inner transaction may be started while an outer transaction is already in progress.
 */
export class TransactionStack implements Transactor, IDisposable {
	readonly #stack: (OnPop | void)[] = [];
	readonly #onPush?: () => OnPop | void;

	readonly #events = createEmitter<TransactionEvents>();
	public get events(): Listenable<TransactionEvents> {
		return this.#events;
	}

	#disposed = false;
	public get disposed(): boolean {
		return this.#disposed;
	}

	/**
	 * Construct a new {@link TransactionStack}.
	 * @param onPush - A {@link OnPush | function} that will be called when a transaction begins.
	 */
	public constructor(onPush?: () => OnPop | void) {
		this.#onPush = onPush;
	}

	public isInProgress(): boolean {
		this.ensureNotDisposed();
		return this.#stack.length > 0;
	}

	public start(): void {
		this.ensureNotDisposed();
		this.#stack.push(this.#onPush?.());
		this.#events.emit("started");
	}

	public commit(): void {
		this.ensureNotDisposed();
		if (!this.isInProgress()) {
			throw new UsageError("No transaction to commit");
		}
		this.#events.emit("committing");
		this.#stack.pop()?.(TransactionResult.Commit);
	}

	public abort(): void {
		this.ensureNotDisposed();
		if (!this.isInProgress()) {
			throw new UsageError("No transaction to abort");
		}
		this.#events.emit("aborting");
		this.#stack.pop()?.(TransactionResult.Abort);
	}

	public dispose(): void {
		this.ensureNotDisposed();
		while (this.isInProgress()) {
			this.abort();
		}
		this.#disposed = true;
	}

	private ensureNotDisposed(): void {
		if (this.disposed) {
			throw new UsageError("Transactor is disposed");
		}
	}
}

/**
 * An implementation of {@link Transactor} that {@link TransactionStack | uses a stack} and a {@link SharedTreeBranch | branch} to manage transactions.
 * @remarks Given a branch, this class will fork the branch when a transaction begins and squash the forked branch back into the original branch when the transaction ends.
 * This class provides conveniences for interacting with the {@link SquashingTransactionStack.activeBranch | active branch} in a way that is stable across transaction boundaries.
 * For example, see {@link SquashingTransactionStack.activeBranchEditor | activeBranchEditor} and {@link SquashingTransactionStack.activeBranchEvents | activeBranchEvents}.
 */
export class SquashingTransactionStack<
	TEditor extends ChangeFamilyEditor,
	TChange,
> extends TransactionStack {
	public readonly branch: SharedTreeBranch<TEditor, TChange>;
	#transactionBranch?: SharedTreeBranch<TEditor, TChange>;

	/**
	 * An editor for whichever branch is currently the {@link SquashingTransactionStack.activeBranch | active branch}.
	 * @remarks This editor can safely be held on to across transaction boundaries, as it will properly delegate to the correct branch.
	 * In contrast, it is not safe to hold onto e.g. `activeBranch.editor` across transaction boundaries, since the active branch may change.
	 */
	public readonly activeBranchEditor = new Proxy<TEditor>({} as unknown as TEditor, {
		get: (_, p, receiver) => {
			return Reflect.get(this.activeBranch.editor, p, receiver);
		},
	});

	/**
	 * Get the "active branch" for this transactor - either the transaction branch if a transaction is in progress, or the original branch otherwise.
	 */
	public get activeBranch(): SharedTreeBranch<TEditor, TChange> {
		return this.#transactionBranch ?? this.branch;
	}

	/**
	 * Provides events for changes in the {@link SquashingTransactionStack.activeBranch | active branch}.
	 * @remarks When the active branch changes, the listeners for these events will automatically be transferred to the new active branch.
	 * In contrast, binding an event to the {@link SquashingTransactionStack.activeBranch | active branch} directly will not automatically transfer the listener when the active branch changes.
	 */
	public get activeBranchEvents(): Listenable<SharedTreeBranchEvents<TEditor, TChange>> {
		const off = (
			eventName: keyof SharedTreeBranchEvents<TEditor, TChange>,
			listener: SharedTreeBranchEvents<TEditor, TChange>[typeof eventName],
		): void => {
			this.activeBranch.events.off(eventName, listener);
			const listeners = this.#activeBranchEvents.get(eventName);
			if (listeners?.delete(listener) === true && listeners.size === 0) {
				this.#activeBranchEvents.delete(eventName);
			}
		};

		return {
			on: (eventName, listener) => {
				const listeners = getOrCreate(this.#activeBranchEvents, eventName, () => new Set());
				listeners.add(listener);
				this.activeBranch.events.on(eventName, listener);
				return () => off(eventName, listener);
			},
			off,
		};
	}
	readonly #activeBranchEvents = new Map<
		keyof SharedTreeBranchEvents<TEditor, TChange>,
		Set<
			SharedTreeBranchEvents<TEditor, TChange>[keyof SharedTreeBranchEvents<TEditor, TChange>]
		>
	>();

	/**
	 * Construct a new {@link SquashingTransactionStack}.
	 * @param branch - The {@link SquashingTransactionStack.branch | branch} that will be forked off of when a transaction begins.
	 * @param squash - Called once when the outer-most transaction is committed to produce a single squashed change from the transaction's commits.
	 * The change will be applied to the original {@link SquashingTransactionStack.branch | branch}.
	 * @param onPush - {@link OnPush | A function} that will be called when a transaction is pushed to the {@link TransactionStack | stack}.
	 */
	public constructor(
		branch: SharedTreeBranch<TEditor, TChange>,
		squash: (commits: GraphCommit<TChange>[]) => TaggedChange<TChange>,
		onPush?: OnPush,
	) {
		super(() => {
			// Keep track of the commit that each transaction was on when it started
			// TODO:#8603: This may need to be computed differently if we allow rebasing during a transaction.
			const startHead = this.activeBranch.getHead();
			const onPop = onPush?.();
			const transactionBranch = this.#transactionBranch ?? this.branch.fork();
			this.setTransactionBranch(transactionBranch);
			transactionBranch.editor.enterTransaction();
			return (result) => {
				assert(this.#transactionBranch !== undefined, 0xa98 /* Expected transaction branch */);
				this.#transactionBranch.editor.exitTransaction();
				switch (result) {
					case TransactionResult.Abort:
						// When a transaction is aborted, roll back all the transaction's changes on the current branch
						this.#transactionBranch.removeAfter(startHead);
						break;
					case TransactionResult.Commit:
						// If this was the outermost transaction closing...
						if (!this.isInProgress()) {
							if (this.#transactionBranch.getHead() !== startHead) {
								// ...squash all the new commits on the transaction branch into a new commit on the original branch
								const removedCommits: GraphCommit<TChange>[] = [];
								findAncestor(
									[this.#transactionBranch.getHead(), removedCommits],
									(c) => c === startHead,
								);
								branch.apply(squash(removedCommits));
							}
						}
						break;
					default:
						unreachableCase(result);
				}
				if (!this.isInProgress()) {
					this.#transactionBranch.dispose();
					this.setTransactionBranch(undefined);
				}
				onPop?.(result);
			};
		});

		this.branch = branch;
	}

	/** Updates the transaction branch (and therefore the active branch) and rebinds the branch events. */
	private setTransactionBranch(
		transactionBranch: SharedTreeBranch<TEditor, TChange> | undefined,
	): void {
		const oldActiveBranch = this.activeBranch;
		this.#transactionBranch = transactionBranch;
		for (const [eventName, listeners] of this.#activeBranchEvents) {
			for (const listener of listeners) {
				oldActiveBranch.events.off(eventName, listener);
				this.activeBranch.events.on(eventName, listener);
			}
		}
	}
}
