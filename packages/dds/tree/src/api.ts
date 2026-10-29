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
	SchemaFactory,
	SchemaFactoryBeta,
	SchemaFactoryAlpha,
} from "./simple-tree/index.js";

/**
 * Module entry points for retrieving alternate (alpha/beta) versions of tree APIs.
 * For each API (usually a class) that has an alpha/beta version, add support to the function(s) below.
 * These functions should only be used by external consumers, not referenced internally within the tree package, to avoid circular import dependencies.
 *
 * These are only valid if all implementations are guaranteed to implement the requested API.
 * They return the original object without adding methods or changing its state.
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
 * @alpha
 */
export function asAlpha<TAllowedTypes extends ImplicitAllowedTypes>(
	node: TreeArrayNode<TAllowedTypes>,
): TreeArrayNodeAlpha<TAllowedTypes>;

/**
 * Retrieve the {@link SchemaFactoryAlpha | alpha API} for a {@link SchemaFactory}.
 *
 * @remarks
 * Returns the same factory, preserving its scope and cached schemas.
 *
 * @param factory - the factory whose alpha API is requested
 *
 * @returns the input factory typed as {@link SchemaFactoryAlpha}
 *
 * @typeParam TScope - the factory's scope
 * @typeParam TFactory - the input factory type
 *
 * @privateRemarks
 * The scope comes from `scope`, while allowed schema names come from the first parameter of `object`.
 * This avoids name-inference failures when `object` is overridden with additional type parameters.
 * Two required type parameters prevent this overload from affecting existing `asAlpha<TSchema>` specializations.
 *
 * @alpha
 */
export function asAlpha<
	TScope extends string | undefined,
	TFactory extends SchemaFactory<string | undefined, never>,
>(
	factory: TFactory & { readonly scope: TScope },
): SchemaFactoryAlpha<TScope, Parameters<TFactory["object"]>[0]>;

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
 * Retrieve the beta API for a {@link TreeView} or {@link SchemaFactory}.
 *
 * @remarks
 * Returns the same object.
 * For factories, this preserves the scope and cached schemas.
 *
 * @see {@link TreeViewBeta}
 * @see {@link SchemaFactoryBeta}
 *
 * @param value - the view or factory whose beta API is requested
 *
 * @returns the input object typed as {@link TreeViewBeta} or {@link SchemaFactoryBeta}
 *
 * @typeParam TSchema - the view's root schema
 * @typeParam TInput - the input view or factory type
 *
 * @privateRemarks
 * Keep a single public call signature so `views.map(asBeta)` preserves the view's schema type.
 * Separate overloads widen the inferred schema to `ImplicitFieldSchema`, even with the view overload last.
 * The separate schema parameter preserves existing calls with explicit schema type arguments.
 * Infer the factory type from its properties to support overridden generic methods.
 *
 * @example
 * ```typescript
 * import { SchemaFactory } from "@fluidframework/tree";
 * import { asBeta } from "@fluidframework/tree/beta";
 *
 * const factory = new SchemaFactory("com.example");
 * const allowedTypes = asBeta(factory).types([factory.string, factory.number]);
 * class Item extends factory.object("Item", { value: allowedTypes }) {}
 * ```
 *
 * @beta
 */
export function asBeta<
	TSchema extends ImplicitFieldSchema,
	TInput extends object = TreeView<TSchema>,
>(
	value: TInput & (TreeView<TSchema> | SchemaFactory<string | undefined, never>),
): TInput extends {
	readonly scope: infer TScope extends string | undefined;
	object: (...args: infer TParameters) => unknown;
}
	? SchemaFactoryBeta<TScope, TParameters[0] & (number | string)>
	: TreeViewBeta<TSchema>;

/**
 * Implementation of the call signature for {@link asBeta}.
 */
export function asBeta(value: unknown): unknown {
	return value;
}
