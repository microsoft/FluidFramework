/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as isomorphicGit from "isomorphic-git";
import * as resources from "@fluidframework/gitresources";
import { NetworkError } from "@fluidframework/server-services-client";

type IsomorphicGitTreeEntryType = "commit" | "blob" | "tree";
type IsomorphicGitTagObjectType = IsomorphicGitTreeEntryType | "tag";



function ensureIsomorphicGitTreeEntryType(originalITreeEntryType: string): IsomorphicGitTreeEntryType {
    if (!["commit", "blob", "tree"].includes(originalITreeEntryType)) {
        throw new NetworkError(400, "Invalid TreeEntry type.");
    }

    return originalITreeEntryType as IsomorphicGitTreeEntryType;
}

function ensureIsomorphicGitTagObjectType(originalITagType: string): IsomorphicGitTagObjectType {
    if (!["commit", "blob", "tree", "tag"].includes(originalITagType)) {
        throw new NetworkError(400, "Invalid Tag Object type.");
    }

    return originalITagType as IsomorphicGitTagObjectType;
}

function oidToCommitHash(oid: string): resources.ICommitHash {
    return { sha: oid, url: "" };
}

/**
 * Helper function to convert from a nodegit commit to our resource representation
 */
export function commitToICommit(commitResult: isomorphicGit.ReadCommitResult): resources.ICommit {
    return {
        author: {
            date: new Date(commitResult.commit.author.timestamp * 1000).toISOString(),
            email: commitResult.commit.author.email,
            name: commitResult.commit.author.name,
        },
        //author:// authorToIAuthor(commit.author(), commit.date()),
        committer: {
            date: new Date(commitResult.commit.committer.timestamp * 1000).toISOString(),
            email: commitResult.commit.committer.email,
            name: commitResult.commit.committer.name,
        },
        //committer: committerToICommitter(commit.committer(), commit.date()),
        message: commitResult.commit.message,
        parents: commitResult.commit.parent && commitResult.commit.parent.length > 0 ?
            commitResult.commit.parent.map((parent) => oidToCommitHash(parent)) : null,
        sha: commitResult.oid,
        tree: {
            sha: commitResult.commit.tree,
            url: "",
        },
        url: "",
    };
}

export function iCreateCommitParamsToCommitObject(
    commitParams: resources.ICreateCommitParams): isomorphicGit.CommitObject {
    const date = Date.parse(commitParams.author.date);
    if (isNaN(date)) {
        throw new NetworkError(400, "Invalid input");
    }

    // Date.parse() returns a value in milliseconds, and Isomorphic-Git expects
    // a timestamp number time in seconds (UTC Unix timestamp)
    const timestamp = Math.floor(date/1000);
    const parent = commitParams.parents && commitParams.parents.length > 0 ? commitParams.parents : null;

    return {
        message: commitParams.message,
        tree: commitParams.tree,
        parent,
        author: {
            name: commitParams.author.name,
            email: commitParams.author.email,
            timestamp,
            timezoneOffset: 0
        },
        committer: {
            name: commitParams.author.name,
            email: commitParams.author.email,
            timestamp,
            timezoneOffset: 0
        }
    };
}

export function blobToIBlob(
    readBlobResponse: isomorphicGit.ReadBlobResult,
    owner: string,
    repo: string,
    ): resources.IBlob {
    const buffer = Buffer.from(readBlobResponse.blob).toString("base64");
    const sha = readBlobResponse.oid;

    return {
        content: buffer,
        encoding: "base64",
        sha,
        size: buffer.length,
        url: `/repos/${owner}/${repo}/git/blobs/${sha}`,
    };
}

export function refToIRef(resolvedRef: string, expandedRef: string): resources.IRef {
    return {
        object: {
            sha: resolvedRef,
            type: "",
            url: "",
        },
        ref: expandedRef,
        url: "",
    };
}

/**
 * Helper function to convert from an isomorphic-git TreeEntry to our ITreeEntry
 */
export function treeEntryToITreeEntry(treeEntry: isomorphicGit.TreeEntry): resources.ITreeEntry {
    return {
        // remove leading 0s from hexadecimal mode string coming from isomorphic-git
        mode: parseInt(treeEntry.mode, 16).toString(16),
        path: treeEntry.path,
        sha: treeEntry.oid,
        size: 0,
        type: treeEntry.type,
        url: "",
    };
}

/**
 * Helper function to convert from our ICreateTreeEntry to an isomorphic-git TreeEntry
 */
export function iCreateTreeEntryToTreeEntry(createTreeEntry: resources.ICreateTreeEntry): isomorphicGit.TreeEntry {
    return {
        mode: createTreeEntry.mode,
        path: createTreeEntry.path,
        oid: createTreeEntry.sha,
        type: ensureIsomorphicGitTreeEntryType(createTreeEntry.type),
    };
}

export async function tagToITag(tagResult: isomorphicGit.ReadTagResult): Promise<resources.ITag> {
    return {
        message: tagResult.tag.message,
        object: {
            sha: tagResult.tag.object,
            type:tagResult.tag.type,
            url: "",
        },
        sha: tagResult.oid,
        tag: tagResult.tag.tag,
        tagger: {
            date: new Date(tagResult.tag.tagger.timestamp * 1000).toISOString(),
            email: tagResult.tag.tagger.email,
            name: tagResult.tag.tagger.name,
        },
        url: "",
    };
}

export function iCreateTagParamsToTagObject(
    tagParams: resources.ICreateTagParams): isomorphicGit.TagObject {
    const date = Date.parse(tagParams.tagger.date);
    if (isNaN(date)) {
        throw new NetworkError(400, "Invalid input");
    }

    // Date.parse() returns a value in milliseconds, and Isomorphic-Git expects
    // a timestamp number time in seconds (UTC Unix timestamp)
    const timestamp = Math.floor(date/1000);

    return {
        object: tagParams.object,
        type: ensureIsomorphicGitTagObjectType(tagParams.type),
        tag: tagParams.tag,
        message: tagParams.message,
        tagger: {
            name: tagParams.tagger.name,
            email: tagParams.tagger.email,
            timestamp,
            timezoneOffset: 0
        },
    };
}
