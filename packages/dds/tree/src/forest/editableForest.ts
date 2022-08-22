/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AnchorSet, FieldKey, DetachedField, Delta, JsonableTree, detachedFieldAsKey, Anchor } from "../tree";
import { IForestSubscription, ITreeSubscriptionCursor } from "./forest";

/**
 * Editing APIs.
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

export function initializeForest(forest: IEditableForest, content: JsonableTree[]): void {
    // TODO: maybe assert forest is empty?
    const insert: Delta.Insert = { type: Delta.MarkType.Insert, content };
    const rootField = detachedFieldAsKey(forest.rootField);
    forest.applyDelta(new Map([[rootField, [insert]]]));
}

// TODO: Types below here may be useful for input into edit building APIs, but are no longer used here directly.

/**
 * Ways to refer to a node in an IEditableForest.
 */
 export type ForestLocation = ITreeSubscriptionCursor | Anchor;

export interface TreeLocation {
    readonly range: FieldLocation | DetachedField;
    readonly index: number;
}

export function isFieldLocation(range: FieldLocation | DetachedField): range is FieldLocation {
    return typeof range === "object";
}

/**
 * Wrapper around DetachedField that can be detected at runtime.
 */
export interface FieldLocation {
	readonly key: FieldKey;
    readonly parent: ForestLocation;
}
