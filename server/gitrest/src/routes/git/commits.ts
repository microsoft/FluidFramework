/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommit, ICreateCommitParams } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import git from "nodegit";
import * as utils from "../../utils";

export async function createCommit(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    blob: ICreateCommitParams): Promise<ICommit> {
    const date = Date.parse(blob.author.date);
    if (isNaN(date)) {
        // eslint-disable-next-line prefer-promise-reject-errors
        return Promise.reject("Invalid input");
    }

    const repository = await repoManager.open(owner, repo);
    const signature = git.Signature.create(blob.author.name, blob.author.email, Math.floor(date), 0);
    // eslint-disable-next-line no-null/no-null
    const parents = blob.parents && blob.parents.length > 0 ? blob.parents : null;
    // eslint-disable-next-line no-null/no-null
    const commit = await repository.createCommit(null, signature, signature, blob.message, blob.tree, parents);

    return {
        author: blob.author,
        committer: blob.author,
        message: blob.message,
        parents: parents ? blob.parents.map((parent) => ({ sha: parent, url: "" })) : [],
        sha: commit.tostrS(),
        tree: {
            sha: blob.tree,
            url: "",
        },
        url: "",
    };
}

async function getCommit(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    sha: string): Promise<ICommit> {
    const repository = await repoManager.open(owner, repo);
    const commit = await repository.getCommit(sha);
    return utils.commitToICommit(commit);
}

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager): Router {
    const router: Router = Router();

    // * https://developer.github.com/v3/git/commits/

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    router.post("/repos/:owner/:repo/git/commits", (request, response, next) => {
        const blobP = createCommit(
            repoManager,
            request.params.owner,
            request.params.repo,
            request.body as ICreateCommitParams);
        return blobP.then(
            (blob) => {
                response.status(201).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    router.get("/repos/:owner/:repo/git/commits/:sha", (request, response, next) => {
        const blobP = getCommit(
            repoManager,
            request.params.owner,
            request.params.repo,
            request.params.sha);
        return blobP.then(
            (blob) => {
                response.status(200).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}
