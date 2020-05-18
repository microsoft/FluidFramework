/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IDocumentAttributes {
    /**
     * Name of the branch that created the snapshot
     */
    branch: string;

    /**
     * Sequence number at which the snapshot was taken
     */
    sequenceNumber: number;

    /**
     * Minimum sequence number when the snapshot was taken
     */
    minimumSequenceNumber: number;

    /**
     * Term number at which the snapshot was taken
     */
    term: number | undefined;
}

export enum FileMode {
    File = "100644",
    Executable = "100755",
    Directory = "040000",
    Commit = "160000",
    Symlink = "120000",
}

/**
 * Raw blob stored within the tree
 */
export interface IBlob {
    // Contents of the blob
    contents: string;

    // The encoding of the contents string (utf-8 or base64)
    encoding: string;
}

export interface ICreateBlobResponse {
    id: string;
    url: string;
}

/**
 * A tree entry wraps a path with a type of node
 */
export interface ITreeEntry {
    // Path to the object
    path: string;

    // One of the below enum string values
    type: string;

    // The value of the entry - either a tree or a blob
    value: IBlob | ITree | string;

    // The file mode; one of 100644 for file (blob), 100755 for executable (blob), 040000 for subdirectory (tree),
    // 160000 for submodule (commit), or 120000 for a blob that specifies the path of a symlink
    mode: FileMode;
}

/**
 * Type of entries that can be stored in a tree
 */
export enum TreeEntry {
    Blob,
    Commit,
    Tree,
}

export interface ITree {
    entries: ITreeEntry[];

    // Unique ID representing all entries in the tree. Can be used to optimize snapshotting in the case
    // it is known that the ITree has already been created and stored
    id: string | null;
}

export interface ISnapshotTree {
    id: string | null;
    blobs: { [path: string]: string };
    commits: { [path: string]: string };
    trees: { [path: string]: ISnapshotTree };
}

/**
 * Represents a version of the snapshot of a component
 */
export interface IVersion  {
    // Version ID
    id: string;

    // Tree ID for this version of the snapshot
    treeId: string;

    // Time when snapshot was generated.
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date?: string;
}
