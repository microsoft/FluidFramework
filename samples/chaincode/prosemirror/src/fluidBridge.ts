/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IProseMirrorNode {
    [key: string]: any;
    type: string,
    content?: IProseMirrorNode[],
    marks?: any[],
}

export interface IProseMirrorSlice {
    openStart?: number;
    openEnd?: number;
    content: IProseMirrorNode[];
}

export function sliceToGroupOps(slice: IProseMirrorSlice): IMergeTreeInsertMsg[] {
    // The slice is defining a tree. The openStart and openEnd
}