/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { AllowedUpdateType, Compatibility, FieldKey } from "../core/index.js";
import { HasListeners, IEmitter, ISubscribable, createEmitter } from "../events/index.js";
import {
	FlexFieldSchema,
	NodeKeyManager,
	ViewSchema,
	defaultSchemaPolicy,
	ContextSlot,
} from "../feature-libraries/index.js";
import {
	FieldSchema,
	ImplicitFieldSchema,
	SchemaCompatibilityStatus,
	InsertableTreeFieldFromImplicitField,
	TreeConfiguration,
	TreeFieldFromImplicitField,
	TreeView,
	TreeViewEvents,
	getProxyForField,
	toFlexConfig,
	setField,
	normalizeFieldSchema,
	InsertableContent,
} from "../simple-tree/index.js";
import { disposeSymbol } from "../util/index.js";

import { TreeContent, UpdateType, ensureSchema, evaluateUpdate } from "./schematizeTree.js";
import { TreeCheckout } from "./treeCheckout.js";
import { CheckoutFlexTreeView } from "./treeView.js";

/**
 * Implementation of TreeView wrapping a FlexTreeView.
 */
export class SchematizingSimpleTreeView<in out TRootSchema extends ImplicitFieldSchema>
	implements TreeView<TRootSchema>
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
	private readonly flexConfig: TreeContent;
	public readonly events: ISubscribable<TreeViewEvents> &
		IEmitter<TreeViewEvents> &
		HasListeners<TreeViewEvents> = createEmitter();

	private readonly viewSchema: ViewSchema;

	private readonly unregisterCallbacks = new Set<() => void>();
	private disposed = false;

	private readonly rootFieldSchema: FieldSchema;

	public constructor(
		public readonly checkout: TreeCheckout,
		public readonly config: TreeConfiguration<TRootSchema>,
		public readonly nodeKeyManager: NodeKeyManager,
		public readonly nodeKeyFieldKey: FieldKey,
	) {
		this.rootFieldSchema = normalizeFieldSchema(config.schema);
		this.flexConfig = toFlexConfig(config);
		this.viewSchema = new ViewSchema(defaultSchemaPolicy, {}, this.flexConfig.schema);
		this.currentCompatibility = {
			canView: false,
			canUpgrade: true,
			isExactMatch: false,
			canInitialize: true,
			differences: [],
			metadata: undefined,
		};
		this.update();

		this.unregisterCallbacks.add(
			this.checkout.events.on("commitApplied", (data, getRevertible) =>
				this.events.emit("commitApplied", data, getRevertible),
			),
		);
	}

	private midUpgrade = false;
	public upgradeSchema(): void {
		this.ensureUndisposed();

		const compatibility = this.compatibility;
		if (compatibility.isExactMatch) {
			// No-op
			return;
		}

		if (!compatibility.canUpgrade) {
			throw new UsageError(
				"Existing stored schema can not be upgraded (see TreeView.compatibility.canUpgrade).",
			);
		}

		this.midUpgrade = true;
		try {
			const result = ensureSchema(
				this.viewSchema,
				// eslint-disable-next-line no-bitwise
				AllowedUpdateType.SchemaCompatible | AllowedUpdateType.Initialize,
				this.checkout,
				this.flexConfig,
			);
			assert(result, 0x8bf /* Schema upgrade should always work if canUpgrade is set. */);
		} finally {
			this.midUpgrade = false;
		}
		this.events.emit("schemaChanged");
		this.events.emit("rootChanged");
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
	 * Updates `this.view`.
	 * Invoked during initialization and when `this.view` needs to be replaced due to stored schema changes.
	 * Handles re-registering for events to call update in the future.
	 * @remarks
	 * This does not check if the view needs to be replaced, it replaces it unconditionally:
	 * callers should do any checking to detect if it's really needed before calling `update`.
	 */
	private update(): void {
		// This implementation avoids making any edits, which prevents it from being invoked reentrantly.
		// If implicit initialization (or some other edit) is desired, it should be done outside of this method.

		const updateType = evaluateUpdate(
			this.viewSchema,
			// eslint-disable-next-line no-bitwise
			AllowedUpdateType.SchemaCompatible | AllowedUpdateType.Initialize,
			this.checkout,
		);
		// TODO: At some point, dedupe many calls to checkCompatibility.
		const result = this.viewSchema.checkCompatibility(this.checkout.storedSchema);
		this.disposeView();

		const compatibility: SchemaCompatibilityStatus = {
			canView: result.write === Compatibility.Compatible,
			canUpgrade:
				result.read === Compatibility.Compatible ||
				// Seems kinda weird that we need to 'or' here, but maybe ok.
				updateType === UpdateType.Initialize,
			isExactMatch:
				result.write === Compatibility.Compatible &&
				result.read === Compatibility.Compatible,
			canInitialize: updateType === UpdateType.Initialize,
			differences: [],
			metadata: undefined,
		};
		let lastRoot =
			this.compatibility.canView && this.view !== undefined ? this.root : undefined;
		this.currentCompatibility = compatibility;

		if (compatibility.canView) {
			this.view = requireSchema(
				this.checkout,
				this.viewSchema,
				() => {
					assert(cleanupCheckOutEvents !== undefined, 0x8c1 /* missing cleanup */);
					cleanupCheckOutEvents();
					this.view = undefined;
					if (!this.disposed) {
						this.update();
					}
				},
				this.nodeKeyManager,
				this.nodeKeyFieldKey,
			);

			// Trigger "rootChanged" if the root changes in the future.
			// Currently there is no good way to do this as FlexTreeField has no events for changes.
			// this.view.flexTree.on(????)
			// As a workaround for the above, trigger "rootChanged" in "afterBatch"
			// which isn't the correct time since we normally do events during the batch when the forest is modified, but its better than nothing.
			// TODO: provide a better event: this.view.flexTree.on(????)
			const cleanupCheckOutEvents = this.checkout.events.on("afterBatch", () => {
				if (!this.midUpgrade && lastRoot !== this.root) {
					lastRoot = this.root;
					this.events.emit("rootChanged");
				}
			});
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
			this.events.emit("rootChanged");
			// TODO: Maybe not on initialization?
			this.events.emit("schemaChanged");
		}
	}

	public initialize(_content: InsertableTreeFieldFromImplicitField<TRootSchema>): void {
		// Not yet implemented. `viewWith` currently implicitly initializes the tree.
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

	public [disposeSymbol](): void {
		this.ensureUndisposed();
		this.disposed = true;
		this.disposeView();
		this.currentCompatibility = undefined;
	}

	public get root(): TreeFieldFromImplicitField<TRootSchema> {
		if (!this.compatibility.canView) {
			throw new UsageError(
				"Document is out of schema. Check TreeView.compatibility before accessing TreeView.root.",
			);
		}
		const view = this.getView();
		return getProxyForField(view.flexTree) as TreeFieldFromImplicitField<TRootSchema>;
	}

	public set root(newRoot: InsertableTreeFieldFromImplicitField<TRootSchema>) {
		if (!this.compatibility.canView) {
			throw new UsageError(
				"Document is out of schema. Check TreeView.compatibility before accessing TreeView.root.",
			);
		}
		const view = this.getView();
		setField(view.context.root, this.rootFieldSchema, newRoot as InsertableContent);
	}
}

export class SchematizeError {
	public constructor(public readonly updateType: UpdateType) {}

	public get canUpgrade(): boolean {
		return (
			this.updateType === UpdateType.Initialize ||
			this.updateType === UpdateType.SchemaCompatible
		);
	}

	public get canInitialize(): boolean {
		return this.updateType === UpdateType.Initialize;
	}
}

/**
 * Flex-Tree schematizing layer.
 * Creates a view that self-disposes whenenever the stored schema changes.
 * This may only be called when the schema is already known to be read-compatible (typically via ensureSchema).
 */
export function requireSchema<TRoot extends FlexFieldSchema>(
	checkout: TreeCheckout,
	viewSchema: ViewSchema<TRoot>,
	onDispose: () => void,
	nodeKeyManager: NodeKeyManager,
	nodeKeyFieldKey: FieldKey,
): CheckoutFlexTreeView<TRoot> {
	const slots = checkout.forest.anchors.slots;
	assert(!slots.has(ContextSlot), 0x8c2 /* Cannot create second view from checkout */);

	{
		const compatibility = viewSchema.checkCompatibility(checkout.storedSchema);
		assert(
			compatibility.write === Compatibility.Compatible,
			0x8c3 /* requireSchema invoked with incompatible schema */,
		);
	}

	const view = new CheckoutFlexTreeView(
		checkout,
		viewSchema.schema,
		nodeKeyManager,
		nodeKeyFieldKey,
		onDispose,
	);
	assert(slots.has(ContextSlot), "Context should be tracked in slot");

	const unregister = checkout.storedSchema.on("afterSchemaChange", () => {
		unregister();
		view[disposeSymbol]();
	});

	return view;
}
