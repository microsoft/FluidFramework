/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	ImplicitFieldSchema,
	TreeViewAlpha,
	UntypedTreeViewAlpha,
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
export class BranchCheckout extends CheckoutBase {
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
