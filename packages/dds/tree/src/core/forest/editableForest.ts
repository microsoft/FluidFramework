/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { RevisionTagCodec } from "../rebase/index.js";
import type { FieldKey } from "../schema-stored/index.js";
import {
	type Anchor,
	type DeltaRoot,
	type DeltaVisitor,
	type DetachedField,
	type ITreeCursorSynchronous,
	applyDelta,
	deltaForRootInitialization,
	makeDetachedFieldIndex,
} from "../tree/index.js";

import type { IForestSubscription, ITreeSubscriptionCursor } from "./forest.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";

/**
 * Editing APIs.
 * @internal
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
 * Sets the contents of the forest via delta.
 * Requires the fores starts empty.
 *
 * @remarks
 * This does not perform an edit: it updates the forest content as if there was an edit that did that.
 */
export function initializeForest(
	forest: IEditableForest,
	content: readonly ITreeCursorSynchronous[],
	revisionTagCodec: RevisionTagCodec,
	idCompressor: IIdCompressor,
): void {
	assert(forest.isEmpty, 0x747 /* forest must be empty */);
	const delta: DeltaRoot = deltaForRootInitialization(content);
	applyDelta(delta, forest, makeDetachedFieldIndex("init", revisionTagCodec, idCompressor));
}

// TODO: Types below here may be useful for input into edit building APIs, but are no longer used here directly.

/**
 * Ways to refer to a node in an IEditableForest.
 * @internal
 */
export type ForestLocation = ITreeSubscriptionCursor | Anchor;

/**
 * @internal
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
 * @internal
 */
export interface FieldLocation {
	readonly key: FieldKey;
	readonly parent: ForestLocation;
}
