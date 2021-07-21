/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, stringToBuffer } from "@fluidframework/common-utils";
import * as git from "@fluidframework/gitresources";
import {
    FileMode,
    ISnapshotTree,
    ITreeEntry,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import { buildHierarchy } from "@fluidframework/protocol-base";
import { v4 as uuid } from "uuid";

function flattenCore(
    path: string,
    treeEntries: ITreeEntry[],
    blobMap: Map<string, ArrayBufferLike>,
): git.ITreeEntry[] {
    const entries: git.ITreeEntry[] = [];
    for (const treeEntry of treeEntries) {
        const subPath = `${path}${treeEntry.path}`;

        if (treeEntry.type === TreeEntry.Blob) {
            const blob = treeEntry.value;
            const buffer = stringToBuffer(blob.contents, blob.encoding);
            const id = uuid();
            blobMap.set(id, buffer);

            const entry: git.ITreeEntry = {
                mode: FileMode[treeEntry.mode],
                path: subPath,
                sha: id,
                size: 0,
                type: "blob",
                url: "",
            };
            entries.push(entry);
        } else if (treeEntry.type === TreeEntry.Commit) {
            const entry: git.ITreeEntry = {
                mode: FileMode[treeEntry.mode],
                path: subPath,
                sha: treeEntry.value,
                size: -1,
                type: "commit",
                url: "",
            };
            entries.push(entry);
        } else {
            assert(treeEntry.type === TreeEntry.Tree, 0x101 /* "Unexpected tree entry type on flatten!" */);
            const t = treeEntry.value;
            const entry: git.ITreeEntry = {
                mode: FileMode[treeEntry.mode],
                path: subPath,
                sha: "",
                size: -1,
                type: "tree",
                url: "",
            };
            entries.push(entry);

            const subTreeEntries = flattenCore(`${subPath}/`, t.entries, blobMap);
            entries.push(...subTreeEntries);
        }
    }

    return entries;
}

/**
 * Create a flatten view of an array of ITreeEntry
 *
 * @param tree - an array of ITreeEntry to flatten
 * @param blobMap - a map of blob's sha1 to content
 * @returns A flatten with of the ITreeEntry
 */
function flatten(tree: ITreeEntry[], blobMap: Map<string, ArrayBufferLike>): git.ITree {
    const entries = flattenCore("", tree, blobMap);
    return {
        sha: "",
        tree: entries,
        url: "",
    };
}

/**
 * Build a tree hierarchy base on an array of ITreeEntry
 *
 * @param entries - an array of ITreeEntry to flatten
 * @param blobMap - a map of blob's sha1 to content that gets filled with content from entries
 * NOTE: blobMap's validity is contingent on the returned promise's resolution
 * @returns the hierarchical tree
 */
export function buildSnapshotTree(
    entries: ITreeEntry[],
    blobMap: Map<string, ArrayBufferLike>,
): ISnapshotTree {
    const flattened = flatten(entries, blobMap);
    return buildHierarchy(flattened);
}
