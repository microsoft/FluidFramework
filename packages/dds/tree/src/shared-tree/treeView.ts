/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type Context,
	type FlexFieldSchema,
	type FlexTreeContext,
	type FlexTreeField,
	type FlexTreeSchema,
	type FlexTreeTypedField,
	type NodeKeyManager,
	getTreeContext,
} from "../feature-libraries/index.js";
import { tryDisposeTreeNode } from "../simple-tree/index.js";
import { type IDisposable, disposeSymbol } from "../util/index.js";

import type { ITreeCheckout, ITreeCheckoutFork } from "./treeCheckout.js";

/**
 * An editable view of a (version control style) branch of a shared tree.
 */
export interface FlexTreeView extends IDisposable {
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
	/**
	 * Get a typed view of the tree content using the flex-tree API.
	 */
	readonly flexTree: FlexTreeField;

	/**
	 * Spawn a new view which is based off of the current state of this view.
	 * Any mutations of the new view will not apply to this view until the new view is merged back into this view via `merge()`.
	 */
	fork(): ITreeViewFork;
}

/**
 * Branch (like in a version control system) of SharedTree.
 *
 * {@link FlexTreeView} that has forked off of the main trunk/branch.
 */
export interface ITreeViewFork extends FlexTreeView {
	readonly checkout: ITreeCheckoutFork;
}

/**
 * Implementation of FlexTreeView wrapping a ITreeCheckout.
 */
export class CheckoutFlexTreeView<
	in out TRoot extends FlexFieldSchema,
	out TCheckout extends ITreeCheckout = ITreeCheckout,
> implements FlexTreeView
{
	public readonly context: Context;
	public readonly flexTree: FlexTreeTypedField<TRoot["kind"]>;
	public constructor(
		public readonly checkout: TCheckout,
		public readonly schema: FlexTreeSchema<TRoot>,
		public readonly nodeKeyManager: NodeKeyManager,
		private readonly onDispose?: () => void,
	) {
		this.context = getTreeContext(schema, this.checkout, nodeKeyManager);
		contextToTreeView.set(this.context, this);
		this.flexTree = this.context.root as FlexTreeTypedField<TRoot["kind"]>;
	}

	public [disposeSymbol](): void {
		for (const anchorNode of this.checkout.forest.anchors) {
			tryDisposeTreeNode(anchorNode);
		}

		this.context[disposeSymbol]();
		this.onDispose?.();
	}

	public fork(): CheckoutFlexTreeView<TRoot, ITreeCheckout & ITreeCheckoutFork> {
		const branch = this.checkout.fork();
		return new CheckoutFlexTreeView(branch, this.schema, this.nodeKeyManager);
	}
}

/**
 * Maps the context of every {@link CheckoutFlexTreeView} to the view.
 * In practice, this allows the view or checkout to be obtained from a flex node by first getting the context from the flex node and then using this map.
 */
export const contextToTreeView = new WeakMap<Context, FlexTreeView>();
