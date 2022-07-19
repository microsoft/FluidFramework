/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Brand } from "../util";
import {
    ChildLocation,
    DetachedRange,
    ChildCollection,
    RootRange,
    FieldKey,
 } from "../tree";
import { UpPath } from "./pathTree";

/**
 * A way to refer to a particular tree location within a {@link Rebaser} instance's revision.
 */
 export type Anchor = Brand<number, "rebaser.Anchor">;

/**
 * Collection of Anchors at a specific revision.
 *
 * See {@link Rebaser} for how to update across revisions.
 */

export class AnchorSet {
    public readonly paths = new PathCollection();
    public readonly anchorsToPath: Map<Anchor, PathShared> = new Map();
    public constructor() {
    }

    /**
     * TODO: support extra/custom return types for specific anchor types:
     * for now caller must rely on data in anchor + returned node location
     * (not ideal for anchors for places or ranges instead of nodes).
     */
    public locate(anchor: Anchor): UpPath | undefined {
        // TODO: this should error for anchors that do not exist,
        // and return undefined only if anchor does exist, but points nowhere in current revision.
        return this.anchorsToPath.get(anchor);
    }

    public forget(anchor: Anchor): void {
        throw Error("Not implemented"); // TODO
    }

    /**
     * TODO: add API to UpPath (maybe extend as AnchorPath to allow building without having to copy here?)
     */
    public track(path: UpPath): Anchor {
        throw Error("Not implemented"); // TODO
    }
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
 */
 export class PathShared<TParent extends ChildCollection = ChildCollection> implements UpPath {
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

    parent(): UpPath | DetachedRange {
        throw new Error("Method not implemented.");
    }
    parentField(): FieldKey {
        throw new Error("Method not implemented.");
    }
    parentIndex(): number {
        throw new Error("Method not implemented.");
    }
}

class PathNode extends PathShared<FieldKey> {
    public constructor(public parentPath: PathShared<FieldKey>, location: ChildLocation) {
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
