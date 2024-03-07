/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey } from "../core/index.js";
import {
	FlexFieldSchema,
	FlexTreeSchema,
	FlexTreeTypedField,
	FlexTreeContext,
	NodeKeyManager,
	getTreeContext,
	Context,
} from "../feature-libraries/index.js";
import { IDisposable, disposeSymbol } from "../util/index.js";
import { ITreeCheckoutFork, ITreeCheckout, TreeCheckout } from "./treeCheckout.js";

/**
 * An editable view of a (version control style) branch of a shared tree.
 * @privateRemarks
 * TODO:
 * 1. Once ISharedTreeView is renamed this can become ISharedTreeView.
 * 2. This object should be combined with or accessible from the TreeContext to allow easy access to thinks like branching.
 * @internal
 */
export interface FlexTreeView<in out TRoot extends FlexFieldSchema> extends IDisposable {
	/**
	 * Context for controlling the EditableTree nodes produced from {@link FlexTreeView.flexTree}.
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
	 * Get a typed view of the tree content using the editable-tree-2 API.
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
export interface ITreeViewFork<in out TRoot extends FlexFieldSchema> extends FlexTreeView<TRoot> {
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
		public readonly nodeKeyFieldKey: FieldKey,
		private readonly onDispose?: () => void,
	) {
		this.context = getTreeContext(
			schema,
			this.checkout.forest,
			this.checkout.editor,
			nodeKeyManager,
			nodeKeyFieldKey,
		);
		this.flexTree = this.context.root as FlexTreeTypedField<TRoot>;
	}

	public [disposeSymbol](): void {
		this.context[disposeSymbol]();
		this.onDispose?.();
	}

	public fork(): CheckoutFlexTreeView<TRoot, TreeCheckout & ITreeCheckoutFork> {
		const branch = this.checkout.fork();
		return new CheckoutFlexTreeView(
			branch,
			this.schema,
			this.nodeKeyManager,
			this.nodeKeyFieldKey,
		);
	}
}
