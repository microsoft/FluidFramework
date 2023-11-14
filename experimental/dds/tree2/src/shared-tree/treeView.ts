/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey } from "../core";
import {
	TreeFieldSchema,
	TreeSchema,
	FlexTreeTypedField,
	ProxyField,
	TreeContext,
	NodeKeyManager,
	getTreeContext,
	getProxyForField,
	Context,
} from "../feature-libraries";
import { IDisposable, disposeSymbol } from "../util";
import { ITreeCheckoutFork, ITreeCheckout } from "./treeCheckout";

/**
 * An editable view of a (version control style) branch of a shared tree.
 * @privateRemarks
 * TODO:
 * 1. Once ISharedTreeView is renamed this can become ISharedTreeView.
 * 2. This object should be combined with or accessible from the TreeContext to allow easy access to thinks like branching.
 * @alpha
 */
export interface ITreeView<in out TRoot extends TreeFieldSchema> extends IDisposable {
	/**
	 * The current root of the tree.
	 */
	readonly root: ProxyField<TRoot>;

	/**
	 * Context for controlling the EditableTree nodes produced from {@link ITreeView.editableTree}.
	 *
	 * @remarks
	 * This is an owning reference: disposing of this view disposes its context.
	 */
	readonly context: TreeContext;

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
	readonly editableTree: FlexTreeTypedField<TRoot>;

	/**
	 * Spawn a new view which is based off of the current state of this view.
	 * Any mutations of the new view will not apply to this view until the new view is merged back into this view via `merge()`.
	 */
	fork(): ITreeViewFork<TRoot>;
}

/**
 * Branch (like in a version control system) of SharedTree.
 *
 * {@link ITreeView} that has forked off of the main trunk/branch.
 * @alpha
 */
export interface ITreeViewFork<in out TRoot extends TreeFieldSchema> extends ITreeView<TRoot> {
	readonly checkout: ITreeCheckoutFork;
}

/**
 * Implementation of ITreeView wrapping a ITreeCheckout.
 */
export class CheckoutView<
	in out TRoot extends TreeFieldSchema,
	out TCheckout extends ITreeCheckout = ITreeCheckout,
> implements ITreeView<TRoot>
{
	public readonly context: Context;
	public readonly editableTree: FlexTreeTypedField<TRoot>;
	public constructor(
		public readonly checkout: TCheckout,
		public readonly schema: TreeSchema<TRoot>,
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
		this.editableTree = this.context.root as FlexTreeTypedField<TRoot>;
	}

	public [disposeSymbol](): void {
		this.context[disposeSymbol]();
		this.onDispose?.();
	}

	public get root(): ProxyField<TRoot> {
		return getProxyForField(this.editableTree);
	}

	public fork(): CheckoutView<TRoot, ITreeCheckoutFork> {
		const branch = this.checkout.fork();
		return new CheckoutView(branch, this.schema, this.nodeKeyManager, this.nodeKeyFieldKey);
	}
}
