/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";
import { FieldKey, TreeType } from "../tree";

export const enum TreeNavigationResult {
    /** Attempt to navigate cursor to a key or index that is outside the client's view. */
    NotFound = -1,

    /** Attempt to navigate cursor to a portion of the tree that has not yet been loaded. */
    Pending = 0,

    /** ITreeReader successfully navigated to the desired node. */
    Ok = 1,
}

/**
 * A stateful low-level interface for reading tree data.
 *
 * TODO: Needs rules around invalidation/mutation of the underlying tree.
 * Should either be documented here, or each producer should document them
 * (and likely via returning a sub-interface with documentation on the subject).
 *
 * TODO: Needs a way to efficiently clone Cursor so patterns like lazy tree reification can be implemented efficiently.
 */
export interface ITreeCursor {
    /** Select the child located at the given key and index. */
    down(key: FieldKey, index: number): TreeNavigationResult;

    /** Select the parent of the currently selected node. */
    up(): TreeNavigationResult;

    /** The type of the currently selected node. */
    readonly type: TreeType;

    /** @returns the keys of the currently selected node. */
    keys: Iterable<FieldKey>;

    /** @returns the number of immediate children for the given key of the currently selected node. */
    length(key: FieldKey): number;

    /** value associated with the currently selected node. */
    readonly value: undefined | Serializable;
}
