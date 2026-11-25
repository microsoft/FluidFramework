/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { assert } from "@fluidframework/core-utils/internal";

import type {
	ImplicitFieldSchema,
	InsertableContent,
	OpenTreeViewResult,
	SimpleTreeSchema,
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
		openView: (config) => openCheckoutView(checkout, config),
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
 * Opens a schema-aware view without transferring ownership of the checkout.
 *
 * @param checkout - The checkout that supplies the document's schema and content.
 * @param config - The schema and behavior configuration for the view.
 * @returns The result of {@link ViewableTreeAlpha.openView} for this checkout.
 */
export function openCheckoutView<TRoot extends ImplicitFieldSchema>(
	checkout: CheckoutBase,
	config: TreeViewConfiguration<TRoot>,
): OpenTreeViewResult<TRoot> {
	const view = checkout.viewWithInternal<TRoot>(config, false);
	try {
		const status = view.compatibility;
		if (status.canInitialize) {
			return createInitializer(view);
		}

		// A permitted upgrade is not necessarily required. Do not write if the existing schema works.
		if (!status.view.isCompatible) {
			if (!status.upgrade.isCompatible) {
				const result = {
					kind: "incompatible",
					incompatibilities: {
						view: status.view.incompatibilities,
						upgrade: status.upgrade.incompatibilities,
					},
				} as const;
				view.dispose();
				return result;
			}
			view.upgradeSchema();
			assert(
				view.compatibility.canView,
				"A permitted schema upgrade must make the view usable",
			);
		}
		return { kind: "ready", view };
	} catch (error) {
		if (!view.disposed) {
			view.dispose();
		}
		throw error;
	}
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
				return current;
			} catch (error) {
				if (!current.disposed) {
					current.dispose();
				}
				throw error;
			}
		},
	};
}
