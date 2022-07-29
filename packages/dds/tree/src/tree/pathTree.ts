/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey } from "./types";

/**
 * Path from a location in the tree upward.
 * UpPaths can be used with deduplicated upper parts to allow
 * working with paths localized to part of the tree without incurring
 * costs related to the depth of the local subtree.
 *
 * UpPaths can be thought of as terminating at a special root node (that is `undefined`)
 * who's FieldKeys are all LocalFieldKey's that correspond to detached sequences.
 *
 * UpPaths can be mutated over time and should be considered to be invalidated when any edits occurs:
 * Use of an UpPath that was acquired before the most recent edit is undefined behavior.
 */
export interface UpPath {
    /**
     * @returns the parent, or undefined in the case where this path is a member of a detached sequence.
     */
    readonly parent: UpPath | undefined;
    /**
     * The Field under which this path points.
     * Note that if `parent` returns `undefined`, this key is a LocalFieldKey that corresponds to a detached sequence.
     */
     readonly parentField: FieldKey; // TODO: Type information, including when in DetachedField.
    /**
     * The index within `parentField` this path is pointing to.
     */
     readonly parentIndex: number; // TODO: field index branded type?
}

/**
 * @returns the number of nodes above this one.
 * Zero when the path's parent is undefined, meaning the path represents a node in a detached field.
 * Runs in O(depth) time.
 */
export function getDepth(path: UpPath): number {
    let depth = 0;
    let next = path.parent;
    while (next !== undefined) {
        depth += 1;
        next = next.parent;
    }
    return depth;
}

/**
 * @returns a deep copy of the provided path as simple javascript objects.
 * This is safe to hold onto and use deep object comparisons on.
 */
export function clonePath(path: UpPath): UpPath;

/**
 * @returns a deep copy of the provided path as simple javascript objects.
 * This is safe to hold onto and use deep object comparisons on.
 */
export function clonePath(path: UpPath | undefined): UpPath | undefined;

export function clonePath(path: UpPath | undefined): UpPath | undefined {
    if (path === undefined) {
        return undefined;
    }
    return {
        parent: clonePath(path.parent),
        parentField: path.parentField,
        parentIndex: path.parentIndex,
    };
}
