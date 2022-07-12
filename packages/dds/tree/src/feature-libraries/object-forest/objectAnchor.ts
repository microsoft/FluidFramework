/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    Anchor,
    ITreeSubscriptionCursorState,
} from "../../forest";
import { PathShared } from "../../tree";

// Currently unused,
// but would be useful if we stop having anchors just hold onto nodes and use rebase like a real version will.

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
 *
 * Since anchors need to work even for unloaded/pending parts of the tree,
 * these are kept separate from the actual tree data.
 */
export class ObjectAnchor implements Anchor {
    state: ITreeSubscriptionCursorState = ITreeSubscriptionCursorState.Current;
    public constructor(public readonly path: PathShared) { }
    free(): void {
        assert(this.state === ITreeSubscriptionCursorState.Current, 0x334 /* Anchor must not be double freed */);
        this.state = ITreeSubscriptionCursorState.Freed;
    }
}
