/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dependee, ObservingDependent } from "../dependency-tracking";
import { FieldKey } from "../tree";
import { Brand, Opaque } from "../util";
import { ITreeCursor, TreeNavigationResult } from "./cursor";

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
 * Location of a tree within a forest.
 *
 * @public
 */
export interface TreeLocation {
    readonly container: TreeParent;
    readonly index: number;
}

export interface ChildField {
	readonly key: FieldKey;
}

/**
 * Parent of a tree in a forest.
 */
export type TreeParent = ChildField | DetachedRange;

/**
 * A root in the forest.
 *
 * The anchoring does not refer to any of the nodes contained in this range:
 * instead `start` and `end` are anchored to the ends of this detached range, but its object identity.
 * Thus any additional content inserted before or after contents of this range will be included in the range.
 * This also means that moving the content from this range elsewhere will leave this range valid, but empty.
 *
 * DetachedRanges, as well as their start and end, are not valid to use as anchors across edits:
 * they are only valid within the edit in which they were created.
 */
export type DetachedRange = Opaque<Brand<number, "forest.DetachedRange">>;
/**
 * Invalidates whenever `current` changes.
 * For now (might change later) downloading new parts of the forest counts as a change.
 *
 * When invalidating, all outstanding cursors must be freed or cleared.
 */
export interface IForestSubscription extends Dependee {
    // We could provide access to this
    // but then accessing it would reduce the ability to mutate in place as an optimization.
    // Maybe add an explicit getter with a perf disclaimer? For now just expose subset of functionality:
    // current(): IForestSnapshot;

    /**
     * Allocates a cursor in the "cleared" state.
     */
    allocateCursor(): ITreeSubscriptionCursor;

    /**
     * Anchor at the beginning or root field.
     */
    readonly root: Anchor;

    /**
     * If observer is provided, it will be invalidated if the value returned from this changes
     * (including from or two undefined).
     *
     *  @returns the node associated with `id`, or undefined if there is none.
     *
     * It is an error not to free `cursorToMove` before the next edit.
     * Must provide a `cursorToMove` from this subscription (acquired via `allocateCursor`).
     */
    tryGet(
        destination: Anchor,
        cursorToMove: ITreeSubscriptionCursor,
        observer?: ObservingDependent
    ): TreeNavigationResult;
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
     * After doing this, further use of this object other than reading `state` or passing to `tryGet`
     * is forbidden (undefined behavior).
     * Invalidation will still happen for the observer: it needs to unsubscribe separately if desired.
     */
    free(): void;

    /**
     * Construct an `Anchor` which the IForestSubscription will keep rebased to `current`.
     * Note that maintaining an Anchor has cost: free them to stop incurring that cost.
     */
    buildAnchor(): Anchor;

    /**
     * Current state.
     */
    readonly state: ITreeSubscriptionCursorState;

    /**
     * @returns location within parent field or range.
     */
    // TODO: maybe support this.
    // getParentInfo(id: NodeId): TreeLocation;
}

/**
 * Pointer to a location in a Forest which IForestSubscription will keep rebased onto `current`.
 *
 * TODO:Performance:
 * An implementation might prefer to de-duplicate
 * Anchors and thus use a ref count instead of allocating an object for each one.
 * This could be enabled by removing "state".
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
     * Empty, but can be reused.
     */
    Cleared,
    /**
     * Freed and must not be used.
     */
    Freed,
}
