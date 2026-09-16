/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type {
	HasListeners,
	IEmitter,
	Listenable,
} from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { tagSchemaArtifacts, UsageError } from "@fluidframework/telemetry-utils/internal";

import { anchorSlot, rootFieldKey, type RevertToOptionsAlpha } from "../core/index.js";
import {
	type NodeIdentifierManager,
	defaultSchemaPolicy,
	cursorForMapTreeField,
	Context,
	combineChunks,
	type FlexTreeOptionalField,
	type FlexTreeUnknownUnboxed,
	FieldKinds,
	type FlexTreeRequiredField,
	allowsRepoSuperset,
} from "../feature-libraries/index.js";
import {
	type ImplicitFieldSchema,
	type SchemaCompatibilityStatusBeta,
	type TreeContextAlpha,
	type TreeViewEvents,
	tryGetTreeNodeForField,
	setField,
	normalizeFieldSchema,
	checkSchemaCompatibility,
	type InsertableContent,
	type StagedSchemaUpgradePolicy,
	type TreeViewConfiguration,
	type TreeViewAlpha,
	type InsertableField,
	type ReadableField,
	type ReadSchema,
	type UnsafeUnknownSchema,
	type TreeBranchEvents,
	type VoidTransactionCallbackStatusAlpha,
	type TransactionCallbackStatusAlpha,
	type TransactionVoidResult,
	type TransactionValueResult,
	type RunTransactionParamsAlpha,
	HydratedContext,
	SimpleContextSlot,
	areImplicitFieldSchemaEqual,
	prepareForInsertionContextless,
	type FieldSchema,
	tryDisposeTreeNode,
	FieldSchemaAlpha,
	TreeViewConfigurationAlpha,
	toInitialSchema,
	toUpgradeSchema,
	type TreeBranchHistory,
	type UntypedTreeViewAlpha,
	type TreeSchema,
	type SchemaUpgrade,
	type StagedUpgradeStatus,
} from "../simple-tree/index.js";
import {
	type Breakable,
	breakingClass,
	disposeSymbol,
	type JsonCompatibleReadOnly,
	type WithBreakable,
} from "../util/index.js";

import { canInitialize, initialize, initializerFromChunk } from "./schematizeTree.js";
import type { TreeCheckout } from "./treeCheckout.js";

/**
 * Creating multiple tree views from the same checkout is not supported. This slot is used to detect if one already
 * exists and error if creating a second.
 */
export const ViewSlot = anchorSlot<TreeContextAlpha>();

function throwIfSchemaIsIncompatible(compatibility: SchemaCompatibilityStatusBeta): void {
	if (compatibility.canView) {
		return;
	}

	const resolution = compatibility.canInitialize
		? "The document is uninitialized; call TreeView.initialize() before reading or writing TreeView.root."
		: compatibility.canUpgrade
			? "The stored schema can be upgraded; call TreeView.upgradeSchema() before reading or writing TreeView.root."
			: "The schemas cannot be upgraded automatically. Use a compatible view schema or explicitly migrate the document schema and data.";
	throw new UsageError(
		`TreeView.root is unavailable because the view schema is incompatible with the stored schema. ${resolution}`,
		tagSchemaArtifacts({
			schemaIncompatibilityDetails:
				compatibility.discrepancies === undefined
					? undefined
					: JSON.stringify(compatibility.discrepancies),
		}),
	);
}

/**
 * Implementation of TreeView wrapping a FlexTreeView.
 */
@breakingClass
export class SchematizingSimpleTreeView<
	in out TRootSchema extends ImplicitFieldSchema | UnsafeUnknownSchema,
> implements TreeViewAlpha<TRootSchema>, WithBreakable
{
	/**
	 * This is set to undefined when this object is disposed or the view schema does not support viewing the document's stored schema.
	 *
	 * The view schema may be incompatible with the stored schema. Use `compatibility` to check.
	 */
	private flexTreeContext: Context | undefined;

	/**
	 * Undefined if and only if uninitialized or disposed.
	 */
	private currentCompatibility: SchemaCompatibilityStatusBeta | undefined;
	/**
	 * Cached map of upgrade statuses, computed alongside compatibility.
	 * @remarks Undefined if and only if uninitialized or disposed.
	 */
	private currentEnabledUpgrades: ReadonlyMap<SchemaUpgrade, StagedUpgradeStatus> | undefined;
	public readonly events: Listenable<TreeViewEvents & TreeBranchEvents> &
		IEmitter<TreeViewEvents & TreeBranchEvents> &
		HasListeners<TreeViewEvents & TreeBranchEvents> = createEmitter();

	/**
	 * The schema for this view, captured at construction time for compatibility checking.
	 */
	private readonly viewSchema: TreeSchema;
	/**
	 * Stored-schema generation policy from the view configuration, frozen at construction time.
	 */
	private readonly stagedUpgradePolicy: StagedSchemaUpgradePolicy;

	/**
	 * Events to unregister upon flex-tree view disposal.
	 */
	private readonly flexTreeViewUnregisterCallbacks = new Set<() => void>();

	/**
	 * Events to unregister upon disposal.
	 */
	private readonly unregisterCallbacks = new Set<() => void>();

	public disposed = false;
	/**
	 * This is set to true while an edit impacting the document schema is in progress.
	 * This allows suppressing extra rootChanged / schemaChanged events until the edit concludes.
	 * This is useful especially for some initialization edits, since document initialization can involve transient schemas
	 * which are implementation details and should not be exposed to the user.
	 */
	private midUpgrade = false;

	/**
	 * Hydration work deferred until Context has been created.
	 */
	private pendingHydration?: () => void;

	private readonly rootFieldSchema: FieldSchema;
	public readonly breaker: Breakable;

	public constructor(
		public readonly checkout: TreeCheckout,
		public readonly config: TreeViewConfiguration<ReadSchema<TRootSchema>>,
		public readonly nodeKeyManager: NodeIdentifierManager,
		private readonly onDispose?: () => void,
	) {
		this.breaker = checkout.breaker;
		if (checkout.forest.anchors.slots.has(ViewSlot)) {
			throw new UsageError("Cannot create a second tree view from the same checkout");
		}
		checkout.forest.anchors.slots.set(ViewSlot, this);

		this.rootFieldSchema = normalizeFieldSchema(config.schema);

		const stagedUpgradePolicy =
			config instanceof TreeViewConfigurationAlpha ? config.stagedUpgradePolicy : undefined;
		const configAlpha = new TreeViewConfigurationAlpha({
			...config,
			stagedUpgradePolicy,
		});
		this.stagedUpgradePolicy = configAlpha.stagedUpgradePolicy;

		// Store viewSchema directly from the configuration (TreeViewConfigurationAlpha implements TreeSchema)
		this.viewSchema = configAlpha;
		// This must be initialized before `update` can be called.
		this.currentCompatibility = {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
			canInitialize: true,
			discrepancies: undefined,
		};
		this.currentEnabledUpgrades = new Map();
		this.update();

		this.unregisterCallbacks.add(
			this.checkout.events.on("changed", (data, getRevertible) => {
				this.events.emit("changed", data, getRevertible);
				this.events.emit("commitApplied", data, getRevertible);
			}),
		);
	}

	public isBranch(): this is UntypedTreeViewAlpha {
		return this.isView();
	}

	public isView(): this is UntypedTreeViewAlpha {
		return true;
	}

	public applyChange(change: JsonCompatibleReadOnly): void {
		this.checkout.applySerializedChange(change);
	}

	public hasRootSchema<TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
	): this is TreeViewAlpha<TSchema> {
		return areImplicitFieldSchemaEqual(this.rootFieldSchema, schema);
	}

	public get schema(): ReadSchema<TRootSchema> {
		return this.config.schema;
	}

	public initialize(content: InsertableField<TRootSchema>): void {
		this.ensureUndisposed();

		const compatibility = this.compatibility;
		if (!compatibility.canInitialize) {
			throw new UsageError("Tree cannot be initialized more than once.");
		}

		this.runSchemaEdit(() => {
			const schema = toInitialSchema(this.config.schema, this.stagedUpgradePolicy);
			// This has to be the contextless version, since when "initialize" is called (right after this),
			// it will do a schema change which would dispose of the current context (see inside `update`).
			// Thus using the current context (if any) would hydrate nodes then
			// immediately dispose them instead of having them actually be useable after initialize.
			// For this to work,
			// the hydration must be deferred until after the content is inserted into the tree and the final schema change is done (for required roots),
			// but before any user event could could run.
			const mapTree = prepareForInsertionContextless(
				content as InsertableContent | undefined,
				this.rootFieldSchema,
				{
					schema,
					policy: defaultSchemaPolicy,
				},
				this,
				schema.rootFieldSchema,
				(batches, doHydration) => {
					assert(
						this.pendingHydration === undefined,
						0xc74 /* pendingHydration already set */,
					);
					this.pendingHydration = () => {
						assert(
							batches.length <= 1,
							0xc75 /* initialize should at most one hydration batch */,
						);
						for (const batch of batches) {
							doHydration(batch, {
								parent: undefined,
								parentField: rootFieldKey,
								parentIndex: 0,
							});
						}
					};
				},
			);

			this.runTransaction(() => {
				initialize(
					this.checkout,
					schema,
					initializerFromChunk(this.checkout, () => {
						// This must be done after initial schema is set!
						return combineChunks(
							this.checkout.forest.chunkField(
								cursorForMapTreeField(mapTree === undefined ? [] : [mapTree]),
							),
						);
					}),
				);
			});
		});
	}

	public upgradeSchema(): void {
		this.ensureUndisposed();

		const newSchema = toUpgradeSchema(this.viewSchema.root, this.effectiveUpgradePolicy);
		const storedSchema = this.checkout.storedSchema.clone();
		if (!allowsRepoSuperset(defaultSchemaPolicy, storedSchema, newSchema)) {
			throw new UsageError(
				"Existing stored schema cannot be upgraded to the requested schema (see TreeView.compatibility.canUpgrade).",
			);
		}
		if (allowsRepoSuperset(defaultSchemaPolicy, newSchema, storedSchema)) {
			// No-op
			return;
		}

		this.runSchemaEdit(() => this.checkout.updateSchema(newSchema));
	}

	public isStagedUpgradeEnabled(upgrade: SchemaUpgrade): StagedUpgradeStatus {
		if (!this.currentEnabledUpgrades) {
			this.failDisposed();
		}
		return this.currentEnabledUpgrades.get(upgrade) ?? "disabled";
	}

	private get effectiveUpgradePolicy(): StagedSchemaUpgradePolicy {
		const configuredPolicy = this.stagedUpgradePolicy;
		if (configuredPolicy.includeAlreadyEnabledUpgrades === false) {
			return configuredPolicy;
		}
		const enabledUpgrades = this.currentEnabledUpgrades;
		assert(
			enabledUpgrades !== undefined,
			0xd3e /* Enabled upgrades must be available for an active view */,
		);
		if (enabledUpgrades.size === 0) {
			return configuredPolicy;
		}

		return {
			includeStaged: (upgrade) =>
				configuredPolicy.includeStaged(upgrade) || enabledUpgrades.has(upgrade),
			includeStagedOptional: (upgrade) =>
				configuredPolicy.includeStagedOptional(upgrade) || enabledUpgrades.has(upgrade),
		};
	}

	/**
	 * Gets the flex-tree context. Throws when disposed or out of schema.
	 */
	public getFlexTreeContext(): Context {
		this.ensureUndisposed();
		assert(this.flexTreeContext !== undefined, 0x8c0 /* unexpected getViewOrError */);
		return this.flexTreeContext;
	}

	public runTransaction<TSuccessValue, TFailureValue>(
		transaction: () => TransactionCallbackStatusAlpha<TSuccessValue, TFailureValue>,
		params?: RunTransactionParamsAlpha,
	): TransactionValueResult<TSuccessValue, TFailureValue>;
	public runTransaction(
		transaction: () => VoidTransactionCallbackStatusAlpha | void,
		params?: RunTransactionParamsAlpha,
	): TransactionVoidResult;
	public runTransaction<TSuccessValue, TFailureValue>(
		transaction: () =>
			| TransactionCallbackStatusAlpha<TSuccessValue, TFailureValue>
			| VoidTransactionCallbackStatusAlpha
			| void,
		params?: RunTransactionParamsAlpha,
	): TransactionValueResult<TSuccessValue, TFailureValue> | TransactionVoidResult {
		this.ensureUndisposed();
		return this.checkout.runTransaction(transaction, params);
	}

	public runTransactionAsync<TSuccessValue, TFailureValue>(
		transaction: () => Promise<TransactionCallbackStatusAlpha<TSuccessValue, TFailureValue>>,
		params?: RunTransactionParamsAlpha,
	): Promise<TransactionValueResult<TSuccessValue, TFailureValue>>;
	public runTransactionAsync(
		transaction: () => Promise<VoidTransactionCallbackStatusAlpha | void>,
		params?: RunTransactionParamsAlpha,
	): Promise<TransactionVoidResult>;
	public async runTransactionAsync<TSuccessValue, TFailureValue>(
		transaction: () => Promise<
			| TransactionCallbackStatusAlpha<TSuccessValue, TFailureValue>
			| VoidTransactionCallbackStatusAlpha
			| void
		>,
		params: RunTransactionParamsAlpha | undefined,
	): Promise<TransactionValueResult<TSuccessValue, TFailureValue> | TransactionVoidResult> {
		this.ensureUndisposed();
		if (this.checkout.transaction.size > 0) {
			// breaker.break() sets brokenBy synchronously before throwing.
			// A plain `throw` inside an async function would be captured as a rejected Promise
			// before @breakingClass could set brokenBy. By setting it here first, the
			// subsequent call to unmountTransaction (also @breakingClass-wrapped) will see the
			// broken state and throw synchronously, propagating out of the outer runTransaction
			// to its caller.
			this.breaker.break(
				new UsageError(
					"An asynchronous transaction cannot be started while another transaction is already in progress.",
				),
			);
		}
		return this.checkout.runTransactionAsync(transaction, params);
	}

	private ensureUndisposed(): void {
		if (this.disposed) {
			this.failDisposed();
		}
	}

	private failDisposed(): never {
		throw new UsageError("Accessed a disposed TreeView.");
	}

	/**
	 * Updates `this.view` and the current compatibility status.
	 * Invoked during initialization and when `this.view` needs to be replaced due to stored schema changes.
	 * Handles re-registering for events to call update in the future.
	 * @remarks
	 * This does not check if the view needs to be replaced, it replaces it unconditionally:
	 * callers should do any checking to detect if it's really needed before calling `update`.
	 * @privateRemarks
	 * This implementation avoids making any edits, which prevents it from being invoked reentrantly.
	 * If implicit initialization (or some other edit) is desired, it should be done outside of this method.
	 */
	private update(): void {
		this.disposeFlexView();

		const compatibility = this.computeCompatibility();
		this.currentCompatibility = compatibility;

		const anchors = this.checkout.forest.anchors;
		const slots = anchors.slots;

		if (compatibility.canView) {
			this.flexTreeContext = new Context(
				defaultSchemaPolicy,
				this.checkout,
				this.nodeKeyManager,
			);
			assert(!slots.has(SimpleContextSlot), 0xa47 /* extra simple tree context */);
			assert(
				this.rootFieldSchema instanceof FieldSchemaAlpha,
				0xbfa /* all field schema should be FieldSchemaAlpha */,
			);
			slots.set(
				SimpleContextSlot,
				new HydratedContext(
					this.flexTreeContext,
					HydratedContext.schemaMapFromRootSchema(
						this.rootFieldSchema.allowedTypesFull.evaluate(),
					),
				),
			);

			// Trigger "rootChanged" events if the root changes in the future.
			{
				// Currently there is no good way to do this as FlexTreeField has no events for changes.
				// this.root.on(????)
				// As a workaround for the above, trigger "rootChanged" in "afterBatch".
				// Ideally these events would be just events for changes within the root.
				// TODO: provide a better event: this.view.flexTree.on(????) and/or integrate with with the normal event code paths.

				// Track what the root was before to be able to detect changes.
				// This uses the flex tree root to avoid demanding the simple-tree TreeNode when it might not be hydrated yet.
				let lastRoot: FlexTreeUnknownUnboxed | undefined = (
					this.flexTreeContext.root as FlexTreeOptionalField
				).content;

				this.flexTreeViewUnregisterCallbacks.add(
					this.checkout.events.on("afterBatch", () => {
						// In the initialization flow, this event is raised before the correct compatibility w.r.t the new schema is calculated.
						// Accessing `this.root` in that case can throw. It's OK to ignore this because:
						// - The rootChanged event will already be raised at the end of the current upgrade
						// - It doesn't matter that `lastRoot` isn't updated in this case, because `update` will be called again before the upgrade
						//   completes (at which point this callback and the `lastRoot` captured here will be out of scope anyway)
						if (!this.midUpgrade && lastRoot !== this.flexRoot.content) {
							lastRoot = this.flexRoot.content;
							this.events.emit("rootChanged");
						}
					}),
				);
			}
		}

		this.flexTreeViewUnregisterCallbacks.add(
			// Will dispose the old view (if there is one) when its no longer valid, and create a new one if appropriate.
			this.checkout.storedSchema.events.on("afterSchemaChange", () => this.update()),
		);

		if (!this.midUpgrade) {
			assert(
				this.pendingHydration === undefined,
				0xc76 /* no nodes should be pending hydration when triggering events that could access nodes */,
			);
			this.events.emit("schemaChanged");
			this.events.emit("rootChanged");
		}
	}

	/**
	 * Computes the current schema compatibility status and updates the cached enabled upgrades.
	 */
	private computeCompatibility(): SchemaCompatibilityStatusBeta {
		const { enabledUpgrades, ...compatibility } = checkSchemaCompatibility(
			this.viewSchema,
			this.checkout.storedSchema,
			this.stagedUpgradePolicy,
		);
		this.currentEnabledUpgrades = enabledUpgrades;
		return {
			...compatibility,
			canInitialize: canInitialize(this.checkout),
		};
	}

	private runSchemaEdit(edit: () => void): void {
		this.midUpgrade = true;
		try {
			edit();
		} finally {
			this.midUpgrade = false;
		}
		// Ensure hydration is flushed before events run which could access nodes.
		this.pendingHydration?.();
		this.pendingHydration = undefined;
		this.events.emit("schemaChanged");
		this.events.emit("rootChanged");
	}

	private disposeFlexView(): void {
		const anchors = this.checkout.forest.anchors;
		if (this.flexTreeContext !== undefined) {
			// Cleanup any TreeNodes cached in the AnchorSet when disposing the flex-tree which they wrap.
			for (const anchorNode of anchors) {
				tryDisposeTreeNode(anchorNode);
			}

			this.flexTreeContext[disposeSymbol]();
			this.flexTreeContext = undefined;
		}
		for (const unregister of this.flexTreeViewUnregisterCallbacks) {
			unregister();
		}
		this.flexTreeViewUnregisterCallbacks.clear();
		anchors.slots.delete(SimpleContextSlot);
	}

	public get compatibility(): SchemaCompatibilityStatusBeta {
		if (!this.currentCompatibility) {
			this.failDisposed();
		}
		return this.currentCompatibility;
	}

	public dispose(): void {
		this.disposed = true;
		this.disposeFlexView();
		for (const unregister of this.unregisterCallbacks) {
			unregister();
		}
		this.checkout.forest.anchors.slots.delete(ViewSlot);
		this.currentCompatibility = undefined;
		this.currentEnabledUpgrades = undefined;
		this.onDispose?.();
		if (!this.checkout.isSharedBranch && !this.checkout.disposed) {
			// All non-shared branches are 1:1 with views, so if a user manually disposes a view, we should also dispose the checkout/branch.
			this.checkout.dispose();
		}
	}

	private get flexRoot(): FlexTreeOptionalField | FlexTreeRequiredField {
		this.breaker.use();
		throwIfSchemaIsIncompatible(this.compatibility);
		const view = this.getFlexTreeContext();
		assert(
			view.root.is(FieldKinds.optional) ||
				view.root.is(FieldKinds.required) ||
				view.root.is(FieldKinds.identifier),
			0xc77 /* unexpected root field kind */,
		);
		return view.root;
	}

	public get root(): ReadableField<TRootSchema> {
		return tryGetTreeNodeForField(this.flexRoot) as ReadableField<TRootSchema>;
	}

	public set root(newRoot: InsertableField<TRootSchema>) {
		this.breaker.use();
		throwIfSchemaIsIncompatible(this.compatibility);
		const view = this.getFlexTreeContext();
		setField(
			view.root,
			this.rootFieldSchema,
			newRoot as InsertableContent | undefined,
			this.checkout.storedSchema.rootFieldSchema,
		);
	}

	// #region Branching

	public fork(): ReturnType<UntypedTreeViewAlpha["fork"]> &
		SchematizingSimpleTreeView<TRootSchema> {
		return this.checkout.fork().viewWith(this.config);
	}

	public rewindTo(revision: string): void {
		this.checkout.rewindTo(revision);
	}

	public revertTo(revision: string, options?: RevertToOptionsAlpha): void {
		this.checkout.revertTo(revision, options);
	}

	public merge(context: UntypedTreeViewAlpha, disposeMerged = true): void {
		this.checkout.merge(context, disposeMerged);
	}

	public rebaseOnto(context: UntypedTreeViewAlpha): void {
		this.checkout.rebaseOnto(context);
	}

	public isMissingEditsFrom(context: UntypedTreeViewAlpha): boolean {
		return this.checkout.isMissingEditsFrom(context);
	}

	public computeNetChangeIfRebasedOnto(
		context: UntypedTreeViewAlpha,
	): JsonCompatibleReadOnly | undefined {
		return this.checkout.computeNetChangeIfRebasedOnto(context);
	}

	// #endregion Branching

	public get branchHistory(): TreeBranchHistory {
		return this.checkout.branchHistory;
	}
}
