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
	ViewableTree,
	ViewableTreeAlpha,
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
 * Retrieve the {@link ViewableTreeAlpha | alpha API} for a {@link ViewableTree}.
 * @param tree - The tree whose alpha API is requested.
 * @returns The alpha API for `tree`.
 * @alpha
 */
export function asAlpha(tree: ViewableTree): ViewableTreeAlpha;

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
 * @param node - The array node whose alpha API is requested.
 * @returns The same node, with its existing type and additional alpha methods.
 * @typeParam TAllowedTypes - The schema types allowed in the array.
 * @typeParam TNode - The input node type. Let this be inferred to preserve customized node members.
 * @remarks
 * If specifying `TAllowedTypes` explicitly, also specify `TNode` to preserve customized node members.
 * @privateRemarks
 * Infer read and insertion types directly: schema-derived node types do not reliably infer `TAllowedTypes`.
 * Only add alpha-only members so existing methods do not acquire broader overloads.
 * Distribute over `TNode` to keep each member of a union paired with its own alpha methods.
 * @alpha
 */
export function asAlpha<
	TAllowedTypes extends ImplicitAllowedTypes,
	TNode extends TreeArrayNode<TAllowedTypes> = TreeArrayNode<TAllowedTypes>,
>(
	node: TNode & TreeArrayNode<TAllowedTypes>,
): TNode extends TreeArrayNode<TAllowedTypes, infer TElement, infer TInsertable>
	? TNode & Omit<TreeArrayNodeAlpha<TAllowedTypes, TElement, TInsertable>, keyof TreeArrayNode>
	: never;

/**
 * Retrieve the {@link TreeMapNodeAlpha | alpha API} for a {@link TreeMapNode}.
 * @param node - The map node whose alpha API is requested.
 * @returns The same node, with its existing type and additional alpha methods.
 * @typeParam TAllowedTypes - The schema types allowed in the map.
 * @typeParam TNode - The input node type. Let this be inferred to preserve customized node members.
 * @remarks
 * If specifying `TAllowedTypes` explicitly, also specify `TNode` to preserve customized node members.
 * @privateRemarks
 * The intersection parameter preserves inference for callers with a generic `TreeMapNode<TAllowedTypes>`.
 * Derive alpha-only member types from the node because its allowed schema types cannot reliably be inferred.
 * Distribute over `TNode` so a union of maps does not allow writes valid for only one member.
 * @alpha
 */
export function asAlpha<
	TAllowedTypes extends ImplicitAllowedTypes,
	TNode extends TreeMapNode<TAllowedTypes> = TreeMapNode<TAllowedTypes>,
>(
	node: TNode & TreeMapNode<TAllowedTypes>,
): TNode extends TreeMapNode<TAllowedTypes>
	? TNode &
			Omit<
				TreeMapNodeAlpha<
					TAllowedTypes,
					Exclude<ReturnType<TNode["get"]>, undefined>,
					Exclude<Parameters<TNode["set"]>[1], undefined>
				>,
				keyof TreeMapNode
			>
	: never;

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
