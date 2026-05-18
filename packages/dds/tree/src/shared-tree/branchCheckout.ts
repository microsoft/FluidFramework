/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	UsageError,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import type {
	ChangeFamily,
	DetachedFieldIndex,
	IEditableForest,
	RevisionTag,
	RevisionTagCodec,
	TreeStoredSchemaRepository,
} from "../core/index.js";
import type { SharedTreeBranch } from "../shared-tree-core/index.js";
import type {
	ImplicitFieldSchema,
	TreeBranchAlpha,
	TreeViewAlpha,
	TreeViewConfiguration,
} from "../simple-tree/index.js";
import type { Breakable } from "../util/index.js";
import { disposeSymbol } from "../util/index.js";

import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";
import { TreeCheckout } from "./treeCheckout.js";

/**
 * Maps each {@link SharedTreeBranch} to its canonical {@link BranchCheckout}, if any.
 *
 * @remarks
 * Keyed weakly by branch so the entry is collected once the branch is unreachable.
 * The {@link BranchCheckout} constructor populates this on creation; {@link BranchCheckout.dispose}
 * removes it so {@link getBranchCheckout} never returns a disposed instance.
 */
const branchCheckoutMap = new WeakMap<
	SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
	BranchCheckout
>();

/**
 * Maps a *source* {@link SharedTreeBranch} (i.e. the `mainBranch` of a view's checkout) to the
 * lazily-created {@link BranchCheckout} that {@link getBranch} forked from it.
 *
 * @remarks
 * Distinct from {@link branchCheckoutMap}: that map answers "which `BranchCheckout` wraps *this*
 * branch?" — keyed by the wrapped branch. This one answers "which `BranchCheckout` did `getBranch`
 * previously hand out for *this view's* branch?" — keyed by the parent branch. Keeping them
 * separate preserves the semantics of {@link getBranchCheckout} while giving `getBranch` a stable
 * idempotent answer per view.
 */
const lazyBranchForViewMap = new WeakMap<
	SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
	BranchCheckout
>();

/**
 * Returns the live {@link BranchCheckout} bound to the given branch, or `undefined` if none exists
 * (the branch was never wrapped in a `BranchCheckout`, or its `BranchCheckout` has been disposed).
 */
export function getBranchCheckout(
	branch: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
): BranchCheckout | undefined {
	return branchCheckoutMap.get(branch);
}

/**
 * A viewless checkout that is permanently bound to the {@link SharedTreeBranch} it was created over.
 *
 * @remarks
 * Unlike {@link TreeCheckout}, a `BranchCheckout` cannot be retargeted to a different branch via `switchBranch` —
 * calling it always throws a `UsageError`.
 *
 * It is "viewless" in the sense that no {@link SchematizingSimpleTreeView} is attached at construction time —
 * a view can still be materialized on demand via the inherited `viewWith`.
 *
 * Lifecycle: a `BranchCheckout` is independent from any other checkout that observes the same data.
 * Disposing the parent of a {@link forkAsBranchCheckout} does not dispose the child, and vice versa;
 * merging is explicit via {@link TreeCheckout.merge}.
 *
 */
export class BranchCheckout extends TreeCheckout {
	public constructor(
		branch: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
		isSharedBranch: boolean,
		changeFamily: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>,
		storedSchema: TreeStoredSchemaRepository,
		forest: IEditableForest,
		mintRevisionTag: () => RevisionTag,
		revisionTagCodec: RevisionTagCodec,
		idCompressor: IIdCompressor,
		removedRoots?: DetachedFieldIndex,
		logger?: ITelemetryLoggerExt,
		breaker?: Breakable,
		disposeForksAfterTransaction?: boolean,
	) {
		// `isSharedBranch` is required by the base constructor signature (and by `forkWith`'s checkoutConstructor type),
		// so we accept it positionally and reject the only invalid value here.
		assert(!isSharedBranch, "BranchCheckout cannot represent a shared branch");
		super(
			branch,
			isSharedBranch,
			changeFamily,
			storedSchema,
			forest,
			mintRevisionTag,
			revisionTagCodec,
			idCompressor,
			removedRoots,
			logger,
			breaker,
			disposeForksAfterTransaction,
		);
		branchCheckoutMap.set(branch, this);
	}

	public override fork(): BranchCheckout {
		return this.forkWith(BranchCheckout);
	}

	/**
	 * A `BranchCheckout` is permanently bound to its branch and may have multiple views created
	 * over its lifetime via `viewWith` (e.g. through {@link getViewOfBranch}). Disposing one of
	 * those views must not invalidate the branch for other callers, so we opt out of the
	 * 1:1 view/checkout auto-dispose contract that `TreeCheckout` defaults to for non-shared branches.
	 */
	public override get disposeWithView(): boolean {
		return false;
	}

	// A `BranchCheckout` is viewless by construction, so the `TreeViewAlpha` type predicate is always false.
	public override hasRootSchema<TSchema extends ImplicitFieldSchema>(
		_schema: TSchema,
	): this is TreeViewAlpha<TSchema> {
		return false;
	}

	/**
	 * Always throws — `BranchCheckout` is permanently bound to its branch.
	 *
	 * @remarks
	 * The parameter is preserved (and ignored) so this override is signature-compatible with
	 * {@link TreeCheckout.switchBranch}: substituting a `BranchCheckout` where a `TreeCheckout` is expected
	 * is type-safe, and the call still fails fast at runtime with a `UsageError`.
	 */
	public override switchBranch(
		_branch: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
	): never {
		throw new UsageError("switchBranch is not supported on BranchCheckout");
	}

	public override [disposeSymbol](): void {
		// Override the symbol-based entry point (not `dispose()`) because internal cleanup paths
		// — notably the merge auto-dispose at `treeCheckout.ts` — call `checkout[disposeSymbol]()`
		// directly. Hooking the symbol catches every disposal route.
		super[disposeSymbol]();
		// Only reached if super did not throw (e.g. double-dispose).
		// Removing the entry here keeps `getBranchCheckout` from ever returning a disposed instance.
		branchCheckoutMap.delete(this.mainBranch);
	}
}

/**
 * Forks {@link parent} and wraps the new branch in a viewless {@link BranchCheckout}.
 *
 * @remarks
 * Used to answer "give me the branch of this checkout, as its own checkout."
 * The returned `BranchCheckout` is independent: edits do not affect {@link parent}, merging back must be explicit,
 * and disposing either side does not dispose the other.
 *
 * Package-internal helper backing the public {@link getBranch} entry point. Not part of the
 * public alpha surface — consumers should call {@link getBranch} instead.
 */
export function forkAsBranchCheckout(parent: TreeCheckout): BranchCheckout {
	return parent.forkWith(BranchCheckout);
}

/**
 * Returns the branch currently bound to the given view.
 *
 * @remarks
 * Repeated calls with the same view typically return the same {@link TreeBranchAlpha} instance,
 * but this is not guaranteed: for example, while the view is participating in a transaction
 * its underlying branch may differ from the one observed outside the transaction, and a future
 * change that retargets a view to another branch would likewise cause a different instance to be
 * returned.
 *
 * @typeParam TSchema - The schema type of the tree view. Required only to satisfy the invariance
 * of {@link TreeViewAlpha}; the schema is not otherwise used and the return type does not depend on it.
 * @param view - A {@link TreeViewAlpha} returned by the Fluid Framework. External implementations
 * are not supported and will cause a `UsageError` to be thrown.
 *
 * @privateRemarks
 * When this API is stabilized it should likely surface as a property of `TreeView` rather than a
 * free function. Keeping it as a free function for now keeps coupling low while the underlying
 * branch/view model is still evolving.
 *
 * Implementation detail: the "branch" returned here is a lazily-created {@link BranchCheckout}
 * forked from the view's checkout. Two lookup paths are tried before forking, in order:
 *
 * 1. If a `BranchCheckout` is already registered for the view's `mainBranch` (e.g. the view was
 * itself built via {@link getViewOfBranch}), that instance is returned.
 * 2. Otherwise, if a previous `getBranch` call already lazy-forked a `BranchCheckout` for this
 * view's `mainBranch` and that instance is still live, it is returned.
 * 3. Otherwise, a fresh `BranchCheckout` is forked via {@link forkAsBranchCheckout} and recorded
 * against the view's `mainBranch` for future calls.
 *
 * Open design question: when should the lazily-forked branch be disposed? A live `BranchCheckout`
 * has ongoing cost (it keeps a forest up to date), so the lifetime semantics need to be revisited
 * before this graduates from `@alpha`.
 *
 * @alpha
 */
export function getBranch(view: TreeBranchAlpha): TreeBranchAlpha {
	if (!(view instanceof SchematizingSimpleTreeView)) {
		throw new UsageError(
			"The `view` argument to `getBranch` must be a view returned by the Fluid Framework — external implementations are not supported.",
		);
	}
	const viewBranch = view.checkout.mainBranch;
	// Path 1: the view is itself built directly on a registered BranchCheckout.
	let branch = getBranchCheckout(viewBranch);
	if (branch !== undefined) {
		return branch;
	}
	// Path 2: a previous `getBranch` call already lazy-forked one; reuse it if still live.
	const cached = lazyBranchForViewMap.get(viewBranch);
	if (cached !== undefined && !cached.disposed) {
		return cached;
	}
	// Path 3: lazy-fork and record under the view's mainBranch so future calls are idempotent.
	branch = forkAsBranchCheckout(view.checkout);
	lazyBranchForViewMap.set(viewBranch, branch);
	return branch;
}

/**
 * Returns a view of the given branch using the provided schema configuration.
 *
 * @typeParam TSchema - The schema type of the tree view.
 * @param branch - A branch returned by {@link getBranch}. Passing any other object will throw a `UsageError` at runtime.
 * @param config - The schema configuration to use for the view.
 *
 * @alpha
 */
export function getViewOfBranch<TSchema extends ImplicitFieldSchema>(
	branch: TreeBranchAlpha,
	config: TreeViewConfiguration<TSchema>,
): TreeViewAlpha<TSchema> {
	if (!(branch instanceof BranchCheckout)) {
		throw new UsageError(
			"The `branch` argument to `getViewOfBranch` must be a `TreeBranchAlpha` returned by `getBranch`.",
		);
	}
	return branch.viewWith(config);
}
