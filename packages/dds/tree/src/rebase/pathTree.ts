/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    ChildLocation,
    DetachedRange,
    ChildCollection,
    RootRange,
    FieldKey,
 } from "../tree";

/**
 * Path from a location in the tree upward.
 * UpPaths can be used with deduplicated upper parts to allow
 * working with paths localized to part of the tree without incurring
 * costs related to the depth of the local subtree.
 */
export interface UpPath {
    parent(): UpPath | DetachedRange;
    parentField(): FieldKey; // TODO: Type information, including when in DetachedRange.
    parentIndex(): number; // TODO: field index branded type?
}

/**
 * This file contains some work in progress code to implement a prefix tree style collection of paths,
 * designed to support collections of cursors and anchors,
 * allowing for optimize rebase and storage of batches of paths.
 *
 * This is currently unused as object forest is focused on correctness not performance.
 */

/**
 * Base type for nodes in a path tree.
 * TODO: implement UpPath/
 */
export class PathShared<TParent extends ChildCollection = ChildCollection> {
    // PathNode arrays are kept sorted by index for efficient search.
    protected readonly children: Map<TParent, PathNode[]> = new Map();
    // public constructor() {}

    public detach(start: number, length: number, destination: DetachedRange): void {
        // TODO: implement.
    }

    public insert(start: number, paths: PathNode, length: number) {
        assert(paths.parent instanceof PathCollection, 0x333 /* PathShared.splice can only insert detached ranges */);
        // TODO: implement.
    }
}

class PathNode extends PathShared<FieldKey> {
    public constructor(public parent: PathShared<FieldKey>, location: ChildLocation) {
        super();
    }
}

/**
 * Tree of anchors.
 * Updated on changes to forest.
 * Contains parent pointers.
 *
 * Each anchor is equivalent to a path through the tree.
 * This tree structure stores a collection of these paths, but deduplicating the common prefixes of the tree
 * prefix-tree style.
 *
 * These anchors are used instead of just holding onto the node objects so that the parent path is available:
 * these store parents, but regular object forest nodes do not.
 *
 * Thus this can be thought of as a sparse copy of the subset of trees which are used as anchors
 * (and thus need parent paths).
 */
class PathCollection extends PathShared<RootRange> {
    public constructor() {
        super();
    }

    public delete(range: DetachedRange): void {
        throw new Error("Method not implemented.");
    }
}
