/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	asTreeViewAlpha,
	type ImplicitFieldSchema,
	type InsertableContent,
	type InsertableTreeFieldFromImplicitField,
	type ITree,
	type SchemaUpgradeIncompatibility,
	type SchemaViewIncompatibility,
	type TreeViewAlpha,
	type TreeViewConfiguration,
} from "../simple-tree/index.js";
import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";

/**
 * The result of opening an initialized tree with {@link viewExisting}.
 * @sealed @alpha
 */
export type ViewExistingResult<TRoot extends ImplicitFieldSchema> =
	| ViewExistingSuccess<TRoot>
	| ViewExistingFailure;

/**
 * A result containing a view that can read and edit the existing document.
 * @sealed @alpha
 */
export interface ViewExistingSuccess<in out TRoot extends ImplicitFieldSchema> {
	/**
	 * Indicates that the view is usable, including after a required upgrade.
	 */
	readonly canView: true;

	/**
	 * The view owned by the caller. Dispose it when it is no longer needed.
	 */
	readonly view: TreeViewAlpha<TRoot>;
}

/**
 * A result explaining why an initialized document could be neither viewed nor upgraded.
 * @sealed @alpha
 */
export interface ViewExistingFailure {
	/**
	 * Indicates that no view was opened.
	 */
	readonly canView: false;

	/**
	 * The viewing and upgrade blockers at the time of the call.
	 */
	readonly incompatibilities: ViewTreeIncompatibilities;
}

/**
 * The reasons a document could be neither viewed nor upgraded.
 *
 * @remarks
 * Both lists describe the schemas at the time of the failed open, even if the document changes later.
 *
 * @sealed @alpha
 */
export interface ViewTreeIncompatibilities {
	/**
	 * The nonempty list of incompatibilities that prevented viewing the document.
	 */
	readonly view: readonly SchemaViewIncompatibility[];

	/**
	 * The nonempty list of incompatibilities that prevented upgrading the document.
	 */
	readonly upgrade: readonly SchemaUpgradeIncompatibility[];
}

/**
 * Opens an initialized tree for editing.
 *
 * @remarks
 * If the document is already viewable, this function does not write to it.
 * Otherwise, it applies a permitted schema upgrade only if one is needed to provide access.
 * An upgrade changes the shared document and can affect other clients.
 *
 * @typeParam TRoot - The schema for the root field.
 * @param tree - An initialized tree with no active view.
 * @param config - The view schema and its configuration.
 * @returns A result with `canView: true` and a view you own, or `canView: false` and diagnostics you can log.
 * @throws An error with `errorType: "usageError"` if the tree is uninitialized or already has an active view.
 * @see {@link initializeAndView} to initialize a new tree.
 *
 * @alpha
 */
export function viewExisting<TRoot extends ImplicitFieldSchema>(
	tree: ITree,
	config: TreeViewConfiguration<TRoot>,
): ViewExistingResult<TRoot> {
	const view = asTreeViewAlpha(tree.viewWith(config));
	try {
		const status = view.compatibility;
		if (status.canInitialize) {
			throw new UsageError("Cannot view an existing tree before it has been initialized.");
		}

		// Upgrade the schema if it is required for the view to be compatible.
		if (!status.view.isCompatible) {
			if (!status.upgrade.isCompatible) {
				const incompatibilities = {
					view: status.view.incompatibilities,
					upgrade: status.upgrade.incompatibilities,
				};
				view.dispose();
				return { canView: false, incompatibilities };
			}
			view.upgradeSchema();
			assert(
				view.compatibility.canView,
				"A permitted schema upgrade must make the view usable",
			);
		}
		return { canView: true, view };
	} catch (error) {
		if (!view.disposed) {
			view.dispose();
		}
		throw error;
	}
}

/**
 * Initializes a new tree and returns its editable view.
 *
 * @remarks
 * Call this before attaching a new container. An already-initialized tree is rejected without changing its schema or content.
 * If the initial content does not match the schema, no view is retained and you can retry with valid content.
 *
 * @typeParam TRoot - The schema for the root field.
 * @param tree - An uninitialized tree with no active view.
 * @param config - The view schema used to create the initial stored schema.
 * @param initialContent - The initial root content. It must conform to the configured schema.
 * @returns A view that you own. Dispose it when you no longer need it.
 * @throws An error with `errorType: "usageError"` if the tree is already initialized, has an active view,
 * or the supplied content does not conform to the schema.
 * @see {@link viewExisting} for an initialized document.
 *
 * @alpha
 */
export function initializeAndView<TRoot extends ImplicitFieldSchema>(
	tree: ITree,
	config: TreeViewConfiguration<TRoot>,
	initialContent: InsertableTreeFieldFromImplicitField<TRoot>,
): TreeViewAlpha<TRoot> {
	const view = asTreeViewAlpha(tree.viewWith(config));
	try {
		assert(
			view instanceof SchematizingSimpleTreeView,
			"Expected a schema-aware SharedTree view",
		);
		view.initializeWithContent(initialContent as InsertableContent | undefined);
		assert(
			view.compatibility.canView,
			"A newly initialized tree must support its own view schema",
		);
		return view;
	} catch (error) {
		if (!view.disposed) {
			view.dispose();
		}
		throw error;
	}
}
