/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@fluidframework/gitresources";
import {
    FileMode,
    IBlob,
    IAttachment,
    ISnapshotTree,
    ITree,
    ITreeEntry,
    TreeEntry,
    SummaryType,
    SummaryObject,
} from "@fluidframework/protocol-definitions";

/**
 * Take a summary object and returns its git mode.
 *
 * @param value - summary object
 * @returns the git mode of summary object
 */
export function getGitMode(value: SummaryObject): string {
    const type = value.type === SummaryType.Handle ? value.handleType : value.type;
    switch (type) {
        case SummaryType.Blob:
            return FileMode.File;
        case SummaryType.Commit:
            return FileMode.Commit;
        case SummaryType.Tree:
            return FileMode.Directory;
        default:
            throw new Error();
    }
}

/**
 * Take a summary object and returns its type.
 *
 * @param value - summary object
 * @returns the type of summary object
 */
export function getGitType(value: SummaryObject): string {
    const type = value.type === SummaryType.Handle ? value.handleType : value.type;

    switch (type) {
        case SummaryType.Blob:
            return "blob";
        case SummaryType.Commit:
            return "commit";
        case SummaryType.Tree:
            return "tree";
        case SummaryType.Attachment:
            return "attachment";
        default:
            throw new Error();
    }
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
    public readonly type = TreeEntry.Blob;
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
    public readonly type = TreeEntry.Commit;

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
    public readonly type = TreeEntry.Tree;

    /**
     * Creates a tree ITreeEntry
     * @param path - path of entry
     * @param value - subtree
     */
    constructor(public readonly path: string, public readonly value: ITree) { }
}

/**
 * Basic implementation of an attachment ITreeEntry
 */
export class AttachmentTreeEntry implements ITreeEntry {
    public readonly mode = FileMode.File;
    public readonly type = TreeEntry.Attachment;
    public readonly value: IAttachment;

    /**
     * Creates an attachment ITreeEntry
     * @param path - path of entry
     * @param id - id of external blob attachment
     */
    constructor(public readonly path: string, public readonly id: string) {
        this.value = { id };
    }
}

export function addBlobToTree(tree: ITree, blobName: string, content: object) {
    tree.entries.push(
        {
            mode: FileMode.File,
            path: blobName,
            type: TreeEntry.Blob,
            value: {
                contents: JSON.stringify(content),
                encoding: "utf-8",
            },
        });
}
