/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionSpaceCompressedId, IIdCompressor } from "@fluidframework/id-compressor";
import { assert } from "@fluidframework/core-utils/internal";

import type { RevisionTagCodec } from "../rebase/index.js";
import type { FieldKey } from "../schema-stored/index.js";
import {
	type Anchor,
	type DeltaRoot,
	type DeltaVisitor,
	type DetachedField,
	type ITreeCursorSynchronous,
	combineVisitors,
	deltaForRootInitialization,
	makeDetachedFieldIndex,
	visitDelta,
} from "../tree/index.js";

import type { IForestSubscription, ITreeSubscriptionCursor } from "./forest.js";
import { chunkTree, defaultChunkPolicy } from "../../feature-libraries/index.js";

/**
 * Editing APIs.
 */
export interface IEditableForest extends IForestSubscription {
	/**
	 * Provides a visitor that can be used to mutate the forest.
	 *
	 * @returns a visitor that can be used to mutate the forest.
	 *
	 * @remarks
	 * Mutating the forest does NOT update anchors.
	 * The visitor must be released after use by calling {@link DeltaVisitor.free} on it.
	 * It is invalid to acquire a visitor without releasing the previous one.
	 */
	acquireVisitor(): DeltaVisitor;
}

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
	content: ITreeCursorSynchronous,
	revisionTagCodec: RevisionTagCodec,
	idCompressor: IIdCompressor,
	visitAnchors = false,
): void {
	assert(forest.isEmpty, 0x747 /* forest must be empty */);
	const chunk = chunkTree(content, { idCompressor, policy: defaultChunkPolicy });
	const delta: DeltaRoot = deltaForRootInitialization(chunk);
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

// TODO: Types below here may be useful for input into edit building APIs, but are no longer used here directly.

/**
 * Ways to refer to a node in an IEditableForest.
 */
export type ForestLocation = ITreeSubscriptionCursor | Anchor;

/**
 */
export interface TreeLocation {
	readonly range: FieldLocation | DetachedField;
	readonly index: number;
}

export function isFieldLocation(range: FieldLocation | DetachedField): range is FieldLocation {
	return typeof range === "object";
}

/**
 * Location of a field within a tree that is not a detached/root field.
 */
export interface FieldLocation {
	readonly key: FieldKey;
	readonly parent: ForestLocation;
}
