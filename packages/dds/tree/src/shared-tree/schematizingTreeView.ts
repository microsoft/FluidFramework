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
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { anchorSlot } from "../core/index.js";
import {
	type NodeIdentifierManager,
	defaultSchemaPolicy,
	cursorForMapTreeNode,
	TreeStatus,
	Context,
} from "../feature-libraries/index.js";
import {
	type ImplicitFieldSchema,
	type SchemaCompatibilityStatus,
	type TreeView,
	type TreeViewEvents,
	tryGetTreeNodeForField,
	setField,
	normalizeFieldSchema,
	SchemaCompatibilityTester,
	type InsertableContent,
	type TreeViewConfiguration,
	type TreeViewAlpha,
	type InsertableField,
	type ReadableField,
	type ReadSchema,
	type UnsafeUnknownSchema,
	type TreeBranch,
	type TreeBranchEvents,
	getOrCreateInnerNode,
	getKernel,
	type VoidTransactionCallbackStatus,
	type TransactionCallbackStatus,
	type TransactionResult,
	type TransactionResultExt,
	type RunTransactionParams,
	type TransactionConstraint,
	HydratedContext,
	SimpleContextSlot,
	areImplicitFieldSchemaEqual,
	prepareForInsertionContextless,
	type FieldSchema,
	tryDisposeTreeNode,
	FieldSchemaAlpha,
	TreeViewConfigurationAlpha,
	toInitialSchema,
} from "../simple-tree/index.js";
import {
	type Breakable,
	breakingClass,
	disposeSymbol,
	type WithBreakable,
} from "../util/index.js";

import { canInitialize, ensureSchema, initialize } from "./schematizeTree.js";
import type { ITreeCheckout, TreeCheckout } from "./treeCheckout.js";

/**
 * Creating multiple tree views from the same checkout is not supported. This slot is used to detect if one already
 * exists and error if creating a second.
 */
export const ViewSlot = anchorSlot<TreeView<ImplicitFieldSchema>>();

/**
 * Implementation of TreeView wrapping a FlexTreeView.
 */
@breakingClass
export class SchematizingSimpleTreeView<
	in out TRootSchema extends ImplicitFieldSchema | UnsafeUnknownSchema,
> implements TreeBranch, TreeViewAlpha<TRootSchema>, WithBreakable
{
	/**
	 * This is set to undefined when this object is disposed or the view schema does not support viewing the document's stored schema.
	 *
	 * The view schema may be incompatible with the stored schema. Use `compatibility` to check.
	 */
	private flexTreeContext: Context | undefined;

	/**
	 * Undefined iff uninitialized or disposed.
	 */
	private currentCompatibility: SchemaCompatibilityStatus | undefined;
	public readonly events: Listenable<TreeViewEvents & TreeBranchEvents> &
		IEmitter<TreeViewEvents & TreeBranchEvents> &
		HasListeners<TreeViewEvents & TreeBranchEvents> = createEmitter();

	private readonly viewSchema: SchemaCompatibilityTester;

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

		const configAlpha = new TreeViewConfigurationAlpha({ schema: config.schema });

		this.viewSchema = new SchemaCompatibilityTester(configAlpha);
		// This must be initialized before `update` can be called.
		this.currentCompatibility = {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
			canInitialize: true,
		};
		this.update();

		this.unregisterCallbacks.add(
			this.checkout.events.on("changed", (data, getRevertible) => {
				this.events.emit("changed", data, getRevertible);
				this.events.emit("commitApplied", data, getRevertible);
			}),
		);
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
			const schema = toInitialSchema(this.config.schema);
			const mapTree = prepareForInsertionContextless(
				content as InsertableContent | undefined,
				this.rootFieldSchema,
				{
					schema,
					policy: defaultSchemaPolicy,
				},
				this,
				schema.rootFieldSchema,
			);

			initialize(this.checkout, {
				schema,
				initialTree: mapTree === undefined ? undefined : cursorForMapTreeNode(mapTree),
			});
		});
	}

	public upgradeSchema(): void {
		this.ensureUndisposed();

		const compatibility = this.compatibility;
		if (compatibility.isEquivalent) {
			// No-op
			return;
		}

		if (!compatibility.canUpgrade) {
			throw new UsageError(
				"Existing stored schema cannot be upgraded (see TreeView.compatibility.canUpgrade).",
			);
		}

		this.runSchemaEdit(() => {
			const result = ensureSchema(this.viewSchema, this.checkout);
			assert(result, 0x8bf /* Schema upgrade should always work if canUpgrade is set. */);
		});
	}

	/**
	 * Gets the flex-tree context. Throws when disposed or out of schema.
	 */
	public getFlexTreeContext(): Context {
		this.ensureUndisposed();
		assert(this.flexTreeContext !== undefined, 0x8c0 /* unexpected getViewOrError */);
		return this.flexTreeContext;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-tree#TreeViewAlpha.runTransaction}
	 */
	public runTransaction<TSuccessValue, TFailureValue>(
		transaction: () => TransactionCallbackStatus<TSuccessValue, TFailureValue>,
		params?: RunTransactionParams,
	): TransactionResultExt<TSuccessValue, TFailureValue>;
	/**
	 * {@inheritDoc @fluidframework/shared-tree#TreeViewAlpha.runTransaction}
	 */
	public runTransaction(
		transaction: () => VoidTransactionCallbackStatus | void,
		params?: RunTransactionParams,
	): TransactionResult;
	public runTransaction<TSuccessValue, TFailureValue>(
		transaction: () =>
			| TransactionCallbackStatus<TSuccessValue, TFailureValue>
			| VoidTransactionCallbackStatus
			| void,
		params?: RunTransactionParams,
	): TransactionResultExt<TSuccessValue, TFailureValue> | TransactionResult {
		const addConstraints = (
			constraintsOnRevert: boolean,
			constraints: readonly TransactionConstraint[] = [],
		): void => {
			addConstraintsToTransaction(this.checkout, constraintsOnRevert, constraints);
		};

		this.checkout.transaction.start();

		// Validate preconditions before running the transaction callback.
		addConstraints(false /* constraintsOnRevert */, params?.preconditions);
		const transactionCallbackStatus = transaction();
		const rollback = transactionCallbackStatus?.rollback;
		const value = (
			transactionCallbackStatus as TransactionCallbackStatus<TSuccessValue, TFailureValue>
		)?.value;

		if (rollback === true) {
			this.checkout.transaction.abort();
			return value !== undefined
				? { success: false, value: value as TFailureValue }
				: { success: false };
		}

		// Validate preconditions on revert after running the transaction callback and was successful.
		addConstraints(
			true /* constraintsOnRevert */,
			transactionCallbackStatus?.preconditionsOnRevert,
		);

		this.checkout.transaction.commit();
		return value !== undefined
			? { success: true, value: value as TSuccessValue }
			: { success: true };
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

		const compatibility = this.viewSchema.checkCompatibility(this.checkout.storedSchema);

		this.currentCompatibility = {
			...compatibility,
			canInitialize: canInitialize(this.checkout),
		};

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
						this.rootFieldSchema.annotatedAllowedTypesNormalized,
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
				let lastRoot: ReadableField<TRootSchema> = this.root;

				this.flexTreeViewUnregisterCallbacks.add(
					this.checkout.events.on("afterBatch", () => {
						// In the initialization flow, this event is raised before the correct compatibility w.r.t the new schema is calculated.
						// Accessing `this.root` in that case can throw. It's OK to ignore this because:
						// - The rootChanged event will already be raised at the end of the current upgrade
						// - It doesn't matter that `lastRoot` isn't updated in this case, because `update` will be called again before the upgrade
						//   completes (at which point this callback and the `lastRoot` captured here will be out of scope anyway)
						if (!this.midUpgrade && lastRoot !== this.root) {
							lastRoot = this.root;
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
			this.events.emit("schemaChanged");
			this.events.emit("rootChanged");
		}
	}

	private runSchemaEdit(edit: () => void): void {
		this.midUpgrade = true;
		try {
			edit();
		} finally {
			this.midUpgrade = false;
		}
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
		this.flexTreeViewUnregisterCallbacks.forEach((unregister) => unregister());
		this.flexTreeViewUnregisterCallbacks.clear();
		anchors.slots.delete(SimpleContextSlot);
	}

	public get compatibility(): SchemaCompatibilityStatus {
		if (!this.currentCompatibility) {
			this.failDisposed();
		}
		return this.currentCompatibility;
	}

	public dispose(): void {
		this.disposed = true;
		this.disposeFlexView();
		this.unregisterCallbacks.forEach((unregister) => unregister());
		this.checkout.forest.anchors.slots.delete(ViewSlot);
		this.currentCompatibility = undefined;
		this.onDispose?.();
		if (this.checkout.isBranch && !this.checkout.disposed) {
			// All (non-main) branches are 1:1 with views, so if a user manually disposes a view, we should also dispose the checkout/branch.
			this.checkout.dispose();
		}
	}

	public get root(): ReadableField<TRootSchema> {
		this.breaker.use();
		if (!this.compatibility.canView) {
			throw new UsageError(
				"Document is out of schema. Check TreeView.compatibility before accessing TreeView.root.",
			);
		}
		const view = this.getFlexTreeContext();
		return tryGetTreeNodeForField(view.root) as ReadableField<TRootSchema>;
	}

	public set root(newRoot: InsertableField<TRootSchema>) {
		this.breaker.use();
		if (!this.compatibility.canView) {
			throw new UsageError(
				"Document is out of schema. Check TreeView.compatibility before accessing TreeView.root.",
			);
		}
		const view = this.getFlexTreeContext();
		setField(
			view.root,
			this.rootFieldSchema,
			newRoot as InsertableContent | undefined,
			this.checkout.storedSchema.rootFieldSchema,
		);
	}

	// #region Branching

	public fork(): ReturnType<TreeBranch["fork"]> & SchematizingSimpleTreeView<TRootSchema> {
		return this.checkout.branch().viewWith(this.config);
	}

	public merge(context: TreeBranch, disposeMerged = true): void {
		this.checkout.merge(getCheckout(context), disposeMerged);
	}

	public rebaseOnto(context: TreeBranch): void {
		getCheckout(context).rebase(this.checkout);
	}

	// #endregion Branching
}

/**
 * Get the {@link TreeCheckout} associated with a given {@link TreeBranch}.
 * @remarks Currently, all contexts are also {@link SchematizingSimpleTreeView}s.
 * Other checkout implementations (e.g. not associated with a view) may be supported in the future.
 */
export function getCheckout(context: TreeBranch): TreeCheckout {
	if (context instanceof SchematizingSimpleTreeView) {
		return context.checkout;
	}
	throw new UsageError("Unsupported context implementation");
}

/**
 * Adds constraints to a `checkout`'s pending transaction.
 *
 * @param checkout - The checkout's who's transaction will have the constraints added to it.
 * @param constraintsOnRevert - If true, use {@link ISharedTreeEditor.addNodeExistsConstraintOnRevert}.
 * @param constraints - The constraints to add to the transaction.
 *
 * @see {@link RunTransactionParams.preconditions}.
 */
export function addConstraintsToTransaction(
	checkout: ITreeCheckout,
	constraintsOnRevert: boolean,
	constraints: readonly TransactionConstraint[] = [],
): void {
	for (const constraint of constraints) {
		switch (constraint.type) {
			case "nodeInDocument": {
				const node = getOrCreateInnerNode(constraint.node);
				const nodeStatus = getKernel(constraint.node).getStatus();
				if (nodeStatus !== TreeStatus.InDocument) {
					const revertText = constraintsOnRevert ? " on revert" : "";
					throw new UsageError(
						`Attempted to add a "nodeInDocument" constraint${revertText}, but the node is not currently in the document. Node status: ${nodeStatus}`,
					);
				}
				assert(node.isHydrated(), 0xbc2 /* In document node must be hydrated. */);
				if (constraintsOnRevert) {
					checkout.editor.addNodeExistsConstraintOnRevert(node.anchorNode);
				} else {
					checkout.editor.addNodeExistsConstraint(node.anchorNode);
				}
				break;
			}
			default:
				unreachableCase(constraint.type);
		}
	}
}
