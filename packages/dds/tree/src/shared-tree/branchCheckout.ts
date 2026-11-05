/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDisposable } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type {
	ImplicitFieldSchema,
	TreeViewAlpha,
	TreeViewConfiguration,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- This is referenced by doc comments.
	UntypedTreeView,
	UntypedTreeViewAlpha,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- This is referenced by doc comments.
	ViewableTreeAlpha,
} from "../simple-tree/index.js";

import { CheckoutBase, type TreeCheckoutOptions } from "./treeCheckout.js";

/**
 * An independently owned checkout for retaining an editable fork across typed-view lifetimes.
 *
 * @remarks
 * By default, disposing a view created through this checkout leaves the checkout available for a new view.
 * Its owner can create another view of the same checkout and must dispose the checkout when it is no longer needed.
 * Views created through a typed view's `fork` operation instead own and dispose their child checkout.
 *
 * A `BranchCheckout` keeps the same underlying branch object:
 * unlike `TreeCheckout`, it does not expose branch switching or rewind operations that replace that object.
 * Its contents remain editable, and it supports merges and rebases.
 *
 * No tree view is attached at construction time.
 * A typed view can be created on demand via the inherited {@link CheckoutBase.viewWith | viewWith}.
 * The typed-view interface still exposes `rewindTo` even though this checkout does not support it.
 * These internal views must not call `rewindTo`, which requires replacing the underlying branch.
 *
 * Disposing the parent of a {@link forkAsBranchCheckout} does not dispose the child, and vice versa;
 * merging is explicit via {@link CheckoutBase.merge}.
 *
 * SharedTree-backed checkouts retain ancestry trimming notifications to keep history counts and repair data up to date.
 */
export class BranchCheckout extends CheckoutBase implements TreeBranchHandleAlpha {
	public constructor(options: TreeCheckoutOptions) {
		assert(
			!options.isSharedBranch,
			0xd77 /* BranchCheckout cannot represent a shared branch */,
		);
		super(options);
	}

	public override fork(): BranchCheckout {
		return this.forkWith((options) => new BranchCheckout(options));
	}

	/**
	 * By default, disposing a view created through this checkout leaves the checkout available for a new view.
	 * Views created through a typed view's `fork` operation override this policy and dispose their child checkout.
	 */
	public override get disposesWithView(): boolean {
		return false;
	}

	public override isView(): this is UntypedTreeViewAlpha {
		return false;
	}

	// A `BranchCheckout` is not a view, even when it has an attached view.
	public override hasRootSchema<TSchema extends ImplicitFieldSchema>(
		_schema: TSchema,
	): this is TreeViewAlpha<TSchema> {
		return false;
	}
}

/**
 * Forks {@link parent} and wraps the new branch in a viewless {@link BranchCheckout}.
 *
 * @remarks
 * The returned `BranchCheckout` is independent: edits do not affect {@link parent}, merging back must be explicit,
 * and disposing either side does not dispose the other.
 */
export function forkAsBranchCheckout(parent: CheckoutBase): BranchCheckout {
	return parent.forkWith((options) => new BranchCheckout(options));
}

/**
 * An independent branch that has a separate lifetime from the tree from which it was forked.
 *
 * @remarks
 * The branch retains its state and history independently of its views.
 * Call {@link TreeBranchHandleAlpha.dispose | dispose} when you no longer need it.
 *
 * @sealed @alpha
 */
export interface TreeBranchHandleAlpha extends IDisposable {
	/**
	 * Creates an independent branch from this branch's current state.
	 *
	 * @remarks
	 * Each call creates a new branch.
	 * You do not need an active view to fork this branch.
	 * Use {@link TreeBranchHandleAlpha.viewWith | viewWith} on the returned branch to create its view.
	 * Changes to the new branch do not affect this branch until you {@link UntypedTreeView.merge | merge} them through views of the branches.
	 * If you dispose one branch, the other branch remains available.
	 *
	 * @returns A new, independent branch handle that you own from this branch, with no active view.
	 *
	 * @throws A `UsageError` if this branch has a pending transaction or is disposed.
	 */
	fork(): TreeBranchHandleAlpha;

	/**
	 * Creates a view of this branch with the specified schema configuration.
	 *
	 * @remarks
	 * See {@link ViewableTree.viewWith} for the schema compatibility rules.
	 * If the view schema is incompatible with the branch's stored schema, check {@link TreeView.compatibility | compatibility} for details.
	 * Access to {@link TreeView.root | root} throws an error until the schemas are compatible.
	 *
	 * Disposing the view preserves this branch so you can create another view.
	 * However, disposing this branch also disposes its active view.
	 * Only one view of this branch can be active at a time.
	 * The returned view does not support {@link UntypedTreeViewAlpha.rewindTo | rewindTo}.
	 *
	 * @typeParam TSchema - The schema type of the tree view.
	 * @param config - The schema configuration for the view.
	 * @returns A view of this branch with the specified schema configuration.
	 *
	 * @throws A `UsageError` if this branch has an active view or is disposed.
	 */
	viewWith<TSchema extends ImplicitFieldSchema>(
		config: TreeViewConfiguration<TSchema>,
	): TreeViewAlpha<TSchema>;

	/**
	 * Disposes this branch and its view, if it has one.
	 * @remarks
	 * Disposing this branch does not dispose its parent or child branches.
	 *
	 * @throws A `UsageError` if this branch is already disposed.
	 */
	dispose(): void;
}
