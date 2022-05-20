/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";
import { TreeKey, TreeType } from "../..";

export const enum TreeReadResult {
    NotFound = -1,
    Pending = 0,
    Ok = 1,
}

export interface INodeReader {
    type: TreeType;
    keys: Iterable<TreeKey>;
    length(key: TreeKey): number;
    value: undefined | Serializable;
}

export interface ITreeReader extends INodeReader {
    push(key: TreeKey, index: number): TreeReadResult;
    pop(): TreeReadResult;
}
