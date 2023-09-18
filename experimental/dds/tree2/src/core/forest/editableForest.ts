/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { FieldKey } from "../schema-stored";
import {
	AnchorSet,
	DetachedField,
	Delta,
	Anchor,
	ITreeCursorSynchronous,
	rootFieldKey,
	DeltaVisitor,
	applyDelta,
} from "../tree";
import { IForestSubscription, ITreeSubscriptionCursor } from "./forest";

/**
 * Editing APIs.
 * @public
 */
export interface IEditableForest extends IForestSubscription {
	/**
	 * Set of anchors this forest is tracking.
	 *
	 * To keep these anchors usable, this AnchorSet must be updated / rebased for any changes made to the forest.
	 * It is the responsibility of the called of the forest editing methods to do this, not the forest itself.
	 * The caller performs these updates because it has more semantic knowledge about the edits, which can be needed to
	 * update the anchors in a semantically optimal way.
	 */
	readonly anchors: AnchorSet;

	/**
	 * @returns a visitor that can be used to mutate the forest.
	 *
	 * Mutating the forest does NOT update anchors.
	 * The visitor must be released after use.
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
): void {
	assert(forest.isEmpty, 0x747 /* forest must be empty */);
	const insert: Delta.Insert = { type: Delta.MarkType.Insert, content };
	applyDelta(new Map([[rootFieldKey, [insert]]]), forest);
}

// TODO: Types below here may be useful for input into edit building APIs, but are no longer used here directly.

/**
 * Ways to refer to a node in an IEditableForest.
 * @public
 */
export type ForestLocation = ITreeSubscriptionCursor | Anchor;

/**
 * @public
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
 * @public
 */
export interface FieldLocation {
	readonly key: FieldKey;
	readonly parent: ForestLocation;
}
