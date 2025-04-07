/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	type Context,
	type FlexTreeField,
	type NodeIdentifierManager,
	getTreeContext,
	type FlexTreeHydratedContext,
	type FullSchemaPolicy,
} from "../feature-libraries/index.js";
import { tryDisposeTreeNode } from "../simple-tree/index.js";
import { disposeSymbol } from "../util/index.js";

import type { ITreeCheckout, ITreeCheckoutFork } from "./treeCheckout.js";

/**
 * An editable view of a (version control style) branch of a shared tree.
 */
export class CheckoutFlexTreeView<out TCheckout extends ITreeCheckout = ITreeCheckout> {
	/**
	 * Context for controlling the FlexTree nodes produced from {@link FlexTreeView.flexTree}.
	 *
	 * @remarks
	 * This is an owning reference: disposing of this view disposes its context.
	 */
	public readonly context: Context;

	/**
	 * Get a typed view of the tree content using the flex-tree API.
	 */
	public readonly flexTree: FlexTreeField;

	public constructor(
		/**
		 * Access non-view schema specific aspects of this branch.
		 *
		 * @remarks
		 * This is a non-owning reference: disposing of this view does not impact the branch.
		 */
		public readonly checkout: TCheckout,
		public readonly schema: FullSchemaPolicy,
		public readonly nodeKeyManager: NodeIdentifierManager,
		private readonly onDispose?: () => void,
	) {
		this.context = getTreeContext(schema, this.checkout, nodeKeyManager);
		contextToTreeViewMap.set(this.context, this);
		this.flexTree = this.context.root;
	}

	public [disposeSymbol](): void {
		for (const anchorNode of this.checkout.forest.anchors) {
			tryDisposeTreeNode(anchorNode);
		}

		this.context[disposeSymbol]();
		this.onDispose?.();
	}

	/**
	 * Spawn a new view which is based off of the current state of this view.
	 * Any mutations of the new view will not apply to this view until the new view is merged back into this view via `merge()`.
	 */
	public fork(): CheckoutFlexTreeView<ITreeCheckout & ITreeCheckoutFork> {
		const branch = this.checkout.branch();
		return new CheckoutFlexTreeView(branch, this.schema, this.nodeKeyManager);
	}
}

/**
 * Maps the context of every {@link CheckoutFlexTreeView} to the view.
 * In practice, this allows the view or checkout to be obtained from a flex node by first getting the context from the flex node and then using this map.
 */
const contextToTreeViewMap = new WeakMap<FlexTreeHydratedContext, CheckoutFlexTreeView>();

/**
 * Retrieve the {@link CheckoutFlexTreeView | view} for the given {@link FlexTreeHydratedContext | context}.
 * @remarks Every {@link CheckoutFlexTreeView} is associated with its context upon creation.
 */
export function getCheckoutFlexTreeView(
	context: FlexTreeHydratedContext,
): CheckoutFlexTreeView {
	const view = contextToTreeViewMap.get(context);
	assert(view !== undefined, 0xa41 /* Expected view to be registered for context */);
	return view;
}
