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
 * An independent branch of a tree, which is owned by the caller.
 *
 * @remarks
 * Create one with {@link forkBranch}, and use {@link TreeBranchHandleAlpha.viewWith | viewWith} to read and edit its content.
 * The branch owns its state and history; a view provides schema-aware access to that state.
 * Edits stay on the branch until they are merged into another view with `merge`.
 * Merging this branch into another view disposes this branch and its view by default, not the target branch or its view.
 * Pass `false` as the second argument to `merge` to keep this branch and its view alive.
 * Otherwise, the owner must call {@link TreeBranchHandleAlpha.dispose | dispose} when the branch is no longer needed.
 *
 * Unlike a view, a branch does not support `rewindTo` or `fork`.
 * External implementations of this interface are not supported.
 *
 * @sealed @alpha
 */
export interface TreeBranchHandleAlpha {
	/**
	 * True if the branch was disposed, either by calling {@link TreeBranchHandleAlpha.dispose | dispose} or by a merge.
	 */
	readonly disposed: boolean;

	/**
	 * Creates a view of this branch using the provided schema configuration.
	 *
	 * @remarks
	 * Schema compatibility is handled as described by {@link ViewableTree.viewWith}.
	 * If the view schema is incompatible with the branch's stored schema, the returned view reports the incompatibility through {@link TreeView.compatibility | compatibility}.
	 * Accessing its {@link TreeView.root | root} throws until the schemas are compatible.
	 *
	 * Edits made through the view are made on this branch.
	 * To merge them into another view, call `merge` on that view and pass this view.
	 * By default, the merge disposes this branch and its view, not the target branch or its view.
	 * Pass `false` as the second argument to `merge` to keep this branch and its view alive.
	 * Disposing the returned view does not dispose this branch, but disposing this branch also disposes its view.
	 * In contrast, a view returned by `fork` owns its new branch and disposes that branch when the view is disposed.
	 * `rewindTo` is not supported on the returned view.
	 *
	 * @typeParam TSchema - The schema type of the tree view.
	 * @param config - The schema configuration to use for the view.
	 * @returns A view of this branch with the provided schema configuration.
	 *
	 * @throws A `UsageError` if this branch already has a view that is not disposed, or if this branch is disposed.
	 */
	viewWith<TSchema extends ImplicitFieldSchema>(
		config: TreeViewConfiguration<TSchema>,
	): TreeViewAlpha<TSchema>;

	/**
	 * Disposes the branch and any view created for it.
	 * @remarks
	 * Disposing a view created by {@link TreeBranchHandleAlpha.viewWith | viewWith} does not dispose the branch.
	 * Disposing the view or branch that {@link forkBranch} copied from does not dispose this branch.
	 */
	dispose(): void;
}

/**
 * Creates an independent {@link TreeBranchHandleAlpha | branch} by forking the given view.
 *
 * @remarks
 * Each call creates a new branch, including when the view was created by {@link TreeBranchHandleAlpha.viewWith}.
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
