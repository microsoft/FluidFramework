/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	TreeView,
	TreeViewAlpha,
	TreeViewBeta,
	ImplicitFieldSchema,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
} from "./simple-tree/index.js";

/**
 * Module entry points for retrieving alternate (alpha/beta) versions of tree APIs.
 * For each API (usually a class) that has an alpha/beta version, add overloads to the function(s) below.
 * These functions should only be used by external consumers, not referenced internally within the tree package, to avoid circular import dependencies.
 */

/**
 * Retrieve the {@link TreeViewAlpha | alpha API} for a {@link TreeView}.
 * @alpha
 */
export function asAlpha<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
): TreeViewAlpha<TSchema>;

/**
 * Retrieve the {@link TreeViewConfigurationAlpha | alpha API} for a {@link TreeViewConfiguration}.
 * @alpha
 */
export function asAlpha<TSchema extends ImplicitFieldSchema>(
	view: TreeViewConfiguration<TSchema>,
): TreeViewConfigurationAlpha<TSchema>;

/**
 * Implementation of overloads for {@link asAlpha}.
 */
export function asAlpha(view: unknown): unknown {
	return view;
}

/**
 * Retrieve the {@link TreeViewBeta | beta API} for a {@link TreeView}.
 * @beta
 */
export function asBeta<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
): TreeViewBeta<TSchema> {
	return view as TreeViewBeta<TSchema>;
}
