/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The types defined in this directory provide strong typing for the deserialized
// REST payloads when communicating with the Git service.
//
// These should not be changed unless Git itself is changed, and should be aligned
// with the service side definitions contained here:
//
// server/routerlicious/packages/gitresources/src/resources.ts

/**
 * Details about the author of the commit
 * @internal
 */
export interface IAuthor {
	name: string;
	email: string;
	// ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
	date: string;
}

/**
 * Details about the committer of the commit
 * @internal
 */
export interface ICommitter {
	name: string;
	email: string;
	// ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
	date: string;
}

/**
 * Details of the commit
 * @internal
 */
export interface ICommitHash {
	sha: string;
	url: string;
}

/**
 * Required params to create commit
 * @internal
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
 * @internal
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
 * @internal
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
 * @internal
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
 * @internal
 */
export interface ICreateBlobParams {
	// The encoded content
	content: string;

	// The encoding of the content.
	// eslint-disable-next-line unicorn/text-encoding-identifier-case
	encoding: "utf-8" | "base64";
}

/**
 * Response to create blob request
 * @internal
 */
export interface ICreateBlobResponse {
	sha: string;
	url: string;
}

/**
 * Ref content
 * @internal
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
 * @legacy
 * @alpha
 */
export interface ICreateRefParams {
	ref: string;
	sha: string;
}

/**
 * Required params to patch ref
 * @legacy
 * @alpha
 */
export interface IPatchRefParams {
	sha: string;
	force: boolean;
}

/**
 * Required params to create repo
 * @param name - name of the repository
 * @internal
 */
export interface ICreateRepoParams {
	name: string;
}

/**
 * Required details to create tree entry
 * @internal
 */
export interface ICreateTreeEntry {
	path: string;
	mode: string;
	type: string;
	sha: string;
}

/**
 * Required params to create tree
 * @internal
 */
export interface ICreateTreeParams {
	base_tree?: string;
	tree: ICreateTreeEntry[];
}

/**
 * Tree Entry Content
 * @internal
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
 * @internal
 */
export interface ITree {
	sha: string;
	url: string;
	tree: ITreeEntry[];
}

/**
 * Tagger content
 * @internal
 */
export interface ITagger {
	name: string;
	email: string;
	// ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
	date: string;
}

/**
 * Required params to create tag
 * @internal
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
 * @internal
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
