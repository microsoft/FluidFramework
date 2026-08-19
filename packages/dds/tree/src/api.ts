/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ITree,
	ITreeAlpha,
	TreeView,
	TreeViewAlpha,
	TreeViewBeta,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
	TreeArrayNode,
	TreeArrayNodeAlpha,
	TreeMapNode,
	TreeMapNodeAlpha,
} from "./simple-tree/index.js";

/**
 * Module entry points for retrieving alternate (alpha/beta) versions of tree APIs.
 * For each API (usually a class) that has an alpha/beta version, add overloads to the function(s) below.
 * These functions should only be used by external consumers, not referenced internally within the tree package, to avoid circular import dependencies.
 *
 * These are only valid if all implementations are guaranteed to implement the alpha API:
 * cases like SchemaFactory which allow users to construct non-alpha versions must not be added here.
 */

/**
 * Retrieve the {@link ITreeAlpha | alpha API} for an {@link ITree}.
 * @alpha
 */
export function asAlpha(tree: ITree): ITreeAlpha;

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
 * Retrieve the {@link TreeArrayNodeAlpha | alpha API} for a {@link (TreeArrayNode:interface)}.
 * @alpha
 */
export function asAlpha<TAllowedTypes extends ImplicitAllowedTypes>(
	node: TreeArrayNode<TAllowedTypes>,
): TreeArrayNodeAlpha<TAllowedTypes>;

/**
 * Retrieve the {@link TreeMapNodeAlpha | alpha API} for a {@link TreeMapNode}.
 * @alpha
 */
export function asAlpha<TAllowedTypes extends ImplicitAllowedTypes>(
	node: TreeMapNode<TAllowedTypes>,
): TreeMapNodeAlpha<TAllowedTypes>;

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
