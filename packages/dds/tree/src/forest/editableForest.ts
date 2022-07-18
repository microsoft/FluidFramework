/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StoredSchemaRepository } from "../schema";
import { AnchorSet, FieldKey, DetachedRange, Value } from "../tree";
import { ITreeCursor } from "./cursor";
import { IForestSubscription, NodeId } from "./forest";

/**
 * Editing APIs.
 *
 * These are sufficient to perform all possible edits,
 * but not particularly efficient (for large slice moves), or semantic.
 * They are also not particularly type safe (ex: you can pass a parented nodes into attach, which is invalid).
 *
 * TODO: improve these APIs, addressing the above.
 */
export interface IEditableForest extends IForestSubscription {

    // Overrides field from IForestSubscription adding editing support.
    readonly schema: StoredSchemaRepository;

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
     * Adds the supplied subtrees to the forest.
     * @param nodes - the sequence of nodes to add to the forest.
     *
     * TODO: there should be a way to include existing detached ranges in the inserted trees.
     */
    add(nodes: Iterable<ITreeCursor>): DetachedRange;

    /**
     * Parents a set of nodes already in the forest at a specified location.
     */
    attachRangeOfChildren(
        destination: TreeLocation,
        toAttach: DetachedRange,
    ): void;

    /**
     * Detaches a range of nodes from their parent. The detached nodes remain in the `Forest`.
     * @param startIndex - the index of the first node in the range to detach
     * @param endIndex - the index after the last node in the range to detach
     * @returns a new `Forest` with the nodes detached, and a list of the ids of the nodes that were detached
     */
    detachRangeOfChildren(
        range: FieldLocation | DetachedRange,
        startIndex: number,
        endIndex: number
    ): DetachedRange;

    /**
     * Replaces a node's value. The node must exist in this `Forest`.
     * @param nodeId - the id of the node
     * @param value - the new value
     */
    setValue(nodeId: NodeId, value: Value): void;

    /**
     * Recursively deletes a range and its children.
     */
    delete(ids: DetachedRange): void;
}

export interface TreeLocation {
    readonly range: FieldLocation | DetachedRange;
    readonly index: number;
}

export function isFieldLocation(range: FieldLocation | DetachedRange): range is FieldLocation {
    return typeof range === "object";
}

/**
 * Wrapper around DetachedRange that can be detected at runtime.
 */
export interface FieldLocation {
	readonly key: FieldKey;
    readonly parent: NodeId;
}
