/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { ImplicitFieldSchema, TreeViewAlpha } from "../simple-tree/index.js";

import { CheckoutBase, type TreeCheckoutOptions } from "./treeCheckout.js";

/**
 * A viewless checkout that is permanently bound to its underlying branch.
 *
 * @remarks
 * Unlike `TreeCheckout`, a `BranchCheckout` does not expose branch switching or rewind operations.
 *
 * It is "viewless" in the sense that no {@link TreeViewAlpha} is attached at construction time -
 * a view can still be materialized on demand via the inherited `viewWith`.
 *
 * Lifecycle: a `BranchCheckout` is independent from any other checkout that observes the same data.
 * Disposing the parent of a {@link forkAsBranchCheckout} does not dispose the child, and vice versa;
 * merging is explicit via {@link CheckoutBase.merge}.
 * The owner must dispose this checkout when it is no longer needed.
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
	 * A `BranchCheckout` is permanently bound to its branch and may have multiple views created
	 * over its lifetime via `viewWith`. Disposing one of those views must not invalidate the branch
	 * for other callers, so we opt out of the 1:1 view/checkout auto-dispose contract that
	 * {@link CheckoutBase} defaults to for non-shared branches.
	 */
	public override get disposesWithView(): boolean {
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
