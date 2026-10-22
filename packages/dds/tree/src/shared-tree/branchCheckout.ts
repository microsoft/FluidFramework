/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	ImplicitFieldSchema,
	TreeViewAlpha,
	TreeViewConfiguration,
	UntypedTreeViewAlpha,
} from "../simple-tree/index.js";

import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
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
		assert(!options.isSharedBranch, "BranchCheckout cannot represent a shared branch");
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
 * An independent branch of a tree that is owned by the caller.
 *
 * @remarks
 * Create one with {@link forkBranch}, and use {@link getViewOfBranch} to read and edit its content.
 * Edits stay on the branch until they are merged into another view with `merge`.
 * A successful merge disposes the branch by default.
 * Otherwise, the owner must call {@link TreeBranchHandleAlpha.dispose | dispose} when the branch is no longer needed.
 *
 * Unlike a view, a branch does not support `rewindTo` or `fork`.
 * This interface is structurally typed, but {@link getViewOfBranch} only accepts branches returned by {@link forkBranch}.
 *
 * @sealed @alpha
 */
export interface TreeBranchHandleAlpha {
	/**
	 * True if the branch was disposed, either by calling {@link TreeBranchHandleAlpha.dispose | dispose} or by a merge.
	 */
	readonly disposed: boolean;

	/**
	 * Disposes the branch and any view created for it.
	 * @remarks
	 * Disposing a view created by {@link getViewOfBranch} does not dispose the branch.
	 * Disposing the view or branch that {@link forkBranch} copied from does not dispose this branch.
	 */
	dispose(): void;
}

/**
 * Creates an independent {@link TreeBranchHandleAlpha | branch} by forking the given view.
 *
 * @remarks
 * Each call creates a new branch, including when the view was created by {@link getViewOfBranch}.
 * Changes to the branch do not affect the source view unless they are merged into it.
 *
 * @param view - A view returned by the Fluid Framework.
 * External implementations are not supported.
 * @returns A new, independently owned branch.
 *
 * @throws A `UsageError` if `view` was not produced by the Fluid Framework.
 * @throws A `UsageError` if the view has a pending transaction or has already been disposed.
 *
 * @alpha
 */
export function forkBranch(view: UntypedTreeViewAlpha): TreeBranchHandleAlpha {
	if (!(view instanceof SchematizingSimpleTreeView)) {
		throw new UsageError(
			"The `view` argument to `forkBranch` must be a view returned by the Fluid Framework — external implementations are not supported.",
		);
	}
	if (view.disposed) {
		throw new UsageError("A disposed view cannot be forked.");
	}
	return forkAsBranchCheckout(view.checkout);
}

/**
 * Creates a view of a {@link TreeBranchHandleAlpha | branch} using the provided schema configuration.
 *
 * @remarks
 * Schema compatibility is handled as described by {@link ViewableTree.viewWith}.
 * If the view schema is incompatible with the branch's stored schema, the returned view reports the incompatibility through {@link TreeView.compatibility | compatibility}.
 * Accessing its {@link TreeView.root | root} throws until the schemas are compatible.
 *
 * Edits made through the view are made on the branch.
 * To merge them into another view, call `merge` on that view and pass this view.
 * `rewindTo` is not supported on the returned view.
 *
 * @typeParam TSchema - The schema type of the tree view.
 * @param branch - A branch returned by {@link forkBranch}.
 * @param config - The schema configuration to use for the view.
 * @returns A view of the branch with the provided schema configuration.
 *
 * @throws A `UsageError` if `branch` was not returned by {@link forkBranch}.
 * @throws A `UsageError` if the branch already has a view that is not disposed, or if the branch is disposed.
 *
 * @alpha
 */
export function getViewOfBranch<TSchema extends ImplicitFieldSchema>(
	branch: TreeBranchHandleAlpha,
	config: TreeViewConfiguration<TSchema>,
): TreeViewAlpha<TSchema> {
	if (!(branch instanceof BranchCheckout)) {
		throw new UsageError(
			"The `branch` argument to `getViewOfBranch` must be a branch returned by `forkBranch`.",
		);
	}
	return branch.viewWith(config);
}
