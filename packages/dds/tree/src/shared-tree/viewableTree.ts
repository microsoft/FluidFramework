/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type {
	ImplicitFieldSchema,
	InsertableContent,
	InsertableTreeFieldFromImplicitField,
	OpenTreeViewResult,
	ReadyTreeView,
	SimpleTreeSchema,
	TreeFieldFromImplicitField,
	TreeView,
	TreeViewAlpha,
	TreeViewConfiguration,
	UninitializedTreeResult,
	ViewableTreeAlpha,
	VerboseTree,
} from "../simple-tree/index.js";

import { forkAsBranchCheckout, type TreeBranchHandleAlpha } from "./branchCheckout.js";
import type { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
import type { CheckoutBase } from "./treeCheckout.js";

/**
 * Creates the common viewable-tree API backed by a checkout.
 */
export function createViewableTreeAlpha(
	checkout: CheckoutBase,
	exportSimpleSchema: () => SimpleTreeSchema,
): ViewableTreeAlpha {
	return {
		get storedSchemaVersion() {
			return checkout.storedSchema.schemaVersion;
		},
		forkBranch(): TreeBranchHandleAlpha {
			return forkAsBranchCheckout(checkout);
		},
		openView<TRoot extends ImplicitFieldSchema>(
			config: TreeViewConfiguration<TRoot>,
		): OpenTreeViewResult<TRoot> {
			const view = checkout.viewWithInternal<TRoot>(config, false);
			try {
				const status = view.compatibility;

				// If the view can be initialized (i.e., the tree is uninitialized), return an initializer to the caller.
				if (status.canInitialize) {
					return createInitializer(view);
				}

				// A permitted upgrade is not necessarily required.
				// Don't apply an upgrade unless it is required to access the tree.
				if (!status.view.isCompatible) {
					if (!status.upgrade.isCompatible) {
						const result = {
							kind: "incompatible",
							viewIncompatibilities: status.view.incompatibilities,
							upgradeIncompatibilities: status.upgrade.incompatibilities,
						} as const;
						view.dispose();
						return result;
					}
					view.upgradeSchema();
				}
				return createReadyView(view);
			} catch (error) {
				view.dispose();
				throw error;
			}
		},
		viewWith<TRoot extends ImplicitFieldSchema>(
			config: TreeViewConfiguration<TRoot>,
		): TreeView<TRoot> {
			const view: TreeViewAlpha<TRoot> = checkout.viewWith(config);
			return view as TreeView<TRoot>;
		},
		exportVerbose(): VerboseTree | undefined {
			return checkout.exportVerbose();
		},
		exportSimpleSchema,
	};
}

/**
 * Wraps an existing view as a {@link ReadyTreeView}.
 *
 * @remarks
 * The wrapper forwards root access and events to the source view without exposing schema management.
 * It does not check compatibility or upgrade the stored schema.
 *
 * @typeParam TRoot - The view schema for the root field.
 * @param source - A live view whose schema already permits reading and editing the tree.
 * @returns A ready view that owns the source view. Disposing it also disposes the source view.
 */
function createReadyView<TRoot extends ImplicitFieldSchema>(
	source: SchematizingSimpleTreeView<TRoot>,
): ReadyTreeView<TRoot> {
	// TRoot is a known schema, so the public read and insertable types apply to both root accessors.
	const view = source as TreeView<TRoot>;
	return {
		kind: "ready",
		schema: view.schema,
		events: view.events,
		get root(): TreeFieldFromImplicitField<TRoot> {
			return view.root;
		},
		set root(content: InsertableTreeFieldFromImplicitField<TRoot>) {
			view.root = content;
		},
		get disposed() {
			return view.disposed;
		},
		dispose(error) {
			if (!view.disposed) {
				view.dispose(error);
			}
		},
	};
}

/**
 * Creates a one-use initializer for an uninitialized tree.
 *
 * @remarks
 * Creating the initializer does not reserve the tree. Initialization checks that the tree is still uninitialized
 * and consumes the handle even if the call fails. On success, ownership of the underlying view transfers
 * to the returned ready view. On failure, the initializer disposes the underlying view.
 *
 * @typeParam TRoot - The view schema that determines which initial content the tree accepts.
 * @param view - A live view of a tree that was uninitialized when opened.
 * @returns An initializer that owns the view until you initialize the tree or dispose the handle.
 */
function createInitializer<TRoot extends ImplicitFieldSchema>(
	view: SchematizingSimpleTreeView<TRoot>,
): UninitializedTreeResult<TRoot> {
	let owned: SchematizingSimpleTreeView<TRoot> | undefined = view;
	return {
		kind: "uninitialized",
		get disposed() {
			return owned === undefined || owned.disposed;
		},
		dispose() {
			const current = owned;
			owned = undefined;
			if (current !== undefined && !current.disposed) {
				current.dispose();
			}
		},
		initialize(content) {
			const current = owned;
			if (current === undefined || current.disposed) {
				throw new UsageError("Cannot initialize with a consumed or disposed initializer.");
			}

			// Consume the handle before any callbacks run. Only the ready view may own it after success.
			owned = undefined;
			try {
				current.initializeForOpen(content as InsertableContent | undefined);
				return createReadyView(current);
			} catch (error) {
				current.dispose();
				throw error;
			}
		},
	};
}
