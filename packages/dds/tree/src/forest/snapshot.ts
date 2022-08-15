/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, ChildLocation, Value } from "../tree";
import { ITreeCursor } from "./cursor";

/**
 * Copy on write and immutable views for forests.
 *
 * These types could be supported in addition to the ones in forest.ts,
 * merged with them, or deleted.
 */

/**
 * Ways to refer to a node in a forest.
 * TODO: other ways. Support for rebase to other forests.
 */
export type NodeId = ITreeCursor;

/**
 * An immutable forest.
 * Enforces single parenting, and allows querying the parent.
 *
 * It is an error to use any ITreeCursor with a IForestSnapshot
 * other than one produced by or for that specific IForestSnapshot.
 *
 * @public
 */
export interface IForestSnapshot {
    /**
     * @returns the node associated with `id`. Should not be used if there is no node with the provided id.
     */
    get(id: NodeId): ITreeCursor;

    /**
     * @returns the parent of `id`. Should not be used if there is no node with id or if id refers to the root node.
     */
    getParent(id: NodeId): ChildLocation;

    /**
     * @returns undefined iff root, otherwise the parent of `id`.
     */
    tryGetParent(id: NodeId): ChildLocation | undefined;

    /**
     * Compares two forests for equality.
     * @param forest - the other forest to compare to this one
     * @returns true iff the forests are equal.
     */
    equals(forest: IForestSnapshot): boolean;
}

/**
 * Copy on write editing extensions for IForestSnapshot.
 * Currently ITransaction in written in a way to not depend on this, making this API redundant.
 * At some point we might want to support both APIs.
 *
 * @public
 */
export interface ICowForestSnapshot extends IForestSnapshot {
    /**
     * Adds the supplied nodes to the forest. The nodes' IDs must be unique in the forest.
     * @param nodes - the sequence of nodes to add to the forest.
     * If any of them have children which exist in the forest already, those
     * children will be parented.
     * Any trait arrays present in a node must be non-empty. The nodes may be provided in any order.
     */
    add(nodes: Iterable<ITreeCursor>): IForestSnapshot;

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
        childIds: readonly NodeId[]
    ): IForestSnapshot;

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
    ): { forest: IForestSnapshot; detached: readonly NodeId[]; };

    /**
     * Replaces a node's value. The node must exist in this `Forest`.
     * @param nodeId - the id of the node
     * @param value - the new value
     */
    setValue(nodeId: NodeId, value: Value): IForestSnapshot;
    /**
     * Deletes every node in ids (each of which must be unparented)
     * @param ids - The IDs of the nodes to delete.
     * @param deleteChildren - If true, recursively deletes descendants. Otherwise, leaves children unparented.
     */
    delete(ids: Iterable<NodeId>, deleteChildren: boolean): IForestSnapshot;
}
