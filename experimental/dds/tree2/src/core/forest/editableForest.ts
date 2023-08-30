/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { FieldKey } from "../schema-stored";
import {
	AnchorSet,
	DetachedField,
	Delta,
	Anchor,
	ITreeCursorSynchronous,
	rootFieldKey,
} from "../tree";
import { IForestSubscription, ITreeSubscriptionCursor } from "./forest";

/**
 * Editing APIs.
 * @alpha
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
	 * Applies the supplied Delta to the forest.
	 * Does NOT update anchors.
	 */
	applyDelta(delta: Delta.Root): void;
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
	forest.applyDelta(new Map([[rootFieldKey, [insert]]]));
}

// TODO: Types below here may be useful for input into edit building APIs, but are no longer used here directly.

/**
 * Ways to refer to a node in an IEditableForest.
 * @alpha
 */
export type ForestLocation = ITreeSubscriptionCursor | Anchor;

/**
 * @alpha
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
 * @alpha
 */
export interface FieldLocation {
	readonly key: FieldKey;
	readonly parent: ForestLocation;
}
