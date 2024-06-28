/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type Context,
	type FlexFieldSchema,
	type FlexTreeContext,
	type FlexTreeSchema,
	type FlexTreeTypedField,
	type NodeKeyManager,
	getTreeContext,
} from "../feature-libraries/index.js";
import { type IDisposable, disposeSymbol } from "../util/index.js";

import type { ITreeCheckout, ITreeCheckoutFork, TreeCheckout } from "./treeCheckout.js";

/**
 * The portion of {@link FlexTreeView} that does not depend on the schema's type.
 * @privateRemarks
 * Since {@link FlexTreeView}'s schema is invariant, `FlexTreeView<FlexFieldSchema>` does not cover this use case.
 * @internal
 */
export interface FlexTreeViewGeneric extends IDisposable {
	/**
	 * Context for controlling the FlexTree nodes produced from {@link FlexTreeView.flexTree}.
	 *
	 * @remarks
	 * This is an owning reference: disposing of this view disposes its context.
	 */
	readonly context: FlexTreeContext;

	/**
	 * Access non-view schema specific aspects of of this branch.
	 *
	 * @remarks
	 * This is a non-owning reference: disposing of this view does not impact the branch.
	 */
	readonly checkout: ITreeCheckout;
}

/**
 * An editable view of a (version control style) branch of a shared tree.
 * @privateRemarks
 * TODO:
 * If schema aware APIs are removed from flex tree, this can be combined with {@link FlexTreeViewGeneric}.
 * @internal
 */
export interface FlexTreeView<in out TRoot extends FlexFieldSchema>
	extends FlexTreeViewGeneric {
	/**
	 * Get a typed view of the tree content using the flex-tree API.
	 */
	readonly flexTree: FlexTreeTypedField<TRoot>;

	/**
	 * Spawn a new view which is based off of the current state of this view.
	 * Any mutations of the new view will not apply to this view until the new view is merged back into this view via `merge()`.
	 */
	fork(): ITreeViewFork<TRoot>;
}

/**
 * Branch (like in a version control system) of SharedTree.
 *
 * {@link FlexTreeView} that has forked off of the main trunk/branch.
 * @internal
 */
export interface ITreeViewFork<in out TRoot extends FlexFieldSchema>
	extends FlexTreeView<TRoot> {
	readonly checkout: ITreeCheckoutFork;
}

/**
 * Implementation of FlexTreeView wrapping a ITreeCheckout.
 */
export class CheckoutFlexTreeView<
	in out TRoot extends FlexFieldSchema,
	out TCheckout extends TreeCheckout = TreeCheckout,
> implements FlexTreeView<TRoot>
{
	public readonly context: Context;
	public readonly flexTree: FlexTreeTypedField<TRoot>;
	public constructor(
		public readonly checkout: TCheckout,
		public readonly schema: FlexTreeSchema<TRoot>,
		public readonly nodeKeyManager: NodeKeyManager,
		private readonly onDispose?: () => void,
	) {
		this.context = getTreeContext(schema, this.checkout, nodeKeyManager);
		contextToTreeView.set(this.context, this);
		this.flexTree = this.context.root as FlexTreeTypedField<TRoot>;
	}

	public [disposeSymbol](): void {
		this.context[disposeSymbol]();
		this.onDispose?.();
	}

	public fork(): CheckoutFlexTreeView<TRoot, TreeCheckout & ITreeCheckoutFork> {
		const branch = this.checkout.fork();
		return new CheckoutFlexTreeView(branch, this.schema, this.nodeKeyManager);
	}
}

/**
 * Maps the context of every {@link CheckoutFlexTreeView} to the view.
 * In practice, this allows the view or checkout to be obtained from a flex node by first getting the context from the flex node and then using this map.
 */
export const contextToTreeView = new WeakMap<Context, FlexTreeViewGeneric>();
