/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { gitHashFile, IsoBuffer } from "@fluidframework/common-utils";
import * as git from "@fluidframework/gitresources";
import {
    FileMode,
    IBlob,
    ISnapshotTree,
    ITree,
    ITreeEntry,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import { buildHierarchy } from "@fluidframework/protocol-base";

async function flattenCore(
    path: string,
    treeEntries: ITreeEntry[],
    blobMap: Map<string, string>,
): Promise<git.ITreeEntry[]> {
    const entries: git.ITreeEntry[] = [];
    for (const treeEntry of treeEntries) {
        const subPath = `${path}${treeEntry.path}`;

        if (treeEntry.type === TreeEntry.Blob) {
            const blob = treeEntry.value as IBlob;
            const buffer = IsoBuffer.from(blob.contents, blob.encoding);
            const sha = await gitHashFile(buffer);
            blobMap.set(sha, buffer.toString("base64"));

            const entry: git.ITreeEntry = {
                mode: FileMode[treeEntry.mode],
                path: subPath,
                sha,
                size: buffer.length,
                type: "blob",
                url: "",
            };
            entries.push(entry);
        } else if (treeEntry.type === TreeEntry.Commit) {
            const entry: git.ITreeEntry = {
                mode: FileMode[treeEntry.mode],
                path: subPath,
                sha: treeEntry.value as string,
                size: -1,
                type: "commit",
                url: "",
            };
            entries.push(entry);
        } else {
            assert(treeEntry.type === TreeEntry.Tree);
            const t = treeEntry.value as ITree;
            const entry: git.ITreeEntry = {
                mode: FileMode[treeEntry.mode],
                path: subPath,
                sha: "",
                size: -1,
                type: "tree",
                url: "",
            };
            entries.push(entry);

            const subTreeEntries = await flattenCore(`${subPath}/`, t.entries, blobMap);
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
async function flatten(tree: ITreeEntry[], blobMap: Map<string, string>): Promise<git.ITree> {
    const entries = await flattenCore("", tree, blobMap);
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
export async function buildSnapshotTree(
    entries: ITreeEntry[],
    blobMap: Map<string, string>,
): Promise<ISnapshotTree> {
    const flattened = await flatten(entries, blobMap);
    return buildHierarchy(flattened);
}
