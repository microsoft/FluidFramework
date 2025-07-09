/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	Context,
	type FlexTreeField,
	type NodeIdentifierManager,
} from "../feature-libraries/index.js";
import { tryDisposeTreeNode } from "../simple-tree/index.js";
import { disposeSymbol } from "../util/index.js";

import type { ITreeCheckout, ITreeCheckoutFork } from "./treeCheckout.js";
import type { SchemaPolicy } from "../core/index.js";

/**
 * An editable view of a (version control style) branch of a shared tree.
 * @remarks
 * Does not depend on stored schema, and thus can live across schema changes.
 * @privateRemarks
 * TODO: This has no state beyond the context, so it likely should be replaced with just the context.
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
	 * Get a view of the tree content using the flex-tree API.
	 */
	public get flexTree(): FlexTreeField {
		return this.context.root;
	}

	public constructor(
		/**
		 * Access non-view schema specific aspects of this branch.
		 *
		 * @remarks
		 * This is a non-owning reference: disposing of this view does not impact the branch.
		 */
		checkout: TCheckout,
		schema: SchemaPolicy,
		nodeKeyManager: NodeIdentifierManager,
		onDispose?: () => void,
	) {
		this.context = new Context(schema, checkout, nodeKeyManager, () => {
			for (const anchorNode of this.context.checkout.forest.anchors) {
				tryDisposeTreeNode(anchorNode);
			}

			onDispose?.();
		});
	}

	public [disposeSymbol](): void {
		this.context[disposeSymbol]();
	}

	/**
	 * Spawn a new view which is based off of the current state of this view.
	 * Any mutations of the new view will not apply to this view until the new view is merged back into this view via `merge()`.
	 */
	public fork(): CheckoutFlexTreeView<ITreeCheckout & ITreeCheckoutFork> {
		assert(!this.context.isDisposed(), 0xb81 /* disposed */);
		const branch = this.context.checkout.branch();
		return new CheckoutFlexTreeView(
			branch,
			this.context.schemaPolicy,
			this.context.nodeKeyManager,
		);
	}
}
