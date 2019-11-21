/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export type SummaryObject = ISummaryCommit | ISummaryTree | ISummaryBlob | ISummaryHandle;

export type SummaryTree = ISummaryTree | ISummaryHandle;

export interface ISummaryAuthor {
    name: string;
    email: string;
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date: string;
}

export interface ISummaryCommitter {
    name: string;
    email: string;
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date: string;
}

export const enum SummaryType {
    Commit = 0,
    Tree = 1,
    Blob = 2,
    Handle = 3,
}

export interface ISummaryHandle {
    type: SummaryType.Handle;

    handleType: SummaryType;

    // Stored handle reference
    handle: string;
}

export interface ISummaryBlob {
    type: SummaryType.Blob;
    content: string | Buffer;
}

export interface ISummaryTree {
    type: SummaryType.Tree;

    // TODO type I can infer from SummaryObject. File mode I may want to directly specify so have symlink+exec access
    tree: { [path: string]: SummaryObject };
}

export interface ISummaryCommit {
    type: SummaryType.Commit;

    author: ISummaryAuthor;

    committer: ISummaryAuthor;

    message: string;

    // Tree referenced by the commit
    tree: SummaryTree;

    // Previous parents to the commit.
    parents: string[];
}
