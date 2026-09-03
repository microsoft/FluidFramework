/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidLoadable, IDisposable, Listenable } from "@fluidframework/core-interfaces";

import type {
	ChangeMetadata,
	CommitMetadata,
	CustomMetadataTree,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- This is referenced by doc comments.
	Revertible,
	RevertibleAlphaFactory,
	RevertibleFactory,
	RevertToOptionsAlpha,
} from "../../core/index.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- This is referenced by doc comments.
import type { TreeStatus } from "../../feature-libraries/index.js";
import type {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports -- This is referenced by doc comments.
	TreeAlpha,
} from "../../shared-tree/index.js";
import type {
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnlyObject,
} from "../../util/index.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- This is referenced by doc comments.
import type { SchemaUpgrade, Unhydrated } from "../core/index.js";
import type {
	ImplicitFieldSchema,
	InsertableField,
	InsertableTreeFieldFromImplicitField,
	ReadableField,
	ReadSchema,
	TreeFieldFromImplicitField,
} from "../fieldSchema.js";
import type { SimpleTreeSchema } from "../simpleSchema.js";
import type { UnsafeUnknownSchema } from "../unsafeUnknownSchema.js";

import type { TreeViewConfiguration } from "./configuration.js";
import type { StagedUpgradeStatus } from "./schemaCompatibilityTester.js";
import type {
	RunTransactionParamsAlpha,
	RunTransactionParamsBeta,
	TransactionCallbackStatusAlpha,
	TransactionCallbackStatusBeta,
	TransactionVoidResult,
	TransactionValueResult,
	VoidTransactionCallbackStatusAlpha,
	VoidTransactionCallbackStatusBeta,
	WithValue,
} from "./transactionTypes.js";
import type { VerboseTree } from "./verboseTree.js";

/**
 * A tree from which a {@link TreeView} can be created.
 *
 * @privateRemarks
 * TODO:
 * Add stored key versions of {@link (TreeAlpha:interface).(exportVerbose:2)}, {@link (TreeAlpha:interface).(exportConcise:2)} and {@link (TreeAlpha:interface).exportCompressed} here so tree content can be accessed without a view schema.
 * Add exportSimpleSchema and exportJsonSchema methods (which should exactly match the concise format, and match the free functions for exporting view schema).
 * Maybe rename "exportJsonSchema" to align on "concise" terminology.
 * Ensure schema exporting APIs here align and reference APIs for exporting view schema to the same formats (which should include stored vs property key choice).
 * Make sure users of independentView can use these export APIs (maybe provide a reference back to the ViewableTree from the TreeView to accomplish that).
 * @system @sealed @public
 */
export interface ViewableTree {
	/**
	 * Returns a {@link TreeView} using the provided schema.
	 * If the stored schema is compatible with the view schema specified by `config`,
	 * the returned {@link TreeView} will expose the root with a schema-aware API based on the provided view schema.
	 * If the provided schema is incompatible with the stored schema, the view will instead expose a status indicating the incompatibility.
	 *
	 * @remarks
	 * If the tree is uninitialized (has no schema and no content), use {@link TreeView.initialize} on the returned view to set the schema and content together.
	 * Using `viewWith` followed by {@link TreeView.upgradeSchema} to initialize only the schema for a document is technically valid when the schema
	 * permits trees with no content.
	 *
	 * Note that other clients can modify the document at any time, causing the view to change its compatibility status: see {@link TreeView.events} for how to handle invalidation in these cases.
	 *
	 * Only one schematized view may exist for a given ITree at a time.
	 * If creating a second, the first must be disposed before calling `viewWith` again.
	 *
	 * @privateRemarks
	 * TODO: Support adapters for handling out-of-schema data.
	 */
	viewWith<TRoot extends ImplicitFieldSchema>(
		config: TreeViewConfiguration<TRoot>,
	): TreeView<TRoot>;
}

/**
 * Channel for a Fluid Tree DDS.
 * @remarks
 * Allows storing and collaboratively editing schema-aware hierarchial data.
 * @sealed @public
 */
export interface ITree extends ViewableTree, IFluidLoadable {}

/**
 * {@link ITree} extended with some alpha APIs.
 * @sealed @alpha
 */
export interface ITreeAlpha extends ITree {
	/**
	 * Exports root in the same format as {@link (TreeAlpha:interface).(exportVerbose:1)} using stored keys.
	 * @remarks
	 * This is `undefined` if and only if the root field is empty (this can only happen if the root field is optional).
	 */
	exportVerbose(): VerboseTree | undefined;

	/**
	 * Exports the SimpleTreeSchema that is stored in the tree, using stored keys for object fields.
	 * @remarks
	 * To get the schema using property keys, use {@link getSimpleSchema} on the view schema.
	 */
	exportSimpleSchema(): SimpleTreeSchema;

	/**
	 * Creates a fork of the current state of the main branch.
	 * This new branch will be shared with and editable by all clients.
	 * @param name - Optional name for the new branch.
	 * This name is not guaranteed to be unique.
	 * (Maximum {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/length | length}: 1024)
	 * @returns The ID of the new branch, which can be used to {@link ITreeAlpha.viewSharedBranchWith | view} the branch.
	 */
	createSharedBranch(name?: string): string;

	/**
	 * Retrieves the name, if any, of the shared branch with the given ID.
	 * @param branchId - The ID of the shared branch to retrieve the name of.
	 * @returns The name of the shared branch, or `undefined` if the branch has no assigned name.
	 * @throws if the branch with the given ID does not exist.
	 */
	getSharedBranchName(branchId: string): string | undefined;

	/**
	 * Returns a list of all shared branches that currently exist on this tree.
	 * Any one of them can be checked out using {@link ITreeAlpha.viewSharedBranchWith}.
	 */
	getSharedBranchIds(): string[];

	/**
	 * Returns a view of the tree on the specified shared branch, using the provided schema.
	 * See {@link ViewableTree.viewWith}.
	 */
	viewSharedBranchWith<TRoot extends ImplicitFieldSchema>(
		branchId: string,
		config: TreeViewConfiguration<TRoot>,
	): TreeView<TRoot>;
}

/**
 * An untyped view of a (version-control-style) branch of a SharedTree.
 * @remarks An `UntypedTreeView` allows for the {@link UntypedTreeView.fork | creation of branches} and for those branches to later be {@link UntypedTreeView.merge | merged}.
 *
 * The branch associated directly with the {@link ITree | SharedTree} is the "main" branch, and all other branches fork (directly or transitively) from that main branch.
 *
 * See {@link UntypedTreeViewAlpha} for additional APIs that are in an earlier stage of development.
 * @sealed @beta
 */
export interface UntypedTreeView extends IDisposable, TreeContextBeta {
	runTransaction<TValue>(
		transaction: () => WithValue<TValue>,
		params?: RunTransactionParamsBeta,
	): TransactionValueResult<TValue, TValue>;

	runTransaction(
		transaction: () => void,
		params?: RunTransactionParamsBeta,
	): TransactionVoidResult;

	/**
	 * Run a synchronous transaction which groups sequential edits to the tree into a single atomic edit if possible.
	 *
	 * @param transaction - The function to run as the body of the transaction, which may optionally return a {@link TransactionCallbackStatusBeta | value or rollback signal}.
	 * It may optionally return a {@link WithValue | value }, which will be returned by the `runTransaction` call.
	 *
	 * @param params - Optional {@link RunTransactionParamsBeta | parameters} for the transaction.
	 *
	 * @returns A {@link TransactionValueResult | value } indicating whether or not the transaction succeeded, and containing the value returned by `transaction`.
	 *
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes from a remote client can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 *
	 * {@link (TreeBeta:interface).on | Change events } will be emitted for changed nodes on this client _as each edit happens_, just as they would be if the changes were made outside of a transaction.
	 * Any other/future clients or contexts will process the transaction "squashed", i.e. they will apply its changes all at once, emitting only a single event per node (even if that node was edited multiple times in the transaction).
	 * Edits to the tree are not permitted within these event callbacks, therefore no other local changes from this client will be interleaved with the changes in this transaction.
	 *
	 * Using a transaction has the following additional consequences:
	 *
	 * - If {@link Revertible | reverted } (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * Only the "outermost" transaction commits a change to the synchronized tree state and therefore only the outermost transaction can be reverted.
	 * If a transaction is started and completed while another transaction is already in progress, then the inner transaction will be reverted together with the outer transaction.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * If the transaction is rolled back, a corresponding {@link TreeBranchEvents.changed | `changed`} event will also be emitted for the rollback.
	 */
	runTransaction<
		TOut extends
			| TransactionCallbackStatusBeta<unknown, unknown>
			| VoidTransactionCallbackStatusBeta
			| void,
	>(
		transaction: () => TOut,
		params?: RunTransactionParamsBeta,
	): TOut extends TransactionCallbackStatusBeta<infer TSuccessValue, infer TFailureValue>
		? TransactionValueResult<TSuccessValue, TFailureValue>
		: TransactionVoidResult;

	runTransactionAsync<TValue>(
		transaction: () => Promise<WithValue<TValue>>,
		params?: RunTransactionParamsBeta,
	): Promise<TransactionValueResult<TValue, TValue>>;

	runTransactionAsync(
		transaction: () => Promise<void>,
		params?: RunTransactionParamsBeta,
	): Promise<TransactionVoidResult>;

	/**
	 * An asynchronous version of {@link UntypedTreeView.(runTransaction:1) | runTransaction}.
	 *
	 * @remarks
	 * As with synchronous transactions, all of the changes in an asynchronous transaction are treated as a unit.
	 * Therefore, no other changes (either from this client or from a remote client) can be interleaved with the transaction changes.
	 *
	 * Unlike with synchronous transactions, it is possible that other changes (e.g. from a remote client) may be applied to the branch while this transaction is in progress.
	 * Those other changes will be not be reflected on the branch until after this transaction completes, at which point the transaction changes will be applied after those other changes.
	 *
	 * An asynchronous transaction may not be started while any other transaction is in progress in this view.
	 */
	runTransactionAsync<
		TOut extends
			| TransactionCallbackStatusBeta<unknown, unknown>
			| VoidTransactionCallbackStatusBeta
			| void,
	>(
		transaction: () => Promise<TOut>,
		params?: RunTransactionParamsBeta,
	): Promise<
		TOut extends TransactionCallbackStatusBeta<infer TSuccessValue, infer TFailureValue>
			? TransactionValueResult<TSuccessValue, TFailureValue>
			: TransactionVoidResult
	>;

	/**
	 * Fork a new branch off of this branch which is based off of this branch's current state.
	 * @remarks Any changes to the tree on the new view will not apply to this view until the new view is e.g. {@link UntypedTreeView.merge | merged} back into this view.
	 * The view should be disposed when no longer needed, either {@link UntypedTreeView.dispose | explicitly} or {@link UntypedTreeView.merge | implicitly when merging} into another view.
	 */
	fork(): UntypedTreeView;

	/**
	 * Apply all the new changes on the given view to this view.
	 * @param view - A view created by {@link UntypedTreeView.fork}.
	 * @param disposeMerged - Whether or not to dispose `view` after the merge completes.
	 * Defaults to true.
	 * The {@link UntypedTreeView | main view} cannot be disposed - attempting to do so will have no effect.
	 * @remarks All ongoing transactions (if any) in `view` will be committed before the merge.
	 */
	merge(view: UntypedTreeView, disposeMerged?: boolean): void;

	/**
	 * Advance this view forward such that all new changes on the target view become part of this view.
	 * @param view - The view to rebase onto.
	 * @remarks After rebasing, this view will be "ahead" of the target view, that is, its unique changes will have been recreated as if they happened after all changes on the target view.
	 * This method may only be called on views produced via {@link UntypedTreeView.fork | fork} - attempting to rebase the main view will throw.
	 *
	 * Rebasing long-lived branches is important to avoid consuming memory unnecessarily.
	 * In particular, the SharedTree retains all sequenced changes made to the tree since the "most-behind" branch was created or last rebased.
	 *
	 * The {@link UntypedTreeView | main view} cannot be rebased onto another view - attempting to do so will throw an error.
	 */
	rebaseOnto(view: UntypedTreeView): void;

	/**
	 * Dispose of this view, cleaning up any resources associated with it.
	 * @param error - Optional error indicating the reason for the disposal, if the object was disposed as the result of an error.
	 * @remarks Views can also be automatically disposed when {@link UntypedTreeView.merge | they are merged} into another view.
	 *
	 * Disposing branches is important to avoid consuming memory unnecessarily.
	 * In particular, the SharedTree retains all sequenced changes made to the tree since the "most-behind" view was created or last {@link UntypedTreeView.rebaseOnto | rebased}.
	 *
	 * The {@link UntypedTreeView | main view} cannot be disposed - attempting to do so will have no effect.
	 */
	dispose(error?: Error): void;
}

/**
 * Compatibility alias for {@link UntypedTreeView}.
 *
 * @deprecated Use {@link UntypedTreeView} instead.
 * @beta
 */
export type TreeBranch = UntypedTreeView;

/**
 * Provides additional APIs that may be used to interact with a tree node.
 * @sealed @beta
 */
export interface TreeContextBeta {
	/**
	 * Run a synchronous transaction which groups sequential edits to the tree into a single atomic edit if possible.
	 * @param transaction - A callback run during the transaction to perform user-supplied operations.
	 * It may optionally return a {@link WithValue | value }, which will be returned by the `runTransaction` call.
	 * @param params - Optional {@link RunTransactionParamsBeta | parameters} for the transaction.
	 * @returns A {@link TransactionValueResult | value } indicating whether or not the transaction succeeded, and containing the value returned by `transaction`.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes from a remote client can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 *
	 * {@link (TreeBeta:interface).on | Change events } will be emitted for changed nodes on this client _as each edit happens_, just as they would be if the changes were made outside of a transaction.
	 * Any other/future clients or contexts will process the transaction "squashed", i.e. they will apply its changes all at once, emitting only a single event per node (even if that node was edited multiple times in the transaction).
	 * Edits to the tree are not permitted within these event callbacks, therefore no other local changes from this client will be interleaved with the changes in this transaction.
	 *
	 * Using a transaction has the following additional consequences:
	 *
	 * - If {@link Revertible | reverted } (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * Only the "outermost" transaction commits a change to the synchronized tree state and therefore only the outermost transaction can be reverted.
	 * If a transaction is started and completed while another transaction is already in progress, then the inner transaction will be reverted together with the outer transaction.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * `runTransaction` may be invoked on the context of a {@link TreeStatus.InDocument | hydrated } or {@link Unhydrated | unhydrated } node.
	 * Use {@link TreeContextBeta.isView | isView()} to check whether this context is associated with a view and gain {@link UntypedTreeView.(runTransaction:1) | access to more transaction capabilities} if so.
	 */
	runTransaction<TValue>(
		transaction: () => WithValue<TValue>,
		params?: RunTransactionParamsBeta,
	): TransactionValueResult<TValue, TValue>;

	/**
	 * An overload of {@link TreeContextBeta.(runTransaction:1) | runTransaction } which does not return a value.
	 *
	 * @privateRemarks
	 * TODO: Consider updating these methods to avoid the need for overloads.
	 * See {@link TreeViewBeta.runTransaction} for an example of how to do this.
	 */
	runTransaction(
		transaction: () => void,
		params?: RunTransactionParamsBeta,
	): TransactionVoidResult;

	/**
	 * An asynchronous version of {@link TreeContextBeta.(runTransaction:1) | runTransaction}.
	 * @remarks
	 * As with synchronous transactions, all of the changes in an asynchronous transaction are treated as a unit.
	 * Therefore, no other changes (either from this client or from a remote client) can be interleaved with the transaction changes.
	 *
	 * Unlike with synchronous transactions, it is possible that other changes (e.g. from a remote client) may be applied to the branch while this transaction is in progress.
	 * Those other changes will be not be reflected on the branch until after this transaction completes, at which point the transaction changes will be applied after those other changes.
	 *
	 * An asynchronous transaction may not be started while any other transaction is in progress in this context.
	 */
	runTransactionAsync<TValue>(
		transaction: () => Promise<WithValue<TValue>>,
		params?: RunTransactionParamsBeta,
	): Promise<TransactionValueResult<TValue, TValue>>;

	/**
	 * An overload of {@link TreeContextBeta.(runTransactionAsync:1) | runTransactionAsync } which does not return a value.
	 *
	 * @privateRemarks
	 * TODO: Consider updating these methods to avoid the need for overloads.
	 * See {@link TreeViewBeta.runTransactionAsync} for an example of how to do this.
	 */
	runTransactionAsync(
		transaction: () => Promise<void>,
		params?: RunTransactionParamsBeta,
	): Promise<TransactionVoidResult>;

	/**
	 * True if this context is associated with an {@link UntypedTreeView | untyped view} and false if it is associated with an {@link Unhydrated | unhydrated } node.
	 * @remarks If this returns true, the context can be safely inferred or cast to {@link UntypedTreeView} to access additional view-specific APIs.
	 * @returns Whether this context is associated with an untyped view.
	 */
	isView(): this is UntypedTreeView;
}

/**
 * Provides additional APIs that may be used to interact with a tree node or a tree node's SharedTree.
 * @sealed @alpha
 */
export interface TreeContextAlpha extends TreeContextBeta {
	runTransaction<TValue>(
		transaction: () => WithValue<TValue>,
		params?: RunTransactionParamsAlpha,
	): TransactionValueResult<TValue, TValue>;

	runTransaction(
		transaction: () => void,
		params?: RunTransactionParamsAlpha,
	): TransactionVoidResult;

	runTransactionAsync<TValue>(
		transaction: () => Promise<WithValue<TValue>>,
		params?: RunTransactionParamsAlpha,
	): Promise<TransactionValueResult<TValue, TValue>>;

	runTransactionAsync(
		transaction: () => Promise<void>,
		params?: RunTransactionParamsAlpha,
	): Promise<TransactionVoidResult>;

	/**
	 * True if this context is associated with an {@link UntypedTreeViewAlpha | untyped view} and false if it is associated with an {@link Unhydrated | unhydrated } node.
	 * @remarks If this returns true, the context can be safely inferred or cast to {@link UntypedTreeViewAlpha} to access additional view-specific APIs.
	 * @example
	 * ```typescript
	 * const context = tree.context(someNode);
	 * if (context.isView()) {
	 *   assert(context.hasRootSchema(MySchema)) // `hasRootSchema` is a method on UntypedTreeViewAlpha, so this is only accessible if `context` is a view context.
	 *   context.root.foo = "bar"; // Edit the root of the SharedTree that `someNode` belongs to.
	 * }
	 * ```
	 * @returns Whether this context is associated with an untyped view.
	 */
	isView(): this is UntypedTreeViewAlpha;

	/**
	 * {@inheritDoc TreeContextAlpha.isView}
	 * @deprecated Use {@link TreeContextAlpha.isView | isView()} instead.
	 */
	isBranch(): this is UntypedTreeViewAlpha;
}

/**
 * An identifier for a commit in a {@link UntypedTreeViewAlpha}'s {@link UntypedTreeViewAlpha.branchHistory | history}.
 * @alpha
 */
export type CommitRevision = string;

/**
 * Metadata describing a single commit in a {@link UntypedTreeViewAlpha}'s history.
 * @sealed @alpha
 */
export interface TreeBranchCommitMetadata {
	/**
	 * The revision UUID that uniquely identifies this commit within the branch's history.
	 */
	readonly revision: CommitRevision;

	/**
	 * Arbitrary, application-defined metadata that was {@link RunTransactionParamsAlpha.customMetadata | attached}
	 * to this commit when it was created, flattened into a single object.
	 *
	 * @remarks
	 * This is `undefined` for commits that were not annotated.
	 *
	 * A commit may be produced by nested transactions, each of which may supply metadata. This property combines
	 * them: where two of them used the same property, the outermost transaction wins, and between siblings the
	 * later one wins. Use {@link TreeBranchCommitMetadata.customTree} to recover which transaction supplied what.
	 */
	readonly custom: JsonCompatibleReadOnlyObject | undefined;

	/**
	 * The {@link CustomMetadataTree | tree} of metadata attached to this commit, reflecting the nesting of
	 * the transactions that produced it.
	 *
	 * @remarks
	 * The structural counterpart to {@link TreeBranchCommitMetadata.custom}, and `undefined` whenever it is.
	 * Prefer `custom` unless you need to know which transaction supplied a particular property.
	 */
	readonly customTree: CustomMetadataTree | undefined;

	/**
	 * The metadata for the commit that this commit was based on, or `undefined` if this commit has no parent
	 * (i.e. it is the oldest commit in the branch's history).
	 *
	 * @remarks
	 * This method may return a different value over time if the parent commit is trimmed from the branch's history.
	 */
	getParent(): TreeBranchCommitMetadata | undefined;
}

/**
 * Provides APIs for querying information about the history of a {@link UntypedTreeViewAlpha}.
 * @remarks
 * The history of a branch is the sequence of commits leading up to its current state.
 * @sealed @alpha
 */
export interface TreeBranchHistory {
	/**
	 * The number of commits in this branch's history.
	 * @remarks
	 * This number grows when any of the following occurs:
	 * - A new edit is made on this branch (either through editing or by reverting an existing commit on this branch).
	 * - A branch that contains commits not already on this branch is merged into this branch.
	 * - The branch is rebased onto another branch that contains commits not already on this branch.
	 * This number shrinks when past commits are trimmed from the history.
	 */
	readonly length: number;

	/**
	 * Returns metadata for the current head commit of this branch.
	 * @returns The metadata for the head commit, or `undefined` if the branch has no commits.
	 */
	getHead(): TreeBranchCommitMetadata | undefined;
}

/**
 * An untyped view of a {@link UntypedTreeView} with alpha-level APIs.
 * @remarks
 * The untyped view for a specific {@link TreeNode} may be acquired by calling {@link (TreeAlpha:interface).context} and checking {@link TreeContextAlpha.isView | isView()}.
 *
 * An untyped view does not necessarily know the schema of its SharedTree. To convert it to a {@link TreeViewAlpha | view with a schema}, use {@link UntypedTreeViewAlpha.hasRootSchema | hasRootSchema()}.
 * @sealed @alpha
 */
export interface UntypedTreeViewAlpha
	extends Omit<UntypedTreeView, "runTransaction" | "runTransactionAsync" | "isView">,
		TreeContextAlpha {
	/**
	 * Events for the view's underlying branch.
	 */
	readonly events: Listenable<TreeBranchEvents>;

	/**
	 * APIs for querying the history of the branch being viewed.
	 */
	readonly branchHistory: TreeBranchHistory;

	/**
	 * Returns true if this view has the given schema as its root schema.
	 * @remarks This is a type guard which allows this view to become strongly typed as a {@link TreeViewAlpha | view} of the given schema.
	 *
	 * To succeed, the given schema must be invariant to the schema of the view - it must include exactly the same allowed types.
	 * For example, a schema of `Foo | Bar` will not match a view schema of `Foo`, and likewise a schema of `Foo` will not match a view schema of `Foo | Bar`.
	 * @example
	 * ```typescript
	 * if (view.hasRootSchema(MySchema)) {
	 *   const { root } = view; // `view` is now a TreeViewAlpha<MySchema>
	 *   // ...
	 * }
	 * ```
	 */
	hasRootSchema<TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
	): this is TreeViewAlpha<TSchema>;

	// Override the base fork method to return the alpha variant.
	fork(): UntypedTreeViewAlpha;

	/**
	 * Switches this view to a new underlying branch with the given commit as the head, updating the view state accordingly.
	 *
	 * @param revision - The {@link TreeBranchCommitMetadata.revision | revision} to rewind to.
	 * Can be obtained by navigating the commits on the {@link UntypedTreeViewAlpha.branchHistory | branch history}.
	 *
	 * @remarks
	 * Unlike {@link UntypedTreeViewAlpha.revertTo | revertTo}, this does not apply a change to the underlying branch.
	 * The original underlying branch will be disposed.
	 * Consider {@link UntypedTreeViewAlpha.fork | forking} before rewinding.
	 * Not valid to invoke on the main branch or a {@link (ITreeAlpha:interface).createSharedBranch | shared branch}.
	 */
	rewindTo(revision: CommitRevision): void;

	/**
	 * Applies a new change which reverts all changes made since the given `revision`.
	 * This is a no-op if the given revision is the head commit of the underlying branch being viewed.
	 *
	 * @param revision - The {@link TreeBranchCommitMetadata.revision | revision} to restore the state of.
	 * Can be obtained by navigating the commits on the {@link UntypedTreeViewAlpha.branchHistory | branch history}.
	 * @param options - Optional {@link RevertToOptionsAlpha | options} for the revert.
	 *
	 * @remarks
	 * The generated change is subject to the same merge semantics as the {@link Revertible.(revert:1) | reverts of individual commits}:
	 * Concurrent changes that are sequenced before the revert will not be overwritten by the revert if they affect different parts of the document.
	 *
	 * Unlike {@link UntypedTreeViewAlpha.rewindTo | rewindTo}, this does not switch to a new branch.
	 */
	revertTo(revision: CommitRevision, options?: RevertToOptionsAlpha): void;

	/**
	 * {@link TreeContextAlpha.(runTransaction:1) | Run a transaction} on this view of the SharedTree.
	 * @param transaction - The function to run as the body of the transaction, which may optionally return a {@link TransactionCallbackStatusAlpha | value or rollback signal}.
	 * @remarks
	 * If the transaction is rolled back, a corresponding {@link TreeBranchEvents.changed | `changed`} event will also be emitted for the rollback.
	 */
	runTransaction<TSuccessValue, TFailureValue>(
		transaction: () => TransactionCallbackStatusAlpha<TSuccessValue, TFailureValue>,
		params?: RunTransactionParamsAlpha,
	): TransactionValueResult<TSuccessValue, TFailureValue>;

	/**
	 * An overload of {@link UntypedTreeViewAlpha.(runTransaction:1) | runTransaction } which does not return a value.
	 *
	 * @privateRemarks
	 * TODO: Consider updating these methods to avoid the need for overloads.
	 * See {@link TreeViewBeta.runTransaction} for an example of how to do this.
	 */
	runTransaction(
		transaction: () => VoidTransactionCallbackStatusAlpha | void,
		params?: RunTransactionParamsAlpha,
	): TransactionVoidResult;

	/**
	 * An asynchronous version of {@link UntypedTreeViewAlpha.(runTransaction:1) | runTransaction}.
	 * @remarks See {@link TreeContextAlpha.(runTransactionAsync:1) | runTransactionAsync} for additional information about asynchronous transactions.
	 */

	runTransactionAsync<TSuccessValue, TFailureValue>(
		transaction: () => Promise<TransactionCallbackStatusAlpha<TSuccessValue, TFailureValue>>,
		params?: RunTransactionParamsAlpha,
	): Promise<TransactionValueResult<TSuccessValue, TFailureValue>>;

	/**
	 * An overload of {@link UntypedTreeViewAlpha.(runTransactionAsync:1) | runTransactionAsync } which does not return a value.
	 *
	 * @privateRemarks
	 * TODO: Consider updating these methods to avoid the need for overloads.
	 * See {@link TreeViewBeta.runTransactionAsync} for an example of how to do this.
	 */
	runTransactionAsync(
		transaction: () => Promise<VoidTransactionCallbackStatusAlpha | void>,
		params?: RunTransactionParamsAlpha,
	): Promise<TransactionVoidResult>;

	/**
	 * Apply a serialized change to this branch.
	 * @param change - the change to apply.
	 * Changes are acquired via `getChange` in a branch's {@link TreeBranchEvents.changed | "changed"} event.
	 * @remarks Changes may only be applied to a SharedTree with the same IdCompressor instance and branch state from which they were generated.
	 * They may be created by one branch and applied to another, but only if both branches share the same history at the time of creation and application.
	 *
	 * @privateRemarks
	 * TODO: This method will support applying changes from different IdCompressor instances as long as they have the same local session ID.
	 * Update the tests and docs to match when that is done.
	 */
	applyChange(change: JsonCompatibleReadOnly): void;

	/**
	 * Determines if there are changes on the given view that are not present on this view.
	 * @param view - The view to compare to.
	 *
	 * The new edits, if any, can be applied to this view by {@link UntypedTreeView.rebaseOnto | rebasing this view onto the given view}
	 * or by {@link UntypedTreeView.merge | merging the given view into this view}.
	 *
	 * @throws UsageError if the branches are unrelated.
	 */
	isMissingEditsFrom(view: UntypedTreeView): boolean;

	/**
	 * Computes the net change that would result if this view were {@link UntypedTreeView.rebaseOnto | rebased onto} the given view.
	 * Note that this method does not actually perform the rebase and therefore has no effect on this view.
	 *
	 * @param view - The view that would be rebased onto.
	 * @returns The net change that would result if this view were rebased onto the given view,
	 * or `undefined` if rebasing would have no impact.
	 */
	computeNetChangeIfRebasedOnto(view: UntypedTreeView): JsonCompatibleReadOnly | undefined;
}

/**
 * Compatibility alias for {@link UntypedTreeViewAlpha}.
 *
 * @deprecated Use {@link UntypedTreeViewAlpha} instead.
 * @alpha
 */
export type TreeBranchAlpha = UntypedTreeViewAlpha;

/**
 * An editable view of a (version control style) branch of a shared tree based on some schema.
 *
 * @remarks
 * This schema (known as the view schema) may or may not align with the stored schema of the document.
 * Information about discrepancies between the two schemas is available via {@link TreeView.compatibility | compatibility}.
 *
 * Application authors are encouraged to read {@link https://github.com/microsoft/FluidFramework/blob/main/packages/dds/tree/docs/user-facing/schema-evolution.md | schema-evolution.md}
 * and choose a schema compatibility policy that aligns with their application's needs.
 *
 * See also {@link TreeViewAlpha}, {@link TreeViewBeta} and {@link UntypedTreeView} for additional APIs that are in earlier stages of development.
 *
 * @privateRemarks
 * From an API design perspective, `upgradeSchema` could be merged into `viewWith` and/or `viewWith` could return errors explicitly on incompatible documents.
 * Such approaches would make it discoverable that out of schema handling may need to be done.
 * Doing that would however complicate trivial "hello world" style example slightly, as well as be a breaking API change.
 * It also seems more complex to handle invalidation with that pattern.
 * Thus this design was chosen at the risk of apps blindly accessing `root` then breaking unexpectedly when the document is incompatible.
 *
 * @see {@link TreeViewAlpha}
 * @see {@link (asAlpha:1)}
 *
 * @sealed @public
 */
export interface TreeView<in out TSchema extends ImplicitFieldSchema> extends IDisposable {
	/**
	 * The current root of the tree.
	 *
	 * If the view schema not sufficiently compatible with the stored schema, accessing this will throw.
	 * To handle this case, check {@link TreeView.compatibility | compatibility}'s {@link SchemaCompatibilityStatus.canView | canView} before using.
	 *
	 * To get notified about changes to this field,
	 * use {@link TreeViewEvents.rootChanged} via `view.events.on("rootChanged", callback)`.
	 *
	 * To get notified about changes to stored schema (which may affect compatibility between this view's schema and
	 * the stored schema), use {@link TreeViewEvents.schemaChanged} via `view.events.on("schemaChanged", callback)`.
	 */
	get root(): TreeFieldFromImplicitField<TSchema>;

	set root(newRoot: InsertableTreeFieldFromImplicitField<TSchema>);

	/**
	 * Description of the current compatibility status between the view schema and stored schema.
	 * @remarks
	 * {@link TreeViewEvents.schemaChanged} is fired when the compatibility status of the document's stored schema changes.
	 * See {@link https://fluidframework.com/docs/data-structures/tree/schema-evolution/ | schema-evolution} for more guidance on how to change schema while maintaining compatibility.
	 * Use {@link snapshotSchemaCompatibility} to write tests to validate that this compatibility behaves as desired across schema changes.
	 */
	readonly compatibility: SchemaCompatibilityStatus;

	/**
	 * When {@link SchemaCompatibilityStatus.canUpgrade} is true,
	 * this can be used to modify the stored schema to make it match the view schema.
	 * @remarks
	 * This will update the {@link TreeView.compatibility}, allowing access to `root`.
	 * Beware that this may impact other clients' ability to view the document: see {@link SchemaCompatibilityStatus.canView} for more information.
	 *
	 * It is an error to call this when {@link SchemaCompatibilityStatus.canUpgrade} is false.
	 * {@link SchemaCompatibilityStatus.canUpgrade} being true does not mean that an upgrade is required, nor that an upgrade will have any effect.
	 *
	 * When using {@link TreeViewConfigurationAlpha} with a {@link ITreeViewConfigurationAlpha.stagedUpgradePolicy},
	 * staged schema upgrades matching the configured policy are included in the target stored schema.
	 * Once a staged schema upgrade has been enabled in a document's stored schema, loading that document
	 * with a view that does not include equivalent staged members in its construction-time policy will cause
	 * `upgradeSchema` to throw a `UsageError` because the requested target would narrow the stored schema.
	 *
	 * @example Enabling a staged allowed type for documents, selected by a feature flag
	 *
	 * ```typescript
	 * const sf = new SchemaFactoryBeta("my-app");
	 *
	 * class TaskItem extends sf.object("TaskItem", { title: sf.string }) {}
	 * class ChecklistItem extends sf.object("ChecklistItem", { text: sf.string }) {}
	 *
	 * // `staged` wraps ChecklistItem so it can be enabled at runtime.
	 * const stagedChecklist = SchemaFactoryBeta.staged(ChecklistItem);
	 * const checklistUpgrade = stagedChecklist.metadata.stagedSchemaUpgrade;
	 *
	 * class AppSchema extends sf.object("AppSchema", {
	 *   items: sf.array([TaskItem, stagedChecklist]),
	 * }) {}
	 *
	 * // Feature flag controls whether the upgrade is enabled for this session.
	 * const policy = featureFlags.enableChecklist
	 *   ? StagedSchemaUpgradePolicy.enabledStagedUpgrades(checklistUpgrade)
	 *   : undefined;
	 *
	 * const view = tree.viewWith(
	 *   new TreeViewConfigurationAlpha({ schema: AppSchema, stagedUpgradePolicy: policy }),
	 * );
	 *
	 * if (view.compatibility.canUpgrade) {
	 *   // Writes the staged type into the document's stored schema.
	 *   view.upgradeSchema();
	 * }
	 * ```
	 *
	 * @privateRemarks
	 * In the future, more upgrade options could be provided here.
	 * Some options that could be added:
	 * - check the actual document contents (not just the schema) and attempt an atomic document update if the data is compatible.
	 * - apply converters and upgrade the document.
	 * - apply converters to lazily to adapt the document to the requested view schema (with optional lazy schema updates or transparent conversions on write).
	 * - update only a specific change (add an optional field, or apply a staged upgrade)
	 * - update persistedMetadata or not
	 *
	 * As persisted metadata becomes more supported, how it interacts with isEquivalent and upgradeSchema should be clarified:
	 * for now the docs are being left somewhat vague to allow flexibility in this area.
	 */
	upgradeSchema(): void;

	/**
	 * Initialize the tree, setting the stored schema to match this view's schema and setting the tree content.
	 *
	 * @remarks
	 * Only valid to call when this view's {@link SchemaCompatibilityStatus.canInitialize} is true.
	 *
	 * When using {@link TreeViewConfigurationAlpha} with a {@link ITreeViewConfigurationAlpha.stagedUpgradePolicy},
	 * staged schema upgrades matching the configured policy are included in the initial stored schema.
	 *
	 * Applications should typically call this function before attaching a `SharedTree`.
	 * @param content - The content to initialize the tree with.
	 */
	initialize(content: InsertableTreeFieldFromImplicitField<TSchema>): void;

	/**
	 * Events for the tree.
	 */
	readonly events: Listenable<TreeViewEvents>;

	/**
	 * The view schema used by this TreeView.
	 */
	readonly schema: TSchema;
}

/**
 * A discrepancy between a view schema and a document's stored schema.
 *
 * @remarks
 * The `mismatch` property discriminates the different discrepancy shapes.
 *
 * @sealed @beta
 */
export type SchemaDiscrepancy =
	| {
			/**
			 * Indicates that a field allows different node types in the view and stored schemas.
			 */
			readonly mismatch: "allowedTypes";
			/**
			 * The field with the discrepancy.
			 *
			 * `"root"` identifies the root field. Otherwise, `nodeType` identifies the containing
			 * node schema and `fieldKey` identifies its field. `fieldKey` is undefined for a map
			 * node's implicit field.
			 */
			readonly location:
				| "root"
				| {
						readonly nodeType: string;
						readonly fieldKey: string | undefined;
				  };
			/**
			 * Non-staged node type identifiers allowed by the view schema but not the stored schema.
			 */
			readonly view: readonly string[];
			/**
			 * Staged node type identifiers allowed by the view schema but not the stored schema.
			 *
			 * @remarks These types provide rollout context but do not cause the discrepancy.
			 */
			readonly stagedView?: readonly string[];
			/**
			 * Node type identifiers allowed by the stored schema but not the view schema.
			 */
			readonly stored: readonly string[];
			/**
			 * Whether the view field is a staged optional field.
			 *
			 * @remarks Omitted when false.
			 */
			readonly viewIsStagedOptional?: true;
	  }
	| {
			/**
			 * Indicates that a field has different field kinds in the view and stored schemas.
			 */
			readonly mismatch: "fieldKind";
			/**
			 * The field with the discrepancy.
			 *
			 * `"root"` identifies the root field. Otherwise, `nodeType` identifies the containing
			 * node schema and `fieldKey` identifies its field. `fieldKey` is undefined for a map
			 * node's implicit field.
			 */
			readonly location:
				| "root"
				| {
						readonly nodeType: string;
						readonly fieldKey: string | undefined;
				  };
			/**
			 * The field kind required by the view schema.
			 */
			readonly view: string;
			/**
			 * The field kind recorded in the stored schema.
			 */
			readonly stored: string;
			/**
			 * Whether the view field is a staged optional field.
			 *
			 * @remarks Omitted when false.
			 */
			readonly viewIsStagedOptional?: true;
	  }
	| {
			/**
			 * Indicates that a leaf node accepts different value types in the view and stored schemas.
			 */
			readonly mismatch: "valueSchema";
			/**
			 * The identifier of the leaf node schema with the discrepancy.
			 */
			readonly nodeType: string;
			/**
			 * The value schema required by the view, or undefined when it does not constrain values.
			 */
			readonly view: string | undefined;
			/**
			 * The value schema recorded in the stored schema, or undefined when it does not constrain values.
			 */
			readonly stored: string | undefined;
	  }
	| {
			/**
			 * Indicates that a node is represented by different node kinds in the view and stored schemas.
			 */
			readonly mismatch: "nodeKind";
			/**
			 * The identifier of the node schema with the discrepancy.
			 */
			readonly nodeType: string;
			/**
			 * The node kind required by the view schema.
			 */
			readonly view: string;
			/**
			 * The node kind recorded in the stored schema.
			 */
			readonly stored: string;
	  };

/**
 * {@link SchemaCompatibilityStatus} with additional beta APIs.
 *
 * @sealed @beta
 */
export interface SchemaCompatibilityStatusBeta extends SchemaCompatibilityStatus {
	/**
	 * Details about the schema discrepancies that prevent this view from accessing the tree.
	 *
	 * @remarks
	 * This property is undefined when {@link SchemaCompatibilityStatus.canView} is true and present
	 * when `canView` is false.
	 * It can include application-defined schema identifiers and field keys.
	 *
	 * @example Interpreting an allowed-types discrepancy
	 *
	 * If a document's stored schema allows `string` for `Todo.title`, but the view schema expects
	 * `number`, the discrepancy identifies the field and the type permitted by each schema:
	 *
	 * ```typescript
	 * const sf = new SchemaFactory("com.example");
	 * class Todo extends sf.object("Todo", {
	 * 	title: sf.number,
	 * }) {}
	 *
	 * const view = asBeta(tree.viewWith(new TreeViewConfiguration({ schema: Todo })));
	 * if (!view.compatibility.canView) {
	 * 	// [{
	 * 	//   mismatch: "allowedTypes",
	 * 	//   location: { nodeType: "com.example.Todo", fieldKey: "title" },
	 * 	//   view: ["com.fluidframework.leaf.number"],
	 * 	//   stored: ["com.fluidframework.leaf.string"],
	 * 	// }]
	 * 	console.error(view.compatibility.discrepancies);
	 * }
	 * ```
	 */
	readonly discrepancies: readonly SchemaDiscrepancy[] | undefined;
}

/**
 * {@link TreeView} with additional beta APIs.
 * @sealed @beta
 */
export interface TreeViewBeta<in out TSchema extends ImplicitFieldSchema>
	extends TreeView<TSchema>,
		UntypedTreeView {
	/**
	 * {@inheritDoc TreeView.compatibility}
	 */
	readonly compatibility: SchemaCompatibilityStatusBeta;

	// Override the base branch method to return a typed view rather than merely a branch.
	fork(): ReturnType<UntypedTreeView["fork"]> & TreeViewBeta<TSchema>;
}

/**
 * {@link TreeView} with proposed changes to the schema aware typing to allow use with `UnsafeUnknownSchema`.
 * @sealed @alpha
 */
export interface TreeViewAlpha<
	in out TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema,
> extends Omit<
			TreeViewBeta<ReadSchema<TSchema>>,
			"root" | "initialize" | "fork" | "runTransaction" | "runTransactionAsync" | "isView"
		>,
		UntypedTreeViewAlpha {
	get root(): ReadableField<TSchema>;

	set root(newRoot: InsertableField<TSchema>);

	/**
	 * Initialize the tree, setting the stored schema to match this view's schema and setting the tree content.
	 *
	 * @remarks
	 * Only valid to call when this view's {@link SchemaCompatibilityStatus.canInitialize} is true.
	 *
	 * Enables staged schema upgrades declared by {@link ITreeViewConfigurationAlpha.stagedUpgradePolicy} when generating the initial stored schema.
	 * Once a staged schema upgrade has been enabled in a document's stored schema, loading that document
	 * with a view that does not include equivalent staged members in its construction-time policy will cause
	 * a subsequent `upgradeSchema` call to throw a `UsageError` because the stored schema already contains
	 * the upgraded members and the new target would narrow it.
	 *
	 * Applications should typically call this function before attaching a `SharedTree`.
	 * @param content - The content to initialize the tree with.
	 */
	initialize(content: InsertableField<TSchema>): void;

	/**
	 * Checks whether a staged schema upgrade has been applied to the document's stored schema.
	 *
	 * @param upgrade - The upgrade token to check.
	 *
	 * @returns The {@link StagedUpgradeStatus} of the upgrade.
	 *
	 * @remarks
	 * Use this to determine whether a document has already been upgraded, for example when deciding
	 * whether to include an upgrade token in the view configuration after a feature flag rollback.
	 *
	 * Results are derived from this view's schema and the current stored schema.
	 * The full schema is checked even when the view is incompatible with the stored schema, so the
	 * result includes all locations declared by the view schema.
	 */
	isStagedUpgradeEnabled(upgrade: SchemaUpgrade): StagedUpgradeStatus;

	readonly events: Listenable<TreeViewEvents & TreeBranchEvents>;

	// Override the base fork method to return a TreeViewAlpha.
	fork(): ReturnType<UntypedTreeView["fork"]> & TreeViewAlpha<TSchema>;
}

/**
 * Information about a view schema's compatibility with the document's stored schema.
 *
 * @see
 * See SharedTree's README for more information about choosing a compatibility policy.
 *
 * @privateRemarks
 * See {@link checkSchemaCompatibility} for the implementation of this compatibility checking.
 *
 * @sealed @public
 */
export interface SchemaCompatibilityStatus {
	/**
	 * Whether the view schema allows exactly the same set of documents as the stored schema.
	 *
	 * @remarks
	 * Equivalence here is defined in terms of allowed documents because there are some degenerate cases where schemas are not
	 * exact matches in a strict (schema-based) sense but still allow the same documents, and the document notion is more useful to applications.
	 *
	 * Examples which are expressible where this may occur include:
	 *
	 * - schema repository `A` has extra schema which schema `B` doesn't have, but they are unused (i.e. not reachable from the root schema)
	 *
	 * - field in schema `A` has allowed field members which the corresponding field in schema `B` does not have, but those types are not constructible (for example: an object node type containing a required field with no allowed types)
	 *
	 * These cases are typically not interesting to applications.
	 *
	 * Note that other content in the stored schema that does not impact document compatibility, like {@link NodeSchemaOptionsAlpha.persistedMetadata}, does not affect this field.
	 *
	 * For the computation of this equivalence, {@link SchemaStaticsBeta.staged | staged} schemas are not included.
	 * If there are any unknown optional fields, even if allowed by {@link ObjectSchemaOptions.allowUnknownOptionalFields}, `isEquivalent` will be false.
	 */
	readonly isEquivalent: boolean;

	/**
	 * Whether the current view schema is sufficiently compatible with the stored schema to allow viewing tree data.
	 * If false, {@link TreeView.root} will throw upon access.
	 * @remarks
	 * If the view schema does not opt into supporting any additional cases, then `canView` is only true when `isEquivalent` is also true.
	 * The view schema can however opt into supporting additional cases, and thus can also view documents with stored schema which would be equivalent, except for the following discrepancies:
	 *
	 * - An object node with {@link ObjectSchemaOptions.allowUnknownOptionalFields} to set to true that has additional optional fields in the stored schema beyond those mentioned in its view schema.
	 *
	 * - An additional type allowed at a location in the stored schema where it is {@link SchemaStaticsBeta.staged | staged} in the view schema.
	 *
	 * In these cases `canUpgrade` and `isEquivalent` will be false.
	 *
	 * When the set of documents allowed by the view schema is a strict superset of those allowed by the stored schema,
	 * `canView` is false because writes to the document using the view schema could make the document violate its stored schema.
	 * In this case, the stored schema could be updated to match the provided view schema, allowing read-write access to the tree.
	 * See {@link SchemaCompatibilityStatus.canUpgrade}.
	 *
	 * Future versions of SharedTree may provide readonly access to the document in this case because that would be safe,
	 * but this is not currently supported.
	 *
	 * @privateRemarks
	 * A necessary condition for this to be true is that the documents allowed by the view schema are a subset of those allowed by the stored schema.
	 * This is not sufficient: the simple-tree layer's read APIs only tolerate very specific cases beyond their schema (unknown optional fields).
	 * For example, if the view schema for a node has a required `Point` field but the stored schema has an optional `Point` field,
	 * read APIs on the view schema do not work correctly when the document has a node with a missing `Point` field.
	 * Similar issues happen when the view schema has a field with less allowed types than the stored schema and the document actually leverages those types.
	 */
	readonly canView: boolean;

	/**
	 * True when {@link TreeView.upgradeSchema} can add support for all content required to be supported by the view schema.
	 * @remarks
	 * When true, it is valid to call {@link TreeView.upgradeSchema} (though if the stored schema is already an exact match, this is a no-op).
	 *
	 * When adding optional fields to schema which previously were marked with {@link ObjectSchemaOptions.allowUnknownOptionalFields}
	 * the schema upgrade (assuming no other changes are included) will allow the previous version to view.
	 * Even this case must still must be done with caution however as only clients with the newly added field will be able to do future upgrades.
	 * Thus if a version of an application is shipped that adds an unknown optional field, all future versions should include it, even if its no longer used,
	 * to ensure that documents containing it can still be upgraded.
	 */
	readonly canUpgrade: boolean;

	/**
	 * True iff the document is uninitialized (i.e. it has no schema and no content).
	 *
	 * To initialize the document, call {@link TreeView.initialize}.
	 *
	 * @remarks
	 * It's not necessary to check this field before calling {@link TreeView.initialize} in most scenarios; application authors typically know from
	 * branch that they're in a flow which creates a new `SharedTree` and would like to initialize it.
	 */
	readonly canInitialize: boolean;

	// TODO: Consider extending this status to include:
	// - application-defined metadata about the stored schema
	// - details about the differences between the stored and view schema sufficient for implementing "safe mismatch" policies
}

/**
 * Events for {@link UntypedTreeView}.
 * @sealed @alpha
 */
export interface TreeBranchEvents {
	/**
	 * Fired when a change is made to the branch. Includes data about the change that is made which listeners
	 * can use to filter on changes they care about (e.g. local vs. remote changes).
	 *
	 * @param data - information about the change
	 * @param getRevertible - a function that allows users to get a revertible for the change. If not provided,
	 * this change is not revertible.
	 */
	changed(data: ChangeMetadata, getRevertible?: RevertibleAlphaFactory): void;
}

/**
 * Events for {@link TreeView}.
 * @remarks
 * See {@link TreeBranchEvents} for more events related to the underlying branch of the SharedTree.
 * @sealed @public
 */
export interface TreeViewEvents {
	/**
	 * Raised whenever {@link TreeView.root} is invalidated.
	 *
	 * This includes changes to the document schema.
	 * It also includes changes to the field containing the root such as setting or clearing an optional root or changing which node is the root.
	 * This does NOT include changes to the content (fields/children) of the root node: for that case subscribe to events on the root node.
	 */
	rootChanged(): void;

	/**
	 * The stored schema for the document has changed.
	 * This may affect the compatibility between the view schema and the stored schema, and thus the ability to use the view.
	 *
	 * @remarks
	 * This event implies that the old {@link TreeView.root} is no longer valid, but applications need not handle that separately:
	 * {@link TreeViewEvents.rootChanged} will be fired after this event.
	 */
	schemaChanged(): void;

	/**
	 * Fired when:
	 *
	 * - a local commit is applied outside of a transaction
	 *
	 * - a local transaction is committed
	 *
	 * The event is not fired when:
	 *
	 * - a local commit is applied within a transaction
	 *
	 * - a remote commit is applied
	 *
	 * @param data - information about the commit that was applied
	 * @param getRevertible - a function provided that allows users to get a revertible for the commit that was applied. If not provided,
	 * this commit is not revertible.
	 */
	commitApplied(data: CommitMetadata, getRevertible?: RevertibleFactory): void;
}

/**
 * Retrieve the {@link TreeViewAlpha | alpha API} for a {@link TreeView}.
 * @remarks
 * This function can be used within the tree package (outside of tests) rather than {@link asAlpha} in order to avoid circular import dependencies.
 */
export function asTreeViewAlpha<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
): TreeViewAlpha<TSchema> {
	return view as TreeViewAlpha<TSchema>;
}
