/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import conversions from "nodegit";
import * as resources from "@fluidframework/gitresources";
import { GitObjectType } from ".";

function authorToIAuthor(author: conversions.Signature, time: Date): resources.IAuthor {
    return {
        date: time.toISOString(),
        email: author.email(),
        name: author.name(),
    };
}

function committerToICommitter(committer: conversions.Signature, time: Date): resources.ICommitter {
    return {
        date: time.toISOString(),
        email: committer.email(),
        name: committer.name(),
    };
}

function oidToCommitHash(oid: conversions.Oid): resources.ICommitHash {
    return { sha: oid.tostrS(), url: "" };
}

/**
 * Helper function to convert from a nodegit commit to our resource representation
 */
export async function commitToICommit(commit: conversions.Commit): Promise<resources.ICommit> {
    const tree = await commit.getTree();
    return {
        author: authorToIAuthor(commit.author(), commit.date()),
        committer: committerToICommitter(commit.committer(), commit.date()),
        message: commit.message(),
        parents: commit.parents() && commit.parents().length > 0 ?
            commit.parents().map((parent) => oidToCommitHash(parent)) : null,
        sha: commit.id().tostrS(),
        tree: {
            sha: tree.id().tostrS(),
            url: "",
        },
        url: "",
    };
}

export function blobToIBlob(blob: conversions.Blob, owner: string, repo: string): resources.IBlob {
    const buffer = blob.content();
    const sha = blob.id().tostrS();

    return {
        content: buffer.toString("base64"),
        encoding: "base64",
        sha,
        size: buffer.length,
        url: `/repos/${owner}/${repo}/git/blobs/${sha}`,
    };
}

export function refToIRef(ref: conversions.Reference): resources.IRef {
    return {
        object: {
            sha: ref.target().tostrS(),
            type: "",
            url: "",
        },
        ref: ref.name(),
        url: "",
    };
}

/**
 * Helper function to convert from a nodegit TreeEntry to our ITreeEntry
 */
export function treeEntryToITreeEntry(entry: conversions.TreeEntry): resources.ITreeEntry {
    return {
        mode: entry.filemode().toString(8),
        path: entry.path(),
        sha: entry.id().tostrS(),
        size: 0,
        type: GitObjectType[entry.type()],
        url: "",
    };
}

export async function tagToITag(tag: conversions.Tag): Promise<resources.ITag> {
    const tagger = tag.tagger() as any;
    const target = await tag.target();

    return {
        message: tag.message(),
        object: {
            sha: target.id().tostrS(),
            type: GitObjectType[target.type()],
            url: "",
        },
        sha: tag.id().tostrS(),
        tag: tag.name(),
        tagger: {
            date: "",
            email: tagger.email(),
            name: tagger.name(),
        },
        url: "",
    };
}
