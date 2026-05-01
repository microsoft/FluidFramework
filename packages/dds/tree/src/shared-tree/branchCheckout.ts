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
import type { Breakable } from "../util/index.js";
import { disposeSymbol } from "../util/index.js";

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
 * Returns the live {@link BranchCheckout} bound to the given branch, or `undefined` if none exists
 * (the branch was never wrapped in a `BranchCheckout`, or its `BranchCheckout` has been disposed).
 *
 * @internal
 * @alpha
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
 * calling it always throws a {@link UsageError}.
 *
 * It is "viewless" in the sense that no {@link SchematizingSimpleTreeView} is attached at construction time —
 * a view can still be materialized on demand via the inherited `viewWith`.
 *
 * Lifecycle: a `BranchCheckout` is independent from any other checkout that observes the same data.
 * Disposing the parent of a {@link forkAsBranchCheckout} does not dispose the child, and vice versa;
 * merging is explicit via {@link TreeCheckout.merge}.
 *
 * @internal
 * @alpha
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
		// `isSharedBranch` is required by the base constructor signature (and by `forkWith`'s ctor type),
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
	 * Always throws — `BranchCheckout` is permanently bound to its branch.
	 *
	 * @remarks
	 * The parameter is preserved (and ignored) so this override is signature-compatible with
	 * {@link TreeCheckout.switchBranch}: substituting a `BranchCheckout` where a `TreeCheckout` is expected
	 * is type-safe, and the call still fails fast at runtime with a {@link UsageError}.
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
 * @internal
 * @alpha
 */
export function forkAsBranchCheckout(parent: TreeCheckout): BranchCheckout {
	return parent.forkWith(BranchCheckout);
}
