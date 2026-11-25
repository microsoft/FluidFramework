/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { SchematizingSimpleTreeView } from "../../shared-tree/index.js";
import type { SchemaUpgrade } from "../core/index.js";
import type {
	ImplicitFieldSchema,
	InsertableField,
	InsertableTreeFieldFromImplicitField,
	ReadableField,
	ReadSchema,
} from "../fieldSchema.js";
import type { InsertableContent } from "../unhydratedFlexTreeFromInsertable.js";
import type { UnsafeUnknownSchema } from "../unsafeUnknownSchema.js";

import type { TreeViewConfiguration } from "./configuration.js";
import type { StagedUpgradeStatus } from "./schemaCompatibilityTester.js";
import type {
	ITree,
	SchemaUpgradeIncompatibility,
	SchemaViewIncompatibility,
	TreeBranchEvents,
	TreeView,
	TreeViewBeta,
	TreeViewEvents,
	TreeViewSchemaVersions,
	UntypedTreeView,
	UntypedTreeViewAlpha,
} from "./tree.js";

/**
 * Retrieve the {@link (TreeViewAlpha:interface) | alpha API} for a {@link TreeView}.
 * @remarks
 * This function can be used within the tree package (outside of tests) rather than {@link asAlpha} in order to avoid circular import dependencies.
 */
export function asTreeViewAlpha<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
): TreeViewAlpha<TSchema> {
	return view as TreeViewAlpha<TSchema>;
}

/**
 * The result of opening an initialized tree with {@link (TreeViewAlpha:namespace).openExisting}.
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
	/**
	 * Contains the configured and stored application-defined schema versions.
	 *
	 * @remarks
	 * {@link TreeViewSchemaVersions} describes how these maps relate to the view and document.
	 * The {@link TreeViewEvents.schemaChanged} event reports updates to the stored schema.
	 */
	readonly schemaVersion: TreeViewSchemaVersions;

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
 * Operations for initializing or opening a schema-aware view of a SharedTree.
 *
 * @alpha
 */
export namespace TreeViewAlpha {
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
	 * @see {@link (TreeViewAlpha:namespace).initializeNew} to initialize a new tree.
	 *
	 * @alpha
	 */
	export function openExisting<TRoot extends ImplicitFieldSchema>(
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
	 * @see {@link (TreeViewAlpha:namespace).openExisting} for an initialized document.
	 *
	 * @alpha
	 */
	export function initializeNew<TRoot extends ImplicitFieldSchema>(
		tree: ITree,
		config: TreeViewConfiguration<TRoot>,
		initialContent: InsertableTreeFieldFromImplicitField<TRoot>,
	): TreeViewAlpha<TRoot> {
		const view = asTreeViewAlpha(tree.viewWith(config));
		try {
			// Check the internal initialization operation without importing the checkout implementation at runtime.
			const implementation = view as SchematizingSimpleTreeView<TRoot>;
			assert(
				typeof implementation.initializeWithContent === "function",
				"Expected a schema-aware SharedTree view",
			);
			implementation.initializeWithContent(initialContent as InsertableContent | undefined);
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
}
