/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { gitHashFile } from "@microsoft/fluid-common-utils";
import * as git from "@microsoft/fluid-gitresources";
import {
    FileMode,
    IBlob,
    ISnapshotTree,
    ITree,
    ITreeEntry,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";

/**
 * Create a flatten view of an array of ITreeEntry
 *
 * @param tree - an array of ITreeEntry to flatten
 * @param blobMap - a map of blob's sha1 to content
 * @returns A flatten with of the ITreeEntry
 */
function flatten(tree: ITreeEntry[], blobMap: Map<string, string>): git.ITree {
    const entries = flattenCore("", tree, blobMap);
    return {
        sha: "",
        tree: entries,
        url: "",
    };
}

function flattenCore(path: string, treeEntries: ITreeEntry[], blobMap: Map<string, string>): git.ITreeEntry[] {
    const entries: git.ITreeEntry[] = [];
    for (const treeEntry of treeEntries) {
        const subPath = `${path}${treeEntry.path}`;

        if (treeEntry.type === TreeEntry[TreeEntry.Blob]) {
            const blob = treeEntry.value as IBlob;
            const buffer = Buffer.from(blob.contents, blob.encoding);
            const sha = gitHashFile(buffer);
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
        } else if (treeEntry.type === TreeEntry[TreeEntry.Commit]) {
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
            assert(treeEntry.type === TreeEntry[TreeEntry.Tree]);
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

            const subTreeEntries = flattenCore(`${subPath}/`, t.entries, blobMap);
            entries.push(...subTreeEntries);
        }
    }

    return entries;
}

/**
 * Build a tree hierarchy base on an array of ITreeEntry
 *
 * @param entries - an array of ITreeEntry to flatten
 * @param blobMap - a map of blob's sha1 to content
 * @returns the hierarchical tree
 */
export function buildSnapshotTree(entries: ITreeEntry[], blobMap: Map<string, string>): ISnapshotTree {
    const flattened = flatten(entries, blobMap);
    return buildHierarchy(flattened);
}

/**
 * Build a tree hierarchy base on a flat tree
 *
 * @param flatTree - a flat tree
 * @param blobsShaToPathCache - Map with blobs sha as keys and values as path of the blob.
 * @returns the hierarchical tree
 */
export function buildHierarchy(
    flatTree: git.ITree,
    blobsShaToPathCache: Map<string, string> = new Map<string, string>()): ISnapshotTree {

    const lookup: { [path: string]: ISnapshotTree } = {};
    const root: ISnapshotTree = { id: flatTree.sha, blobs: {}, commits: {}, trees: {} };
    lookup[""] = root;

    for (const entry of flatTree.tree) {
        const lastIndex = entry.path.lastIndexOf("/");
        const entryPathDir = entry.path.slice(0, Math.max(0, lastIndex));
        const entryPathBase = entry.path.slice(lastIndex + 1);

        // The flat output is breadth-first so we can assume we see tree nodes prior to their contents
        const node = lookup[entryPathDir];

        // Add in either the blob or tree
        if (entry.type === "tree") {
            const newTree = { id: entry.sha, blobs: {}, commits: {}, trees: {} };
            node.trees[decodeURIComponent(entryPathBase)] = newTree;
            lookup[entry.path] = newTree;
        } else if (entry.type === "blob") {
            node.blobs[decodeURIComponent(entryPathBase)] = entry.sha;
            blobsShaToPathCache.set(entry.sha, `/${entry.path}`);
        } else if (entry.type === "commit") {
            node.commits[decodeURIComponent(entryPathBase)] = entry.sha;
        }
    }

    return root;
}

/**
 * Basic implementation of a blob ITreeEntry
 */
export class BlobTreeEntry implements ITreeEntry {
    public readonly mode = FileMode.File;
    public readonly type = TreeEntry[TreeEntry.Blob];
    public readonly value: IBlob;

    /**
     * Creates a blob ITreeEntry
     * @param path - path of entry
     * @param contents - blob contents
     * @param encoding - encoding of contents; defaults to utf-8
     */
    constructor(public readonly path: string, contents: string, encoding: string = "utf-8") {
        this.value = { contents, encoding };
    }
}

/**
 * Basic implementation of a commit ITreeEntry
 */
export class CommitTreeEntry implements ITreeEntry {
    public readonly mode = FileMode.Commit;
    public readonly type = TreeEntry[TreeEntry.Commit];

    /**
     * Creates a commit ITreeEntry
     * @param path - path of entry
     * @param value - commit value
     */
    constructor(public readonly path: string, public readonly value: string) { }
}

/**
 * Basic implementation of a tree ITreeEntry
 */
export class TreeTreeEntry implements ITreeEntry {
    public readonly mode = FileMode.Directory;
    public readonly type = TreeEntry[TreeEntry.Tree];

    /**
     * Creates a tree ITreeEntry
     * @param path - path of entry
     * @param value - subtree
     */
    constructor(public readonly path: string, public readonly value: ITree) { }
}

export function addBlobToTree(tree: ITree, blobName: string, content: object) {
    tree.entries.push(
        {
            mode: FileMode.File,
            path: blobName,
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(content),
                encoding: "utf-8",
            },
        });
}
