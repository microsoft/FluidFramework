/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { AllowedUpdateType, Compatibility } from "../core/index.js";
import {
	type HasListeners,
	type IEmitter,
	type Listenable,
	createEmitter,
} from "../events/index.js";
import {
	type FlexFieldSchema,
	type NodeKeyManager,
	ViewSchema,
	defaultSchemaPolicy,
	ContextSlot,
	cursorForMapTreeNode,
	type FlexTreeSchema,
} from "../feature-libraries/index.js";
import {
	type FieldSchema,
	type ImplicitFieldSchema,
	type SchemaCompatibilityStatus,
	type InsertableTreeFieldFromImplicitField,
	type TreeFieldFromImplicitField,
	type TreeView,
	type TreeViewEvents,
	getTreeNodeForField,
	toFlexSchema,
	setField,
	normalizeFieldSchema,
	type InsertableContent,
	type TreeViewConfiguration,
	mapTreeFromNodeData,
	prepareContentForHydration,
} from "../simple-tree/index.js";
import { Breakable, breakingClass, disposeSymbol, type WithBreakable } from "../util/index.js";

import { canInitialize, ensureSchema, initialize } from "./schematizeTree.js";
import type { ITreeCheckout } from "./treeCheckout.js";
import { CheckoutFlexTreeView } from "./treeView.js";

/**
 * Implementation of TreeView wrapping a FlexTreeView.
 */
@breakingClass
export class SchematizingSimpleTreeView<in out TRootSchema extends ImplicitFieldSchema>
	implements TreeView<TRootSchema>, WithBreakable
{
	/**
	 * The view is set to undefined when this object is disposed or the view schema does not support viewing the document's stored schema.
	 *
	 * The view schema may be incompatible with the stored schema. Use `compatibility` to check.
	 */
	private view: CheckoutFlexTreeView<FlexFieldSchema> | undefined;

	/**
	 * Undefined iff uninitialized or disposed.
	 */
	private currentCompatibility: SchemaCompatibilityStatus | undefined;
	private readonly flexSchema: FlexTreeSchema;
	public readonly events: Listenable<TreeViewEvents> &
		IEmitter<TreeViewEvents> &
		HasListeners<TreeViewEvents> = createEmitter();

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
		public readonly checkout: ITreeCheckout,
		public readonly config: TreeViewConfiguration<TRootSchema>,
		public readonly nodeKeyManager: NodeKeyManager,
		public readonly breaker: Breakable = new Breakable("SchematizingSimpleTreeView"),
	) {
		const policy = {
			...defaultSchemaPolicy,
			validateSchema: config.enableSchemaValidation,
		};
		this.rootFieldSchema = normalizeFieldSchema(config.schema);
		this.flexSchema = toFlexSchema(config.schema);

		this.viewSchema = new ViewSchema(policy, {}, this.flexSchema);
		// This must be initialized before `update` can be called.
		this.currentCompatibility = {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
			canInitialize: true,
		};
		this.update();

		this.unregisterCallbacks.add(
			this.checkout.events.on("commitApplied", (data, getRevertible) =>
				this.events.emit("commitApplied", data, getRevertible),
			),
		);
	}

	public initialize(content: InsertableTreeFieldFromImplicitField<TRootSchema>): void {
		this.ensureUndisposed();

		const compatibility = this.compatibility;
		if (!compatibility.canInitialize) {
			throw new UsageError("Tree cannot be initialized more than once.");
		}

		this.runSchemaEdit(() => {
			const mapTree = mapTreeFromNodeData(
				content as InsertableContent,
				this.rootFieldSchema,
				this.nodeKeyManager,
				{
					schema: this.checkout.storedSchema,
					policy: {
						...defaultSchemaPolicy,
						validateSchema: this.config.enableSchemaValidation,
					},
				},
			);

			prepareContentForHydration(mapTree, this.checkout.forest);
			initialize(this.checkout, {
				schema: this.flexSchema,
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
					schema: this.flexSchema,
					initialTree: undefined,
				},
			);
			assert(result, 0x8bf /* Schema upgrade should always work if canUpgrade is set. */);
		});
	}

	/**
	 * Gets the view. Throws when disposed.
	 */
	public getView(): CheckoutFlexTreeView<FlexFieldSchema> {
		this.ensureUndisposed();
		assert(this.view !== undefined, 0x8c0 /* unexpected getViewOrError */);
		return this.view;
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

		const result = this.viewSchema.checkCompatibility(this.checkout.storedSchema);

		// TODO: AB#8121: Weaken this check to support viewing under additional circumstances.
		// In the near term, this should support viewing documents with additional optional fields in their schema on object types.
		// Longer-term (as demand arises), we could also add APIs to constructing view schema to allow for more flexibility
		// (e.g. out-of-schema content handlers could allow support for viewing docs which have extra allowed types in a particular field)
		const canView =
			result.write === Compatibility.Compatible && result.read === Compatibility.Compatible;
		const canUpgrade = result.read === Compatibility.Compatible;
		const isEquivalent = canView && canUpgrade;
		const compatibility: SchemaCompatibilityStatus = {
			canView,
			canUpgrade,
			isEquivalent,
			canInitialize: canInitialize(this.checkout),
		};
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

			this.view = requireSchema(
				this.checkout,
				this.viewSchema,
				onViewDispose,
				this.nodeKeyManager,
			);
		} else {
			this.view = undefined;

			const unregister = this.checkout.storedSchema.on("afterSchemaChange", () => {
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
			this.unregisterCallbacks.forEach((unregister) => unregister());
		}
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
		this.currentCompatibility = undefined;
	}

	public get root(): TreeFieldFromImplicitField<TRootSchema> {
		this.breaker.use();
		if (!this.compatibility.canView) {
			throw new UsageError(
				"Document is out of schema. Check TreeView.compatibility before accessing TreeView.root.",
			);
		}
		const view = this.getView();
		return getTreeNodeForField(view.flexTree) as TreeFieldFromImplicitField<TRootSchema>;
	}

	public set root(newRoot: InsertableTreeFieldFromImplicitField<TRootSchema>) {
		this.breaker.use();
		if (!this.compatibility.canView) {
			throw new UsageError(
				"Document is out of schema. Check TreeView.compatibility before accessing TreeView.root.",
			);
		}
		const view = this.getView();
		setField(view.context.root, this.rootFieldSchema, newRoot as InsertableContent);
	}
}

/**
 * Creates a view that self-disposes whenenever the stored schema changes.
 * This may only be called when the schema is already known to be compatible (typically via ensureSchema).
 */
export function requireSchema<TRoot extends FlexFieldSchema>(
	checkout: ITreeCheckout,
	viewSchema: ViewSchema<TRoot>,
	onDispose: () => void,
	nodeKeyManager: NodeKeyManager,
): CheckoutFlexTreeView<TRoot> {
	const slots = checkout.forest.anchors.slots;
	assert(!slots.has(ContextSlot), 0x8c2 /* Cannot create second view from checkout */);

	{
		const compatibility = viewSchema.checkCompatibility(checkout.storedSchema);
		assert(
			compatibility.write === Compatibility.Compatible &&
				compatibility.read === Compatibility.Compatible,
			0x8c3 /* requireSchema invoked with incompatible schema */,
		);
	}

	const view = new CheckoutFlexTreeView(
		checkout,
		viewSchema.schema,
		nodeKeyManager,
		onDispose,
	);
	assert(slots.has(ContextSlot), 0x90d /* Context should be tracked in slot */);

	const unregister = checkout.storedSchema.on("afterSchemaChange", () => {
		unregister();
		view[disposeSymbol]();
	});

	return view;
}
