/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";
import { TreeKey, TreeType } from "..";

export const enum TreeReadResult {
    /** Attempt to navigate ITreeReader to a key or index that is outside the client's view. */
    NotFound = -1,

    /** Attempt to navigate ITreeReader to a portion of the tree that has not yet been loaded. */
    Pending = 0,

    /** ITreeReader successfully navigated to the desired node. */
    Ok = 1,
}

export interface INodeReader {
    type: TreeType;
    keys: Iterable<TreeKey>;
    length(key: TreeKey): number;
    value: undefined | Serializable;
}

export interface ITreeReader extends INodeReader {
    down(key: TreeKey, index: number): TreeReadResult;
    up(): TreeReadResult;
}
