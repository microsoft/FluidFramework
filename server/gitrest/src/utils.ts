/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import git from "nodegit";
import * as resources from "@fluidframework/gitresources";
import { IGetRefParamsExternal } from "@fluidframework/server-services-client";
import * as winston from "winston";

const exists = util.promisify(fs.exists);

// 100644 for file (blob)
// 100755 for executable (blob)
// 040000 for subdirectory (tree)
// 160000 for submodule (commit)
// 120000 for a blob that specifies the path of a symlink

/** Basic type (loose or packed) of any Git object. */
export enum GitObjectType {
    any = -2,       /** < Object can be any of the following */
    bad = -1,       /** < Object is invalid. */
    ext1 = 0,       /** < Reserved for future use. */
    commit = 1,     /** < A commit object. */
    tree = 2,       /** < A tree (directory listing) object. */
    blob = 3,       /** < A file revision object. */
    tag = 4,        /** < An annotated tag object. */
    ext2 = 5,       /** < Reserved for future use. */
    ofsdelta = 6,   /** < A delta, base is given by an offset. */
    refdelta = 7,   /** < A delta, base is given by object id. */
}

function authorToIAuthor(author: git.Signature, time: Date): resources.IAuthor {
    return {
        date: time.toISOString(),
        email: author.email(),
        name: author.name(),
    };
}

function committerToICommitter(committer: git.Signature, time: Date): resources.ICommitter {
    return {
        date: time.toISOString(),
        email: committer.email(),
        name: committer.name(),
    };
}

function oidToCommitHash(oid: git.Oid): resources.ICommitHash {
    return { sha: oid.tostrS(), url: "" };
}

/**
 * Helper function to decode externalstorage read params
 */
export function getReadParams(params): IGetRefParamsExternal | undefined {
    if (params) {
        const getRefParams: IGetRefParamsExternal = JSON.parse(decodeURIComponent(params));
        return getRefParams;
    }
    return undefined;
}

/**
 * Helper function to convert from a nodegit commit to our resource representation
 */
export async function commitToICommit(commit: git.Commit): Promise<resources.ICommit> {
    const tree = await commit.getTree();
    return {
        author: authorToIAuthor(commit.author(), commit.date()),
        committer: committerToICommitter(commit.committer(), commit.date()),
        message: commit.message(),
        parents: commit.parents() && commit.parents().length > 0 ?
            // eslint-disable-next-line no-null/no-null
            commit.parents().map((parent) => oidToCommitHash(parent)) : null,
        sha: commit.id().tostrS(),
        tree: {
            sha: tree.id().tostrS(),
            url: "",
        },
        url: "",
    };
}

export function blobToIBlob(blob: git.Blob, owner: string, repo: string): resources.IBlob {
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

export class RepositoryManager {
    // Cache repositories to allow for reuse
    private repositoryCache: { [key: string]: Promise<git.Repository> } = {};

    constructor(private readonly baseDir) {
    }

    public async create(owner: string, name: string): Promise<git.Repository> {
        // Verify that both inputs are valid folder names
        const repoPath = this.getRepoPath(owner, name);

        // Create and then cache the repository
        const isBare: any = 1;
        const repository = git.Repository.init(`${this.baseDir}/${repoPath}`, isBare);
        this.repositoryCache[repoPath] = repository;
        winston.info(`Created a new repo for owner ${owner} reponame: ${name}`);

        return repository;
    }

    public async open(owner: string, name: string): Promise<git.Repository> {
        const repoPath = this.getRepoPath(owner, name);

        if (!(repoPath in this.repositoryCache)) {
            const directory = `${this.baseDir}/${repoPath}`;

            if (!await exists(directory)) {
                winston.info(`Repo does not exist ${directory}`);
                // eslint-disable-next-line prefer-promise-reject-errors
                return Promise.reject(`Repo does not exist ${directory}`);
            }

            this.repositoryCache[repoPath] = git.Repository.open(directory);
        }

        return this.repositoryCache[repoPath];
    }

    /**
     * Retrieves the full repository path. Or throws an error if not valid.
     */
    private getRepoPath(owner: string, name: string) {
        // Verify that both inputs are valid folder names
        const parsedOwner = path.parse(owner);
        const parsedName = path.parse(name);
        const repoPath = `${owner}/${name}`;

        if (parsedName.dir !== "" || parsedOwner.dir !== "") {
            throw new Error(`Invalid repo name ${repoPath}`);
        }

        return repoPath;
    }
}
