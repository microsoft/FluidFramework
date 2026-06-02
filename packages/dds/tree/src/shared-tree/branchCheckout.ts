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
 * Values are also weak ({@link WeakRef}) so that an independently-retained branch does not pin its
 * {@link BranchCheckout} — required for the {@link FinalizationRegistry}-driven auto-disposal of
 * `BranchCheckout`s to be observable.
 *
 * The {@link BranchCheckout} constructor populates this on creation; {@link BranchCheckout.dispose}
 * removes it so {@link getBranchCheckout} never returns a disposed instance.
 */
const branchCheckoutMap = new WeakMap<
	SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
	WeakRef<BranchCheckout>
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
 *
 * Values are {@link WeakRef} so a lazily-forked `BranchCheckout` whose only retainer is this cache
 * can be garbage-collected when no caller holds it. This is the linchpin of the sharing semantics:
 * shared callers of `getBranch` get the same instance, and the instance only becomes finalizable
 * once *every* caller drops it.
 */
const lazyBranchForViewMap = new WeakMap<
	SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
	WeakRef<BranchCheckout>
>();

/**
 * Per-{@link BranchCheckout} state passed to the {@link FinalizationRegistry} callback.
 *
 * @remarks
 * **Heap-snapshot tip:** this is a named class so leaks of finalization state show up clearly.
 *
 * **Critical invariant:** instances must not transitively reference the `BranchCheckout` they were
 * registered for. If they did, the registry's strong hold on this object would pin the checkout
 * and the finalizer would never fire — the same trap solved by `SubscriptionsWrapper` in
 * `packages/framework/react/src/useObservation.ts`.
 *
 * The state intentionally holds **no** references to the checkout's resources (transaction, forest,
 * events, views, revertibles, ...). All those resources are part of a self-cycle with the
 * `BranchCheckout` itself; once nothing external retains the checkout, the JavaScript garbage collector collects the whole
 * cycle in one pass. The finalizer is therefore observational — it signals "the checkout was
 * collected" without performing any active cleanup.
 */
class BranchCheckoutFinalizationState {
	/**
	 * Optional callback invoked once when the registered `BranchCheckout` becomes unreachable
	 * without having been explicitly disposed. Cleared after firing.
	 *
	 * @remarks
	 * The callback must not close over the `BranchCheckout` or anything that reaches it — doing so
	 * would prevent the finalizer from ever firing. Intended for testing and (future) telemetry.
	 */
	public onFinalized: (() => void) | undefined;
}

/**
 * Side-table mapping each `BranchCheckout` to its finalization state, so external code (tests,
 * future telemetry hooks) can install an {@link BranchCheckoutFinalizationState.onFinalized}
 * callback without exposing private fields. Weakly keyed so this table does not retain checkouts.
 */
const branchCheckoutFinalizationStates = new WeakMap<
	BranchCheckout,
	BranchCheckoutFinalizationState
>();

/**
 * Registry that fires its callback when a `BranchCheckout` becomes unreachable.
 *
 * @remarks
 * The held value is a {@link BranchCheckoutFinalizationState} which by design holds no path back
 * to the checkout. The unregister token is the checkout itself; explicit dispose calls
 * `branchCheckoutFinalizationRegistry.unregister(this)` to avoid a spurious callback firing later.
 *
 * Modeled on `finalizationRegistry` in `packages/framework/react/src/useObservation.ts`.
 */
const branchCheckoutFinalizationRegistry =
	new FinalizationRegistry<BranchCheckoutFinalizationState>((state) => {
		const callback = state.onFinalized;
		state.onFinalized = undefined;
		callback?.();
	});

/**
 * Install a callback to be invoked once when the given `BranchCheckout` is garbage-collected
 * *without* having been explicitly disposed.
 *
 * @remarks
 * Primarily a test seam: the test must verify finalization happened without holding a strong
 * reference to the `BranchCheckout`. The supplied callback must not close over the
 * `BranchCheckout` or anything that reaches it — doing so would prevent finalization.
 *
 * Returns `false` if no finalization state is registered for the given checkout (e.g. already
 * disposed and unregistered), `true` otherwise.
 *
 * @internal
 */
export function setBranchCheckoutFinalizationCallback(
	checkout: BranchCheckout,
	callback: (() => void) | undefined,
): boolean {
	const state = branchCheckoutFinalizationStates.get(checkout);
	if (state === undefined) {
		return false;
	}
	state.onFinalized = callback;
	return true;
}

/**
 * Returns the live {@link BranchCheckout} bound to the given branch, or `undefined` if none exists
 * (the branch was never wrapped in a `BranchCheckout`, the `BranchCheckout` has been disposed, or
 * the `BranchCheckout` has been garbage-collected after losing all external references).
 */
export function getBranchCheckout(
	branch: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
): BranchCheckout | undefined {
	return branchCheckoutMap.get(branch)?.deref();
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
		// A BranchCheckout is local-only (asserted above) and its lifetime is bounded by the
		// holder, not by the SharedTree. Detach from the long-lived branchTrimmer so the branch
		// (and transitively this checkout) is not strongly retained by the EditManager's event
		// emitter — without this, garbage collection of an unreachable BranchCheckout is impossible
		// while the SharedTree lives. The trade-off is that this branch no longer receives
		// `ancestryTrimmed` events to incrementally release repair data; that data is released when
		// the BranchCheckout is disposed or garbage-collected.
		branch.detachTrimmer();
		branchCheckoutMap.set(branch, new WeakRef(this));

		// Register for finalization-based observability. The held value is a fresh state object
		// with no path back to `this` (see BranchCheckoutFinalizationState's doc); the unregister
		// token is `this` so explicit dispose can deterministically cancel the callback.
		const finalizationState = new BranchCheckoutFinalizationState();
		branchCheckoutFinalizationStates.set(this, finalizationState);
		branchCheckoutFinalizationRegistry.register(this, finalizationState, this);
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
		// `super[disposeSymbol]()` throws via `checkNotDisposed` on a repeat dispose, so this code
		// only runs on the first successful disposal. Removing the entry here keeps
		// `getBranchCheckout` from ever returning a disposed instance.
		branchCheckoutMap.delete(this.mainBranch);

		// Cancel the finalization callback: explicit dispose already covered cleanup, and we don't
		// want a spurious "finalized" signal firing later. unregister is safe regardless of whether
		// the state callback was ever installed.
		const finalizationState = branchCheckoutFinalizationStates.get(this);
		if (finalizationState !== undefined) {
			finalizationState.onFinalized = undefined;
		}
		branchCheckoutFinalizationRegistry.unregister(this);
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
	const cached = lazyBranchForViewMap.get(viewBranch)?.deref();
	if (cached !== undefined && !cached.disposed) {
		return cached;
	}
	// Path 3: lazy-fork and record under the view's mainBranch so future calls are idempotent.
	branch = forkAsBranchCheckout(view.checkout);
	lazyBranchForViewMap.set(viewBranch, new WeakRef(branch));
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
