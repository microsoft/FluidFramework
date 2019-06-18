/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IAuthor {
    name: string;
    email: string;
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date: string;
}

export interface ICommitter {
    name: string;
    email: string;
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date: string;
}

export interface ICommitHash {
    sha: string;
    url: string;
}

export interface ICreateCommitParams {
    message: string;
    tree: string;
    parents: string[];
    // GitHub has signature verification on the author
    author: IAuthor;
}

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

export interface IBlob {
    content: string;
    encoding: string;
    url: string;
    sha: string;
    size: number;
}

export interface ICreateBlobParams {
    // The encoded content
    content: string;

    // The encoding of the content. Either utf8 or base64.
    encoding: string;
}

export interface ICreateBlobResponse {
    sha: string;
    url: string;
}

export interface IRef {
    ref: string;
    url: string;
    object: {
        type: string;
        sha: string;
        url: string;
    };
}

export interface ICreateRefParams {
    ref: string;
    sha: string;
}

export interface IPatchRefParams {
    sha: string;
    force: boolean;
}

export interface ICreateRepoParams {
    // name of the repository
    name: string;
}

export interface ICreateTreeEntry {
    path: string;
    mode: string;
    type: string;
    sha: string;
}

export interface ICreateTreeParams {
    base_tree?: string;
    tree: ICreateTreeEntry[];
}

export interface ITreeEntry {
    path: string;
    mode: string;
    type: string;
    size: number;
    sha: string;
    url: string;
}

export interface ITree {
    sha: string;
    url: string;
    tree: ITreeEntry[];
}
export interface ITagger {
    name: string;
    email: string;
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date: string;
}

export interface ICreateTagParams {
    tag: string;
    message: string;
    object: string;
    type: string;
    tagger: ITagger;
}

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
