/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { SharedTreeBranch } from "../shared-tree-core/index.js";
import type { ImplicitFieldSchema, TreeViewAlpha } from "../simple-tree/index.js";
import { throwIfBroken } from "../util/index.js";

import type { SharedTreeChangeProcessingContext } from "./sharedTreeChangeFamily.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";
import { TreeCheckout, type TreeCheckoutOptions } from "./treeCheckout.js";

/**
 * A viewless checkout that is permanently bound to the {@link SharedTreeBranch} it was created over.
 *
 * @remarks
 * Unlike {@link TreeCheckout}, a `BranchCheckout` cannot be retargeted to a different branch via `switchBranch` -
 * calling it always throws a `UsageError`.
 *
 * It is "viewless" in the sense that no {@link TreeViewAlpha} is attached at construction time -
 * a view can still be materialized on demand via the inherited `viewWith`.
 *
 * Lifecycle: a `BranchCheckout` is independent from any other checkout that observes the same data.
 * Disposing the parent of a {@link forkAsBranchCheckout} does not dispose the child, and vice versa;
 * merging is explicit via {@link TreeCheckout.merge}.
 * The owner must dispose this checkout when it is no longer needed.
 * SharedTree-backed checkouts retain ancestry trimming notifications to keep history counts and repair data up to date.
 */
export class BranchCheckout extends TreeCheckout {
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
	 * `TreeCheckout` defaults to for non-shared branches.
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

	/**
	 * Always throws because this checkout cannot switch to a different underlying branch.
	 */
	@throwIfBroken
	public override rewindTo(_revision: string): never {
		throw new UsageError("rewindTo is not supported on BranchCheckout. Use revertTo instead.");
	}

	/**
	 * Always throws because `BranchCheckout` is permanently bound to its branch.
	 *
	 * @remarks
	 * The parameter is preserved (and ignored) so this override is signature-compatible with
	 * {@link TreeCheckout.switchBranch}: substituting a `BranchCheckout` where a `TreeCheckout` is expected
	 * is type-safe, and the call still fails fast at runtime with a `UsageError`.
	 */
	public override switchBranch(
		_branch: SharedTreeBranch<
			SharedTreeEditBuilder,
			SharedTreeChange,
			SharedTreeChangeProcessingContext
		>,
	): never {
		throw new UsageError("switchBranch is not supported on BranchCheckout");
	}
}

/**
 * Forks {@link parent} and wraps the new branch in a viewless {@link BranchCheckout}.
 *
 * @remarks
 * The returned `BranchCheckout` is independent: edits do not affect {@link parent}, merging back must be explicit,
 * and disposing either side does not dispose the other.
 */
export function forkAsBranchCheckout(parent: TreeCheckout): BranchCheckout {
	return parent.forkWith((options) => new BranchCheckout(options));
}
