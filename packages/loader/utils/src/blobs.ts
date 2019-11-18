/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@microsoft/fluid-gitresources";
import {
    FileMode,
    IBlob,
    IDocumentStorageService,
    ISnapshotTree,
    ITree,
    ITreeEntry,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";
// tslint:disable-next-line:no-submodule-imports
import * as sha1 from "sha.js/sha1";

/**
 * Create Hash (Github hashes the string with blob and size)
 *
 * @param file - The contents of the file in a buffer
 * @returns The sha1 hash of the content of the buffer with the `blob` prefix and size
 */
export function gitHashFile(file: Buffer): string {
    const size = file.byteLength;
    const filePrefix = "blob " + size.toString() + String.fromCharCode(0);
    /* tslint:disable:no-unsafe-any */
    const engine = new sha1();
    return engine.update(filePrefix)
        .update(file)
        .digest("hex");
}

/**
 * Create a flatten view of an array of ITreeEntry
 *
 * @param tree - an array of ITreeEntry to flatten
 * @param blobMap - a map of blob's sha1 to content
 * @returns A flatten with of the ITreeEntry
 */
export function flatten(tree: ITreeEntry[], blobMap: Map<string, string>): git.ITree {
    const entries = flattenCore("", tree, blobMap);
    return {
        sha: "",
        tree: entries,
        url: "",
    };
}

/**
 * Read a blob from IDocumentStorageService, decode it (from "base64") and JSON.parse it into object of type T
 *
 * @param storage - the IDocumentStorageService to read from
 * @param id - the id of the blob to read and parse
 * @returns the object that we decoded and JSON.parse
 */
export async function readAndParse<T>(storage: IDocumentStorageService, id: string): Promise<T> {
    const encoded = await storage.read(id);
    const decoded = Buffer
        .from(encoded, "base64")
        .toString();
    return JSON.parse(decoded) as T;
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

            const subTreeEntries = flattenCore(subPath + "/", t.entries, blobMap);
            entries.push(...subTreeEntries);
        }
    }

    return entries;
}

/**
 * Build a tree hierarchy base on a flat tree
 *
 * @param flatTree - a flat tree
 * @returns the hierarchical tree
 */
export function buildHierarchy(flatTree: git.ITree, blobsShaCache: Set<string> = new Set<string>()): ISnapshotTree {
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
            blobsShaCache.add(entry.sha);
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
    constructor(public readonly path: string, public readonly value: string) {}
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
    constructor(public readonly path: string, public readonly value: ITree) {}
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
