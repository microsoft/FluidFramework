/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, DetachedRange } from "../tree";
import { Value, ITreeCursor } from "./cursor";
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
    /**
     * Adds the supplied nodes to the forest.
     * @param nodes - the sequence of nodes to add to the forest.
     * If any of them have children which exist in the forest already, those children will be parented.
     * Any trait arrays present in a node must be non-empty.
     * The nodes may be provided in any order.
     */
    add(nodes: Iterable<ITreeCursor>): DetachedRange;

    /**
     * Parents a set of nodes already in the forest at a specified location within a trait.
     * @param parentId - the id of the parent under which to insert the new nodes
     * @param label - the label of the trait under which to insert the new nodes
     * @param index - the index in the trait after which to insert the new nodes
     * @param childIds - the ids of the nodes to insert
     */
    attachRangeOfChildren(
        parentId: NodeId,
        label: FieldKey,
        index: number,
        childIds: DetachedRange,
    ): void;

    /**
     * Detaches a range of nodes from their parent. The detached nodes remain in the `Forest`.
     * @param parentId - the id of the parent from which to detach the nodes
     * @param label - the label of the trait from which to detach the nodes
     * @param startIndex - the index of the first node in the range to detach
     * @param endIndex - the index after the last node in the range to detach
     * @returns a new `Forest` with the nodes detached, and a list of the ids of the nodes that were detached
     */
    detachRangeOfChildren(
        parentId: NodeId,
        label: FieldKey,
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
     * Deletes every node in ids (each of which must be unparented)
     * @param ids - The IDs of the nodes to delete.
     * @param deleteChildren - If true, recursively deletes descendants. Otherwise, leaves children unparented.
     */
    delete(ids: DetachedRange): void;
}
