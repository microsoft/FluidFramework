/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    gcBlobPrefix,
    gcTreeKey,
} from "@fluidframework/container-runtime";
import { concatGarbageCollectionStates } from "@fluidframework/garbage-collector";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import {
    IGarbageCollectionState,
} from "@fluidframework/runtime-definitions";

export function getGCStateFromSummary(summary: ISummaryTree): IGarbageCollectionState | undefined {
    const rootGCTree = summary.tree[gcTreeKey];
    if (rootGCTree === undefined) {
        return undefined;
    }
    assert(rootGCTree.type === SummaryType.Tree, `GC state should be a tree`);

    let rootGCState: IGarbageCollectionState = { gcNodes: {} };
    for (const key of Object.keys(rootGCTree.tree)) {
        // Skip blobs that do not start with the GC prefix.
        if (!key.startsWith(gcBlobPrefix)) {
            continue;
        }

        const gcBlob = rootGCTree.tree[key];
        assert(gcBlob?.type === SummaryType.Blob, `GC blob not available`);
        const gcState = JSON.parse(gcBlob.content as string) as IGarbageCollectionState;
        // Merge the GC state of this blob into the root GC state.
        rootGCState = concatGarbageCollectionStates(rootGCState, gcState);
    }
    return rootGCState;
}
