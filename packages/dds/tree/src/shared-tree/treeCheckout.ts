/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import { IIdCompressor } from "@fluidframework/id-compressor";
import {
	AnchorLocator,
	IForestSubscription,
	AnchorSetRootEvents,
	Anchor,
	AnchorNode,
	AnchorSet,
	IEditableForest,
	TreeStoredSchemaRepository,
	combineVisitors,
	visitDelta,
	DetachedFieldIndex,
	makeDetachedFieldIndex,
	Revertible,
	ChangeFamily,
	tagChange,
	TreeStoredSchema,
	TreeStoredSchemaSubscription,
	JsonableTree,
	RevisionTagCodec,
	DeltaVisitor,
} from "../core/index.js";
import { HasListeners, IEmitter, ISubscribable, createEmitter } from "../events/index.js";
import {
	buildForest,
	intoDelta,
	FieldBatchCodec,
	jsonableTreeFromCursor,
	makeFieldBatchCodec,
	TreeCompressionStrategy,
} from "../feature-libraries/index.js";
import { SharedTreeBranch, getChangeReplaceType } from "../shared-tree-core/index.js";
import { TransactionResult, fail } from "../util/index.js";
import { noopValidator } from "../codec/index.js";
import { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import { SharedTreeChangeFamily } from "./sharedTreeChangeFamily.js";
import { ISharedTreeEditor, SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";

/**
 * Events for {@link ITreeCheckout}.
 * @internal
 */
export interface CheckoutEvents {
	/**
	 * A batch of changes has finished processing and the view is in a consistent state.
	 * It is once again safe to access the EditableTree, Forest and AnchorSet.
	 *
	 * @remarks
	 * This is mainly useful for knowing when to do followup work scheduled during events from Anchors.
	 */
	afterBatch(): void;

	/**
	 * Fired when a revertible change has been made to this view.
	 *
	 * Applications which subscribe to this event are expected to revert or discard revertibles they acquire (failure to do so will leak memory).
	 * The provided revertible is inherently bound to the view that raised the event, calling `revert` won't apply to forked views.
	 *
	 * @param revertible - The revertible that can be used to revert the change.
	 */
	newRevertible(revertible: Revertible): void;

	/**
	 * Fired when a revertible is either reverted or discarded.
	 *
	 * This event can be used to maintain a list or set of active revertibles.
	 * @param revertible - The revertible that was disposed.
	 * This revertible was previously passed to the `newRevertible` event.
	 * Calling `discard` on this revertible is not necessary but is safe to do.
	 */
	revertibleDisposed(revertible: Revertible): void;
}

/**
 * Provides a means for interacting with a SharedTree.
 * This includes reading data from the tree and running transactions to mutate the tree.
 * @remarks This interface should not have any implementations other than those provided by the SharedTree package libraries.
 * @privateRemarks
 * API for interacting with a {@link SharedTreeBranch}.
 * Implementations of this interface must implement the {@link branchKey} property.
 * @internal
 */
export interface ITreeCheckout extends AnchorLocator {
	/**
	 * Read and Write access for schema stored in the document.
	 *
	 * These APIs are temporary and will be replaced with different abstractions (View Schema based) in a different place later.
	 *
	 * TODO:
	 * Editing of this should be moved into transactions with the rest of tree editing to they can be intermixed.
	 * This will be done after the relations between views, branches and Indexes are figured out.
	 *
	 * TODO:
	 * Public APIs for dealing with schema should be in terms of View Schema, and schema update policies.
	 * The actual stored schema should be hidden (or ar least not be the most prominent way to interact with schema).
	 *
	 * TODO:
	 * Something should ensure the document contents are always in schema.
	 */
	readonly storedSchema: TreeStoredSchemaSubscription;
	/**
	 * Current contents.
	 * Updated by edits (local and remote).
	 * Use `editor` to create a local edit.
	 */
	readonly forest: IForestSubscription;

	/**
	 * Used to edit the state of the tree. Edits will be immediately applied locally to the tree.
	 * If there is no transaction currently ongoing, then the edits will be submitted to Fluid immediately as well.
	 */
	readonly editor: ISharedTreeEditor;

	/**
	 * A collection of functions for managing transactions.
	 */
	readonly transaction: ITransaction;

	/**
	 * Spawn a new view which is based off of the current state of this view.
	 * Any mutations of the new view will not apply to this view until the new view is merged back into this view via `merge()`.
	 */
	fork(): ITreeCheckoutFork;

	/**
	 * Apply all the new changes on the given view to this view.
	 * @param view - a view which was created by a call to `fork()`.
	 * It is automatically disposed after the merge completes.
	 * @remarks All ongoing transactions (if any) in `view` will be committed before the merge.
	 */
	merge(view: ITreeCheckoutFork): void;

	/**
	 * Apply all the new changes on the given view to this view.
	 * @param view - a view which was created by a call to `fork()`.
	 * @param disposeView - whether or not to dispose `view` after the merge completes.
	 * @remarks All ongoing transactions (if any) in `view` will be committed before the merge.
	 */
	merge(view: ITreeCheckoutFork, disposeView: boolean): void;

	/**
	 * Rebase the given view onto this view.
	 * @param view - a view which was created by a call to `fork()`. It is modified by this operation.
	 */
	rebase(view: ITreeCheckoutFork): void;

	/**
	 * Replaces all schema with the provided schema.
	 * Can over-write preexisting schema, and removes unmentioned schema.
	 */
	updateSchema(newSchema: TreeStoredSchema): void;

	/**
	 * Events about this view.
	 */
	readonly events: ISubscribable<CheckoutEvents>;

	/**
	 * Events about the root of the tree in this view.
	 */
	readonly rootEvents: ISubscribable<AnchorSetRootEvents>;

	/**
	 * Returns a JsonableTree for each tree that was removed from (and not restored to) the document.
	 * This list is guaranteed to contain all nodes that are recoverable through undo/redo on this checkout.
	 * The list may also contain additional nodes.
	 *
	 * This is only intended for use in testing and exceptional code paths: it is not performant.
	 */
	getRemovedRoots(): [string | number | undefined, number, JsonableTree][];
}

/**
 * Creates a {@link TreeCheckout}.
 * @param args - an object containing optional components that will be used to build the view.
 * Any components not provided will be created by default.
 * @remarks This does not create a {@link SharedTree}, but rather a view with the minimal state
 * and functionality required to implement {@link ITreeCheckout}.
 */
export function createTreeCheckout(
	idCompressor: IIdCompressor,
	revisionTagCodec: RevisionTagCodec,
	args?: {
		branch?: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>;
		changeFamily?: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>;
		schema?: TreeStoredSchemaRepository;
		forest?: IEditableForest;
		fieldBatchCodec?: FieldBatchCodec;
		events?: ISubscribable<CheckoutEvents> &
			IEmitter<CheckoutEvents> &
			HasListeners<CheckoutEvents>;
		removedRoots?: DetachedFieldIndex;
		chunkCompressionStrategy?: TreeCompressionStrategy;
	},
): TreeCheckout {
	const forest = args?.forest ?? buildForest();
	const schema = args?.schema ?? new TreeStoredSchemaRepository();
	const defaultCodecOptions = { jsonValidator: noopValidator };
	const changeFamily =
		args?.changeFamily ??
		new SharedTreeChangeFamily(
			revisionTagCodec,
			args?.fieldBatchCodec ?? makeFieldBatchCodec(defaultCodecOptions),
			{ jsonValidator: noopValidator },
			args?.chunkCompressionStrategy,
		);
	const branch =
		args?.branch ??
		new SharedTreeBranch(
			{
				change: changeFamily.rebaser.compose([]),
				revision: "root",
			},
			changeFamily,
			() => idCompressor.generateCompressedId(),
		);
	const events = args?.events ?? createEmitter();

	const transaction = new Transaction(branch);

	return new TreeCheckout(
		transaction,
		branch,
		changeFamily,
		schema,
		forest,
		events,
		revisionTagCodec,
		args?.removedRoots,
	);
}

/**
 * A collection of functions for managing transactions.
 * Transactions allow edits to be batched into atomic units.
 * Edits made during a transaction will update the local state of the tree immediately, but will be squashed into a single edit when the transaction is committed.
 * If the transaction is aborted, the local state will be reset to what it was before the transaction began.
 * Transactions may nest, meaning that a transaction may be started while a transaction is already ongoing.
 *
 * To avoid updating observers of the view state with intermediate results during a transaction,
 * use {@link ITreeCheckout#fork} and {@link ISharedTreeFork#merge}.
 * @internal
 */
export interface ITransaction {
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
	commit(): TransactionResult.Commit;
	/**
	 * Close this transaction and revert the state of the tree to what it was before this transaction began.
	 */
	abort(): TransactionResult.Abort;
	/**
	 * True if there is at least one transaction currently in progress on this view, otherwise false.
	 */
	inProgress(): boolean;
}

class Transaction implements ITransaction {
	public constructor(
		private readonly branch: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
	) {}

	public start(): void {
		this.branch.startTransaction();
		this.branch.editor.enterTransaction();
	}
	public commit(): TransactionResult.Commit {
		this.branch.commitTransaction();
		this.branch.editor.exitTransaction();
		return TransactionResult.Commit;
	}
	public abort(): TransactionResult.Abort {
		this.branch.abortTransaction();
		this.branch.editor.exitTransaction();
		return TransactionResult.Abort;
	}
	public inProgress(): boolean {
		return this.branch.isTransacting();
	}
}

/**
 * Branch (like in a version control system) of SharedTree.
 *
 * {@link ITreeCheckout} that has forked off of the main trunk/branch.
 * @internal
 */
export interface ITreeCheckoutFork extends ITreeCheckout {
	/**
	 * Rebase the changes that have been applied to this view over all the new changes in the given view.
	 * @param view - Either the root view or a view that was created by a call to `fork()`. It is not modified by this operation.
	 */
	rebaseOnto(view: ITreeCheckout): void;
}

/**
 * An implementation of {@link ITreeCheckoutFork}.
 */
export class TreeCheckout implements ITreeCheckoutFork {
	public constructor(
		public readonly transaction: ITransaction,
		private readonly branch: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
		private readonly changeFamily: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>,
		public readonly storedSchema: TreeStoredSchemaRepository,
		public readonly forest: IEditableForest,
		public readonly events: ISubscribable<CheckoutEvents> &
			IEmitter<CheckoutEvents> &
			HasListeners<CheckoutEvents>,
		private readonly revisionTagCodec: RevisionTagCodec,
		private readonly removedRoots: DetachedFieldIndex = makeDetachedFieldIndex(
			"repair",
			revisionTagCodec,
		),
	) {
		// We subscribe to `beforeChange` rather than `afterChange` here because it's possible that the change is invalid WRT our forest.
		// For example, a bug in the editor might produce a malformed change object and thus applying the change to the forest will throw an error.
		// In such a case we will crash here, preventing the change from being added to the commit graph, and preventing `afterChange` from firing.
		// One important consequence of this is that we will not submit the op containing the invalid change, since op submissions happens in response to `afterChange`.
		branch.on("beforeChange", (event) => {
			if (event.change !== undefined) {
				// Conflicts due to schema will be empty and thus are not applied.
				for (const change of event.change.change.changes) {
					if (change.type === "data") {
						const delta = intoDelta(
							tagChange(change.innerChange, event.change.revision),
						);
						this.withCombinedVisitor((visitor) => {
							visitDelta(delta, visitor, this.removedRoots);
						});
					} else if (change.type === "schema") {
						// We purge all removed content because the schema change may render that repair data invalid.
						// This happens on all peers that receive the schema change.
						// Note that while the originator of the schema change could theoretically validate/update the
						// repair data that it has, so that is it guaranteed to be valid with the new schema, we cannot
						// guarantee that the originator has a superset of the repair data that other clients have.
						// This means the originator cannot guarantee that the repair data on all peers is valid for
						// the new schema.
						this.purgeRemovedRoots();
						storedSchema.apply(change.innerChange.schema.new);
					} else {
						fail("Unknown Shared Tree change type.");
					}
				}
				this.events.emit("afterBatch");
			}
			if (event.type === "replace" && getChangeReplaceType(event) === "transactionCommit") {
				const transactionRevision = event.newCommits[0].revision;
				for (const transactionStep of event.removedCommits) {
					this.removedRoots.updateMajor(transactionStep.revision, transactionRevision);
				}
			}
		});
		branch.on("newRevertible", (revertible) => {
			this.events.emit("newRevertible", revertible);
		});
		branch.on("revertibleDisposed", (revertible, revision) => {
			// We do not expose the revision in this API
			this.events.emit("revertibleDisposed", revertible);
		});
	}

	private withCombinedVisitor(fn: (visitor: DeltaVisitor) => void): void {
		const anchorVisitor = this.forest.anchors.acquireVisitor();
		const combinedVisitor = combineVisitors(
			[this.forest.acquireVisitor(), anchorVisitor],
			[anchorVisitor],
		);
		fn(combinedVisitor);
		combinedVisitor.free();
	}

	private purgeRemovedRoots() {
		// Revertibles are susceptible to use repair data so we purge them.
		this.branch.purgeRevertibles();
		this.withCombinedVisitor((visitor) => {
			for (const { root } of this.removedRoots.entries()) {
				const field = this.removedRoots.toFieldKey(root);
				// TODO:AD5509 Handle arbitrary-length fields once the storage of removed roots is no longer atomized.
				visitor.destroy(field, 1);
			}
		});
		this.removedRoots.purge();
	}

	public get rootEvents(): ISubscribable<AnchorSetRootEvents> {
		return this.forest.anchors;
	}

	public get editor(): ISharedTreeEditor {
		return this.branch.editor;
	}

	public locate(anchor: Anchor): AnchorNode | undefined {
		return this.forest.anchors.locate(anchor);
	}

	public fork(): TreeCheckout {
		const anchors = new AnchorSet();
		const branch = this.branch.fork();
		const storedSchema = this.storedSchema.clone();
		const forest = this.forest.clone(storedSchema, anchors);
		const transaction = new Transaction(branch);
		return new TreeCheckout(
			transaction,
			branch,
			this.changeFamily,
			storedSchema,
			forest,
			createEmitter(),
			this.revisionTagCodec,
			this.removedRoots.clone(),
		);
	}

	public rebase(view: TreeCheckout): void {
		view.branch.rebaseOnto(this.branch);
	}

	public rebaseOnto(view: ITreeCheckout): void {
		view.rebase(this);
	}

	public merge(view: TreeCheckout): void;
	public merge(view: TreeCheckout, disposeView: boolean): void;
	public merge(view: TreeCheckout, disposeView = true): void {
		assert(
			!this.transaction.inProgress() || disposeView,
			0x710 /* A view that is merged into an in-progress transaction must be disposed */,
		);
		while (view.transaction.inProgress()) {
			view.transaction.commit();
		}
		this.branch.merge(view.branch);
		if (disposeView) {
			view.dispose();
		}
	}

	public updateSchema(newSchema: TreeStoredSchema): void {
		this.editor.schema.setStoredSchema(this.storedSchema.clone(), newSchema);
	}

	/**
	 * Dispose this view, freezing its state and allowing the SharedTree to release resources required by it.
	 * Attempts to further mutate or dispose this view will error.
	 */
	public dispose(): void {
		this.branch.dispose();
	}

	public getRemovedRoots(): [string | number | undefined, number, JsonableTree][] {
		const trees: [string | number | undefined, number, JsonableTree][] = [];
		const cursor = this.forest.allocateCursor();
		for (const { rangeId, root } of this.removedRoots.entries()) {
			const parentField = this.removedRoots.toFieldKey(root);
			this.forest.moveCursorToPath(
				{ parent: undefined, parentField, parentIndex: 0 },
				cursor,
			);
			const tree = jsonableTreeFromCursor(cursor);
			if (tree !== undefined) {
				// This method is used for tree consistency comparison.
				const { major, minor } = rangeId;
				const finalizedMajor =
					major !== undefined ? this.revisionTagCodec.encode(major) : major;
				// TODO
				for (
					let finalizedMinor = minor.start;
					finalizedMinor < minor.start + minor.length;
					finalizedMinor++
				) {
					trees.push([finalizedMajor, finalizedMinor, tree]);
				}
			}
		}
		cursor.free();
		return trees;
	}
}

/**
 * Run a synchronous transaction on the given shared tree view.
 * This is a convenience helper around the {@link SharedTreeFork#transaction} APIs.
 * @param view - the view on which to run the transaction
 * @param transaction - the transaction function. This will be executed immediately. It is passed `view` as an argument for convenience.
 * If this function returns an `Abort` result then the transaction will be aborted. Otherwise, it will be committed.
 * @returns whether or not the transaction was committed or aborted
 * @internal
 */
export function runSynchronous(
	view: ITreeCheckout,
	transaction: (view: ITreeCheckout) => TransactionResult | void,
): TransactionResult {
	view.transaction.start();
	const result = transaction(view);
	return result === TransactionResult.Abort
		? view.transaction.abort()
		: view.transaction.commit();
}
