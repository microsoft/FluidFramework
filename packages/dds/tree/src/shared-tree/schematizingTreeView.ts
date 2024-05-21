/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { AllowedUpdateType, Compatibility } from "../core/index.js";
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
	InsertableTreeFieldFromImplicitField,
	SchemaIncompatible,
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
	 * In one of three states:
	 * 1. Valid: A checkout is present, not disposed, and it's stored schema and view schema are compatible.
	 * 2. SchematizeError: stored schema and view schema are not compatible.
	 * 3. disposed: `view` is undefined, and using this object will error. Some methods also transiently leave view undefined.
	 */
	private view: CheckoutFlexTreeView<FlexFieldSchema> | SchematizeError | undefined;
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
	) {
		const policy = {
			...defaultSchemaPolicy,
			validateSchema: config.options.enableSchemaValidation,
		};
		this.rootFieldSchema = normalizeFieldSchema(config.schema);
		this.flexConfig = toFlexConfig(config, nodeKeyManager, {
			schema: checkout.storedSchema,
			policy,
		});
		this.viewSchema = new ViewSchema(policy, {}, this.flexConfig.schema);
		this.update();

		this.unregisterCallbacks.add(
			this.checkout.events.on("commitApplied", (data, getRevertible) =>
				this.events.emit("commitApplied", data, getRevertible),
			),
		);
	}

	public upgradeSchema(): void {
		// Errors if disposed.
		const error = this.error;

		// No-op non error state.
		if (error === undefined) {
			return;
		}

		if (this.error?.canUpgrade !== true) {
			throw new UsageError(
				"Existing stored schema can not be upgraded (see TreeView.canUpgrade).",
			);
		}

		const result = ensureSchema(
			this.viewSchema,
			// eslint-disable-next-line no-bitwise
			AllowedUpdateType.SchemaCompatible | AllowedUpdateType.Initialize,
			this.checkout,
			this.flexConfig,
		);
		assert(result, 0x8bf /* Schema upgrade should always work if canUpgrade is set. */);
	}

	/**
	 * Gets the view is the stored schema is compatible with the view schema,
	 * otherwise returns an error detailing the schema incompatibility.
	 */
	public getViewOrError(): CheckoutFlexTreeView<FlexFieldSchema> | SchematizeError {
		if (this.disposed) {
			throw new UsageError("Accessed a disposed TreeView.");
		}
		assert(this.view !== undefined, 0x8c0 /* unexpected getViewOrError */);
		return this.view;
	}

	/**
	 * Updates `this.view`.
	 * Invoked during initialization and when `this.view` needs to be replaced due to stored schema changes.
	 * Handled re-registering for events to call update in the future.
	 * @remarks
	 * This does not check if the view needs to be replaced, it replaces it unconditionally:
	 * callers should do any checking to detect if its really needed before calling `update`.
	 */
	private update(): void {
		// This implementation avoids making any edits, which prevents it from being invoked reentrantly.
		// If implicit initialization (or some other edit) is desired, it should be done outside of this method.

		const compatibility = evaluateUpdate(
			this.viewSchema,
			// eslint-disable-next-line no-bitwise
			AllowedUpdateType.SchemaCompatible | AllowedUpdateType.Initialize,
			this.checkout,
		);
		this.disposeView();
		switch (compatibility) {
			case UpdateType.None: {
				// Remove event from checkout when view is disposed
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
				);

				// Trigger "rootChanged" if the root changes in the future.
				// Currently there is no good way to do this as FlexTreeField has no events for changes.
				// this.view.flexTree.on(????)
				// As a workaround for the above, trigger "rootChanged" in "afterBatch"
				// which isn't the correct time since we normally do events during the batch when the forest is modified, but its better than nothing.
				// TODO: provide a better event: this.view.flexTree.on(????)
				let lastRoot = this.root;
				const cleanupCheckOutEvents = this.checkout.events.on("afterBatch", () => {
					if (lastRoot !== this.root) {
						lastRoot = this.root;
						this.events.emit("rootChanged");
					}
					this.events.emit("afterBatch");
				});
				break;
			}
			case UpdateType.Incompatible:
			case UpdateType.Initialize:
			case UpdateType.SchemaCompatible: {
				this.view = new SchematizeError(compatibility);
				const unregister = this.checkout.storedSchema.on("afterSchemaChange", () => {
					unregister();
					this.unregisterCallbacks.delete(unregister);
					this.update();
				});
				this.unregisterCallbacks.add(unregister);
				break;
			}
			default: {
				unreachableCase(compatibility);
			}
		}
		this.events.emit("rootChanged");
	}

	private disposeView(): void {
		if (this.view !== undefined && !(this.view instanceof SchematizeError)) {
			this.view[disposeSymbol]();
			this.view = undefined;
			this.unregisterCallbacks.forEach((unregister) => unregister());
		}
	}

	public get error(): SchematizeError | undefined {
		const view = this.getViewOrError();
		return view instanceof SchematizeError ? view : undefined;
	}

	public [disposeSymbol](): void {
		this.getViewOrError();
		this.disposed = true;
		this.disposeView();
	}

	public get root(): TreeFieldFromImplicitField<TRootSchema> {
		const view = this.getViewOrError();
		if (view instanceof SchematizeError) {
			throw new UsageError(
				"Document is out of schema. Check TreeView.error before accessing TreeView.root.",
			);
		}
		return getProxyForField(view.flexTree) as TreeFieldFromImplicitField<TRootSchema>;
	}

	public set root(newRoot: InsertableTreeFieldFromImplicitField<TRootSchema>) {
		const view = this.getViewOrError();
		if (view instanceof SchematizeError) {
			throw new UsageError(
				"Document is out of schema. Check TreeView.error before accessing TreeView.root.",
			);
		}

		setField(
			view.context.root,
			this.rootFieldSchema,
			newRoot as InsertableContent,
			view.context.nodeKeyManager,
		);
	}
}

export class SchematizeError implements SchemaIncompatible {
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
 * Creates a view that self-disposes when stored schema becomes incompatible.
 * This may only be called when the schema is already known to be compatible (typically via ensureSchema).
 */
export function requireSchema<TRoot extends FlexFieldSchema>(
	checkout: TreeCheckout,
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

	const view = new CheckoutFlexTreeView(checkout, viewSchema.schema, nodeKeyManager, onDispose);
	assert(slots.has(ContextSlot), 0x90d /* Context should be tracked in slot */);

	const unregister = checkout.storedSchema.on("afterSchemaChange", () => {
		const compatibility = viewSchema.checkCompatibility(checkout.storedSchema);
		if (
			compatibility.write !== Compatibility.Compatible ||
			compatibility.read !== Compatibility.Compatible
		) {
			unregister();
			view[disposeSymbol]();
		}
	});

	return view;
}
