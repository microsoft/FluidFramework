/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey } from "../core";
import {
	TreeFieldSchema,
	TreeSchema,
	TypedField,
	ProxyField,
	TreeContext,
	NodeKeyManager,
	getTreeContext,
	getProxyForField,
	Context,
} from "../feature-libraries";
import { IDisposable, disposeSymbol } from "../util";
import { ISharedTreeView } from "./sharedTreeView";
import { TypedTreeView } from "./typedTree";

/**
 * An editable view of a (version control style) branch of a shared tree.
 * @privateRemarks
 * TODO:
 * 1. Once ISharedTreeView is renamed this can become ISharedTreeView.
 * 2. This object should be combined with or accessible from the TreeContext to allow easy access to thinks like branching.
 * @alpha
 */
export interface ISharedTreeView2<in out TRoot extends TreeFieldSchema>
	extends IDisposable,
		TypedTreeView<TRoot> {
	/**
	 * Context for controlling the EditableTree nodes produced from {@link ISharedTreeView2.editableTree}.
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
	readonly branch: ISharedTreeView;

	/**
	 * Get a typed view of the tree content using the editable-tree-2 API.
	 */
	readonly editableTree: TypedField<TRoot>;

	/**
	 * Spawn a new view which is based off of the current state of this view.
	 * Any mutations of the new view will not apply to this view until the new view is merged back into this view via `merge()`.
	 */
	fork(): ISharedTreeView2<TRoot>;
}

/**
 * Implementation of ISharedTreeView2.
 */
export class SharedTreeView2<in out TRoot extends TreeFieldSchema>
	implements ISharedTreeView2<TRoot>
{
	public readonly context: Context;
	public readonly editableTree: TypedField<TRoot>;
	public constructor(
		public readonly branch: ISharedTreeView,
		public readonly schema: TreeSchema<TRoot>,
		public readonly nodeKeyManager: NodeKeyManager,
		public readonly nodeKeyFieldKey: FieldKey,
	) {
		this.context = getTreeContext(
			schema,
			this.branch.forest,
			this.branch.editor,
			nodeKeyManager,
			nodeKeyFieldKey,
		);
		this.editableTree = this.context.root as TypedField<TRoot>;
	}

	public [disposeSymbol](): void {
		this.context[disposeSymbol]();
	}

	public get root(): ProxyField<TRoot> {
		return getProxyForField(this.editableTree);
	}

	public fork(): ISharedTreeView2<TRoot> {
		const branch = this.branch.fork();
		return new SharedTreeView2(branch, this.schema, this.nodeKeyManager, this.nodeKeyFieldKey);
	}
}
