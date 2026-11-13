/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidLoadable, IDisposable, Listenable } from "@fluidframework/core-interfaces";

import type {
	ChangeMetadata,
	ChangeMetadataBeta,
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
	TreeBranchHandleAlpha,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports -- This is referenced by doc comments.
	TreeAlpha,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- This is referenced by doc comments.
	createViewableTreeAlpha,
} from "../../shared-tree/index.js";
import type {
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnlyObject,
} from "../../util/index.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- This is referenced by doc comments.
import type { SchemaUpgrade, Unhydrated } from "../core/index.js";
import type { TreeNodeSchema } from "../core/index.js";
import type {
	ImplicitFieldSchema,
	InsertableField,
	InsertableTreeFieldFromImplicitField,
	ReadableField,
	ReadSchema,
	TreeFieldFromImplicitField,
} from "../fieldSchema.js";
import type {
	SchemaType,
	SimpleObjectFieldSchema,
	SimpleTreeSchema,
} from "../simpleSchema.js";
import type { UnsafeUnknownSchema } from "../unsafeUnknownSchema.js";

import type { TreeViewConfiguration } from "./configuration.js";
import type { TreeLocationResolver } from "./locations.js";
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
 * @remarks
 * For experimental APIs that access tree content and stored schema without a view schema, see {@link ViewableTreeAlpha}.
 *
 * @see {@link (asAlpha:2)} to access alpha APIs on this tree
 *
 * @privateRemarks
 * Use {@link createViewableTreeAlpha} to implement this interface.
 *
 * TODO:
 * Add stored key versions of {@link (TreeAlpha:interface).(exportConcise:2)} and {@link (TreeAlpha:interface).exportCompressed} here so tree content can be accessed without a view schema.
 * Add an exportJsonSchema method, which should exactly match the concise format and the free function for exporting view schema.
 * Maybe rename "exportJsonSchema" to align on "concise" terminology.
 * Ensure schema exporting APIs here align and reference APIs for exporting view schema to the same formats (which should include stored vs property key choice).
 * Make sure users of createIndependentTreeViewAlpha can use these export APIs (maybe provide a reference back to the ViewableTree from the TreeView to accomplish that).
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
 *
 * @remarks
 * Allows storing and collaboratively editing schema-aware hierarchial data.
 *
 * @see {@link ITreeAlpha} for additional alpha APIs
 * @see {@link (asAlpha:1)} to access alpha APIs on this tree
 *
 * @sealed @public
 */
export interface ITree extends ViewableTree, IFluidLoadable {}

/**
 * A {@link ViewableTree} with experimental APIs.
 *
 * @see {@link (asAlpha:2)} to access these APIs on an existing {@link ViewableTree}
 *
 * @sealed
 * @alpha
 */
export interface ViewableTreeAlpha extends ViewableTree {
	/**
	 * Creates an independent branch from this tree's current state.
	 *
	 * @remarks
	 * Each call creates a new branch.
	 * Changes to the new branch do not affect this tree until you {@link UntypedTreeView.merge | merge} them into a view of this tree.
	 * Use {@link TreeBranchHandleAlpha.viewWith | viewWith} to create a view that can read and edit the new branch.
	 * Use {@link TreeBranchHandleAlpha.fork | fork} to create child branches.
	 *
	 * You own the returned branch.
	 * Dispose the branch when you no longer need it.
	 * If you dispose a view of the source tree or the new branch, the new branch remains available.
	 *
	 * @returns A new, independent branch that you own.
	 * @throws A `UsageError` if this tree's branch has a pending transaction or is disposed.
	 */
	forkBranch(): TreeBranchHandleAlpha;

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
}

/**
 * {@link ITree} extended with some alpha APIs.
 *
 * @remarks
 * This object represents the tree's main branch.
 *
 * @see {@link (asAlpha:1)} to access these APIs on an existing {@link ITree}
 *
 * @sealed @alpha
 */
export interface ITreeAlpha extends ITree, ViewableTreeAlpha {
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
 * An untyped view of a git-style branch of a SharedTree.
 * @remarks
 * Use `UntypedTreeView` to work with a SharedTree branch when you do not know, or do not need, the schema of the tree.
 * This is the primary public API for application code that needs branch-style editing of a SharedTree: an application can {@link UntypedTreeView.fork | fork} a new branch,
 * make changes on it in isolation, and later {@link UntypedTreeView.merge | merge} those changes back.
 *
 * Every {@link ITree | SharedTree} has one "main" branch.
 * All other branches fork from the main branch, either directly or through another branch.
 *
 * @see {@link UntypedTreeViewAlpha} for more experimental APIs.
 * @sealed @beta
 */
export interface UntypedTreeView extends IDisposable, TreeContextBeta {
	/**
	 * Events for the view's underlying branch.
	 */
	readonly events: Listenable<TreeBranchEventsBeta>;

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
	 * Creates a view of a new branch based on this branch's current state.
	 *
	 * @remarks
	 * Changes through the returned view do not affect this branch until you {@link UntypedTreeView.merge | merge} them back.
	 * The returned view owns its branch: disposing the view also disposes that branch.
	 *
	 * @returns A view that owns the new branch.
	 * @throws A `UsageError` if this branch has a pending transaction or is disposed.
	 */
	fork(): UntypedTreeView;

	/**
	 * Applies all new changes from the provided view's branch to this view's branch.
	 * @param view - A view of a branch that shares a common ancestor with this view's branch.
	 * For example, use a view from {@link UntypedTreeView.fork} or {@link TreeBranchHandleAlpha.viewWith}.
	 * The provided branch does not need to be a direct fork of this view's branch.
	 * @param disposeMerged - If true, dispose the provided view and its branch after a successful merge, unless that branch is shared.
	 * The default is true.
	 * Pass false to keep the provided view and its branch available.
	 *
	 * @remarks
	 * The disposal policy also applies when the provided view was created through {@link TreeBranchHandleAlpha.viewWith}:
	 * a successful merge disposes its branch and view unless `disposeMerged` is false.
	 * Shared branches, including the main branch, are not disposed by a merge.
	 * The merge does not dispose this view or the branch it views.
	 *
	 * @throws A `UsageError` if either branch has a pending transaction or is disposed.
	 * @throws An error if the branches do not share a common ancestor.
	 */
	merge(view: UntypedTreeView, disposeMerged?: boolean): void;

	/**
	 * Advance this view forward such that all new changes on the target view become part of this view.
	 * @param view - The view to rebase onto.
	 * @remarks After rebasing, this view will be "ahead" of the target view, that is, its unique changes will have been recreated as if they happened after all changes on the target view.
	 * This method can be called on views from {@link UntypedTreeView.fork | fork} or {@link TreeBranchHandleAlpha.viewWith}.
	 * Shared branches, including the main branch, cannot be rebased onto another branch.
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

	/**
	 * The schema of the {@link ObjectSchemaOptions.allowUnknownOptionalFields | unknown fields} of each object node schema in the view schema of this context.
	 *
	 * @remarks
	 * Each key is an object node schema in the view schema that has unknown fields.
	 * Each value maps the {@link SimpleObjectFieldSchema.storedKey | stored key} of each of those fields to its schema.
	 *
	 * This is `undefined` if this context has no view schema, for example the context of an {@link Unhydrated | unhydrated} node.
	 *
	 * The value can change when the stored schema changes, for example when another client upgrades the schema.
	 * To be notified of these changes, listen to {@link TreeViewEvents.schemaChanged} on the {@link TreeViewAlpha | view}, then read this property again.
	 * Reading this property is not tracked by {@link (TreeAlpha:interface).trackObservations} or {@link (TreeAlpha:interface).trackObservationsOnce},
	 * so a stored schema change does not invalidate their results.
	 *
	 * To read the content of these fields, use {@link (TreeAlpha:interface).(exportVerbose:1)} with {@link KeyEncodingOptions.allStoredKeys}.
	 */
	readonly unknownFieldSchemas:
		| ReadonlyMap<
				TreeNodeSchema,
				ReadonlyMap<string, SimpleObjectFieldSchema<SchemaType.Stored>>
		  >
		| undefined;
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

	/**
	 * Applies a new change that reverts all changes made after this commit on the branch from which it was obtained.
	 * This is a no-op if this commit is the head of that branch.
	 *
	 * @param options - Optional {@link RevertToOptionsAlpha | options} for the revert.
	 *
	 * @remarks
	 * This method is `undefined` when the commit is no longer reachable on its original branch, the branch has
	 * been replaced or disposed, a later commit contains a schema change, or reverting is temporarily disallowed
	 * (for example, during a transaction). Its availability can change as the branch's history changes.
	 * A schema change in this commit does not prevent reverting later data changes.
	 *
	 * Access this method on the metadata before each call; do not retain references to it.
	 * Each obtained function is single-use and throws a `UsageError` if reused or if the branch changes before it is called.
	 *
	 * The generated change is subject to the same merge semantics as the {@link Revertible.(revert:1) | reverts of individual commits}:
	 * Concurrent changes that are sequenced before the revert will not be overwritten by the revert if they affect different parts of the document.
	 *
	 * Unlike {@link UntypedTreeViewAlpha.rewindTo | rewindTo}, this does not switch to a new branch.
	 */
	revertTo?(options?: RevertToOptionsAlpha): void;
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
	 * Reading this property after the branch is disposed throws an error.
	 */
	readonly length: number;

	/**
	 * Returns metadata for the current head commit of this branch.
	 * @returns The metadata for the head commit, or `undefined` if the branch has no commits.
	 */
	getHead(): TreeBranchCommitMetadata | undefined;
}

/**
 * An {@link UntypedTreeView} with alpha-level APIs.
 * @remarks
 * Use `UntypedTreeViewAlpha` when your application needs to inspect or manipulate branch history directly.
 *
 * To get the untyped view for a specific {@link TreeNode}, call {@link (TreeAlpha:interface).context}
 * and check {@link TreeContextAlpha.isView | isView()}.
 *
 * An untyped view does not necessarily know the schema of its SharedTree.
 * To convert it to a {@link TreeViewAlpha | view with a schema}, use {@link UntypedTreeViewAlpha.hasRootSchema | hasRootSchema()}.
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
	 * Captures node selections and sequence gaps, and resolves them into this view's current local state.
	 */
	readonly locations: TreeLocationResolver;

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
	 * Switches this view to a new branch with the specified commit as its head.
	 *
	 * @param revision - The {@link TreeBranchCommitMetadata.revision | revision} to rewind to.
	 * Can be obtained by navigating the commits on the {@link UntypedTreeViewAlpha.branchHistory | branch history}.
	 *
	 * @remarks
	 * Unlike {@link UntypedTreeViewAlpha.revertTo | revertTo}, this method does not apply a change to the current branch.
	 * Instead, it disposes the current branch.
	 * Use {@link UntypedTreeViewAlpha.fork | fork} first to keep a copy of the current state.
	 * Do not call this method on the main branch or a {@link (ITreeAlpha:interface).createSharedBranch | shared branch}.
	 * Do not call it on a view whose branch cannot be replaced.
	 * This restriction includes views created through {@link TreeBranchHandleAlpha.viewWith} and forks of those views.
	 * Use {@link TreeBranchCommitMetadata.revertTo} to restore earlier content without replacing the branch.
	 *
	 * @throws A `UsageError` if this view's branch cannot be replaced, is shared, has a pending transaction, or is disposed.
	 * @throws A `UsageError` if a revision with the given UUID cannot be found in this branch's history.
	 */
	rewindTo(revision: CommitRevision): void;

	/**
	 * Applies a new change which reverts all changes made since the given `revision`.
	 * This is a no-op if the given revision is the head commit of the underlying branch being viewed.
	 *
	 * @param revision - The {@link TreeBranchCommitMetadata.revision | revision} to restore the state of.
	 * Can be obtained by navigating the commits on the {@link UntypedTreeViewAlpha.branchHistory | branch history}.
	 * @param options - Optional {@link RevertToOptionsAlpha | options} for the revert.
	 * @throws a `UsageError` (without applying changes) if any commit after the given revision contains a schema change.
	 *
	 * @remarks
	 * The generated change is subject to the same merge semantics as the {@link Revertible.(revert:1) | reverts of individual commits}:
	 * Concurrent changes that are sequenced before the revert will not be overwritten by the revert if they affect different parts of the document.
	 *
	 * Unlike {@link UntypedTreeViewAlpha.rewindTo | rewindTo}, this does not switch to a new branch.
	 * For new code, use {@link TreeBranchCommitMetadata.revertTo} on a commit from this view's branch history instead.
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
 * @see {@link TreeViewBeta}
 * @see {@link (asAlpha:3)} to access alpha APIs on this view
 * @see {@link asBeta} to access beta APIs on this view
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
	 * Describes whether this view's configuration permits viewing, upgrading, or initializing the document.
	 * @remarks
	 * {@link TreeViewEvents.schemaChanged} is fired when the compatibility status of the document's stored schema changes.
	 * See {@link https://fluidframework.com/docs/data-structures/tree/schema-evolution/ | schema-evolution} for more guidance on how to change schema while maintaining compatibility.
	 * Use {@link snapshotSchemaCompatibility} to write tests to validate that this compatibility behaves as desired across schema changes.
	 */
	readonly compatibility: SchemaCompatibilityStatus;

	/**
	 * When {@link SchemaCompatibilityStatus.canUpgrade} is true,
	 * this can be used to modify the stored schema to make it compatible with the view.
	 * @remarks
	 * An upgrade makes the schema changes needed by this view while preserving content permitted by the existing stored schema.
	 * For example, it can add an allowed type or make a required field optional, but cannot remove an allowed type that existing content may use.
	 * Preserving content does not guarantee that other application versions can read newly allowed values, so check their compatibility before deploying the change.
	 *
	 * When the stored schema is upgraded, {@link SchemaCompatibilityStatus.canView} becomes `true`, and {@link TreeView.root} becomes available.
	 *
	 * Use {@link SchemaCompatibilityStatus.canUpgrade} to check whether calling this method is permitted; calling it when that flag is `false` is an error.
	 *
	 * When using {@link TreeViewConfigurationAlpha} with a {@link ITreeViewConfigurationAlpha.stagedUpgradePolicy},
	 * the configured policy selects which staged upgrades to enable.
	 * Already-enabled upgrades are preserved even if the policy does not select their tokens, allowing a flag-off client to make other compatible upgrades.
	 * This preservation is local to each field: if fields share a token but only one has the change enabled, the others remain unchanged unless the policy enables that token.
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
	 * As persisted metadata becomes more supported, how it interacts with `upgradeSchema` should be clarified:
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
 * A discrepancy that prevents a view schema from providing read/write access to a tree, based on that tree's existing stored schema.
 *
 * @remarks
 * These entries explain why {@link SchemaCompatibilityStatusBeta.view} does not permit access to the document.
 * They compare the view schema with the document's existing stored schema, rather than checking its current content
 * or the proposed schema for an upgrade.
 *
 * To identify the failed constraint, use `mismatch` to distinguish the entry's shape and interpret its structured fields.
 * An entry can also include staging annotations that provide context without themselves preventing access.
 *
 * @sealed @beta
 */
export type SchemaDiscrepancy =
	| {
			/**
			 * Indicates that a field allows different node types in the view and stored schemas.
			 *
			 * @remarks
			 * This compares node type identifiers, not the shapes of nodes with the same identifier.
			 * For example, changing a field from `sf.number` to `sf.string` changes its allowed types,
			 * so `view` and `stored` identify the types allowed only on their respective sides.
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
			 *
			 * @remarks
			 * A field's kind determines its child presence requirements, independently of which node types it allows.
			 * For example, `"Value"` requires exactly one child, while `"Optional"` permits zero or one,
			 * so changing between them changes whether a child can be absent.
			 * The other kinds are `"Sequence"` (any number of children), `"Forbidden"` (no children),
			 * and `"Identifier"` (a required identifier field).
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
			 *
			 * @remarks
			 * A leaf holds a primitive value or a Fluid handle rather than child nodes,
			 * so its value schema determines which values it accepts.
			 * This mismatch occurs when the same node type identifier requires different value types,
			 * such as `"Number"` in the view and `"String"` in the stored schema.
			 * In contrast, changing a field between `sf.number` and `sf.string` uses different node identifiers,
			 * so that change produces an `"allowedTypes"` mismatch instead.
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
			 *
			 * @remarks
			 * Node kinds describe structure, such as an object, map, array, or leaf.
			 * Because the view must interpret the stored structure, it cannot view an identifier as an object
			 * when the stored schema defines it as a map.
			 * Arrays require an additional structural check because they use an object representation in stored schema:
			 * a stored object that lacks the required array structure also produces this mismatch.
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
 * A constraint that prevents the proposed stored schema from being a permitted upgrade.
 *
 * @remarks
 * Before upgrading a document, the view creates a proposed stored schema using its effective staged-upgrade policy.
 * The proposal must both satisfy the stored-schema upgrade rules and allow the view to read and write the document.
 * These entries explain which requirement prevents the upgrade, rather than why viewing the document's current schema is blocked.
 *
 * When the proposal violates a stored-schema upgrade rule, the entry identifies the schema difference that caused the failure.
 * For mismatch kinds shared with {@link SchemaViewIncompatibility}, the entries use the same shapes,
 * but replace `view` with `proposed` and omit viewing-specific staging annotations.
 * For an allowed-type mismatch, the arrays show identifiers present on only one side of the comparison:
 * removing stored types blocks the upgrade, while proposed-only types are included for context.
 *
 * Even if the proposal satisfies the stored-schema upgrade rules, it can still prevent viewing.
 * In that case, `viewIncompatibleAfterUpgrade` contains the viewing incompatibilities for the proposed schema,
 * explaining why the upgrade would not make the document accessible through this view.
 *
 * @sealed @beta
 */
export type SchemaUpgradeIncompatibility =
	| {
			/**
			 * A field's proposed allowed types do not include all its stored allowed types.
			 *
			 * @remarks
			 * An upgrade must continue to allow the stored field's node types.
			 * For example, replacing `[sf.number, sf.string]` with `sf.number` fails this requirement because it removes support for string nodes.
			 * The comparison therefore concerns node type identifiers, not the primitive value types or shapes of those nodes.
			 */
			readonly mismatch: "allowedTypes";
			/**
			 * A human-readable explanation of the failed constraint.
			 * Intended for diagnostics, not parsing or choosing an application-specific fix.
			 */
			readonly reason: string;
			/**
			 * The root field, or the containing node identifier and stored field key.
			 * The field key is undefined for a map's implicit field.
			 */
			readonly location:
				| "root"
				| {
						readonly nodeType: string;
						readonly fieldKey: string | undefined;
				  };
			/**
			 * Node type identifiers allowed only by the proposed schema.
			 */
			readonly proposed: readonly string[];
			/**
			 * Node type identifiers allowed only by the stored schema.
			 * Removing these types prevents the upgrade.
			 */
			readonly stored: readonly string[];
	  }
	| {
			/**
			 * The transition from the stored field kind to the proposed kind is not permitted.
			 *
			 * @remarks
			 * Because field kinds determine how many children a field permits, changing the kind can exclude previously allowed content.
			 * For example, changing `"Optional"` (zero or one child) to `"Value"` (exactly one) would stop accepting an absent child.
			 * Accepting the same content is not the only requirement: upgrade rules also restrict some transitions
			 * to prevent clients from repeatedly upgrading back and forth.
			 */
			readonly mismatch: "fieldKind";
			/**
			 * A human-readable explanation of the failed constraint.
			 * Intended for diagnostics, not parsing or choosing an application-specific fix.
			 */
			readonly reason: string;
			/**
			 * The root field, or the containing node identifier and stored field key.
			 * The field key is undefined for a map's implicit field.
			 */
			readonly location:
				| "root"
				| {
						readonly nodeType: string;
						readonly fieldKey: string | undefined;
				  };
			/**
			 * The proposed field kind.
			 */
			readonly proposed: string;
			/**
			 * The stored field kind.
			 */
			readonly stored: string;
	  }
	| {
			/**
			 * A leaf node's proposed value schema is incompatible with its stored value schema.
			 *
			 * @remarks
			 * A leaf holds a primitive value or a Fluid handle rather than child nodes.
			 * For example, reusing a node type identifier for number values when it previously held strings
			 * would stop accepting the stored string values.
			 * In contrast, changing a field between `sf.number` and `sf.string` uses different node identifiers,
			 * so that change produces an `"allowedTypes"` mismatch instead.
			 */
			readonly mismatch: "valueSchema";
			/**
			 * A human-readable explanation of the failed constraint.
			 * Intended for diagnostics, not parsing or choosing an application-specific fix.
			 */
			readonly reason: string;
			/**
			 * The leaf node schema identifier.
			 */
			readonly nodeType: string;
			/**
			 * The proposed value schema, or undefined when it does not constrain values.
			 */
			readonly proposed: string | undefined;
			/**
			 * The stored value schema, or undefined when it does not constrain values.
			 */
			readonly stored: string | undefined;
	  }
	| {
			/**
			 * The proposed node kind is incompatible with the stored node kind.
			 *
			 * @remarks
			 * Stored nodes use an `"Object"`, `"Map"`, or `"Leaf"` representation, with arrays using the object representation.
			 * Changing that representation can stop accepting previously allowed structures;
			 * for example, changing a stored map to an object under the same identifier is not permitted.
			 * Some object-to-map upgrades are permitted, however, so a representation change alone does not imply a failure.
			 * This mismatch reports a blocked structural change, rather than a difference in field presence or primitive value types.
			 */
			readonly mismatch: "nodeKind";
			/**
			 * A human-readable explanation of the failed constraint.
			 * Intended for diagnostics, not parsing or choosing an application-specific fix.
			 */
			readonly reason: string;
			/**
			 * The node schema identifier.
			 */
			readonly nodeType: string;
			/**
			 * The proposed node kind.
			 */
			readonly proposed: string;
			/**
			 * The stored node kind.
			 */
			readonly stored: string;
	  }
	| {
			/**
			 * A constructible stored node definition is absent from the proposed schema.
			 *
			 * @remarks
			 * Upgrading must preserve stored node types even when they are unreachable from the document root,
			 * since detached content may use them.
			 */
			readonly mismatch: "missingNodeSchema";
			/**
			 * A human-readable explanation of the failed constraint.
			 * Intended for diagnostics, not parsing or choosing an application-specific fix.
			 */
			readonly reason: string;
			/**
			 * The missing stored node schema identifier.
			 */
			readonly nodeType: string;
	  }
	| {
			/**
			 * The proposed node definition has requirements that cannot be satisfied under the upgrade rules.
			 *
			 * @remarks
			 * The upgrade comparison checks whether the proposed node can be constructed,
			 * resolving its allowed child types against the existing stored definitions.
			 * For example, a required field cannot be filled if it allows no types or none of its allowed types can be constructed this way.
			 * This failure therefore describes an unsatisfied schema requirement, not invalid document content.
			 */
			readonly mismatch: "nodeSchemaCannotBeSatisfied";
			/**
			 * A human-readable explanation identifying the unsatisfied field or map constraint.
			 * Intended for diagnostics, not parsing or choosing an application-specific fix.
			 */
			readonly reason: string;
			/**
			 * The stored node schema identifier.
			 */
			readonly nodeType: string;
	  }
	| {
			/**
			 * The proposed stored schema is an allowed upgrade but would still prevent this view from reading or writing.
			 *
			 * @remarks
			 * An upgrade can preserve existing allowed types that this view does not support,
			 * leaving the document inaccessible even though the stored-schema upgrade rules are satisfied.
			 * To explain why the upgrade would not resolve access, these incompatibilities compare the view
			 * with the proposed schema rather than the current stored schema.
			 */
			readonly mismatch: "viewIncompatibleAfterUpgrade";
			/**
			 * A human-readable explanation of why the upgrade would not enable viewing.
			 * Intended for diagnostics, not parsing or choosing an application-specific fix.
			 */
			readonly reason: string;
			/**
			 * The nonempty list of viewing incompatibilities with the proposed stored schema.
			 */
			readonly incompatibilities: readonly SchemaViewIncompatibility[];
	  };

/**
 * An incompatibility that prevents a view from providing read/write access to a document.
 *
 * @remarks
 * To help you diagnose the failure, this combines the structured details from {@link SchemaDiscrepancy} with a human-readable reason.
 * The reason explains the failed schema constraint, but cannot determine which change is appropriate for your application.
 * Use it for diagnostics rather than programmatic handling: its wording is not stable API,
 * so application logic should use `mismatch` and the structured fields instead.
 *
 * @sealed @beta
 */
export type SchemaViewIncompatibility = SchemaDiscrepancy & {
	/**
	 * A human-readable explanation of the failed constraint and its location.
	 * Intended for diagnostics, not parsing or choosing an application-specific fix.
	 */
	readonly reason: string;
};

/**
 * Whether a schema operation is permitted, including its blocking incompatibilities when it is not.
 *
 * @typeParam TIncompatibility - The incompatibilities that can prevent the operation.
 * @remarks
 * Check `isCompatible` to determine whether you can perform the operation.
 * If it is false, `incompatibilities` explains what prevents it; successful results have no such property.
 *
 * Each result describes the schema and configuration at the time compatibility was checked.
 * Retaining a result therefore preserves that assessment even if the document schema subsequently changes.
 *
 * @sealed @beta
 */
export type CompatibilityResult<TIncompatibility> =
	| {
			/**
			 * The operation is permitted.
			 */
			readonly isCompatible: true;
	  }
	| {
			/**
			 * The operation is blocked by schema incompatibilities.
			 */
			readonly isCompatible: false;
			/**
			 * The nonempty list of incompatibilities that prevent the operation.
			 *
			 * @remarks
			 * Each entry describes a failed schema constraint rather than an issue with the document's current content.
			 * To identify the affected schema location, entries can include application-defined schema identifiers and stored field keys.
			 *
			 * The list can be computed lazily on first access, but is cached for this result
			 * and still describes the schema at the time of the check.
			 */
			readonly incompatibilities: readonly TIncompatibility[];
	  };

/**
 * {@link SchemaCompatibilityStatus} with additional beta APIs.
 *
 * @sealed @beta
 */
export interface SchemaCompatibilityStatusBeta extends SchemaCompatibilityStatus {
	/**
	 * Whether the view schema permits read/write access to the document, and any incompatibilities that prevent access.
	 *
	 * @remarks
	 * Check `isCompatible` before accessing {@link TreeView.root}, since root access throws when viewing is blocked.
	 * In that case, the nonempty `incompatibilities` list explains the failed schema constraints.
	 * An entry may also include staging context to help you interpret the failure, even when that context does not itself block access.
	 *
	 * Because this result concerns viewing, it does not list every schema difference or determine whether an upgrade is permitted.
	 * To check whether upgrading is an option, use {@link SchemaCompatibilityStatusBeta.upgrade}.
	 *
	 * @example Interpreting an allowed-types incompatibility
	 *
	 * If a document's stored schema allows `string` for `Todo.title`, but the view schema expects
	 * `number`, the incompatibility identifies the field and the type permitted by each schema:
	 *
	 * ```typescript
	 * const sf = new SchemaFactory("com.example");
	 * class Todo extends sf.object("Todo", {
	 * 	title: sf.number,
	 * }) {}
	 *
	 * const view = asBeta(tree.viewWith(new TreeViewConfiguration({ schema: Todo })));
	 * if (!view.compatibility.view.isCompatible) {
	 * 	// [{
	 * 	//   mismatch: "allowedTypes",
	 * 	//   location: { nodeType: "com.example.Todo", fieldKey: "title" },
	 * 	//   view: ["com.fluidframework.leaf.number"],
	 * 	//   stored: ["com.fluidframework.leaf.string"],
	 * 	//   reason: 'Cannot view field "title" of node type "com.example.Todo": ...',
	 * 	// }]
	 * 	console.error(view.compatibility.view.incompatibilities);
	 * }
	 * ```
	 */
	readonly view: CompatibilityResult<SchemaViewIncompatibility>;

	/**
	 * Whether the proposed stored schema is a permitted upgrade, and any incompatibilities that prevent upgrading.
	 *
	 * @remarks
	 * Check `isCompatible` before calling {@link TreeView.upgradeSchema}.
	 * A true result permits the call, but does not mean an upgrade is needed;
	 * a false result includes a nonempty `incompatibilities` list explaining what prevents the upgrade.
	 *
	 * The check applies the view's effective staged-upgrade policy to generate the proposed stored schema.
	 * It then checks all existing stored node definitions, including those unreachable from the document root,
	 * because detached content can still use them.
	 *
	 * Upgrade permission is independent of permission to view the current document, so either operation can be permitted without the other.
	 * When viewing is already possible, upgrade failure details are deferred until you first access them.
	 * Once computed, they are cached for this result and continue to describe the schema snapshot used for the check.
	 */
	readonly upgrade: CompatibilityResult<SchemaUpgradeIncompatibility>;

	/**
	 * Incompatibilities that prevent viewing, or undefined when viewing is permitted.
	 *
	 * @remarks
	 * When {@link SchemaCompatibilityStatus.canView} is false, this is the same nonempty list
	 * exposed by {@link SchemaCompatibilityStatusBeta.view} as `incompatibilities`.
	 */
	readonly discrepancies: readonly SchemaDiscrepancy[] | undefined;
}

/**
 * {@link TreeView} with additional beta APIs.
 *
 * @see {@link TreeViewAlpha} for additional alpha APIs
 * @see {@link asBeta} to access these APIs on an existing {@link TreeView}
 * @see {@link (asAlpha:3)} to access alpha APIs on this view
 *
 * @sealed @beta
 */
export interface TreeViewBeta<in out TSchema extends ImplicitFieldSchema>
	extends TreeView<TSchema>,
		UntypedTreeView {
	readonly compatibility: SchemaCompatibilityStatusBeta;

	/**
	 * {@inheritDoc TreeView.events}
	 */
	readonly events: Listenable<TreeViewEvents & TreeBranchEventsBeta>;

	// Override the base branch method to return a typed view rather than merely a branch.
	fork(): ReturnType<UntypedTreeView["fork"]> & TreeViewBeta<TSchema>;
}

/**
 * {@link TreeView} with proposed changes to the schema aware typing to allow use with `UnsafeUnknownSchema`.
 *
 * @see {@link TreeViewBeta} for beta APIs
 * @see {@link (asAlpha:3)} to access these APIs on an existing {@link TreeView}
 * @see {@link asBeta} to access beta APIs on a {@link TreeView}
 *
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
	 * Results are derived from this view's schema and the existing stored schema.
	 * The full schema is checked even when the view is incompatible with the stored schema, so the
	 * result includes all locations declared by the view schema.
	 */
	isStagedUpgradeEnabled(upgrade: SchemaUpgrade): StagedUpgradeStatus;

	readonly events: Listenable<TreeViewEvents & TreeBranchEvents>;

	// Override the base fork method to return a TreeViewAlpha.
	// Keep the alpha view first so event listeners infer alpha metadata.
	fork(): TreeViewAlpha<TSchema> & ReturnType<UntypedTreeView["fork"]>;
}

/**
 * Information about whether a view's configuration permits viewing, upgrading, or initializing a document, and whether its schemas are equivalent.
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
	 * Whether the view schema would generate an equivalent stored schema to the existing one.
	 * That is, whether both the existing stored schema and the stored schema derived
	 * from the view allow the same subset of documents.
	 *
	 * @remarks
	 *
	 * This is true only when {@link SchemaCompatibilityStatus.canView} is true and the existing and generated stored schemas each satisfy the schema upgrade rules relative to the other.
	 * Thus, a `true` value also implies that {@link SchemaCompatibilityStatus.canUpgrade} is true.
	 *
	 * Equivalence does not require the schemas to be identical.
	 * Differences that do not affect schema compatibility, such as {@link NodeSchemaOptionsAlpha.persistedMetadata}, do not affect this flag.
	 *
	 * The generated schema depends only on the view and its {@link ITreeViewConfigurationAlpha.stagedUpgradePolicy | staged upgrade policy}, as when initializing a new document.
	 * It does not retain staged upgrades already enabled in the existing document.
	 * A view whose policy excludes an already-enabled staged type can therefore report `false` even though {@link TreeView.upgradeSchema} would preserve that type and make no change.
	 *
	 * Allowing unknown optional fields through {@link ObjectSchemaOptions.allowUnknownOptionalFields} can permit viewing without equivalence:
	 * fields present in the stored schema but absent from the generated stored schema can still prevent equivalence.
	 *
	 * When true, {@link TreeView.upgradeSchema} makes no change to the stored schema.
	 *
	 * A `false` value does not by itself mean that viewing or upgrading will throw.
	 * Check {@link SchemaCompatibilityStatus.canView} before accessing {@link TreeView.root},
	 * and {@link SchemaCompatibilityStatus.canUpgrade} before calling {@link TreeView.upgradeSchema}.
	 *
	 * @deprecated
	 * This property isn't needed as a part of application flows for loading a document.
	 * Use {@link SchemaCompatibilityStatus.canView} to determine if a document can be viewed as-is.
	 * Use {@link SchemaCompatibilityStatus.canUpgrade} to determine if the stored schema can be upgraded to match the view schema, when the document is not viewable as-is.
	 *
	 * When diagnosing schema incompatibility issues, use the `incompatibilities` on
	 * {@link SchemaCompatibilityStatusBeta.view} and {@link SchemaCompatibilityStatusBeta.upgrade}.
	 *
	 * No direct replacement APIs are intended for this property.
	 * It will be removed in a version 4.0.0.
	 * See {@link https://github.com/microsoft/FluidFramework/issues/28660} for more details.
	 */
	readonly isEquivalent: boolean;

	/**
	 * Whether the view schema can provide read/write access to a tree, based on the tree's existing stored schema.
	 *
	 * @remarks
	 * If false, accessing {@link TreeView.root} throws.
	 *
	 * A view does not need to declare exactly the same schema as the document to provide read/write access.
	 * It can tolerate additional stored content when its declarations provide the appropriate compatibility support:
	 *
	 * - {@link ObjectSchemaOptions.allowUnknownOptionalFields} lets an object view tolerate additional optional fields without exposing them as properties.
	 *
	 * - A {@link SchemaStaticsBeta.staged | staged allowed type} lets the view read and write that type where the stored schema already permits it.
	 *
	 * - A {@link SchemaStaticsAlpha.stagedOptional | staged-optional field} lets the view handle missing content where the stored field is already optional.
	 *
	 * These allowances determine whether the current document can be used; they do not by themselves determine {@link SchemaCompatibilityStatus.canUpgrade}.
	 * For example, a view that tolerates unknown optional fields can read a document while still being unable to upgrade it because it omits those fields.
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
	 * Whether the stored schema and the view's requested additions can be composed into a safe upgrade target that the view can read and edit.
	 *
	 * @remarks
	 * Use this flag when deciding whether to call {@link TreeView.upgradeSchema}; calling it when the flag is `false` throws a `UsageError`.
	 *
	 * A `true` result permits the call but does not mean an upgrade is needed: the view may already work with the stored schema, or the requested upgrade may be a no-op.
	 * If {@link SchemaCompatibilityStatus.canView} is `false`, you must apply the permitted upgrade before accessing the document through this view.
	 *
	 * To determine whether the upgrade is safe, this check considers a target built from the existing stored schema and the view's requested additions.
	 * The {@link ITreeViewConfigurationAlpha.stagedUpgradePolicy | staged upgrade policy} chooses which staged upgrades to enable.
	 * The target also retains existing allowed types and supported optionality at their stored locations, independently of that policy.
	 *
	 * The target is accepted only if it satisfies the stored-schema upgrade rules and gives the requesting view read/write access.
	 * This preservation does not retain optional fields omitted from an object's view schema.
	 * Adding an optional field can therefore let older views continue reading when they allow {@link ObjectSchemaOptions.allowUnknownOptionalFields}, while preventing those views from making further upgrades.
	 * Keep the field in future view declarations if those clients need to upgrade documents that contain it.
	 */
	readonly canUpgrade: boolean;

	/**
	 * Whether the document is uninitialized: it has neither stored schema nor tree content.
	 *
	 * @remarks
	 * If false, calling {@link TreeView.initialize} throws a `UsageError`.
	 *
	 * This checks only the document's state, independently of the view schema and staged upgrade policy.
	 * An initialized document with no tree content is considered initialized if it has stored schema.
	 *
	 * When true, you can call {@link TreeView.initialize} to set the initial stored schema and content.
	 * The initial stored schema is generated from the view's configuration, including its staged upgrade policy.
	 * This flag does not validate proposed initial content; the content supplied to `initialize` must be valid for that schema.
	 *
	 * You do not need to check this flag when your application already knows that it is initializing a new `SharedTree`.
	 */
	readonly canInitialize: boolean;

	// TODO: Consider extending this status to include:
	// - application-defined metadata about the stored schema
	// - details about the differences between the stored and view schema sufficient for implementing "safe mismatch" policies
}

/**
 * Events for {@link UntypedTreeView}.
 * @sealed @beta
 */
export interface TreeBranchEventsBeta {
	/**
	 * Fired when a change is made to the branch. Includes data about the change that is made which listeners
	 * can use to filter on changes they care about (e.g. local vs. remote changes).
	 *
	 * @param data - information about the change, including settlement events for local changes
	 */
	changed(data: ChangeMetadataBeta): void;
}

/**
 * Events for {@link UntypedTreeView}.
 * @sealed @alpha
 */
export interface TreeBranchEvents extends TreeBranchEventsBeta {
	/**
	 * Fired as described by {@link TreeBranchEventsBeta.changed}, with alpha change metadata and revertible support.
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
