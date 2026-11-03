/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	ImplicitFieldSchema,
	TreeViewAlpha,
	TreeViewConfiguration,
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

	// A `BranchCheckout` is viewless by construction, so the `TreeViewAlpha` type predicate is always false.
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
 * An independent branch of a tree that you own.
 *
 * @remarks
 * Use {@link ViewableTreeAlpha.forkBranch} to create a branch.
 * Use {@link TreeBranchHandleAlpha.viewWith | viewWith} to create a view that can read and edit the branch.
 * The branch owns its state and history.
 * The view uses the configured schema to read and edit that state.
 * Edits affect only this branch until you merge them into another view with `merge`.
 * By default, a successful merge disposes this branch and its view.
 * It does not dispose the target branch or its view.
 * Pass `false` as the second argument to `merge` to keep this branch and its view available.
 * If you do not dispose the branch through a merge, call {@link TreeBranchHandleAlpha.dispose | dispose} when you no longer need it.
 *
 * The branch and its views do not support `rewindTo`.
 * Do not implement this interface yourself.
 *
 * @sealed @alpha
 */
export interface TreeBranchHandleAlpha {
	/**
	 * True if a call to {@link TreeBranchHandleAlpha.dispose | dispose} or a merge disposed the branch.
	 */
	readonly disposed: boolean;

	/**
	 * Creates an independent branch from this branch.
	 *
	 * @remarks
	 * Each call creates a new branch.
	 * Changes to the new branch do not affect this branch until you merge them into it.
	 * If you dispose one branch, the other branch remains available.
	 *
	 * @returns A new, independent branch that you own.
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
	 * Edits through the view affect this branch.
	 * To merge the edits, call `merge` on the target view and pass this view as the first argument.
	 * By default, a successful merge disposes this branch and its view.
	 * It does not dispose the target branch or its view.
	 * Pass `false` as the second argument to `merge` to keep this branch and its view available.
	 * If you dispose the returned view, this branch remains available.
	 * If you dispose this branch, it also disposes its view.
	 * A view from `view.fork()` owns its new branch.
	 * If you dispose that view, it also disposes its branch.
	 * The returned view does not support `rewindTo`.
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
	 * If you dispose a view from {@link TreeBranchHandleAlpha.viewWith | viewWith}, this branch remains available.
	 * If you dispose the source branch or its view, this branch remains available.
	 */
	dispose(): void;
}
