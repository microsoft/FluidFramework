/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Details about the author of the commit
 */
export interface IAuthor {
    name: string;
    email: string;
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date: string;
}

/**
 * Details about the committer of the commit
 */
export interface ICommitter {
    name: string;
    email: string;
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date: string;
}

/**
 * Details of the commit
 */
export interface ICommitHash {
    sha: string;
    url: string;
}

/**
 * Required params to create commit
 */
export interface ICreateCommitParams {
    message: string;
    tree: string;
    parents: string[];
    // GitHub has signature verification on the author
    author: IAuthor;
}

/**
 * Commit content
 */
export interface ICommit {
    sha: string;
    url: string;
    author: IAuthor;
    committer: ICommitter;
    message: string;
    tree: ICommitHash;
    parents: ICommitHash[];
}

/**
 * Details of a commit
 *
 * GitHub differentiates the commit resource returned from its git and repos routes. The repos
 * route returns more site specific information (like links to the developer's account) while the git
 * route is what is actually stored in the Git repo
 *
 * https://developer.github.com/v3/git/commits/
 * https://developer.github.com/v3/repos/commits/
 */
export interface ICommitDetails {
    url: string;
    sha: string;
    commit: {
        url: string;
        author: IAuthor;
        committer: ICommitter;
        message: string;
        tree: ICommitHash;
    };
    parents: ICommitHash[];
}

/**
 * Blob content
 */
export interface IBlob {
    content: string;
    encoding: string;
    url: string;
    sha: string;
    size: number;
}

/**
 * Required params to create blob
 */
export interface ICreateBlobParams {
    // The encoded content
    content: string;

    // The encoding of the content. Either utf8 or base64.
    encoding: string;
}

/**
 * Response to create blob request
 */
export interface ICreateBlobResponse {
    sha: string;
    url: string;
}

/**
 * Ref content
 */
export interface IRef {
    ref: string;
    url: string;
    object: {
        type: string;
        sha: string;
        url: string;
    };
}

/**
 * Required params to create ref
 */
export interface ICreateRefParams {
    ref: string;
    sha: string;
}

/**
 * Required params to patch ref
 */
export interface IPatchRefParams {
    sha: string;
    force: boolean;
}

/**
 * Required params to create repo
 * @param name - name of the repository
 */
export interface ICreateRepoParams {
    name: string;
}

/**
 * Required details to create tree entry
 */
export interface ICreateTreeEntry {
    path: string;
    mode: string;
    type: string;
    sha: string;
}

/**
 * Required params to create tree
 */
export interface ICreateTreeParams {
    base_tree?: string;
    tree: ICreateTreeEntry[];
}

/**
 * Tree Entry Content
 */
export interface ITreeEntry {
    path: string;
    mode: string;
    type: string;
    size: number;
    sha: string;
    url: string;
}

/**
 * Tree content
 */
export interface ITree {
    sha: string;
    url: string;
    tree: ITreeEntry[];
}

/**
 * Tagger content
 */
export interface ITagger {
    name: string;
    email: string;
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date: string;
}

/**
 * Required params to create tag
 */
export interface ICreateTagParams {
    tag: string;
    message: string;
    object: string;
    type: string;
    tagger: ITagger;
}

/**
 * Tag content
 */
export interface ITag {
    tag: string;
    sha: string;
    url: string;
    message: string;
    tagger: ITagger;
    object: {
        type: string;
        sha: string;
        url: string;
    };
}
