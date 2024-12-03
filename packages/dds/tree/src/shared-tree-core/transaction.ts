/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { IDisposable, Listenable } from "@fluidframework/core-interfaces";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

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
