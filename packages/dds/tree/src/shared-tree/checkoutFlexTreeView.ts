/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	type Context,
	type FlexTreeField,
	type FlexTreeSchema,
	type NodeKeyManager,
	getTreeContext,
	type FlexTreeHydratedContext,
} from "../feature-libraries/index.js";
import { tryDisposeTreeNode } from "../simple-tree/index.js";
import { disposeSymbol } from "../util/index.js";

import type { ITreeCheckout, ITreeCheckoutFork } from "./treeCheckout.js";

/**
 * Implementation of FlexTreeView wrapping a ITreeCheckout.
 */
export class CheckoutFlexTreeView<out TCheckout extends ITreeCheckout = ITreeCheckout> {
	public readonly context: Context;
	public readonly flexTree: FlexTreeField;
	public constructor(
		public readonly checkout: TCheckout,
		public readonly schema: FlexTreeSchema,
		public readonly nodeKeyManager: NodeKeyManager,
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

	public fork(): CheckoutFlexTreeView<ITreeCheckout & ITreeCheckoutFork> {
		const branch = this.checkout.fork();
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
	assert(view !== undefined, "Expected view to be registered for context");
	return view;
}
