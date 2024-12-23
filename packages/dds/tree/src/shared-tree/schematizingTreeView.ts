/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	HasListeners,
	IEmitter,
	Listenable,
} from "@fluidframework/core-interfaces/internal";
import { createEmitter } from "@fluid-internal/client-utils";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { AllowedUpdateType, anchorSlot, type SchemaPolicy } from "../core/index.js";
import {
	type NodeKeyManager,
	defaultSchemaPolicy,
	ContextSlot,
	cursorForMapTreeNode,
	type FullSchemaPolicy,
	TreeStatus,
} from "../feature-libraries/index.js";
import {
	type FieldSchema,
	type ImplicitFieldSchema,
	type SchemaCompatibilityStatus,
	type TreeView,
	type TreeViewEvents,
	getTreeNodeForField,
	setField,
	normalizeFieldSchema,
	ViewSchema,
	type InsertableContent,
	type TreeViewConfiguration,
	mapTreeFromNodeData,
	prepareContentForHydration,
	comparePersistedSchemaInternal,
	toStoredSchema,
	type TreeViewAlpha,
	type InsertableField,
	type ReadableField,
	type ReadSchema,
	type UnsafeUnknownSchema,
	type TreeBranch,
	type TreeBranchEvents,
	getOrCreateInnerNode,
	getKernel,
} from "../simple-tree/index.js";
import { Breakable, breakingClass, disposeSymbol, type WithBreakable } from "../util/index.js";

import { canInitialize, ensureSchema, initialize } from "./schematizeTree.js";
import type { ITreeCheckout, TreeCheckout } from "./treeCheckout.js";
import { CheckoutFlexTreeView } from "./checkoutFlexTreeView.js";
import {
	HydratedContext,
	SimpleContextSlot,
	areImplicitFieldSchemaEqual,
	createUnknownOptionalFieldPolicy,
} from "../simple-tree/index.js";
import type {
	VoidTransactionCallbackStatus,
	TransactionCallbackStatus,
	TransactionResult,
	TransactionResultExt,
	RunTransactionParams,
	TransactionConstraint,
} from "./transactionTypes.js";

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
	 * The view is set to undefined when this object is disposed or the view schema does not support viewing the document's stored schema.
	 *
	 * The view schema may be incompatible with the stored schema. Use `compatibility` to check.
	 */
	private view: CheckoutFlexTreeView | undefined;

	/**
	 * Undefined iff uninitialized or disposed.
	 */
	private currentCompatibility: SchemaCompatibilityStatus | undefined;
	private readonly schemaPolicy: SchemaPolicy;
	public readonly events: Listenable<TreeViewEvents & TreeBranchEvents> &
		IEmitter<TreeViewEvents & TreeBranchEvents> &
		HasListeners<TreeViewEvents & TreeBranchEvents> = createEmitter();

	private readonly viewSchema: ViewSchema;

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

	public constructor(
		public readonly checkout: TreeCheckout,
		public readonly config: TreeViewConfiguration<ReadSchema<TRootSchema>>,
		public readonly nodeKeyManager: NodeKeyManager,
		public readonly breaker: Breakable = new Breakable("SchematizingSimpleTreeView"),
		private readonly onDispose?: () => void,
	) {
		if (checkout.forest.anchors.slots.has(ViewSlot)) {
			throw new UsageError("Cannot create a second tree view from the same checkout");
		}
		checkout.forest.anchors.slots.set(ViewSlot, this);

		this.rootFieldSchema = normalizeFieldSchema(config.schema);
		this.schemaPolicy = {
			...defaultSchemaPolicy,
			validateSchema: config.enableSchemaValidation,
			allowUnknownOptionalFields: createUnknownOptionalFieldPolicy(this.rootFieldSchema),
		};

		this.viewSchema = new ViewSchema(this.schemaPolicy, {}, this.rootFieldSchema);
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
			const mapTree = mapTreeFromNodeData(
				content as InsertableContent | undefined,
				this.rootFieldSchema,
				this.nodeKeyManager,
				{
					schema: this.checkout.storedSchema,
					policy: this.schemaPolicy,
				},
			);

			prepareContentForHydration(mapTree, this.checkout.forest);
			initialize(this.checkout, {
				schema: toStoredSchema(this.viewSchema.schema),
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
				"Existing stored schema can not be upgraded (see TreeView.compatibility.canUpgrade).",
			);
		}

		this.runSchemaEdit(() => {
			const result = ensureSchema(
				this.viewSchema,
				AllowedUpdateType.SchemaCompatible,
				this.checkout,
				{
					schema: toStoredSchema(this.viewSchema.schema),
					initialTree: undefined,
				},
			);
			assert(result, 0x8bf /* Schema upgrade should always work if canUpgrade is set. */);
		});
	}

	/**
	 * Gets the view. Throws when disposed.
	 */
	public getView(): CheckoutFlexTreeView {
		this.ensureUndisposed();
		assert(this.view !== undefined, 0x8c0 /* unexpected getViewOrError */);
		return this.view;
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
		const validateConstraints = (
			constraints: readonly TransactionConstraint[],
			constraintsOnRevert: boolean,
		): void => {
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
						if (constraintsOnRevert) {
							this.checkout.editor.addNodeExistsConstraintOnRevert(node.anchorNode);
						} else {
							this.checkout.editor.addNodeExistsConstraint(node.anchorNode);
						}
						break;
					}
					default:
						unreachableCase(constraint.type);
				}
			}
		};

		this.checkout.transaction.start();

		// Validate preconditions before running the transaction callback.
		validateConstraints(params?.preconditions ?? [], false /* constraintsOnRevert */);
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
		validateConstraints(
			transactionCallbackStatus?.preconditionsOnRevert ?? [],
			true /* constraintsOnRevert */,
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
		this.disposeView();

		const compatibility = comparePersistedSchemaInternal(
			this.checkout.storedSchema,
			this.viewSchema,
			canInitialize(this.checkout),
		);

		let lastRoot =
			this.compatibility.canView && this.view !== undefined ? this.root : undefined;
		this.currentCompatibility = compatibility;

		if (compatibility.canView) {
			// Trigger "rootChanged" if the root changes in the future.
			// Currently there is no good way to do this as FlexTreeField has no events for changes.
			// this.view.flexTree.on(????)
			// As a workaround for the above, trigger "rootChanged" in "afterBatch"
			// which isn't the correct time since we normally do events during the batch when the forest is modified, but its better than nothing.
			// TODO: provide a better event: this.view.flexTree.on(????)
			const cleanupCheckOutEvents = this.checkout.events.on("afterBatch", () => {
				// In the initialization flow, this event is raised before the correct compatibility w.r.t the new schema is calculated.
				// Accessing `this.root` in that case can throw. It's OK to ignore this because:
				// - The rootChanged event will already be raised at the end of the current upgrade
				// - It doesn't matter that `lastRoot` isn't updated in this case, because `update` will be called again before the upgrade
				//   completes (at which point this callback and the `lastRoot` captured here will be out of scope anyway)
				if (!this.midUpgrade && lastRoot !== this.root) {
					lastRoot = this.root;
					this.events.emit("rootChanged");
				}
			});

			const onViewDispose = (): void => {
				cleanupCheckOutEvents();
				this.view = undefined;
				if (!this.disposed) {
					this.update();
				}
			};

			const view = requireSchema(
				this.checkout,
				this.viewSchema,
				onViewDispose,
				this.nodeKeyManager,
				this.schemaPolicy,
			);
			this.view = view;
			assert(
				!this.checkout.forest.anchors.slots.has(SimpleContextSlot),
				0xa47 /* extra simple tree context */,
			);
			this.checkout.forest.anchors.slots.set(
				SimpleContextSlot,
				new HydratedContext(this.rootFieldSchema.allowedTypeSet, view.context),
			);

			const unregister = this.checkout.storedSchema.events.on("afterSchemaChange", () => {
				unregister();
				this.unregisterCallbacks.delete(unregister);
				view[disposeSymbol]();
			});
			this.unregisterCallbacks.add(unregister);
		} else {
			this.view = undefined;
			this.checkout.forest.anchors.slots.delete(SimpleContextSlot);

			const unregister = this.checkout.storedSchema.events.on("afterSchemaChange", () => {
				unregister();
				this.unregisterCallbacks.delete(unregister);
				this.update();
			});
			this.unregisterCallbacks.add(unregister);
		}

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

	private disposeView(): void {
		if (this.view !== undefined) {
			this.view[disposeSymbol]();
			this.view = undefined;
			this.checkout.forest.anchors.slots.delete(SimpleContextSlot);
			this.unregisterCallbacks.forEach((unregister) => unregister());
		}
		this.checkout.forest.anchors.slots.delete(SimpleContextSlot);
	}

	public get compatibility(): SchemaCompatibilityStatus {
		if (!this.currentCompatibility) {
			this.failDisposed();
		}
		return this.currentCompatibility;
	}

	public dispose(): void {
		this.disposed = true;
		this.disposeView();
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
		const view = this.getView();
		return getTreeNodeForField(view.flexTree) as ReadableField<TRootSchema>;
	}

	public set root(newRoot: InsertableField<TRootSchema>) {
		this.breaker.use();
		if (!this.compatibility.canView) {
			throw new UsageError(
				"Document is out of schema. Check TreeView.compatibility before accessing TreeView.root.",
			);
		}
		const view = this.getView();
		setField(
			view.context.root,
			this.rootFieldSchema,
			newRoot as InsertableContent | undefined,
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
 * Creates a view that self-disposes whenenever the stored schema changes.
 * This may only be called when the schema is already known to be compatible (typically via ensureSchema).
 */
export function requireSchema(
	checkout: ITreeCheckout,
	viewSchema: ViewSchema,
	onDispose: () => void,
	nodeKeyManager: NodeKeyManager,
	schemaPolicy: FullSchemaPolicy,
): CheckoutFlexTreeView {
	const slots = checkout.forest.anchors.slots;
	assert(!slots.has(ContextSlot), 0x8c2 /* Cannot create second view from checkout */);

	{
		const compatibility = viewSchema.checkCompatibility(checkout.storedSchema);
		assert(compatibility.canView, 0x8c3 /* requireSchema invoked with incompatible schema */);
	}

	const view = new CheckoutFlexTreeView(checkout, schemaPolicy, nodeKeyManager, onDispose);
	assert(slots.has(ContextSlot), 0x90d /* Context should be tracked in slot */);

	return view;
}
