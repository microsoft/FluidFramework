/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionSpaceCompressedId, IIdCompressor } from "@fluidframework/id-compressor";
import { assert } from "@fluidframework/core-utils/internal";

import {
	type DeltaRoot,
	type IEditableForest,
	type ITreeCursorSynchronous,
	type RevisionTagCodec,
	combineVisitors,
	deltaForRootInitialization,
	makeDetachedFieldIndex,
	visitDelta,
} from "../core/index.js";

/**
 * Initializes the given forest with the given content.
 * @remarks The forest must be empty when this function is called.
 * This does not perform an edit in the typical sense.
 * Instead, it creates a delta expressing a creation and insertion of the `content` under the {@link rootFieldKey}, and then applies the delta to the forest.
 * If `visitAnchors` is enabled, then the delta will also be applied to the forest's {@link AnchorSet} (in which case there must be no existing anchors when this function is called).
 *
 * @remarks
 * This does not perform an edit: it updates the forest content as if there was an edit that did that.
 */
export function initializeForest(
	forest: IEditableForest,
	content: readonly ITreeCursorSynchronous[],
	revisionTagCodec: RevisionTagCodec,
	idCompressor: IIdCompressor,
	visitAnchors = false,
): void {
	assert(forest.isEmpty, 0x747 /* forest must be empty */);
	const delta: DeltaRoot = deltaForRootInitialization(content);
	let visitor = forest.acquireVisitor();
	if (visitAnchors) {
		assert(forest.anchors.isEmpty(), 0x9b7 /* anchor set must be empty */);
		const anchorVisitor = forest.anchors.acquireVisitor();
		visitor = combineVisitors([visitor, anchorVisitor]);
	}

	// any detached trees built here are immediately attached so the revision used here doesn't matter
	// we use a dummy revision to make correctness checks in the detached field index easier
	visitDelta(
		delta,
		visitor,
		makeDetachedFieldIndex("init", revisionTagCodec, idCompressor),
		0 as SessionSpaceCompressedId,
	);
	visitor.free();
}
