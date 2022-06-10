/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";
import { TreeKey, TreeType } from "../tree";

export const enum TreeNavigationResult {
    /** Attempt to navigate cursor to a key or index that is outside the client's view. */
    NotFound = -1,

    /** Attempt to navigate cursor to a portion of the tree that has not yet been loaded. */
    Pending = 0,

    /** ITreeReader successfully navigated to the desired node. */
    Ok = 1,
}

/** A stateful low-level interface for reading tree data. */
export interface ITreeCursor {
    /** Select the child located at the given key and index. */
    down(key: TreeKey, index: number): TreeNavigationResult;

    /** Select the parent of the currently selected node. */
    up(): TreeNavigationResult;

    /** Returns the type of the currently selected node. */
    type: TreeType;

    /** Returns the keys of the currently selected node. */
    keys: Iterable<TreeKey>;

    /** Returns the number of immediate children for the given key of the currently selected node. */
    length(key: TreeKey): number;

    /** Returns the value associated with the currently selected node. */
    value: undefined | Serializable;
}
