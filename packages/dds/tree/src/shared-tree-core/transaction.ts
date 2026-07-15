/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { IDisposable, Listenable } from "@fluidframework/core-interfaces";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	diffHistories,
	findAncestor,
	findCommonAncestor,
	mintCommit,
	rebaseBranch,
	tagChange,
	type ChangeFamilyEditor,
	type GraphCommit,
	type RevisionTag,
} from "../core/index.js";
import { getLast, getOrCreate } from "../util/index.js";

import type { SharedTreeBranch, SharedTreeBranchEvents } from "./branch.js";

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
 * @typeParam TOptions - The type of the options passed to {@link Transactor.start | start}.
 */
export interface Transactor<TOptions> {
	/**
	 * Start a new transaction.
	 * @param options - Options controlling how the transaction is committed.
	 * @remarks
	 * If a transaction is already in progress when this new transaction starts, then this transaction will be "nested" inside of it,
	 * i.e. the outer transaction will still be in progress after this new transaction is committed or aborted.
	 */
	start(options?: TOptions): void;
	/**
	 * Close this transaction by squashing its edits and committing them as a single edit.
	 * @remarks If this is the root checkout and there are no ongoing transactions remaining, the squashed edit will be submitted to Fluid.
	 */
	commit(): void;
	/**
	 * Close this transaction and revert the state of the tree to what it was before this transaction began.
	 */
	abort(): void;
	/**
	 * The number of transactions currently in progress, including any nested transactions.
	 * @remarks This is 0 when no transaction is in progress, 1 when a single transaction is in progress, 2 when a transaction is nested inside another, etc.
	 */
	size: number;
	/**
	 * Provides events for changes in transaction progress.
	 */
	events: Listenable<TransactionEvents>;
}

export interface TransactionEvents {
	/**
	 * Raised just after a transaction has begun.
	 * @remarks When this event fires, {@link Transactor.size} will be greater than 0 because the transaction has already begun.
	 */
	started(): void;
	/**
	 * Raised just before a transaction is aborted.
	 * @remarks When this event fires, {@link Transactor.size} will still be greater than 0 because the transaction has not yet ended.
	 */
	aborting(): void;
	/**
	 * Raised just before a transaction is committed.
	 * @remarks When this event fires, {@link Transactor.size} will still be greater than 0 because the transaction has not yet ended.
	 */
	committing(): void;
}

/**
 * Callbacks for transaction lifecycle events.
 * @typeParam TOptions - The type of the options passed to {@link Transactor.start | start}.
 */
export interface Callbacks<TOptions> {
	/**
	 * Called when the current transaction is popped from the {@link TransactionStack | stack}.
	 */
	readonly onPop?: OnPop;
	/**
	 * Called when a nested transaction is pushed onto the {@link TransactionStack | stack}.
	 * @remarks
	 * Transactions may be arbitrarily nested (by {@link TransactionStack.start | start}ing a transaction within a transaction that is already in progress).
	 * The `OnPush` callback for an (outer) transaction may optionally return another `OnPush` callback that is associated with any nested (inner) transaction(s).
	 * In that case, the inner `OnPush` will be called when those inner transactions are pushed and the outer `OnPush` will not be called.
	 * Put another way, a transaction always results in a call to exactly one `OnPush` callback - whichever is closest to the transaction.
	 * The event "bubbles up" to (and no further past) its first registered callback.
	 */
	readonly onPush?: OnPush<TOptions>;
}

/**
 * A function that will be called when a transaction is pushed to the {@link TransactionStack | stack}.
 * @remarks This function may return other functions that will be called when the transaction is popped from the stack or a nested transaction is pushed onto the stack.
 * This function runs just before the transaction begins, so if this is the beginning of an outermost (not nested) transaction then {@link Transactor.size} will be 0 during its execution.
 * @typeParam TOptions - The type of the options passed to {@link Transactor.start | start}.
 * @param options - The options passed to {@link Transactor.start | start}.
 */
export type OnPush<TOptions> = (options?: TOptions) => Callbacks<TOptions> | void;

/**
 * A function that will be called when a transaction is popped from the {@link TransactionStack | stack}.
 * @remarks This function runs just after the transaction ends, so if this is the end of an outermost (not nested) transaction then {@link Transactor.size} will be 0 during its execution.
 * @param result - The result of the transaction.
 */
export type OnPop = (result: TransactionResult) => void;

/**
 * A frame in the transaction stack.
 * @typeParam TOptions - The type of the options passed to {@link Transactor.start | start}.
 */
interface TransactionStackFrame<TOptions> {
	/** The callbacks provided when this transaction frame was pushed onto the stack. */
	readonly callbacks: Callbacks<TOptions>;
}

/**
 * An implementation of {@link Transactor} that uses a stack to manage transactions.
 * @remarks Using a stack allows transactions to nest - i.e. an inner transaction may be started while an outer transaction is already in progress.
 * @typeParam TOptions - The type of the options passed to {@link Transactor.start | start}.
 */
export class TransactionStack<TOptions> implements Transactor<TOptions>, IDisposable {
	readonly #stack: TransactionStackFrame<TOptions>[] = [];
	readonly #onPush?: OnPush<TOptions>;

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
	public constructor(onPush?: OnPush<TOptions>) {
		this.#onPush = onPush;
	}

	public get size(): number {
		this.ensureNotDisposed();
		return this.#stack.length;
	}

	public start(options?: TOptions): void {
		this.ensureNotDisposed();
		const last = getLast(this.#stack);
		const onPushCurrent = last === undefined ? this.#onPush : last.callbacks.onPush;
		const { onPush, onPop } = onPushCurrent?.(options) ?? {};
		this.#stack.push({
			callbacks: { onPop, onPush: onPush ?? onPushCurrent },
		});
		this.#events.emit("started");
	}

	public commit(): void {
		this.ensureNotDisposed();
		if (this.size === 0) {
			throw new UsageError("No transaction to commit");
		}
		this.#events.emit("committing");
		this.#stack.pop()?.callbacks.onPop?.(TransactionResult.Commit);
	}

	public abort(): void {
		this.ensureNotDisposed();
		if (this.size === 0) {
			throw new UsageError("No transaction to abort");
		}
		this.#events.emit("aborting");
		this.#stack.pop()?.callbacks.onPop?.(TransactionResult.Abort);
	}

	public dispose(): void {
		this.ensureNotDisposed();
		while (this.size > 0) {
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
 * A function that will be called when a transaction is popped from the {@link SquashingTransactionStack | stack}.
 * @remarks This function runs just after the transaction ends, so if this is the end of an outermost (not nested) transaction then {@link Transactor.size} will be 0 during its execution.
 * @param result - The result of the transaction.
 * @param viewUpdate - The change that needs to be applied to the view to keep it up-to-date with the branch after the transaction ends.
 * This is needed in asynchronous transactions where new commits have been added to the branch while the transaction was in progress.
 * This will be `undefined` if no such change is necessary.
 */
export type OnPopWithViewUpdate<TChange> = (
	result: TransactionResult,
	viewUpdate: TChange | undefined,
) => void;

/**
 * Informs the caller of {@link ChangeProcessor} what context it should be invoked for.
 * @remarks This is purely a recommendation to the caller of the processor and
 * not a strict rule.
 */
export enum ChangeProcessorApplicability {
	/**
	 * Invoke the processor if no later (outer) instance of this change processor
	 * may be applied to related changes before changes are "visible".
	 *
	 * @remarks
	 * This designation is meant for processors that only need to be applied
	 * once to a set of related changes independent of scope or nesting,
	 * with the understanding that the processor should still be applied no
	 * later than when the changes are "visible" (e.g. committed to a branch).
	 * For example, a processor that removes extraneous information from a
	 * change (e.g. data for nodes that were both created and removed within a
	 * transaction) only needs to be applied once to the squashed change
	 * produced by the outermost transaction.
	 */
	IfOutermost,
	/**
	 * Invoke the processor in all contexts.
	 */
	Always,
}

/**
 * Processes a change altering its representation.
 *
 * @remarks
 * A change processor receives a change and returns a change with the
 * same observable effect but otherwise transformed.
 *
 * Currently this is the internal counterpart of the type-erased post-processor
 * exposed on the public transaction API. The public boundary type-erases this
 * (see the conversion helpers in the `shared-tree` layer) so that its internal
 * change representation does not leak into the public API.
 */
export interface ChangeProcessor<TChange> {
	/**
	 * Informs what context it should be invoked for.
	 */
	readonly applicability: ChangeProcessorApplicability;
	/**
	 * Processes the given change, returning a change with the same observable effect.
	 */
	readonly processChange: (change: TChange) => TChange;
}

/**
 * Options for {@link Transactor.start | starting} a transaction.
 */
export interface SquashingTransactionOptions<TChange> {
	/**
	 * An optional {@link ChangeProcessor} applied to the squashed change produced when a transaction that was started
	 * with this option is committed.
	 *
	 * @remarks
	 * When omitted, the transaction's edits are squashed without any post-processing.
	 *
	 * How often the processor is invoked across nested transactions is governed by its
	 * {@link ChangeProcessor.applicability | applicability}.
	 */
	readonly postProcessor?: ChangeProcessor<TChange>;
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
> extends TransactionStack<SquashingTransactionOptions<TChange>> {
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
	 * @param onPush - A function that will be called when a transaction is pushed to the {@link TransactionStack | stack}.
	 * @remarks To post-process the squashed change produced when a transaction is committed (for example, to "minimize"
	 * it so that it contains no extraneous information), start the transaction with a
	 * {@link SquashingTransactionOptions.postProcessor | post-processor}. The post-processor is injected via the transaction
	 * options rather than baked into this stack, so different transactions may supply different post-processors (or none).
	 */
	public constructor(
		public readonly branch: SharedTreeBranch<TEditor, TChange>,
		mintRevisionTag: () => RevisionTag,
		onPush?: () => OnPopWithViewUpdate<TChange> | void,
	) {
		// A stack of the post-processors to apply when each in-progress transaction commits, ordered from outermost to
		// innermost. Each in-progress transaction contributes exactly one entry: either the processor to apply when it
		// commits, or `undefined` when none should be applied.
		const postProcessorStack: (ChangeProcessor<TChange> | undefined)[] = [];
		// Determines the entry to push for a transaction that was started with the given `requested` processor (if any).
		// A processor with "outermost" applicability that is already active in an enclosing transaction resolves to
		// `undefined` so that it is only applied once (at the outermost transaction that supplied it).
		const resolvePostProcessor = (
			requested: ChangeProcessor<TChange> | undefined,
		): ChangeProcessor<TChange> | undefined => {
			if (
				requested?.applicability === ChangeProcessorApplicability.IfOutermost &&
				postProcessorStack.includes(requested)
			) {
				return undefined;
			}
			return requested;
		};

		super(
			// Invoked when an outer transaction starts
			(
				startOptions?: SquashingTransactionOptions<TChange>,
			): Callbacks<SquashingTransactionOptions<TChange>> => {
				postProcessorStack.push(resolvePostProcessor(startOptions?.postProcessor));
				// Keep track of the commit that each transaction was on when it started
				const startHead = this.activeBranch.getHead();
				const rebaser = this.branch.changeFamily.rebaser;
				const outerOnPop = onPush?.();
				let transactionRevision: RevisionTag | undefined;
				const transactionBranch = this.branch.fork(
					startHead,
					// Lazily mint the revision tag for the transaction when it is first needed
					() => (transactionRevision ??= mintRevisionTag()),
				);
				this.setTransactionBranch(transactionBranch);
				transactionBranch.editor.enterTransaction();

				// Invoked when an outer transaction ends
				const onOuterTransactionPop: OnPop = (result) => {
					assert(this.size === 0, 0xcae /* The outer transaction should be ending */);
					const postProcessor = postProcessorStack.pop();
					transactionBranch.editor.exitTransaction();

					const sourcePath: GraphCommit<TChange>[] = [];
					const targetPath: GraphCommit<TChange>[] = [];
					const ancestor = findCommonAncestor(
						[startHead, sourcePath],
						[branch.getHead(), targetPath],
					);
					assert(ancestor !== undefined, 0xcce /* branches must be related */);

					const transactionSteps: GraphCommit<TChange>[] = [];
					findAncestor(
						[transactionBranch.getHead(), transactionSteps],
						(c) => c === startHead,
					);

					let viewUpdate: TChange | undefined;
					switch (result) {
						case TransactionResult.Abort: {
							// When a transaction is aborted, roll back all the transaction's changes on the current branch.
							// It is important that this happens before and separately from updating the view because the `TreeCheckout` needs to
							// revert some internal (state to match what it was before the transaction began) before applying the view update (if any).
							transactionBranch.removeAfter(startHead);
							// If changes were made on `branch` since the transaction began, the view will need to be updated to reflect those changes.
							if (targetPath.length > 0) {
								viewUpdate = diffHistories(
									rebaser,
									startHead,
									this.branch.getHead(),
									mintRevisionTag,
								);
							}
							break;
						}
						case TransactionResult.Commit: {
							if (transactionSteps.length > 0) {
								assert(
									transactionRevision !== undefined,
									0xccf /* Expected transaction revision in the presence of transaction steps */,
								);
								for (const commit of transactionSteps) {
									assert(
										commit.revision === transactionRevision,
										0xcaf /* Unexpected commit in transaction */,
									);
								}
								// Squash all the new commits on the transaction branch into a new commit on the original branch
								const squash = rebaser.compose(transactionSteps);
								// Apply this transaction's post-processor (if any) to the squashed change (for example, to
								// "minimize" it so that it contains no extraneous information).
								const change =
									postProcessor === undefined ? squash : postProcessor.processChange(squash);

								if (change !== squash) {
									// The post-processor produced a change that differs from the
									// one that was applied to the view as the transaction's edits
									// were made. Roll back the transaction's changes on the transaction
									// branch (which rolls back the view) and apply the post-processed
									// change in their place so that the view fully reflects the modified
									// `change`.
									transactionBranch.removeAfter(startHead);
									transactionBranch.apply(tagChange(change, transactionRevision));
								}

								if (targetPath.length === 0) {
									// No changes were made on the original branch since the transaction began
									// The transaction commit can be applied directly
									this.branch.apply(tagChange(change, transactionRevision));
									// The view is already up-to-date so there's nothing more to do
								} else {
									// Some changes were made on `branch` since the transaction began
									const unrebasedHead = mintCommit(startHead, {
										change,
										revision: transactionRevision,
									});
									// We need to rebase the transaction commit on top of the new changes
									const rebased = rebaseBranch(
										mintRevisionTag,
										rebaser,
										unrebasedHead,
										branch.getHead(),
									);
									assert(
										rebased.newSourceHead.revision === transactionRevision,
										0xcd0 /* The transaction commit should be rebased to the tip */,
									);
									this.branch.apply(rebased.newSourceHead);
									viewUpdate = rebased.sourceChange;
								}
							} else {
								if (targetPath.length > 0) {
									// Changes were made on `branch` since the transaction began.
									// The view will need to be updated to reflect those changes.
									viewUpdate = diffHistories(
										rebaser,
										startHead,
										this.branch.getHead(),
										mintRevisionTag,
									);
								}
							}

							break;
						}
						default: {
							unreachableCase(result);
						}
					}
					transactionBranch.dispose();
					this.setTransactionBranch(undefined);
					outerOnPop?.(result, viewUpdate);
				};
				// Invoked when a nested transaction begins
				const onNestedTransactionPush: OnPush<SquashingTransactionOptions<TChange>> = (
					nestedStartOptions,
				) => {
					postProcessorStack.push(resolvePostProcessor(nestedStartOptions?.postProcessor));
					const nestedStartHead = this.activeBranch.getHead();
					const nestedOuterOnPop = onPush?.();
					transactionBranch.editor.enterTransaction();
					return {
						// Invoked when a nested transaction ends
						onPop: (result) => {
							const nestedPostProcessor = postProcessorStack.pop();
							transactionBranch.editor.exitTransaction();
							switch (result) {
								case TransactionResult.Abort: {
									// When a transaction is aborted, roll back all the transaction's changes on the current branch
									transactionBranch.removeAfter(nestedStartHead);
									break;
								}
								case TransactionResult.Commit: {
									// When this nested transaction supplied a post-processor that should be applied here, squash its
									// edits into a single (post-processed) commit on the transaction branch rather than leaving them to
									// be squashed only when the outermost transaction is committed.
									if (nestedPostProcessor !== undefined) {
										const nestedSteps: GraphCommit<TChange>[] = [];
										findAncestor(
											[transactionBranch.getHead(), nestedSteps],
											(c) => c === nestedStartHead,
										);
										if (nestedSteps.length > 0) {
											assert(
												transactionRevision !== undefined,
												0xd07 /* Expected transaction revision in the presence of transaction steps */,
											);
											const squash = rebaser.compose(nestedSteps);
											const processedSquash = nestedPostProcessor.processChange(squash);
											// Roll back the transaction branch to the nested start head and apply the
											// processed change if it differs from the original change.
											if (processedSquash !== squash) {
												transactionBranch.removeAfter(nestedStartHead);
												transactionBranch.apply(
													tagChange(processedSquash, transactionRevision),
												);
											}
										}
									}
									break;
								}
								default: {
									unreachableCase(result);
								}
							}
							nestedOuterOnPop?.(result, undefined);
						},
					};
				};
				return { onPop: onOuterTransactionPop, onPush: onNestedTransactionPush };
			},
		);
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
