/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dependee, ObservingDependent } from "../dependency-tracking";
import { FieldKey } from "../tree";
import { Value, ITreeCursor } from "./cursor";

/**
 * APIs for forest designed so the implementation can be copy on write,
 * or mutate in palace, and we can ensure no references are dangling into the forest to allow this.
 *
 * This results in rather manual memory management,
 * but make is practical to provide highly optimized implementations,
 * for example WASM powered binary formats that can track reference counts and only copy when needed.
 */

/**
 * Ways to refer to a node in an IForestSubscription.
 */
export type NodeId = ITreeSubscriptionCursor | Anchor;

/**
 * Information about a ForestNode's parent
 *
 * @public
 */
export interface ParentData {
    readonly parentId: NodeId;
    readonly traitParent: FieldKey;
    readonly index: number;
}

/**
 * Invalidates whenever `current` changes.
 * For now (might change later) downloading new parts of the forest counts as a change.
 *
 * When invalidating, all outstanding cursors must be freed.
 */
export interface IForestSubscription extends Dependee {
    // We could provide access to this
    // but then accessing it would reduce the ability to mutate in place as an optimization.
    // Maybe add an explicit getter with a perf disclaimer? For now just expose subset of functionality:
    // current(): IForestSnapshot;

    /**
     * If observer is provided, it will be invalidated if the value returned from this changes
     * (including from or two undefined).
     *
     *  @returns the node associated with `id`, or undefined if there is none.
     */
    tryGet(
        id: NodeId,
        observer?: ObservingDependent
    ): ITreeSubscriptionCursor | undefined;

    /**
     * @returns true if the node associated with `id` exists in this forest, otherwise false
     */
    has(id: NodeId): boolean;

    /**
     * @returns undefined iff root, otherwise the parent of `id`.
     */
    tryGetParent(id: NodeId): ParentData | undefined;
}

/**
 * ITreeCursor supporting IForestSubscription and its changes over time.
 */
export interface ITreeSubscriptionCursor extends ITreeCursor {
    /**
     * Where observations get recorded for invalidation.
     * When modified, future observations will count toward the new one.
     *
     * Observations made when in an OutOfDate state will never cause invalidation.
     */
    observer?: ObservingDependent;

    /**
     * @param observer - sets the starting value for the observer.
     * If undefined there is no observer for the returned ITreeSubscriptionCursor.
     *
     * Doing this has no impact on this.observer.
     */
    fork(observer?: ObservingDependent): ITreeSubscriptionCursor;

    /**
     * Release any resources this cursor is holding onto.
     * After doing this, further use of this object other than reading `state` is forbidden (undefined behavior).
     * Invalidation will still happen for the observer: it needs to unsubscribe separately if desired.
     */
    free(): void;

    /**
     * Construct an `Anchor` which the IForestSubscription will keep rebased to `current`.
     * @param free - iff free, will also `free` this.
     */
    buildAnchor(free: boolean): Anchor;

    /**
     * Current state.
     */
    readonly state: ITreeSubscriptionCursorState;
}

/**
 * Pointer to a location in a Forest which IForestSubscription will keep rebased onto `current`.
 */
export interface Anchor {
    /**
     * Release any resources this Anchor is holding onto.
     * After doing this, further use of this object other than reading `state` is forbidden (undefined behavior).
     */
    free(): void;

    /**
     * Current state.
     */
    readonly state: ITreeSubscriptionCursorState;
}

export enum ITreeSubscriptionCursorState {
    /**
     * On the current revision of the forest.
     */
    Current,
    /**
     * Freed and must not be used.
     */
    Freed,
}

/**
 * Editing APIs.
 *
 * These are sufficient to perform all possible edits,
 * but not particularly efficient (for large slice moves), or semantic.
 * They are also not particularly type safe (ex: you can pass a parented nodes into attach, which is invalid).
 *
 * TODO: improve these APIs, addressing the above.
 */
export interface ITransaction extends IForestSubscription {
    /**
     * Adds the supplied nodes to the forest.
     * @param nodes - the sequence of nodes to add to the forest.
     * If any of them have children which exist in the forest already, those children will be parented.
     * Any trait arrays present in a node must be non-empty.
     * The nodes may be provided in any order.
     */
    add(nodes: Iterable<ITreeCursor>): void;

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
        childIds: NodeId[]
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
    ): readonly NodeId[];

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
    delete(ids: Iterable<NodeId>, deleteChildren: boolean): void;
}
